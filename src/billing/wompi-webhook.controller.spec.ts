import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { WompiWebhookController } from './wompi-webhook.controller';
import { BillingService } from './billing.service';
import { DatabaseService } from '../database/database.service';

describe('WompiWebhookController', () => {
    let controller: WompiWebhookController;
    let billingService: BillingService;
    let configService: ConfigService;
    let dbQueryMock: jest.Mock;

    const secret = 'test-secret';

    // Formato REAL del evento Wompi (verificado contra docs + sandbox 2026-08-06):
    // signature.properties apuntan a campos DENTRO de data, checksum en signature.checksum
    function buildEvent(overrides: any = {}) {
        const base = {
            event: 'transaction.updated',
            environment: 'test',
            timestamp: 1234567890,
            sent_at: '2018-07-20T16:45:05.000Z',
            signature: {
                properties: ['transaction.id', 'transaction.status', 'transaction.reference', 'transaction.status_message'],
                checksum: '',
            },
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
        if (overrides.signature?.properties) merged.signature.properties = overrides.signature.properties;
        if (overrides.data?.transaction) Object.assign(merged.data.transaction, overrides.data.transaction);

        const values = merged.signature.properties.map((prop: string) => {
            const parts = prop.split('.');
            let val: any = merged.data;
            for (const p of parts) val = val?.[p];
            return String(val ?? '');
        });
        const payload = values.join('') + merged.timestamp + secret;
        merged.signature.checksum = createHash('sha256').update(payload).digest('hex');
        return merged;
    }

    let mockEvent: ReturnType<typeof buildEvent>;

    beforeEach(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
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
                { provide: DatabaseService, useValue: { query: dbQueryMock } },
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
            await expect(controller.handleWebhook(mockEvent)).rejects.toThrow(BadRequestException);
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

        it('should handle ERROR transaction as failed', async () => {
            const errorEvent = buildEvent({ data: { transaction: { status: 'ERROR', status_message: 'timeout' } } });
            await controller.handleWebhook(errorEvent);
            expect(billingService.markPaymentFailed).toHaveBeenCalledWith('txn-1', 'ref-1', 'timeout');
        });

        it('should update club status on nequi_token.updated', async () => {
            const nequiEvent = buildEvent({
                event: 'nequi_token.updated',
                signature: { properties: ['transaction.id', 'transaction.status'] },
                data: { transaction: { id: 'src_nequi_1', status: 'AVAILABLE', reference: 'x' } },
            });
            await controller.handleWebhook(nequiEvent);
            expect(dbQueryMock).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE clubs'),
                ['AVAILABLE', 'src_nequi_1'],
            );
        });

        it('should return received for unhandled event type', async () => {
            const unknownEvent = buildEvent({ event: 'unknown.type' });
            const result = await controller.handleWebhook(unknownEvent);
            expect(result).toEqual({ received: true });
        });
    });

    describe('verifyChecksum', () => {
        it('should verify valid SHA256 checksum from signature.checksum', () => {
            const validEvent = buildEvent({ data: { transaction: { status: 'APPROVED' } } });
            const result = (controller as any).verifyChecksum(validEvent, secret);
            expect(result).toBe(true);
        });

        it('should verify checksum from X-Event-Checksum header', () => {
            const validEvent = buildEvent({ data: { transaction: { status: 'APPROVED' } } });
            const result = (controller as any).verifyChecksum(validEvent, secret, validEvent.signature.checksum);
            expect(result).toBe(true);
        });

        it('should reject invalid checksum', () => {
            const result = (controller as any).verifyChecksum(
                { ...mockEvent, signature: { ...mockEvent.signature, checksum: 'wrong' } },
                secret,
            );
            expect(result).toBe(false);
        });

        it('should reject event without signature object', () => {
            const withoutSignature: Record<string, unknown> = { ...mockEvent };
            delete withoutSignature.signature;
            const result = (controller as any).verifyChecksum(withoutSignature, secret);
            expect(result).toBe(false);
        });
    });
});
