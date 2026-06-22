import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { WompiWebhookController } from './wompi-webhook.controller';
import { BillingService } from './billing.service';

describe('WompiWebhookController', () => {
    let controller: WompiWebhookController;
    let billingService: BillingService;
    let configService: ConfigService;

    const secret = 'test-secret';

    function buildEvent(overrides: any = {}) {
        const base = {
            event: 'transaction.updated',
            timestamp: 1234567890,
            properties: ['data.transaction.id', 'data.transaction.status', 'data.transaction.reference', 'data.transaction.status_message'],
            data: {
                transaction: {
                    id: 'txn-1',
                    status: 'APPROVED',
                    reference: 'ref-1',
                    status_message: 'OK',
                },
            },
        };
        const merged = JSON.parse(JSON.stringify(base));
        if (overrides.event) merged.event = overrides.event;
        if (overrides.timestamp) merged.timestamp = overrides.timestamp;
        if (overrides.properties) merged.properties = overrides.properties;
        if (overrides.data?.transaction) Object.assign(merged.data.transaction, overrides.data.transaction);

        const values = merged.properties.map((prop: string) => {
            const parts = prop.split('.');
            let val: any = merged;
            for (const p of parts) val = val[p];
            return String(val ?? '');
        });
        const payload = values.join('') + merged.timestamp + secret;
        const checksum = createHash('sha256').update(payload).digest('hex');
        return { ...merged, checksum };
    }

    let mockEvent: ReturnType<typeof buildEvent>;

    beforeEach(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [WompiWebhookController],
            providers: [
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue('test-secret'),
                    },
                },
                {
                    provide: BillingService,
                    useValue: {
                        confirmPayment: jest.fn().mockResolvedValue(undefined),
                        markPaymentFailed: jest.fn().mockResolvedValue(undefined),
                        handleVoidedTransaction: jest.fn().mockResolvedValue(undefined),
                    },
                },
            ],
        }).compile();

        controller = moduleRef.get<WompiWebhookController>(WompiWebhookController);
        billingService = moduleRef.get<BillingService>(BillingService);
        configService = moduleRef.get<ConfigService>(ConfigService);
    });

    beforeEach(() => {
        mockEvent = buildEvent();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('handleWebhook', () => {
        it('should throw BadRequestException when secret is not configured', async () => {
            jest.spyOn(configService, 'get').mockReturnValueOnce(undefined);
            await expect(controller.handleWebhook(mockEvent)).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException for invalid checksum', async () => {
            jest.spyOn(controller as any, 'verifyChecksum').mockReturnValue(false);
            const invalidEvent = { ...mockEvent, checksum: 'invalid' };
            await expect(controller.handleWebhook(invalidEvent)).rejects.toThrow(BadRequestException);
        });

        it('should handle APPROVED transaction', async () => {
            const result = await controller.handleWebhook(mockEvent);
            expect(result).toEqual({ received: true });
            expect(billingService.confirmPayment).toHaveBeenCalledWith('txn-1', 'ref-1');
        });

        it('should handle DECLINED transaction', async () => {
            const declinedEvent = buildEvent({ data: { transaction: { status: 'DECLINED', status_message: 'Failed' } } });
            await controller.handleWebhook(declinedEvent);
            expect(billingService.markPaymentFailed).toHaveBeenCalledWith('txn-1', 'ref-1', 'Failed');
        });

        it('should handle VOIDED transaction', async () => {
            const voidedEvent = buildEvent({ data: { transaction: { status: 'VOIDED', status_message: '' } } });
            await controller.handleWebhook(voidedEvent);
            expect(billingService.handleVoidedTransaction).toHaveBeenCalledWith('txn-1', 'ref-1');
        });

        it('should return received for unhandled event type', async () => {
            const unknownEvent = buildEvent({ event: 'unknown.type' });
            const result = await controller.handleWebhook(unknownEvent);
            expect(result).toEqual({ received: true });
        });
    });

    describe('verifyChecksum', () => {
        it('should verify valid SHA256 checksum', () => {
            const validEvent = buildEvent({ data: { transaction: { status: 'APPROVED' } } });
            const result = (controller as any).verifyChecksum(validEvent, secret);
            expect(result).toBe(true);
        });

        it('should reject invalid checksum', () => {
            const result = (controller as any).verifyChecksum({ ...mockEvent, checksum: 'wrong' }, secret);
            expect(result).toBe(false);
        });
    });
});
