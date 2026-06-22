import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClubRolesGuard } from './club-roles.guard';
import { UserRole } from '../../users/users.types';

describe('ClubRolesGuard', () => {
    let guard: ClubRolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
        guard = new ClubRolesGuard(reflector);
    });

    const createContext = (user?: { role: UserRole; clubs?: { club_id: string; role: UserRole }[] }, clubId?: string): ExecutionContext => {
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

    it('should return true if no required roles', () => {
        reflector.getAllAndOverride.mockReturnValue(null);
        expect(guard.canActivate(createContext())).toBe(true);
    });

    it('should throw if no user or clubId', () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.lider]);
        expect(() => guard.canActivate(createContext())).toThrow(ForbiddenException);
    });

    it('should allow admin regardless of club role', () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.lider]);
        const result = guard.canActivate(createContext({ role: UserRole.admin }, 'club-1'));
        expect(result).toBe(true);
    });

    it('should allow if user has required role in club', () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.lider]);
        const result = guard.canActivate(
            createContext({ role: UserRole.piloto, clubs: [{ club_id: 'club-1', role: UserRole.lider }] }, 'club-1'),
        );
        expect(result).toBe(true);
    });

    it('should throw if user lacks required role', () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
        expect(() =>
            guard.canActivate(
                createContext({ role: UserRole.piloto, clubs: [{ club_id: 'club-1', role: UserRole.lider }] }, 'club-1'),
            ),
        ).toThrow(ForbiddenException);
    });
});
