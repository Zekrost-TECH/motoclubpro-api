import { Test, TestingModule } from '@nestjs/testing';
import { MotorcyclesService } from './motorcycles.service';
import { DatabaseService } from '../database/database.service';
import { NotFoundException } from '@nestjs/common';

describe('MotorcyclesService', () => {
    let service: MotorcyclesService;
    let dbQueryMock: jest.Mock;

    const mockMotorcycle = {
        id: 'moto-1',
        userId: 'user-1',
        brand: 'Honda',
        model: 'CB500',
        year: 2020,
        cc: 500,
        plate: 'ABC123',
        color: 'red',
        currentKm: 1000,
        nextServiceKm: 5000,
        soatExpiry: new Date(),
        techReviewExpiry: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        dbQueryMock = jest.fn();

        const moduleRef: TestingModule = await Test.createTestingModule({
            providers: [
                MotorcyclesService,
                {
                    provide: DatabaseService,
                    useValue: {
                        query: dbQueryMock,
                        getPool: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = moduleRef.get<MotorcyclesService>(MotorcyclesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create a motorcycle', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockMotorcycle] });
            const dto = {
                brand: 'Honda',
                model: 'CB500',
                year: 2020,
                cc: 500,
                plate: 'ABC123',
                color: 'red',
                currentKm: 1000,
            };
            const result = await service.create('user-1', dto);
            expect(result).toEqual(mockMotorcycle);
            expect(dbQueryMock).toHaveBeenCalled();
        });
    });

    describe('findAll', () => {
        it('should return all motorcycles for a club', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [mockMotorcycle] });
            const result = await service.findAll(undefined, 'club-1');
            expect(result).toEqual({ data: [mockMotorcycle], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(dbQueryMock).toHaveBeenCalledTimes(2);
        });
    });

    describe('findOne', () => {
        it('should return a motorcycle', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockMotorcycle] });
            const result = await service.findOne('moto-1');
            expect(result).toEqual(mockMotorcycle);
        });

        it('should throw NotFoundException when not found', async () => {
            dbQueryMock.mockResolvedValue({ rows: [] });
            await expect(service.findOne('not-found')).rejects.toThrow(NotFoundException);
        });
    });
});
