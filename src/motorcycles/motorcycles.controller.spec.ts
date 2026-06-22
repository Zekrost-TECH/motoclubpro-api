import { Test, TestingModule } from '@nestjs/testing';
import { MotorcyclesController } from './motorcycles.controller';
import { MotorcyclesService } from './motorcycles.service';
import { MaintenanceType } from './motorcycles.types';
import { DatabaseService } from '../database/database.service';
import { Reflector } from '@nestjs/core';

describe('MotorcyclesController', () => {
    let controller: MotorcyclesController;
    let service: MotorcyclesService;

    const mockMotorcycle = { id: 'moto-1', userId: 'user-1', brand: 'Honda', model: 'CB500', year: 2020, cc: 500, plate: 'ABC123', color: 'red', currentKm: 1000, nextServiceKm: 5000, soatExpiry: new Date(), techReviewExpiry: new Date(), createdAt: new Date(), updatedAt: new Date() };
    const mockMaintenance = { id: 'maint-1', motorcycleId: 'moto-1', type: MaintenanceType.ACEITE, description: 'Oil change', km: 1000, date: new Date(), cost: 50000, createdAt: new Date() };

    beforeEach(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [MotorcyclesController],
            providers: [
                {
                    provide: MotorcyclesService,
                    useValue: {
                        create: jest.fn().mockResolvedValue(mockMotorcycle),
                        findAll: jest.fn().mockResolvedValue({ data: [mockMotorcycle], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
                        findOne: jest.fn().mockResolvedValue(mockMotorcycle),
                        update: jest.fn().mockResolvedValue(mockMotorcycle),
                        remove: jest.fn().mockResolvedValue(undefined),
                        addMaintenance: jest.fn().mockResolvedValue(mockMaintenance),
                        getMaintenances: jest.fn().mockResolvedValue([mockMaintenance]),
                    },
                },
                { provide: DatabaseService, useValue: { query: jest.fn() } },
                { provide: Reflector, useValue: new Reflector() },
            ],
        }).compile();

        controller = moduleRef.get<MotorcyclesController>(MotorcyclesController);
        service = moduleRef.get<MotorcyclesService>(MotorcyclesService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should create a motorcycle', async () => {
            const dto = { brand: 'Honda', model: 'CB500', year: 2020, cc: 500, plate: 'ABC123', color: 'red' };
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.create(req, dto);
            expect(result).toEqual(mockMotorcycle);
            expect(service.create).toHaveBeenCalledWith('user-1', dto, undefined);
        });
    });

    describe('findAll', () => {
        it('should return all motorcycles for club', async () => {
            const result = await controller.findAll('club-1');
            expect(result).toEqual({ data: [mockMotorcycle], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(service.findAll).toHaveBeenCalledWith(undefined, 'club-1', undefined, undefined);
        });
    });

    describe('findMine', () => {
        it('should return user motorcycles', async () => {
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.findMine(req);
            expect(result).toEqual({ data: [mockMotorcycle], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(service.findAll).toHaveBeenCalledWith('user-1', undefined, undefined, undefined);
        });
    });

    describe('findOne', () => {
        it('should return a motorcycle', async () => {
            const result = await controller.findOne('moto-1');
            expect(result).toEqual(mockMotorcycle);
            expect(service.findOne).toHaveBeenCalledWith('moto-1', undefined);
        });
    });

    describe('update', () => {
        it('should update a motorcycle', async () => {
            const dto = { brand: 'Yamaha' };
            const result = await controller.update('moto-1', dto);
            expect(result).toEqual(mockMotorcycle);
            expect(service.update).toHaveBeenCalledWith('moto-1', dto, undefined);
        });
    });

    describe('remove', () => {
        it('should remove a motorcycle', async () => {
            await controller.remove('moto-1');
            expect(service.remove).toHaveBeenCalledWith('moto-1', undefined);
        });
    });

    describe('addMaintenance', () => {
        it('should add maintenance record', async () => {
            const dto = { type: MaintenanceType.ACEITE, description: 'Oil change', km: 1000, date: '2024-01-01', cost: 50000 };
            const result = await controller.addMaintenance('moto-1', dto);
            expect(result).toEqual(mockMaintenance);
            expect(service.addMaintenance).toHaveBeenCalledWith('moto-1', dto, undefined);
        });
    });

    describe('getMaintenances', () => {
        it('should return maintenance records', async () => {
            const result = await controller.getMaintenances('moto-1');
            expect(result).toEqual([mockMaintenance]);
            expect(service.getMaintenances).toHaveBeenCalledWith('moto-1', undefined);
        });
    });
});
