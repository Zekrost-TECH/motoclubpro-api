import { Test, TestingModule } from '@nestjs/testing';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { DatabaseService } from '../database/database.service';
import { Reflector } from '@nestjs/core';

describe('SosController', () => {
    let controller: SosController;
    let service: SosService;

    const mockAlert = { id: 'alert-1', userId: 'user-1', clubId: 'club-1', type: 'accidente', lat: 1, lng: 2, description: 'Help', status: 'active', createdAt: new Date() };

    beforeEach(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [SosController],
            providers: [
                {
                    provide: SosService,
                    useValue: {
                        create: jest.fn().mockResolvedValue(mockAlert),
                        findAll: jest.fn().mockResolvedValue({ data: [mockAlert], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
                        findActive: jest.fn().mockResolvedValue({ data: [mockAlert], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
                        resolve: jest.fn().mockResolvedValue(mockAlert),
                    },
                },
                { provide: DatabaseService, useValue: { query: jest.fn() } },
                { provide: Reflector, useValue: new Reflector() },
            ],
        }).compile();

        controller = moduleRef.get<SosController>(SosController);
        service = moduleRef.get<SosService>(SosService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should create an SOS alert', async () => {
            const dto = { type: 'accidente', lat: 1, lng: 2, description: 'Help' } as any;
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.create(req, dto);
            expect(result).toEqual(mockAlert);
            expect(service.create).toHaveBeenCalledWith('user-1', dto, undefined);
        });
    });

    describe('findAll', () => {
        it('should return all alerts', async () => {
            const result = await controller.findAll('club-1');
            expect(result).toEqual({ data: [mockAlert], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(service.findAll).toHaveBeenCalledWith('club-1', undefined, undefined);
        });
    });

    describe('findActive', () => {
        it('should return active alerts', async () => {
            const result = await controller.findActive('club-1');
            expect(result).toEqual({ data: [mockAlert], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(service.findActive).toHaveBeenCalledWith('club-1', undefined, undefined);
        });
    });

    describe('resolve', () => {
        it('should resolve an alert', async () => {
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.resolve('alert-1', req);
            expect(result).toEqual(mockAlert);
            expect(service.resolve).toHaveBeenCalledWith('alert-1', 'user-1', undefined);
        });
    });
});
