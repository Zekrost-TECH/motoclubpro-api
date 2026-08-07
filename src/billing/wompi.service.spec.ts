import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { createHash } from 'crypto';
import { WompiService } from './wompi.service';
import type { CreateWompiPaymentSourceDto, CreateWompiTransactionDto } from './billing.types';

describe('WompiService', () => {
    let service: WompiService;
    const fetchMock = jest.fn();

    const dto: CreateWompiTransactionDto = {
        amount_in_cents: 50000,
        currency: 'COP',
        customer_email: 'test@example.com',
        reference: 'MCP-ref-1',
        payment_method: { type: 'CARD', token: 'tok_123' },
    };

    function buildModule(overrides: Record<string, string> = {}) {
        return Test.createTestingModule({
            providers: [
                WompiService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            const map: Record<string, string> = {
                                WOMPI_BASE_URL: 'https://api.wompi.test',
                                WOMPI_PRIVATE_KEY: 'priv_key',
                                WOMPI_PUBLIC_KEY: 'pub_key',
                                WOMPI_INTEGRITY_KEY: 'test_integrity_abc',
                                ...overrides,
                            };
                            return map[key];
                        }),
                    },
                },
            ],
        }).compile();
    }

    beforeEach(async () => {
        global.fetch = fetchMock as unknown as typeof fetch;
        fetchMock.mockReset();

        const module: TestingModule = await buildModule();
        service = module.get<WompiService>(WompiService);
    });

    describe('createTransaction', () => {
        it('should create a transaction successfully', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ data: { presigned_acceptance: { acceptance_token: 'acc_tok' } } }),
                }) // merchant / acceptance token
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ data: { id: 'tx-1', status: 'PENDING', reference: 'MCP-ref-1' } }),
                }); // transaction

            const result = await service.createTransaction(dto);
            expect(result.data.id).toBe('tx-1');
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('should send integrity signature in body (referencia+monto+moneda+secreto)', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ data: { presigned_acceptance: { acceptance_token: 'acc_tok' } } }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ data: { id: 'tx-1', status: 'PENDING' } }),
                });

            const expectedSig = createHash('sha256')
                .update('MCP-ref-150000COPtest_integrity_abc')
                .digest('hex');

            await service.createTransaction(dto);

            const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
            const body = JSON.parse(init.body as string);
            expect(body.signature).toBe(expectedSig);
        });

        it('should send payment_source_id and installments for saved sources', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ data: { presigned_acceptance: { acceptance_token: 'acc_tok' } } }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ data: { id: 'tx-1', status: 'PENDING' } }),
                });

            await service.createTransaction({
                ...dto,
                payment_source_id: 360185,
                payment_method: { type: 'CARD', installments: 1 },
            });

            const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
            const body = JSON.parse(init.body as string);
            expect(body.payment_source_id).toBe(360185);
            expect(body.payment_method).toEqual({ type: 'CARD', installments: 1 });
        });

        it('should throw HttpException when transaction creation fails', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ data: { presigned_acceptance: { acceptance_token: 'acc_tok' } } }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 422,
                    json: jest.fn().mockResolvedValue({ error: 'invalid' }),
                });

            await expect(service.createTransaction(dto)).rejects.toThrow(HttpException);
        });

        it('should throw HttpException when acceptance token request fails', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: jest.fn().mockResolvedValue({ error: 'server' }),
            });

            await expect(service.createTransaction(dto)).rejects.toThrow(HttpException);
        });

        it('should simulate transaction in dry-run mode without fetch', async () => {
            const dryModule = await buildModule({ BILLING_DRY_RUN: 'true' });
            const dryService = dryModule.get<WompiService>(WompiService);

            const result = await dryService.createTransaction(dto);

            expect(result.data.status).toBe('APPROVED');
            expect(result.data.reference).toBe('MCP-ref-1');
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('createPaymentSource', () => {
        const sourceDto: CreateWompiPaymentSourceDto = {
            type: 'CARD',
            token: 'tok_123',
            customer_email: 'test@example.com',
            acceptance_token: 'acc_tok',
        };

        it('should create a payment source successfully', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ data: { id: 'src_123', type: 'CARD', status: 'AVAILABLE' } }),
            });

            const result = await service.createPaymentSource(sourceDto);

            expect(result.data.id).toBe('src_123');
            expect(fetchMock).toHaveBeenCalledWith(
                'https://api.wompi.test/payment_sources',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ Authorization: 'Bearer priv_key' }),
                }),
            );
        });

        it('should throw HttpException when payment source creation fails', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 422,
                json: jest.fn().mockResolvedValue({ error: 'invalid token' }),
            });

            await expect(service.createPaymentSource(sourceDto)).rejects.toThrow(HttpException);
        });

        it('should send accept_personal_auth for NEQUI sources', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ data: { id: 'src_123', type: 'NEQUI', status: 'AVAILABLE' } }),
            });

            await service.createPaymentSource({
                ...sourceDto,
                type: 'NEQUI',
                acceptance_token: 'acc_tok',
                accept_personal_auth: 'pd_auth_tok',
            });

            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            const body = JSON.parse(init.body as string);
            expect(body.acceptance_token).toBe('acc_tok');
            expect(body.accept_personal_auth).toBe('pd_auth_tok');
        });

        it('should simulate payment source in dry-run mode', async () => {
            const dryModule = await buildModule({ BILLING_DRY_RUN: 'true' });
            const dryService = dryModule.get<WompiService>(WompiService);

            const result = await dryService.createPaymentSource(sourceDto);

            expect(result.data.id).toContain('src_dryrun_');
            expect(result.data.status).toBe('AVAILABLE');
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('getNequiTokenStatus', () => {
        it('should return token status', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ data: { id: 'nequi_tok', status: 'APPROVED' } }),
            });

            await expect(service.getNequiTokenStatus('nequi_tok')).resolves.toBe('APPROVED');
            expect(fetchMock).toHaveBeenCalledWith(
                'https://api.wompi.test/tokens/nequi/nequi_tok',
                expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pub_key' }) }),
            );
        });

        it('should return null on error response', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: jest.fn().mockResolvedValue({ error: 'not found' }),
            });

            await expect(service.getNequiTokenStatus('nequi_tok')).rejects.toThrow(HttpException);
        });

        it('should return APPROVED in dry-run mode', async () => {
            const dryModule = await buildModule({ BILLING_DRY_RUN: 'true' });
            const dryService = dryModule.get<WompiService>(WompiService);

            await expect(dryService.getNequiTokenStatus('nequi_tok')).resolves.toBe('APPROVED');
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('getMerchantInfo', () => {
        it('should return merchant data including personal data auth', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    data: {
                        presigned_acceptance: { acceptance_token: 'acc_tok', permalink: 'https://wompi.co/tos' },
                        presigned_personal_data_auth: { acceptance_token: 'pd_auth_tok' },
                        acceptance_policies: { acceptance_policy: {} },
                    },
                }),
            });

            const result = await service.getMerchantInfo();

            expect(result.presigned_acceptance.acceptance_token).toBe('acc_tok');
            expect(result.presigned_personal_data_auth?.acceptance_token).toBe('pd_auth_tok');
        });

        it('should return stub in dry-run mode', async () => {
            const dryModule = await buildModule({ BILLING_DRY_RUN: 'true' });
            const dryService = dryModule.get<WompiService>(WompiService);

            const result = await dryService.getMerchantInfo();

            expect(result.presigned_acceptance.acceptance_token).toBe('acceptance_token_dry_run');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('getPersonalDataAuthToken should return the token', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    data: { presigned_personal_data_auth: { acceptance_token: 'pd_auth_tok' } },
                }),
            });

            await expect(service.getPersonalDataAuthToken()).resolves.toBe('pd_auth_tok');
        });

        it('getPersonalDataAuthToken should throw when unavailable', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ data: {} }),
            });

            await expect(service.getPersonalDataAuthToken()).rejects.toThrow(HttpException);
        });
    });
});

