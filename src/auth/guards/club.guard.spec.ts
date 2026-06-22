import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClubGuard } from './club.guard';
import { UserRole } from '../../users/users.types';

describe('ClubGuard', () => {
    let guard: ClubGuard;

    beforeEach(() => {
        guard = new ClubGuard();
    });

    const createContext = (user?: { role: UserRole; clubs?: { club_id: string; role: UserRole }[] }, clubId?: string): ExecutionContext => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    user,
                    headers: { 'x-club-id': clubId },
                }),
            }),
        } as unknown as ExecutionContext;
    };

    it('should return false if no user', () => {
        expect(guard.canActivate(createContext())).toBe(false);
    });

    it('should allow admin regardless of club membership', () => {
        const result = guard.canActivate(createContext({ role: UserRole.admin }, 'club-1'));
        expect(result).toBe(true);
    });

    it('should allow if no clubId header', () => {
        const result = guard.canActivate(createContext({ role: UserRole.piloto, clubs: [] }));
        expect(result).toBe(true);
    });

    it('should allow active member', () => {
        const result = guard.canActivate(
            createContext({ role: UserRole.piloto, clubs: [{ club_id: 'club-1', role: UserRole.piloto }] }, 'club-1'),
        );
        expect(result).toBe(true);
    });

    it('should throw ForbiddenException if not a member', () => {
        expect(() =>
            guard.canActivate(
                createContext({ role: UserRole.piloto, clubs: [{ club_id: 'club-2', role: UserRole.piloto }] }, 'club-1'),
            ),
        ).toThrow(ForbiddenException);
    });
});
