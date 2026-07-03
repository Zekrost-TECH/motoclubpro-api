import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClubMemberGuard } from './club-member.guard';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';

describe('ClubMemberGuard', () => {
    let guard: ClubMemberGuard;
    let db: { query: jest.Mock };

    beforeEach(async () => {
        db = { query: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClubMemberGuard,
                { provide: DatabaseService, useValue: db },
            ],
        }).compile();
        guard = module.get<ClubMemberGuard>(ClubMemberGuard);
    });

    const createContext = (userId: string, clubId: string): ExecutionContext => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    user: { id: userId, role: UserRole.rider },
                    params: { id: clubId },
                }),
            }),
        } as unknown as ExecutionContext;
    };

    it('should allow active member', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
        const result = await guard.canActivate(createContext('user-1', 'club-1'));
        expect(result).toBe(true);
    });

    it('should allow admin without checking membership', async () => {
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({
                    user: { id: 'admin-1', role: UserRole.admin },
                    params: { id: 'club-1' },
                }),
            }),
        } as unknown as ExecutionContext;
        const result = await guard.canActivate(ctx);
        expect(result).toBe(true);
        expect(db.query).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if not a member', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        await expect(guard.canActivate(createContext('user-1', 'club-1'))).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user context is missing', async () => {
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({ user: undefined, params: { id: 'club-1' } }),
            }),
        } as unknown as ExecutionContext;
        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
});
