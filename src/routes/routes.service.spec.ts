import { Test, TestingModule } from '@nestjs/testing';
import { RoutesService } from './routes.service';
import { DatabaseService } from '../database/database.service';
import { NotFoundException } from '@nestjs/common';

describe('RoutesService', () => {
    let service: RoutesService;
    let dbQueryMock: jest.Mock;

    const mockRoute = {
        id: 'route-1',
        name: 'Route 1',
        description: 'Desc',
        difficulty: 'suave',
        distanceKm: 10,
        estimatedTime: '60',
        elevationMin: 100,
        elevationMax: 200,
        geojson: {},
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        dbQueryMock = jest.fn();

        const moduleRef: TestingModule = await Test.createTestingModule({
            providers: [
                RoutesService,
                {
                    provide: DatabaseService,
                    useValue: {
                        query: dbQueryMock,
                        getPool: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = moduleRef.get<RoutesService>(RoutesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create a route', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockRoute] });
            const dto = { name: 'Route 1', difficulty: 'suave' } as any;
            const result = await service.create('user-1', dto);
            expect(result).toEqual(mockRoute);
            expect(dbQueryMock).toHaveBeenCalled();
        });
    });

    describe('findAll', () => {
        it('should return routes for a club', async () => {
            dbQueryMock
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [mockRoute] });
            const result = await service.findAll('club-1');
            expect(result).toEqual({ data: [mockRoute], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(dbQueryMock).toHaveBeenCalledTimes(2);
        });
    });

    describe('findOne', () => {
        it('should return a route', async () => {
            dbQueryMock.mockResolvedValue({ rows: [mockRoute] });
            const result = await service.findOne('route-1');
            expect(result).toEqual(mockRoute);
        });

        it('should throw NotFoundException when not found', async () => {
            dbQueryMock.mockResolvedValue({ rows: [] });
            await expect(service.findOne('not-found')).rejects.toThrow(NotFoundException);
        });
    });
});
