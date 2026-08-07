import { Test, TestingModule } from '@nestjs/testing';
import { BillingCronService } from './billing-cron.service';
import { DatabaseService } from '../database/database.service';
import { WompiService } from './wompi.service';
import { BillingService } from './billing.service';
import { AlegraService } from './alegra.service';

describe('BillingCronService', () => {
    let service: BillingCronService;
    let dbQueryMock: jest.Mock;
    let wompiMock: jest.Mocked<Partial<WompiService>>;
    let billingMock: jest.Mocked<Partial<BillingService>>;
    let alegraMock: jest.Mocked<Partial<AlegraService>>;
    let poolClientMock: { query: jest.Mock; release: jest.Mock };

    const sub = {
        id: 'sub-1',
        club_id: 'club-1',
        plan_id: 'plan-1',
        status: 'active',
        current_period_start: new Date('2026-01-01'),
        current_period_end: new Date('2026-02-01'),
        pending_plan_id: null,
        wompi_customer_email: 'club@example.com',
        wompi_payment_source_id: 'src_1',
        wompi_payment_method_type: 'CARD',
        wompi_payment_phone: null,
        wompi_payment_source_status: 'AVAILABLE',
        price_cents: 50000,
        overage_member_cents: 500,
    };

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });
        poolClientMock = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        };
        wompiMock = { createTransaction: jest.fn().mockResolvedValue({ data: { id: 'tx-1' } } as any) };
        billingMock = {
            calculateMonthlyUsage: jest.fn().mockResolvedValue({
                member_count: 10, event_count: 2, overage_members: 2, overage_charge_cents: 1000,
            }),
            calculateOverageCharge: jest.fn().mockResolvedValue(1000),
            incrementRetryAndMaybeSuspend: jest.fn().mockResolvedValue(undefined),
        };
        alegraMock = { generateInvoice: jest.fn().mockResolvedValue({ invoiceNumber: '1', cufe: 'x', pdfUrl: 'http://pdf' }) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingCronService,
                {
                    provide: DatabaseService,
                    useValue: {
                        query: dbQueryMock,
                        getPool: jest.fn(() => ({ connect: jest.fn().mockResolvedValue(poolClientMock) })),
                    },
                },
                { provide: WompiService, useValue: wompiMock },
                { provide: BillingService, useValue: billingMock },
                { provide: AlegraService, useValue: alegraMock },
            ],
        }).compile();

        service = module.get<BillingCronService>(BillingCronService);
    });

    describe('processRecurringPayments', () => {
        it('should charge all due subscriptions with price per cycle', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [sub] }) // subscriptions query
                .mockResolvedValueOnce({ rows: [] }); // cancelados transition

            await service.processRecurringPayments();

            expect(billingMock.calculateMonthlyUsage).toHaveBeenCalledWith('club-1', sub.current_period_start);
            expect(wompiMock.createTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount_in_cents: 51000,
                    payment_source_id: 'src_1',
                    payment_method: { type: 'CARD', installments: 1 },
                }),
            );
            expect(poolClientMock.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO payment_transactions'),
                expect.arrayContaining(['club-1', 'sub-1', 51000, 50000, 1000, 'CARD']),
            );
            expect(poolClientMock.query).toHaveBeenCalledWith('COMMIT');
        });

        it('should transition trial subscription to active when charged', async () => {
            const trialSub = { ...sub, status: 'trial' };
            dbQueryMock.mockResolvedValueOnce({ rows: [trialSub] });
            dbQueryMock.mockResolvedValueOnce({ rows: [] }); // cancelados

            await service.processRecurringPayments();

            expect(poolClientMock.query).toHaveBeenCalledWith(
                expect.stringContaining("SET status = 'active'"),
                ['sub-1'],
            );
        });

        it('should use NEQUI phone_number for nequi subscriptions', async () => {
            const nequiSub = { ...sub, wompi_payment_method_type: 'NEQUI', wompi_payment_phone: '3991111111' };
            dbQueryMock
                .mockResolvedValueOnce({ rows: [nequiSub] })
                .mockResolvedValueOnce({ rows: [] });

            await service.processRecurringPayments();

            expect(wompiMock.createTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    payment_method: { type: 'NEQUI', phone_number: '3991111111' },
                }),
            );
        });

        it('should continue when a subscription charge fails', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [sub] });
            (wompiMock.createTransaction as jest.Mock).mockRejectedValueOnce(new Error('wompi down'));

            await expect(service.processRecurringPayments()).resolves.toBeUndefined();
        });

        it('should materialize downgrade pending_plan_id when charging', async () => {
            const pendingSub = { ...sub, plan_id: 'basico', pending_plan_id: 'esencial', price_cents: 7990000 };
            dbQueryMock
                .mockResolvedValueOnce({ rows: [pendingSub] })
                .mockResolvedValueOnce({ rows: [] }); // cancelados

            await service.processRecurringPayments();

            expect(poolClientMock.query).toHaveBeenCalledWith(
                expect.stringContaining('pending_plan_id = NULL'),
                ['sub-1', 'basico'],
            );
        });

        it('should materialize cancellations when period ends', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            dbQueryMock.mockResolvedValueOnce({ rows: [] }); // cancelados

            await service.processRecurringPayments();

            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining("SET status = 'canceled'"),
                [expect.any(String)],
            );
        });

        it('should do nothing when there are no due subscriptions', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            dbQueryMock.mockResolvedValueOnce({ rows: [] }); // cancelados

            await service.processRecurringPayments();
            expect(wompiMock.createTransaction).not.toHaveBeenCalled();
        });
    });

    describe('retryFailedPayments', () => {
        const failedTx = {
            id: 'tx-1',
            club_id: 'club-1',
            subscription_id: 'sub-1',
            amount_cents: 50000,
            retry_count: 1,
            wompi_customer_email: 'club@example.com',
            wompi_payment_source_id: 'src_1',
            wompi_payment_method_type: 'CARD',
            wompi_payment_phone: null,
            wompi_payment_source_status: 'AVAILABLE',
            sub_retry_count: 1,
        };

        it('should retry declined transactions inserting its own row', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [failedTx] }) // failed query
                .mockResolvedValueOnce({ rows: [] }) // INSERT retry row
                .mockResolvedValueOnce({ rows: [] }); // UPDATE retry_count

            await service.retryFailedPayments();

            expect(wompiMock.createTransaction).toHaveBeenCalledWith(
                expect.objectContaining({ payment_source_id: 'src_1', payment_method: { type: 'CARD', installments: 1 } }),
            );
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO payment_transactions'),
                expect.arrayContaining([expect.stringContaining('MCP-RETRY-'), 'CARD', 2]),
            );
        });

        it('should suspend via shared helper when retry creation fails', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [failedTx] });
            (wompiMock.createTransaction as jest.Mock).mockRejectedValueOnce(new Error('wompi down'));

            await service.retryFailedPayments();

            expect(billingMock.incrementRetryAndMaybeSuspend).toHaveBeenCalledWith('sub-1');
        });

        it('should retry NEQUI with phone number', async () => {
            const nequiTx = { ...failedTx, wompi_payment_method_type: 'NEQUI', wompi_payment_phone: '3991111111' };
            dbQueryMock
                .mockResolvedValueOnce({ rows: [nequiTx] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            await service.retryFailedPayments();

            expect(wompiMock.createTransaction).toHaveBeenCalledWith(
                expect.objectContaining({ payment_method: { type: 'NEQUI', phone_number: '3991111111' } }),
            );
        });

        it('should do nothing when no failed transactions', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.retryFailedPayments();
            expect(wompiMock.createTransaction).not.toHaveBeenCalled();
        });
    });

    describe('retryPendingInvoices', () => {
        it('should generate invoice for approved transactions without one', async () => {
            dbQueryMock.mockResolvedValueOnce({
                rows: [
                    { id: 'tx-1', club_id: 'club-1', plan_amount_cents: 50000, overage_amount_cents: 0, plan_name: 'Pro' },
                ],
            });

            await service.retryPendingInvoices();

            expect(alegraMock.generateInvoice).toHaveBeenCalledWith('club-1', 'tx-1', 'Pro', 50000, 0);
        });

        it('should do nothing when no pending invoices', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.retryPendingInvoices();
            expect(alegraMock.generateInvoice).not.toHaveBeenCalled();
        });
    });
});
