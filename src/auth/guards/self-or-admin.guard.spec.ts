import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SelfOrAdminGuard } from './self-or-admin.guard';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';

describe('SelfOrAdminGuard', () => {
    let guard: SelfOrAdminGuard;
    let db: { query: jest.Mock };

    beforeEach(async () => {
        db = { query: jest.fn() };
        const module = await Test.createTestingModule({
            providers: [SelfOrAdminGuard, { provide: DatabaseService, useValue: db }],
        }).compile();
        guard = module.get<SelfOrAdminGuard>(SelfOrAdminGuard);
    });

    const createContext = (user: { id: string; role: UserRole }, targetId: string): ExecutionContext => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ user, params: { id: targetId } }),
            }),
        } as unknown as ExecutionContext;
    };

    it('should allow admin to access any user', async () => {
        const ctx = createContext({ id: 'user-1', role: UserRole.admin }, 'user-2');
        expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow superadmin to access any user', async () => {
        const ctx = createContext({ id: 'user-1', role: UserRole.superadmin }, 'user-2');
        expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow user to access their own data', async () => {
        const ctx = createContext({ id: 'user-1', role: UserRole.rider }, 'user-1');
        expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow club leader/admin sharing a club with the target', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        const ctx = createContext({ id: 'user-1', role: UserRole.leader }, 'user-2');
        expect(await guard.canActivate(ctx)).toBe(true);
        expect(db.query).toHaveBeenCalledWith(expect.any(String), ['user-1', 'user-2', UserRole.admin, UserRole.leader]);
    });

    it('should throw ForbiddenException for non-admin accessing another user', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        const ctx = createContext({ id: 'user-1', role: UserRole.rider }, 'user-2');
        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user context is missing', async () => {
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({ user: undefined, params: { id: 'user-1' } }),
            }),
        } as unknown as ExecutionContext;
        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
});
