import { Test, TestingModule } from '@nestjs/testing';
import { SupportService } from './support.service';
import { DatabaseService } from '../database/database.service';
import { NotFoundException } from '@nestjs/common';

describe('SupportService', () => {
    let service: SupportService;
    let dbQueryMock: jest.Mock;

    const mockPoint = {
        id: 'point-1',
        name: 'Shop',
        lat: 1,
        lng: 2,
        type: 'taller',
        address: 'Addr',
        phone: '123',
        isVerified: true,
        createdAt: new Date(),
    };

    beforeEach(async () => {
        dbQueryMock = jest.fn();

        const moduleRef: TestingModule = await Test.createTestingModule({
            providers: [
                SupportService,
                {
                    provide: DatabaseService,
                    useValue: {
                        query: dbQueryMock,
                        getPool: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = moduleRef.get<SupportService>(SupportService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('search', () => {
        it('should search support points', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockPoint] });
            const result = await service.search(1, 2, 5000, 'taller' as any, 'club-1');
            expect(result).toEqual([mockPoint]);
            expect(dbQueryMock).toHaveBeenCalled();
        });
    });

    describe('create', () => {
        it('should create a support point', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockPoint] });
            const dto = { name: 'Shop', lat: 1, lng: 2, type: 'taller' as any, address: 'Addr', phone: '123' };
            const result = await service.create('user-1', dto, 'club-1');
            expect(result).toEqual(mockPoint);
        });
    });

    describe('search without type filter', () => {
        it('should search without a type and without clubId', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockPoint] });
            const result = await service.search(1, 2, 5000);
            expect(result).toEqual([mockPoint]);
        });
    });

    describe('verify', () => {
        it('should verify a support point', async () => {
            dbQueryMock.mockResolvedValue({ rowCount: 1, rows: [{ id: 'point-1', verified: true }] });
            const result = await service.verify('point-1', 'club-1');
            expect(result.verified).toBe(true);
        });

        it('should throw NotFoundException when point not found', async () => {
            dbQueryMock.mockResolvedValue({ rowCount: 0, rows: [] });
            await expect(service.verify('point-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('review', () => {
        it('should add a review and recalculate rating', async () => {
            dbQueryMock.mockResolvedValue({ rowCount: 1, rows: [{ id: 'point-1', rating: 4.5, review_count: 2 }] });
            const result = await service.review('point-1', 'user-1', { rating: 5 } as any, 'club-1');
            expect(result.review_count).toBe(2);
        });

        it('should throw NotFoundException when point not found', async () => {
            dbQueryMock.mockResolvedValue({ rowCount: 0, rows: [] });
            await expect(service.review('point-1', 'user-1', { rating: 5 } as any)).rejects.toThrow(NotFoundException);
        });
    });
});
