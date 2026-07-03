import { Test, TestingModule } from '@nestjs/testing';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { Reflector } from '@nestjs/core';

describe('ClubsController', () => {
    let controller: ClubsController;
    let service: ClubsService;

    const mockClub = { id: 'club-1', name: 'Test Club', slug: 'test-club', city: 'Bogota', department: 'Cundinamarca', logo_url: null, nit: null, billing_address: null, billing_phone: null, billing_contact_name: null, billing_contact_email: null, tax_regime: null, is_active: true, created_at: new Date() };
    const mockMember = { id: 'member-1', user_id: 'user-1', club_id: 'club-1', role: 'rider', joined_at: new Date(), is_active: true, name: 'Test User', email: 'test@test.com', avatar_url: null };
    const mockSubscription = { id: 'sub-1', club_id: 'club-1', plan: 'basic', status: 'active', current_period_start: new Date(), current_period_end: new Date(), created_at: new Date() };

    beforeEach(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [ClubsController],
            providers: [
                {
                    provide: ClubsService,
                    useValue: {
                        create: jest.fn().mockResolvedValue(mockClub),
                        findBySlug: jest.fn().mockResolvedValue(mockClub),
                        findMembers: jest.fn().mockResolvedValue({ data: [mockMember], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
                        inviteMember: jest.fn().mockResolvedValue(undefined),
                        updateBillingInfo: jest.fn().mockResolvedValue(undefined),
                        getSubscription: jest.fn().mockResolvedValue(mockSubscription),
                    },
                },
                { provide: DatabaseService, useValue: { query: jest.fn() } },
                { provide: UsersService, useValue: { findByEmail: jest.fn() } },
                { provide: Reflector, useValue: new Reflector() },
            ],
        }).compile();

        controller = moduleRef.get<ClubsController>(ClubsController);
        service = moduleRef.get<ClubsService>(ClubsService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('create', () => {
        it('should create a club', async () => {
            const dto = { name: 'Test Club', slug: 'test-club', city: 'Bogota', department: 'Cundinamarca' };
            const req = { user: { id: 'user-1' } } as any;
            const result = await controller.create(dto, req);
            expect(result).toEqual(mockClub);
            expect(service.create).toHaveBeenCalledWith({ ...dto, ownerUserId: 'user-1' });
        });
    });

    describe('findBySlug', () => {
        it('should return a club by slug', async () => {
            const result = await controller.findBySlug('test-club');
            expect(result).toEqual(mockClub);
            expect(service.findBySlug).toHaveBeenCalledWith('test-club');
        });

        it('should throw NotFoundException when club not found', async () => {
            jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(null);
            await expect(controller.findBySlug('not-found')).rejects.toThrow(NotFoundException);
        });
    });

    describe('findMembers', () => {
        it('should return members', async () => {
            const result = await controller.findMembers('club-1');
            expect(result).toEqual({ data: [mockMember], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
            expect(service.findMembers).toHaveBeenCalledWith('club-1', undefined, undefined);
        });
    });

    describe('inviteMember', () => {
        it('should invite a member by userId', async () => {
            const dto = { userId: 'user-2', role: 'rider' };
            const req = { user: { id: 'admin-1', email: 'admin@test.com' } } as any;
            const result = await controller.inviteMember('club-1', dto, req);
            expect(result).toEqual({ ok: true });
            expect(service.inviteMember).toHaveBeenCalledWith('club-1', 'user-2', undefined, 'rider', req.user);
        });

        it('should invite a member by email creating a new account', async () => {
            const dto = { email: 'new@user.com', role: 'rider' };
            const req = { user: { id: 'admin-1', email: 'admin@test.com' } } as any;
            const result = await controller.inviteMember('club-1', dto, req);
            expect(result).toEqual({ ok: true });
            expect(service.inviteMember).toHaveBeenCalledWith('club-1', undefined, 'new@user.com', 'rider', req.user);
        });
    });

    describe('updateBilling', () => {
        it('should update billing info', async () => {
            const dto = { nit: '123', billingAddress: 'Addr' };
            const result = await controller.updateBilling('club-1', dto);
            expect(result).toEqual({ ok: true });
            expect(service.updateBillingInfo).toHaveBeenCalledWith('club-1', dto);
        });
    });

    describe('getSubscription', () => {
        it('should return subscription', async () => {
            const result = await controller.getSubscription('club-1');
            expect(result).toEqual(mockSubscription);
            expect(service.getSubscription).toHaveBeenCalledWith('club-1');
        });
    });
});
