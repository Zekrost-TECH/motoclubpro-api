import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/users.types';

describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
        reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
        guard = new RolesGuard(reflector);
    });

    const createContext = (user?: { role: UserRole }): ExecutionContext => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ user }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext;
    };

    it('should return true if no required roles', () => {
        reflector.getAllAndOverride.mockReturnValue(null);
        expect(guard.canActivate(createContext())).toBe(true);
    });

    it('should throw UnauthorizedException if no user', () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
        expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
    });

    it('should allow if user has required role', () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.admin, UserRole.leader]);
        const result = guard.canActivate(createContext({ role: UserRole.leader }));
        expect(result).toBe(true);
    });

    it('should deny if user lacks required role', () => {
        reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
        const result = guard.canActivate(createContext({ role: UserRole.rider }));
        expect(result).toBe(false);
    });
});
