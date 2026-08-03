import { Test, TestingModule } from '@nestjs/testing';
import { ClubMemberRolesGuard } from './club-member-roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';

describe('ClubMemberRolesGuard', () => {
    let guard: ClubMemberRolesGuard;
    let reflector: Reflector;
    let db: { query: jest.Mock };

    function createContext(user: unknown, clubId: string): unknown {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ user, params: { id: clubId } }),
            }),
            getHandler: () => jest.fn(),
            getClass: () => jest.fn(),
        };
    }

    beforeEach(async () => {
        reflector = new Reflector();
        db = { query: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClubMemberRolesGuard,
                { provide: DatabaseService, useValue: db },
            ],
        }).compile();

        guard = module.get<ClubMemberRolesGuard>(ClubMemberRolesGuard);
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.leader]);
        Object.assign(guard, { reflector });
    });

    it('should allow access when no roles required', async () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'c1') as never;
        expect(await guard.canActivate(context)).toBe(true);
    });

    it('should allow admin bypass', async () => {
        const context = createContext({ id: 'u1', role: UserRole.admin }, 'c1') as never;
        expect(await guard.canActivate(context)).toBe(true);
    });

    it('should allow superadmin bypass', async () => {
        const context = createContext({ id: 'u1', role: UserRole.superadmin }, 'c1') as never;
        expect(await guard.canActivate(context)).toBe(true);
    });

    it('should allow when user has required club role (verified against DB)', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ role: UserRole.leader }] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'c1') as never;
        expect(await guard.canActivate(context)).toBe(true);
        expect(db.query).toHaveBeenCalledWith(expect.any(String), ['c1', 'u1']);
    });

    it('should deny when user does not have required club role', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ role: UserRole.rider }] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'c1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should deny when user is not a club member', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'c1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
});
