import { Test, TestingModule } from '@nestjs/testing';
import { ClubMemberRolesGuard } from './club-member-roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/users.types';

describe('ClubMemberRolesGuard', () => {
    let guard: ClubMemberRolesGuard;
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
        reflector = new Reflector();

        const module: TestingModule = await Test.createTestingModule({
            providers: [ClubMemberRolesGuard],
        }).compile();

        guard = module.get<ClubMemberRolesGuard>(ClubMemberRolesGuard);
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.leader]);
        Object.assign(guard, { reflector });
    });

    it('should allow access when no roles required', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
        const context = createContext({ id: 'u1', role: UserRole.rider }, 'c1') as never;
        expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow admin bypass', () => {
        const context = createContext({ id: 'u1', role: UserRole.admin }, 'c1') as never;
        expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow when user has required club role via JWT', () => {
        const context = createContext({ id: 'u1', role: UserRole.rider, clubs: [{ club_id: 'c1', role: UserRole.leader }] }, 'c1') as never;
        expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny when user does not have required club role', () => {
        const context = createContext({ id: 'u1', role: UserRole.rider, clubs: [{ club_id: 'c1', role: UserRole.rider }] }, 'c1') as never;
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should deny when user is not a club member', () => {
        const context = createContext({ id: 'u1', role: UserRole.rider, clubs: [] }, 'c1') as never;
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
});
