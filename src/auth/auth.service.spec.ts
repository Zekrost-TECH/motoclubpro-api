import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../users/users.types';

jest.mock('bcrypt', () => ({
    compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
    let service: AuthService;
    let usersService: jest.Mocked<UsersService>;
    let jwtService: jest.Mocked<JwtService>;
    let configService: jest.Mocked<ConfigService>;
    let redis: { get: jest.Mock; set: jest.Mock };

    const mockUser = {
        id: 'user-1',
        name: 'Test',
        nickname: 'test',
        email: 'test@test.com',
        role: UserRole.rider,
        riderLevel: 'novato',
        passwordHash: 'hashed',
        joinDate: new Date(),
        isActive: true,
    };

    beforeEach(async () => {
        usersService = {
            findByEmail: jest.fn(),
            findOne: jest.fn(),
            getUserClubs: jest.fn().mockResolvedValue([{ club_id: 'club-1', role: UserRole.rider }]),
        } as unknown as jest.Mocked<UsersService>;

        jwtService = {
            sign: jest.fn().mockReturnValue('signed-token'),
            verify: jest.fn(),
        } as unknown as jest.Mocked<JwtService>;

        configService = {
            get: jest.fn((key: string) => {
                if (key === 'REFRESH_SECRET') return 'refresh-secret';
                if (key === 'REFRESH_EXPIRES_IN') return '30d';
                return null;
            }),
        } as unknown as jest.Mocked<ConfigService>;

        redis = {
            get: jest.fn(),
            set: jest.fn().mockResolvedValue('OK'),
        };

        const db = { query: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: usersService },
                { provide: JwtService, useValue: jwtService },
                { provide: ConfigService, useValue: configService },
                { provide: 'REDIS_CLIENT', useValue: redis },
                { provide: DatabaseService, useValue: db },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
    });

    describe('validateUser', () => {
        it('should return user without passwordHash on valid credentials', async () => {
            usersService.findByEmail.mockResolvedValue(mockUser as never);

            const result = await service.validateUser('test@test.com', 'password');
            expect(result).toBeDefined();
            expect(result?.email).toBe('test@test.com');
            expect(result).not.toHaveProperty('passwordHash');
        });

        it('should return null if user not found', async () => {
            usersService.findByEmail.mockResolvedValue(null);
            const result = await service.validateUser('missing@test.com', 'password');
            expect(result).toBeNull();
        });
    });

    describe('login', () => {
        it('should return access_token, refresh_token and user with clubs', async () => {
            const user = { ...mockUser, clubs: [] };
            delete (user as Record<string, unknown>).passwordHash;

            const result = await service.login(user as never);
            expect(result.access_token).toBe('signed-token');
            expect(result.refresh_token).toBe('signed-token');
            expect(result.user.clubs).toEqual([{ club_id: 'club-1', role: UserRole.rider }]);
        });
    });

    describe('refresh', () => {
        it('should throw if token is blacklisted', async () => {
            redis.get.mockResolvedValue('1');
            await expect(service.refresh('blacklisted-token')).rejects.toThrow(UnauthorizedException);
        });

        it('should return new tokens on valid refresh', async () => {
            redis.get.mockResolvedValue(null);
            jwtService.verify.mockReturnValue({ sub: 'user-1' } as never);
            usersService.findOne.mockResolvedValue(mockUser as never);

            const result = await service.refresh('valid-refresh-token');
            expect(result.access_token).toBe('signed-token');
            expect(result.refresh_token).toBe('signed-token');
            expect(redis.set).toHaveBeenCalledWith('blacklist:valid-refresh-token', '1', 'EX', expect.any(Number));
        });
    });

    describe('logout', () => {
        it('should blacklist both tokens', async () => {
            await service.logout('refresh-token', 'access-token');
            expect(redis.set).toHaveBeenCalledWith('blacklist:refresh-token', '1', 'EX', expect.any(Number));
            expect(redis.set).toHaveBeenCalledWith('blacklist:access-token', '1', 'EX', expect.any(Number));
        });
    });
});
