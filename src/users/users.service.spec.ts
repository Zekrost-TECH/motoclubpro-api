import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '../database/database.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UserRole } from './users.types';

describe('UsersService', () => {
    let service: UsersService;
    let db: { query: jest.Mock; getPool: jest.Mock };

    beforeEach(async () => {
        db = {
            query: jest.fn(),
            getPool: jest.fn().mockReturnValue({ connect: jest.fn() }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: DatabaseService, useValue: db },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
    });

    describe('createUser', () => {
        it('should create a user', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            db.query.mockResolvedValueOnce({
                rows: [{
                    id: 'u1', name: 'Test', nickname: 't', email: 't@test.com',
                    role: UserRole.rider, riderLevel: 'novato', joinDate: new Date(), isActive: true,
                }],
            });

            const result = await service.createUser({
                name: 'Test', nickname: 't', email: 't@test.com', password: '123456',
            } as never);

            expect(result.email).toBe('t@test.com');
        });

        it('should throw ConflictException if email exists', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'u1' }] });
            await expect(service.createUser({ email: 't@test.com' } as never)).rejects.toThrow(ConflictException);
        });
    });

    describe('findAll', () => {
        it('should return all active users when no clubId', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'A', role: UserRole.rider }] });
            const result = await service.findAll();
            expect(result.data).toHaveLength(1);
            expect(result.meta.total).toBe(1);
        });

        it('should filter by clubId when provided', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'A', role: UserRole.rider }] });
            const result = await service.findAll('club-1');
            expect(result.data).toHaveLength(1);
            expect(result.meta.total).toBe(1);
        });
    });

    describe('findOne', () => {
        it('should return user with motorcycle and positions', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'A' }] });
            db.query.mockResolvedValueOnce({ rows: [{ brand: 'Yamaha' }] });
            db.query.mockResolvedValueOnce({ rows: [{ clubPositionName: 'President' }] });

            const result = await service.findOne('u1');
            expect(result.id).toBe('u1');
            expect(result.motorcycle).toEqual({ brand: 'Yamaha' });
        });

        it('should throw NotFoundException if user not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
        });
    });

    describe('findByEmail', () => {
        it('should return a user when found', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'u1', email: 't@test.com' }] });
            const result = await service.findByEmail('t@test.com');
            expect(result?.email).toBe('t@test.com');
        });

        it('should return null when not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            const result = await service.findByEmail('missing@test.com');
            expect(result).toBeNull();
        });
    });

    describe('updateUser', () => {
        it('should update a user', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'Updated' }] });
            const result = await service.updateUser('u1', { name: 'Updated' } as never);
            expect(result.name).toBe('Updated');
        });

        it('should hash password when passwordHash provided', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'A' }] });
            await service.updateUser('u1', { passwordHash: 'newpass' } as never);
            const sql = db.query.mock.calls[0][0] as string;
            const values = db.query.mock.calls[0][1] as unknown[];
            expect(sql).toContain('password_hash');
            expect(values[0]).not.toBe('newpass');
        });

        it('should flatten nested emergencyContact into ec columns', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'A' }] });
            await service.updateUser('u1', {
                emergencyContact: { name: 'Jane', phone: '321', relationship: 'spouse' },
            } as never);
            const sql = db.query.mock.calls[0][0] as string;
            const values = db.query.mock.calls[0][1] as unknown[];
            expect(sql).toContain('ec_name');
            expect(sql).toContain('ec_phone');
            expect(sql).toContain('ec_relationship');
            expect(values).toEqual(['Jane', '321', 'spouse', 'u1']);
        });

        it('should return findOne result when no keys to update', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'A' }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });
            const result = await service.updateUser('u1', {} as never);
            expect(result.id).toBe('u1');
        });

        it('should throw NotFoundException when user not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            await expect(service.updateUser('u1', { name: 'X' } as never)).rejects.toThrow(NotFoundException);
        });
    });

    describe('getMedicalInfo', () => {
        it('should return medical info', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ bloodType: 'O+', allergies: 'none' }] });
            const result = await service.getMedicalInfo('u1');
            expect(result.bloodType).toBe('O+');
        });

        it('should throw NotFoundException when user not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            await expect(service.getMedicalInfo('u1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('remove', () => {
        it('should soft-delete a user', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'u1', isActive: false }] });
            const result = await service.remove('u1');
            expect(result.isActive).toBe(false);
        });

        it('should throw NotFoundException when user not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            await expect(service.remove('u1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('getUserClubs', () => {
        it('should return clubs the user belongs to', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ role: UserRole.admin }] });
            db.query.mockResolvedValueOnce({ rows: [{ club_id: 'club-1', role: UserRole.admin }] });
            const result = await service.getUserClubs('u1');
            expect(result).toHaveLength(1);
            expect(result[0].club_id).toBe('club-1');
        });
    });
});
