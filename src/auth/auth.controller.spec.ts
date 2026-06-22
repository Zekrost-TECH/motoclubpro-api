import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../users/users.types';

describe('AuthController', () => {
    let controller: AuthController;
    let authService: jest.Mocked<AuthService>;

    beforeEach(async () => {
        authService = {
            validateUser: jest.fn(),
            login: jest.fn(),
            register: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
        } as unknown as jest.Mocked<AuthService>;

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [{ provide: AuthService, useValue: authService }],
        }).compile();

        controller = module.get<AuthController>(AuthController);
    });

    describe('login', () => {
        it('should return tokens on valid credentials', async () => {
            const mockUser = { id: 'u1', email: 't@test.com', role: UserRole.piloto };
            const mockResponse = { access_token: 'at', refresh_token: 'rt', user: { id: 'u1', email: 't@test.com', role: UserRole.piloto, clubs: [] } };
            authService.validateUser.mockResolvedValue(mockUser as never);
            authService.login.mockResolvedValue(mockResponse as never);

            const result = await controller.login({ email: 't@test.com', password: 'pass' } as never);
            expect(result.access_token).toBe('at');
            expect(authService.validateUser).toHaveBeenCalledWith('t@test.com', 'pass');
        });

        it('should throw UnauthorizedException on invalid credentials', async () => {
            authService.validateUser.mockResolvedValue(null);
            await expect(controller.login({ email: 'bad@test.com', password: 'wrong' } as never)).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('register', () => {
        it('should return tokens after registration', async () => {
            const mockResponse = { access_token: 'at', refresh_token: 'rt', user: { id: 'u1', email: 't@test.com', role: UserRole.piloto, clubs: [] } };
            authService.register.mockResolvedValue(mockResponse as never);

            const result = await controller.register({ email: 't@test.com', password: 'pass', name: 'Test' } as never);
            expect(result.access_token).toBe('at');
        });
    });

    describe('refresh', () => {
        it('should return new tokens', async () => {
            authService.refresh.mockResolvedValue({ access_token: 'new-at', refresh_token: 'new-rt' } as never);
            const result = await controller.refresh('old-rt');
            expect(result.access_token).toBe('new-at');
        });

        it('should throw if refresh token is missing', async () => {
            await expect(controller.refresh('')).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('logout', () => {
        it('should return success message', async () => {
            authService.logout.mockResolvedValue(undefined);
            const result = await controller.logout({ headers: { authorization: 'Bearer token' }, user: { id: 'u1' } } as never, 'rt');
            expect(result.message).toBe('Logged out successfully');
            expect(authService.logout).toHaveBeenCalledWith('rt', 'token');
        });
    });
});
