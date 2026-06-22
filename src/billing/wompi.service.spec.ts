import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { WompiService } from './wompi.service';
import type { CreateWompiTransactionDto } from './billing.types';

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

    beforeEach(async () => {
        global.fetch = fetchMock as unknown as typeof fetch;
        fetchMock.mockReset();

        const module: TestingModule = await Test.createTestingModule({
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
                            };
                            return map[key];
                        }),
                    },
                },
            ],
        }).compile();

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
    });

    describe('getTransaction', () => {
        it('should fetch a transaction by id', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ data: { id: 'tx-1', status: 'APPROVED', reference: 'MCP-ref-1' } }),
            });

            const result = await service.getTransaction('tx-1');
            expect(result.data.status).toBe('APPROVED');
        });

        it('should throw HttpException when fetch fails', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: jest.fn().mockResolvedValue({ error: 'not found' }),
            });

            await expect(service.getTransaction('tx-1')).rejects.toThrow(HttpException);
        });
    });
});
