import { Test, TestingModule } from '@nestjs/testing';
import { ClubsService } from './clubs.service';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../notifications/mail.service';
import { RideRolesService } from '../ride-roles/ride-roles.service';
import { PlansService } from '../plans/plans.service';

describe('ClubsService', () => {
    let service: ClubsService;
    let db: { query: jest.Mock; getPool: jest.Mock };
    let client: { query: jest.Mock; release: jest.Mock };

    beforeEach(async () => {
        client = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        };
        db = {
            query: jest.fn(),
            getPool: jest.fn().mockReturnValue({ connect: jest.fn().mockResolvedValue(client) }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClubsService,
                { provide: DatabaseService, useValue: db },
                { provide: UsersService, useValue: { findByEmail: jest.fn() } },
                { provide: MailService, useValue: { sendInvitation: jest.fn().mockResolvedValue(true) } },
                { provide: RideRolesService, useValue: { seedDefaults: jest.fn().mockResolvedValue(undefined) } },
                { provide: PlansService, useValue: { assertCanAddMember: jest.fn().mockResolvedValue(undefined) } },
            ],
        }).compile();

        service = module.get<ClubsService>(ClubsService);
    });

    describe('create', () => {
        it('should create club with owner and trial subscription', async () => {
            client.query = jest.fn((query: string) => {
                if (query === 'BEGIN') return { rows: [] };
                if (query.includes('INSERT INTO clubs')) return { rows: [{ id: 'club-1', name: 'Test Club', slug: 'test' }] };
                if (query.includes('INSERT INTO club_members')) return { rows: [] };
                if (query.includes('SELECT id FROM plans')) return { rows: [{ id: 'prueba' }] };
                if (query.includes('INSERT INTO club_subscriptions')) return { rows: [] };
                if (query === 'COMMIT') return { rows: [] };
                return { rows: [] };
            });

            const result = await service.create({
                name: 'Test Club', slug: 'test', ownerUserId: 'user-1',
            });

            expect(result.id).toBe('club-1');
            expect(client.query).toHaveBeenCalledWith('BEGIN');
            expect(client.query).toHaveBeenCalledWith('COMMIT');
        });
    });

    describe('findBySlug', () => {
        it('should return club by slug', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'club-1', name: 'Test' }] });
            const result = await service.findBySlug('test');
            expect(result?.name).toBe('Test');
        });
    });

    describe('findMembers', () => {
        it('should return active members', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [{ id: 'm1', user_id: 'u1', name: 'Alice', role: 'admin' }] });
            const result = await service.findMembers('club-1');
            expect(result.data).toHaveLength(1);
            expect(result.data[0].name).toBe('Alice');
            expect(result.meta.total).toBe(1);
        });
    });
});
