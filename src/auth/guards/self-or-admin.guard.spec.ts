import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SelfOrAdminGuard } from './self-or-admin.guard';
import { UserRole } from '../../users/users.types';

describe('SelfOrAdminGuard', () => {
    let guard: SelfOrAdminGuard;

    beforeEach(() => {
        guard = new SelfOrAdminGuard();
    });

    const createContext = (user: { id: string; role: UserRole }, targetId: string): ExecutionContext => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ user, params: { id: targetId } }),
            }),
        } as unknown as ExecutionContext;
    };

    it('should allow admin to access any user', () => {
        const ctx = createContext({ id: 'user-1', role: UserRole.admin }, 'user-2');
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow user to access their own data', () => {
        const ctx = createContext({ id: 'user-1', role: UserRole.rider }, 'user-1');
        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should throw ForbiddenException for non-admin accessing another user', () => {
        const ctx = createContext({ id: 'user-1', role: UserRole.rider }, 'user-2');
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user context is missing', () => {
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({ user: undefined, params: { id: 'user-1' } }),
            }),
        } as unknown as ExecutionContext;
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
});
