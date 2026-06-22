import { Test, TestingModule } from '@nestjs/testing';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { RouteDifficulty, WaypointType } from './routes.types';
import { DatabaseService } from '../database/database.service';
import { Reflector } from '@nestjs/core';

describe('RoutesController', () => {
    let controller: RoutesController;
    let service: RoutesService;

    const mockRoute = { id: 'route-1', name: 'Route 1', description: 'Desc', difficulty: RouteDifficulty.SUAVE, distanceKm: 10, estimatedTime: '60', elevationMin: 100, elevationMax: 200, geojson: {}, createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date() };
    const mockWaypoint = { id: 'wp-1', routeId: 'route-1', lat: 1, lng: 2, type: 'rest', name: 'Stop', createdAt: new Date() };

    beforeEach(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [RoutesController],
            providers: [
                {
                    provide: RoutesService,
                    useValue: {
                        create: jest.fn().mockResolvedValue(mockRoute),
                        findAll: jest.fn().mockResolvedValue({ data: [mockRoute], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
                        findOne: jest.fn().mockResolvedValue(mockRoute),
                        update: jest.fn().mockResolvedValue(mockRoute),
                        remove: jest.fn().mockResolvedValue(undefined),
                        addWaypoint: jest.fn().mockResolvedValue(mockWaypoint),
                        getWaypoints: jest.fn().mockResolvedValue([mockWaypoint]),
                        addBatchWaypoints: jest.fn().mockResolvedValue(undefined),
                    },
                },
                { provide: DatabaseService, useValue: { query: jest.fn() } },
                { provide: Reflector, useValue: new Reflector() },
            ],
        }).compile();

        controller = moduleRef.get<RoutesController>(RoutesController);
        service = moduleRef.get<RoutesService>(RoutesService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should create a route', async () => {
            const dto = { name: 'Route 1', difficulty: RouteDifficulty.SUAVE };
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.create(req, dto);
            expect(result).toEqual(mockRoute);
            expect(service.create).toHaveBeenCalledWith('user-1', dto, undefined);
        });
    });

    describe('findAll', () => {
        it('should return routes', async () => {
            const result = await controller.findAll('club-1');
            expect(result).toEqual({ data: [mockRoute], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(service.findAll).toHaveBeenCalledWith('club-1', undefined, undefined);
        });
    });

    describe('findOne', () => {
        it('should return a route', async () => {
            const result = await controller.findOne('route-1');
            expect(result).toEqual(mockRoute);
            expect(service.findOne).toHaveBeenCalledWith('route-1', undefined);
        });
    });

    describe('update', () => {
        it('should update a route', async () => {
            const dto = { name: 'Updated' };
            const result = await controller.update('route-1', dto);
            expect(result).toEqual(mockRoute);
            expect(service.update).toHaveBeenCalledWith('route-1', dto, undefined);
        });
    });

    describe('remove', () => {
        it('should remove a route', async () => {
            await controller.remove('route-1');
            expect(service.remove).toHaveBeenCalledWith('route-1', undefined);
        });
    });

    describe('addWaypoint', () => {
        it('should add a waypoint', async () => {
            const dto = { location: { type: 'Point' as const, coordinates: [1, 2] as [number, number] }, type: WaypointType.PARADA, name: 'Stop', sortOrder: 1 } as any;
            const result = await controller.addWaypoint('route-1', dto);
            expect(result).toEqual(mockWaypoint);
            expect(service.addWaypoint).toHaveBeenCalledWith('route-1', dto, undefined);
        });
    });

    describe('getWaypoints', () => {
        it('should return waypoints', async () => {
            const result = await controller.getWaypoints('route-1');
            expect(result).toEqual([mockWaypoint]);
            expect(service.getWaypoints).toHaveBeenCalledWith('route-1', undefined);
        });
    });

    describe('addBatchWaypoints', () => {
        it('should add batch waypoints', async () => {
            const geojson = { type: 'FeatureCollection', features: [] };
            await controller.addBatchWaypoints('route-1', geojson);
            expect(service.addBatchWaypoints).toHaveBeenCalledWith('route-1', geojson, undefined);
        });
    });
});
