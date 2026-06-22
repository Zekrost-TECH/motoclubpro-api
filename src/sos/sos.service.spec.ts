import { Test, TestingModule } from '@nestjs/testing';
import { SosService } from './sos.service';
import { DatabaseService } from '../database/database.service';
import { FcmService } from '../notifications/fcm.service';
import { NotFoundException } from '@nestjs/common';

describe('SosService', () => {
    let service: SosService;
    let dbQueryMock: jest.Mock;

    const mockAlert = {
        id: 'alert-1',
        userId: 'user-1',
        clubId: 'club-1',
        type: 'accidente',
        lat: 1,
        lng: 2,
        description: 'Help',
        status: 'active',
        createdAt: new Date(),
    };

    beforeEach(async () => {
        dbQueryMock = jest.fn();

        const moduleRef: TestingModule = await Test.createTestingModule({
            providers: [
                SosService,
                {
                    provide: DatabaseService,
                    useValue: {
                        query: dbQueryMock,
                        getPool: jest.fn(),
                    },
                },
                {
                    provide: 'REDIS_CLIENT',
                    useValue: {
                        publish: jest.fn().mockResolvedValue(1),
                    },
                },
                {
                    provide: FcmService,
                    useValue: {
                        sendSOSAlert: jest.fn().mockResolvedValue(undefined),
                    },
                },
            ],
        }).compile();

        service = moduleRef.get<SosService>(SosService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create an SOS alert', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockAlert] });
            const dto = { type: 'accidente' as any, lat: 1, lng: 2, description: 'Help' };
            const result = await service.create('user-1', dto, 'club-1');
            expect(result).toEqual(mockAlert);
            expect(dbQueryMock).toHaveBeenCalled();
        });
    });

    describe('findAll', () => {
        it('should return all alerts for a club', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [mockAlert] });
            const result = await service.findAll('club-1');
            expect(result).toEqual({ data: [mockAlert], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(dbQueryMock).toHaveBeenCalledTimes(2);
        });

        it('should return all alerts without clubId', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [] });
            const result = await service.findAll();
            expect(result.meta.total).toBe(0);
        });
    });

    describe('findActive', () => {
        it('should return active alerts for a club', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [mockAlert] });
            const result = await service.findActive('club-1');
            expect(result.data).toHaveLength(1);
            expect(result.meta.total).toBe(1);
        });

        it('should return active alerts without clubId', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [] });
            const result = await service.findActive();
            expect(result.data).toHaveLength(0);
        });
    });

    describe('resolve', () => {
        it('should resolve an alert', async () => {
            dbQueryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'alert-1', status: 'resuelta' }] });
            const result = await service.resolve('alert-1', 'user-1', 'club-1');
            expect(result.status).toBe('resuelta');
        });

        it('should throw NotFoundException when alert not found or resolved', async () => {
            dbQueryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
            await expect(service.resolve('alert-1', 'user-1')).rejects.toThrow(NotFoundException);
        });
    });
});
