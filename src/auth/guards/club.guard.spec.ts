import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClubGuard } from './club.guard';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';

describe('ClubGuard', () => {
    let guard: ClubGuard;
    let db: { query: jest.Mock };

    beforeEach(async () => {
        db = { query: jest.fn() };
        const module = await Test.createTestingModule({
            providers: [ClubGuard, { provide: DatabaseService, useValue: db }],
        }).compile();
        guard = module.get<ClubGuard>(ClubGuard);
    });

    const createContext = (user?: { role: UserRole; id?: string }, clubId?: string): ExecutionContext => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    user,
                    headers: { 'x-club-id': clubId },
                }),
            }),
        } as unknown as ExecutionContext;
    };

    it('should return false if no user', async () => {
        expect(await guard.canActivate(createContext())).toBe(false);
    });

    it('should allow admin regardless of club membership', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        const result = await guard.canActivate(createContext({ role: UserRole.admin }, 'club-1'));
        expect(result).toBe(true);
    });

    it('should allow superadmin regardless of club membership', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        const result = await guard.canActivate(createContext({ role: UserRole.superadmin }, 'club-1'));
        expect(result).toBe(true);
    });

    it('should reject admin operating on a non-existent or inactive club', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        await expect(
            guard.canActivate(createContext({ role: UserRole.admin }, 'club-x')),
        ).rejects.toThrow(ForbiddenException);
    });

    it('should allow if no clubId header', async () => {
        const result = await guard.canActivate(createContext({ role: UserRole.rider, id: 'u1' }));
        expect(result).toBe(true);
    });

    it('should allow active member (verified against DB)', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        const result = await guard.canActivate(
            createContext({ role: UserRole.rider, id: 'u1' }, 'club-1'),
        );
        expect(result).toBe(true);
        expect(db.query).toHaveBeenCalledWith(expect.any(String), ['club-1', 'u1']);
    });

    it('should throw ForbiddenException if not a member', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        await expect(
            guard.canActivate(createContext({ role: UserRole.rider, id: 'u1' }, 'club-1')),
        ).rejects.toThrow(ForbiddenException);
    });
});
