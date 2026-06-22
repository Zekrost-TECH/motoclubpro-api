import { JwtAuthGuard } from './jwt-auth.guard';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

describe('JwtAuthGuard', () => {
    let guard: JwtAuthGuard;

    beforeEach(() => {
        guard = new JwtAuthGuard();
    });

    function createContext(): ExecutionContext {
        return {
            switchToHttp: () => ({
                getRequest: () => ({}),
            }),
        } as unknown as ExecutionContext;
    }

    it('should throw UnauthorizedException when user is null', () => {
        expect(() => guard.handleRequest(null, null, null, createContext(), null)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when error exists', () => {
        const err = new Error('jwt expired');
        expect(() => guard.handleRequest(err, null, null, createContext(), null)).toThrow(err);
    });

    it('should return user when authenticated', () => {
        const user = { id: 'u1', email: 'a@test.com' };
        const result = guard.handleRequest(null, user, null, createContext(), null);
        expect(result).toBe(user);
    });
});
