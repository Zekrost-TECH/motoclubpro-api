import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../notifications/mail.service';
import { RideRolesService } from '../ride-roles/ride-roles.service';
import { PlansService } from '../plans/plans.service';
import { UserRole } from '../users/users.types';

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
                { provide: MailService, useValue: { sendInvitation: jest.fn().mockResolvedValue(true), sendWelcomeClub: jest.fn().mockResolvedValue(true) } },
                { provide: RideRolesService, useValue: { seedDefaults: jest.fn().mockResolvedValue(undefined) } },
                { provide: PlansService, useValue: { assertCanAddMember: jest.fn().mockResolvedValue(undefined), getClubLimits: jest.fn().mockResolvedValue(undefined) } },
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

        it('should reject a second club for a non-superadmin owner', async () => {
            client.query = jest.fn((query: string) => Promise.resolve({
                rows: query.includes('role = \'superadmin\'')
                    ? [{ is_superadmin: false }]
                    : query.includes('FROM club_members')
                        ? [{ id: 'existing' }]
                        : [],
            }));

            await expect(
                service.create({ name: 'Otro Club', ownerUserId: 'user-1' }),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should allow superadmin to create multiple clubs', async () => {
            client.query = jest.fn((query: string) => {
                if (query === 'BEGIN') return { rows: [] };
                if (query.includes('role = \'superadmin\'')) return { rows: [{ is_superadmin: true }] };
                if (query.includes('INSERT INTO clubs')) return { rows: [{ id: 'club-2', name: 'Club 2', slug: 'club-2' }] };
                if (query.includes('INSERT INTO club_members')) return { rows: [] };
                if (query.includes('SELECT id FROM plans')) return { rows: [{ id: 'prueba' }] };
                if (query.includes('INSERT INTO club_subscriptions')) return { rows: [] };
                if (query === 'COMMIT') return { rows: [] };
                return { rows: [] };
            });

            const result = await service.create({ name: 'Club 2', ownerUserId: 'super-1' });
            expect(result.id).toBe('club-2');
        });

        it('should auto-generate a unique slug when omitted or taken', async () => {
            const slugsChecked: string[] = [];
            client.query = jest.fn((query: string) => {
                if (query === 'BEGIN') return { rows: [] };
                if (query.includes('role = \'superadmin\'')) return { rows: [{ is_superadmin: true }] };
                if (query.includes('SELECT 1 FROM clubs WHERE slug')) {
                    slugsChecked.push(query.match(/\$1/) ? '' : '');
                    // primera consulta: slug tomado; segunda: libre
                    return { rows: slugsChecked.length === 1 ? [{ id: 'taken' }] : [] };
                }
                if (query.includes('INSERT INTO clubs')) return { rows: [{ id: 'club-3', name: 'Iron Bikers', slug: 'iron-bikers-2' }] };
                if (query.includes('INSERT INTO club_members')) return { rows: [] };
                if (query.includes('SELECT id FROM plans')) return { rows: [{ id: 'prueba' }] };
                if (query.includes('INSERT INTO club_subscriptions')) return { rows: [] };
                if (query === 'COMMIT') return { rows: [] };
                return { rows: [] };
            });

            await service.create({ name: 'Iron Bikers', ownerUserId: 'super-1' });

            const slugQueries = client.query.mock.calls.filter(([q]) => String(q).includes('SELECT 1 FROM clubs WHERE slug'));
            expect(slugQueries.length).toBeGreaterThanOrEqual(2);
        });

        it('should send welcome email when ownerEmail is provided', async () => {
            client.query = jest.fn((query: string) => {
                if (query === 'BEGIN') return { rows: [] };
                if (query.includes('role = \'superadmin\'')) return { rows: [{ is_superadmin: true }] };
                if (query.includes('INSERT INTO clubs')) return { rows: [{ id: 'club-1', name: 'Test Club', slug: 'test' }] };
                if (query.includes('INSERT INTO club_members')) return { rows: [] };
                if (query.includes('SELECT id FROM plans')) return { rows: [{ id: 'prueba' }] };
                if (query.includes('INSERT INTO club_subscriptions')) return { rows: [] };
                if (query === 'COMMIT') return { rows: [] };
                return { rows: [] };
            });

            await service.create({
                name: 'Test Club', slug: 'test', ownerUserId: 'user-1', ownerEmail: 'owner@example.com',
            });

            const mailService = (service as any).mailService;
            expect(mailService.sendWelcomeClub).toHaveBeenCalledWith({
                email: 'owner@example.com',
                clubName: 'Test Club',
            });
        });
    });

    describe('findBySlug', () => {
        it('should return club by slug', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'club-1', name: 'Test' }] });
            const result = await service.findBySlug('test');
            expect(result?.name).toBe('Test');
        });

        it('should not select DIAN/billing fields in the query', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'club-1', name: 'Test' }] });
            const result = await service.findBySlug('test');
            const sql = db.query.mock.calls[0][0] as string;
            expect(result).toBeDefined();
            expect(sql).not.toMatch(/nit|billing_address|billing_phone|billing_contact|tax_regime/);
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

    describe('inviteMember', () => {
        it('should throw ForbiddenException when no inviter', async () => {
            await expect(service.inviteMember('club-1', 'u1', undefined, 'rider')).rejects.toThrow(ForbiddenException);
        });

        it('should reject a leader inviting an admin', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ role: 'leader' }] });
            await expect(
                service.inviteMember('club-1', 'u1', undefined, 'admin', { id: 'inviter', email: 'i@b.com', role: UserRole.leader }),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should allow a club admin inviting a leader', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [] });
            await service.inviteMember('club-1', 'u1', undefined, 'leader', { id: 'inviter', email: 'i@b.com', role: UserRole.rider });
            expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO club_members'), ['club-1', 'u1', 'leader']);
        });

        it('should allow superadmin to invite with any role', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [] });
            await service.inviteMember('club-1', 'u1', undefined, 'admin', { id: 'sa', email: 'sa@b.com', role: UserRole.superadmin });
            expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO club_members'), ['club-1', 'u1', 'admin']);
        });
    });
});
