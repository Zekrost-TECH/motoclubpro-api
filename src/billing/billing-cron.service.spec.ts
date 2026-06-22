import { Test, TestingModule } from '@nestjs/testing';
import { BillingCronService } from './billing-cron.service';
import { DatabaseService } from '../database/database.service';
import { WompiService } from './wompi.service';
import { BillingService } from './billing.service';

describe('BillingCronService', () => {
    let service: BillingCronService;
    let dbQueryMock: jest.Mock;
    let wompiMock: jest.Mocked<Partial<WompiService>>;
    let billingMock: jest.Mocked<Partial<BillingService>>;

    const sub = {
        id: 'sub-1',
        club_id: 'club-1',
        plan_id: 'plan-1',
        current_period_start: new Date('2026-01-01'),
        current_period_end: new Date('2026-02-01'),
        wompi_customer_email: 'club@example.com',
        wompi_payment_source_id: 'src_1',
        wompi_payment_method_type: 'CARD',
        price_monthly_cents: 50000,
        overage_member_cents: 500,
    };

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });
        wompiMock = { createTransaction: jest.fn().mockResolvedValue({ data: { id: 'tx-1' } } as any) };
        billingMock = {
            calculateMonthlyUsage: jest.fn().mockResolvedValue({ member_count: 10, event_count: 2, overage_members: 2 }),
            calculateOverageCharge: jest.fn().mockResolvedValue(1000),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingCronService,
                { provide: DatabaseService, useValue: { query: dbQueryMock } },
                { provide: WompiService, useValue: wompiMock },
                { provide: BillingService, useValue: billingMock },
            ],
        }).compile();

        service = module.get<BillingCronService>(BillingCronService);
    });

    describe('processRecurringPayments', () => {
        it('should charge all due subscriptions', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [sub] }) // subscriptions query
                .mockResolvedValueOnce({ rows: [] }); // insert pending tx

            await service.processRecurringPayments();

            expect(billingMock.calculateMonthlyUsage).toHaveBeenCalledWith('club-1', sub.current_period_start);
            expect(wompiMock.createTransaction).toHaveBeenCalled();
        });

        it('should continue when a subscription charge fails', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [sub] });
            (wompiMock.createTransaction as jest.Mock).mockRejectedValueOnce(new Error('wompi down'));

            await expect(service.processRecurringPayments()).resolves.toBeUndefined();
        });

        it('should do nothing when there are no due subscriptions', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.processRecurringPayments();
            expect(wompiMock.createTransaction).not.toHaveBeenCalled();
        });
    });

    describe('retryFailedPayments', () => {
        it('should retry declined transactions', async () => {
            const failedTx = {
                id: 'tx-1',
                club_id: 'club-1',
                subscription_id: 'sub-1',
                amount_cents: 50000,
                wompi_customer_email: 'club@example.com',
                wompi_payment_source_id: 'src_1',
            };
            dbQueryMock
                .mockResolvedValueOnce({ rows: [failedTx] }) // failed query
                .mockResolvedValueOnce({ rows: [] }); // update retry_count

            await service.retryFailedPayments();

            expect(wompiMock.createTransaction).toHaveBeenCalled();
        });

        it('should continue when a retry fails', async () => {
            const failedTx = {
                id: 'tx-1',
                club_id: 'club-1',
                subscription_id: 'sub-1',
                amount_cents: 50000,
                wompi_customer_email: 'club@example.com',
                wompi_payment_source_id: 'src_1',
            };
            dbQueryMock.mockResolvedValueOnce({ rows: [failedTx] });
            (wompiMock.createTransaction as jest.Mock).mockRejectedValueOnce(new Error('wompi down'));

            await expect(service.retryFailedPayments()).resolves.toBeUndefined();
        });

        it('should do nothing when no failed transactions', async () => {
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            await service.retryFailedPayments();
            expect(wompiMock.createTransaction).not.toHaveBeenCalled();
        });
    });
});
