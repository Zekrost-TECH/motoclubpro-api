import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { DatabaseService } from '../database/database.service';
import { AlegraService } from './alegra.service';

describe('BillingService', () => {
    let service: BillingService;
    let dbQueryMock: jest.Mock;
    let alegraMock: jest.Mocked<Partial<AlegraService>>;

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });
        alegraMock = { generateInvoice: jest.fn().mockResolvedValue(undefined) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                { provide: DatabaseService, useValue: { query: dbQueryMock, getPool: jest.fn() } },
                { provide: AlegraService, useValue: alegraMock },
            ],
        }).compile();

        service = module.get<BillingService>(BillingService);
    });

    describe('confirmPayment', () => {
        it('should confirm payment and extend subscription', async () => {
            const tx = {
                id: 'tx-1',
                subscription_id: 'sub-1',
                club_id: 'club-1',
                status: 'pending',
                plan_amount_cents: 10000,
                overage_amount_cents: 0,
            };
            const sub = { id: 'sub-1', current_period_end: new Date('2026-01-01'), billing_cycle: 'monthly', plan_id: 'plan-1' };
            const client = {
                query: jest.fn(),
                release: jest.fn(),
            };
            client.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce({ rows: [] }) // UPDATE tx
                .mockResolvedValueOnce({ rows: [sub] }) // SELECT sub
                .mockResolvedValueOnce({ rows: [] }) // UPDATE sub
                .mockResolvedValueOnce({ rows: [] }); // COMMIT

            dbQueryMock
                .mockResolvedValueOnce({ rows: [tx] }) // find tx
                .mockResolvedValueOnce({ rows: [{ name: 'Basic' }] }); // plan name

            const poolMock = { connect: jest.fn().mockResolvedValue(client) };
            const dbService = (service as any).db;
            dbService.getPool = jest.fn().mockReturnValue(poolMock);

            await service.confirmPayment('wompi-tx-1', 'ref-1');

            expect(client.query).toHaveBeenCalledWith('BEGIN');
            expect(client.query).toHaveBeenCalledWith('COMMIT');
            expect(alegraMock.generateInvoice).toHaveBeenCalled();
        });

        it('should return early if transaction not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.confirmPayment('wompi-tx-1', 'ref-1');
            expect(alegraMock.generateInvoice).not.toHaveBeenCalled();
        });

        it('should return early if transaction already approved', async () => {
            dbQueryMock.mockResolvedValueOnce({
                rows: [{ id: 'tx-1', subscription_id: 'sub-1', club_id: 'club-1', status: 'approved', plan_amount_cents: 10000, overage_amount_cents: 0 }],
            });
            await service.confirmPayment('wompi-tx-1', 'ref-1');
            expect(alegraMock.generateInvoice).not.toHaveBeenCalled();
        });
    });

    describe('markPaymentFailed', () => {
        it('should mark payment as failed and increment retry', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ subscription_id: 'sub-1' }] })
                .mockResolvedValueOnce({ rows: [{ retry_count: 1, status: 'active' }] });

            await service.markPaymentFailed('wompi-tx-1', 'ref-1', 'Card declined');
            expect(dbQueryMock).toHaveBeenCalledTimes(2);
        });

        it('should suspend subscription after 3 retries', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ subscription_id: 'sub-1' }] })
                .mockResolvedValueOnce({ rows: [{ retry_count: 3, status: 'active' }] })
                .mockResolvedValueOnce({ rows: [] });

            await service.markPaymentFailed('wompi-tx-1', 'ref-1');
            expect(dbQueryMock).toHaveBeenCalledTimes(3);
        });

        it('should return early if transaction not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.markPaymentFailed('wompi-tx-1', 'ref-1');
            expect(dbQueryMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleVoidedTransaction', () => {
        it('should void the transaction', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.handleVoidedTransaction('wompi-tx-1', 'ref-1');
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE payment_transactions'),
                ['wompi-tx-1', 'ref-1'],
            );
        });
    });

    describe('calculateMonthlyUsage', () => {
        it('should return cached usage if exists', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ member_count: 5, event_count: 2, overage_members: 0 }] });
            const result = await service.calculateMonthlyUsage('club-1', new Date('2026-01-01'));
            expect(result.member_count).toBe(5);
            expect(dbQueryMock).toHaveBeenCalledTimes(1);
        });

        it('should calculate and cache fresh usage', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [] }) // no cache
                .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // members
                .mockResolvedValueOnce({ rows: [{ count: 3 }] }) // events
                .mockResolvedValueOnce({ rows: [{ max_members: 8 }] }) // plan
                .mockResolvedValueOnce({ rows: [] }); // insert

            const result = await service.calculateMonthlyUsage('club-1', new Date('2026-01-01'));
            expect(result.member_count).toBe(10);
            expect(result.event_count).toBe(3);
            expect(result.overage_members).toBe(2);
        });
    });

    describe('calculateOverageCharge', () => {
        it('should return 0 when no overage', async () => {
            const result = await service.calculateOverageCharge('plan-1', 0);
            expect(result).toBe(0);
        });

        it('should calculate overage charge', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [{ overage_member_cents: 500 }] });
            const result = await service.calculateOverageCharge('plan-1', 3);
            expect(result).toBe(1500);
        });

        it('should return 0 when plan not found', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            const result = await service.calculateOverageCharge('plan-1', 2);
            expect(result).toBe(0);
        });
    });
});
