import { Test, TestingModule } from '@nestjs/testing';
import { ClubMemberRolesGuard } from './club-member-roles.guard';
import { DatabaseService } from '../../database/database.service';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/users.types';

describe('ClubMemberRolesGuard', () => {
    let guard: ClubMemberRolesGuard;
    let db: { query: jest.Mock };
    let reflector: Reflector;

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
        db = { query: jest.fn() };
        reflector = new Reflector();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClubMemberRolesGuard,
                { provide: DatabaseService, useValue: db },
            ],
        }).compile();

        guard = module.get<ClubMemberRolesGuard>(ClubMemberRolesGuard);
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.lider]);
        Object.assign(guard, { reflector });
    });

    it('should allow access when no roles required', async () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
        const context = createContext({ id: 'u1', role: UserRole.piloto }, 'c1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should allow admin bypass', async () => {
        const context = createContext({ id: 'u1', role: UserRole.admin }, 'c1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should allow when user has required club role', async () => {
        db.query.mockResolvedValue({ rows: [{ role: UserRole.lider }] });
        const context = createContext({ id: 'u1', role: UserRole.piloto }, 'c1') as never;
        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should deny when user does not have required club role', async () => {
        db.query.mockResolvedValue({ rows: [{ role: UserRole.piloto }] });
        const context = createContext({ id: 'u1', role: UserRole.piloto }, 'c1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should deny when user is not a club member', async () => {
        db.query.mockResolvedValue({ rows: [] });
        const context = createContext({ id: 'u1', role: UserRole.piloto }, 'c1') as never;
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
});
