import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ClubRolesGuard } from './club-roles.guard';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';

describe('ClubRolesGuard', () => {
    let guard: ClubRolesGuard;
    let reflector: Reflector;
    let db: { query: jest.Mock };

    beforeEach(async () => {
        reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
        db = { query: jest.fn() };
        const module = await Test.createTestingModule({
            providers: [
                ClubRolesGuard,
                { provide: Reflector, useValue: reflector },
                { provide: DatabaseService, useValue: db },
            ],
        }).compile();
        guard = module.get<ClubRolesGuard>(ClubRolesGuard);
    });

    const createContext = (user?: { role: UserRole; id?: string }, clubId?: string): ExecutionContext => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    user,
                    headers: { 'x-club-id': clubId },
                }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext;
    };

    it('should return true if no required roles', async () => {
        reflector.getAllAndOverride.mockReturnValue(null);
        expect(await guard.canActivate(createContext())).toBe(true);
    });

    it('should throw if no user or clubId', async () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.leader]);
        await expect(guard.canActivate(createContext())).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin regardless of club role', async () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.leader]);
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        const result = await guard.canActivate(createContext({ role: UserRole.admin }, 'club-1'));
        expect(result).toBe(true);
    });

    it('should allow superadmin regardless of club role', async () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.leader]);
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        const result = await guard.canActivate(createContext({ role: UserRole.superadmin }, 'club-1'));
        expect(result).toBe(true);
    });

    it('should reject admin operating on a non-existent or inactive club', async () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.leader]);
        db.query.mockResolvedValueOnce({ rows: [] });
        await expect(
            guard.canActivate(createContext({ role: UserRole.admin }, 'club-x')),
        ).rejects.toThrow(ForbiddenException);
    });

    it('should allow if user has required role in club (verified against DB)', async () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.leader]);
        db.query.mockResolvedValueOnce({ rows: [{ role: UserRole.leader }] });
        const result = await guard.canActivate(
            createContext({ role: UserRole.rider, id: 'u1' }, 'club-1'),
        );
        expect(result).toBe(true);
        expect(db.query).toHaveBeenCalledWith(expect.any(String), ['club-1', 'u1']);
    });

    it('should throw if user lacks required role', async () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
        db.query.mockResolvedValueOnce({ rows: [{ role: UserRole.leader }] });
        await expect(
            guard.canActivate(createContext({ role: UserRole.rider, id: 'u1' }, 'club-1')),
        ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if user is not a member of the club', async () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.leader]);
        db.query.mockResolvedValueOnce({ rows: [] });
        await expect(
            guard.canActivate(createContext({ role: UserRole.rider, id: 'u1' }, 'club-1')),
        ).rejects.toThrow(ForbiddenException);
    });
});
