import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { WompiService } from './wompi.service';
import { DatabaseService } from '../database/database.service';

describe('BillingController', () => {
    let controller: BillingController;
    let billingMock: jest.Mocked<Partial<BillingService>>;
    let wompiMock: jest.Mocked<Partial<WompiService>>;
    let dbQueryMock: jest.Mock;

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });
        billingMock = {
            attachPaymentSource: jest.fn().mockResolvedValue({ sourceId: 'src_123', type: 'CARD', status: 'AVAILABLE', dryRun: false }),
            clearPaymentSource: jest.fn().mockResolvedValue(undefined),
            createSubscription: jest.fn().mockResolvedValue({ transactionId: 'tx-1', reference: 'MCP-ref-1', status: 'pending', dryRun: false }),
            changeSubscription: jest.fn().mockResolvedValue({ type: 'upgrade', amountCents: 500000, reference: 'MCP-CHG-1', pendingPlanId: null, dryRun: false }),
            cancelSubscription: jest.fn().mockResolvedValue(undefined),
        };
        wompiMock = {
            dryRun: false,
            getMerchantInfo: jest.fn().mockResolvedValue({
                presigned_acceptance: { acceptance_token: 'acc_tok', permalink: 'https://wompi.co/tos' },
                acceptance_policies: {},
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [BillingController],
            providers: [
                { provide: DatabaseService, useValue: { query: dbQueryMock } },
                { provide: BillingService, useValue: billingMock },
                { provide: WompiService, useValue: wompiMock },
            ],
        }).compile();

        controller = module.get<BillingController>(BillingController);
    });

    describe('acceptance-token', () => {
        it('should return acceptance token from merchant info', async () => {
            const result = await controller.acceptanceToken();
            expect(result.acceptanceToken).toBe('acc_tok');
            expect(result.dryRun).toBe(false);
        });
    });

    describe('payment-sources', () => {
        it('should create payment source for club', async () => {
            const result = await controller.createPaymentSource('club-1', {
                type: 'CARD',
                token: 'tok_123',
            } as never);
            expect(billingMock.attachPaymentSource).toHaveBeenCalledWith('club-1', expect.any(Object));
            expect(result.sourceId).toBe('src_123');
        });

        it('should reject without club id', async () => {
            await expect(controller.createPaymentSource(null, {} as never)).rejects.toThrow(BadRequestException);
        });
    });

    describe('subscription (checkout)', () => {
        it('should create subscription for club', async () => {
            const result = await controller.subscribe('club-1', { planId: 'pro', billingCycle: 'monthly' });
            expect(billingMock.createSubscription).toHaveBeenCalledWith('club-1', 'pro', 'monthly');
            expect(result.status).toBe('pending');
        });

        it('should reject without club id', async () => {
            await expect(
                controller.subscribe(null, { planId: 'pro', billingCycle: 'monthly' }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('delete payment-source', () => {
        it('should clear payment source for club', async () => {
            const result = await controller.deletePaymentSource('club-1');
            expect(billingMock.clearPaymentSource).toHaveBeenCalledWith('club-1');
            expect(result).toEqual({ ok: true });
        });

        it('should reject without club id', async () => {
            await expect(controller.deletePaymentSource(null)).rejects.toThrow(BadRequestException);
        });
    });

    describe('change subscription (plan change)', () => {
        it('should change plan for club', async () => {
            const result = await controller.changeSubscription('club-1', { planId: 'pro' });
            expect(billingMock.changeSubscription).toHaveBeenCalledWith('club-1', 'pro', undefined);
            expect(result.type).toBe('upgrade');
        });

        it('should reject without club id', async () => {
            await expect(
                controller.changeSubscription(null, { planId: 'pro' }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('cancel subscription', () => {
        it('should cancel subscription for club', async () => {
            const result = await controller.cancelSubscription('club-1', { reason: 'muy caro' });
            expect(billingMock.cancelSubscription).toHaveBeenCalledWith('club-1', 'muy caro');
            expect(result).toEqual({ ok: true, cancelAtPeriodEnd: true });
        });

        it('should reject without club id', async () => {
            await expect(controller.cancelSubscription(null, {})).rejects.toThrow(BadRequestException);
        });
    });
});
