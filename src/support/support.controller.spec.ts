import { Test, TestingModule } from '@nestjs/testing';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportType } from './dto/create-support.dto';
import { DatabaseService } from '../database/database.service';
import { Reflector } from '@nestjs/core';

describe('SupportController', () => {
    let controller: SupportController;
    let service: SupportService;

    const mockPoint = { id: 'point-1', name: 'Shop', lat: 1, lng: 2, type: 'mecanico', address: 'Addr', phone: '123', isVerified: true, createdAt: new Date() };
    const mockSummary = { id: 'point-1', name: 'Shop', type: 'mecanico', isVerified: true };
    const mockVerify = { id: 'point-1', isVerified: true, verifiedAt: new Date() };
    const mockReview = { id: 'review-1', pointId: 'point-1', userId: 'user-1', rating: 5, comment: 'Good', createdAt: new Date() };

    beforeEach(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [SupportController],
            providers: [
                {
                    provide: SupportService,
                    useValue: {
                        search: jest.fn().mockResolvedValue([mockPoint]),
                        create: jest.fn().mockResolvedValue(mockSummary),
                        verify: jest.fn().mockResolvedValue(mockVerify),
                        review: jest.fn().mockResolvedValue(mockReview),
                    },
                },
                { provide: DatabaseService, useValue: { query: jest.fn() } },
                { provide: Reflector, useValue: new Reflector() },
            ],
        }).compile();

        controller = moduleRef.get<SupportController>(SupportController);
        service = moduleRef.get<SupportService>(SupportService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('search', () => {
        it('should search support points', async () => {
            const result = await controller.search(1, 2, 5000, SupportType.TALLER, 'club-1');
            expect(result).toEqual([mockPoint]);
            expect(service.search).toHaveBeenCalledWith(1, 2, 5000, SupportType.TALLER, 'club-1');
        });
    });

    describe('create', () => {
        it('should create a support point', async () => {
            const dto = { name: 'Shop', lat: 1, lng: 2, type: SupportType.TALLER, address: 'Addr', phone: '123' };
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.create(req, dto);
            expect(result).toEqual(mockSummary);
            expect(service.create).toHaveBeenCalledWith('user-1', dto, undefined);
        });
    });

    describe('verify', () => {
        it('should verify a support point', async () => {
            const result = await controller.verify('point-1');
            expect(result).toEqual(mockVerify);
            expect(service.verify).toHaveBeenCalledWith('point-1', undefined);
        });
    });

    describe('review', () => {
        it('should add a review', async () => {
            const dto = { rating: 5, comment: 'Good' };
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.review(req, 'point-1', dto);
            expect(result).toEqual(mockReview);
            expect(service.review).toHaveBeenCalledWith('point-1', 'user-1', dto, undefined);
        });
    });
});
