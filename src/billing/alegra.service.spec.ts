import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlegraService } from './alegra.service';
import { DatabaseService } from '../database/database.service';

describe('AlegraService', () => {
    let service: AlegraService;
    let dbQueryMock: jest.Mock;
    const fetchMock = jest.fn();

    const club = {
        name: 'Moto Club',
        nit: '900123456',
        billing_address: 'Calle 1',
        billing_phone: '3001234567',
        billing_contact_email: 'club@example.com',
        tax_regime: 'comun',
    };

    function buildService(credentials: boolean): Promise<void> {
        return Test.createTestingModule({
            providers: [
                AlegraService,
                { provide: DatabaseService, useValue: { query: dbQueryMock } },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            const map: Record<string, string> = {
                                ALEGRA_BASE_URL: 'https://api.alegra.test',
                                ALEGRA_EMAIL: credentials ? 'me@example.com' : '',
                                ALEGRA_API_KEY: credentials ? 'api_key' : '',
                            };
                            return map[key];
                        }),
                    },
                },
            ],
        })
            .compile()
            .then((module) => {
                service = module.get<AlegraService>(AlegraService);
            });
    }

    beforeEach(() => {
        global.fetch = fetchMock as unknown as typeof fetch;
        fetchMock.mockReset();
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [] });
    });

    describe('generateInvoice', () => {
        it('should return null when credentials are not configured', async () => {
            await buildService(false);
            const result = await service.generateInvoice('club-1', 'tx-1', 'Basic', 50000, 0);
            expect(result).toBeNull();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('should return null when club not found', async () => {
            await buildService(true);
            dbQueryMock.mockResolvedValueOnce({ rows: [] });
            const result = await service.generateInvoice('club-1', 'tx-1', 'Basic', 50000, 0);
            expect(result).toBeNull();
        });

        it('should generate invoice and persist data', async () => {
            await buildService(true);
            dbQueryMock
                .mockResolvedValueOnce({ rows: [club] }) // club lookup
                .mockResolvedValueOnce({ rows: [] }); // update tx
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ id: 1, number: 'FE-001', cufe: 'CUFE123', status: 'open', pdf: 'http://pdf' }),
            });

            const result = await service.generateInvoice('club-1', 'tx-1', 'Basic', 50000, 10000);
            expect(result?.invoiceNumber).toBe('FE-001');
            expect(result?.cufe).toBe('CUFE123');
            expect(dbQueryMock).toHaveBeenCalledTimes(2);
        });

        it('should return null when Alegra API fails', async () => {
            await buildService(true);
            dbQueryMock.mockResolvedValueOnce({ rows: [club] });
            fetchMock.mockResolvedValueOnce({
                ok: false,
                json: jest.fn().mockResolvedValue({ error: 'bad request' }),
            });

            const result = await service.generateInvoice('club-1', 'tx-1', 'Basic', 50000, 0);
            expect(result).toBeNull();
        });

        it('should return null when fetch throws', async () => {
            await buildService(true);
            dbQueryMock.mockResolvedValueOnce({ rows: [club] });
            fetchMock.mockRejectedValueOnce(new Error('network'));

            const result = await service.generateInvoice('club-1', 'tx-1', 'Basic', 50000, 0);
            expect(result).toBeNull();
        });
    });
});
