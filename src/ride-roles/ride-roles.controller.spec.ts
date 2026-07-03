import { Test, TestingModule } from '@nestjs/testing';
import { RideRolesController } from './ride-roles.controller';
import { RideRolesService } from './ride-roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import type { ClubRideRole } from './ride-roles.types';

describe('RideRolesController', () => {
    let controller: RideRolesController;
    let serviceMock: jest.Mocked<Partial<RideRolesService>>;

    const mockRole: ClubRideRole = {
        id: 'role-1',
        club_id: 'club-1',
        slug: 'puntero',
        name: 'Puntero',
        is_unique: true,
        sort_order: 1,
        created_at: new Date(),
        updated_at: new Date(),
    };

    beforeEach(async () => {
        serviceMock = {
            findByClub: jest.fn().mockResolvedValue([mockRole]),
            create: jest.fn().mockResolvedValue(mockRole),
            update: jest.fn().mockResolvedValue(mockRole),
            delete: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [RideRolesController],
            providers: [{ provide: RideRolesService, useValue: serviceMock }],
        })
            .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
            .overrideGuard(ClubGuard).useValue({ canActivate: () => true })
            .overrideGuard(ClubRolesGuard).useValue({ canActivate: () => true })
            .compile();

        controller = module.get<RideRolesController>(RideRolesController);
    });

    describe('findAll', () => {
        it('should return ride roles for the club', async () => {
            const result = await controller.findAll('club-1');
            expect(result).toEqual([mockRole]);
            expect(serviceMock.findByClub).toHaveBeenCalledWith('club-1');
        });
    });

    describe('create', () => {
        it('should create a ride role', async () => {
            const dto = { slug: 'puntero', name: 'Puntero', is_unique: true, sort_order: 1 };
            const result = await controller.create('club-1', dto as any);
            expect(result).toEqual(mockRole);
            expect(serviceMock.create).toHaveBeenCalledWith('club-1', dto);
        });
    });

    describe('update', () => {
        it('should update a ride role', async () => {
            const dto = { name: 'Puntero principal' };
            const result = await controller.update('club-1', 'role-1', dto as any);
            expect(result).toEqual(mockRole);
            expect(serviceMock.update).toHaveBeenCalledWith('club-1', 'role-1', dto);
        });
    });

    describe('remove', () => {
        it('should remove a ride role', async () => {
            await controller.remove('club-1', 'role-1');
            expect(serviceMock.delete).toHaveBeenCalledWith('club-1', 'role-1');
        });
    });
});
