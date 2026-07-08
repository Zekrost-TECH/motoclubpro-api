import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AuthModule } from '../src/auth/auth.module';
import { DatabaseModule } from '../src/database/database.module';
import { RedisModule } from '../src/redis/redis.module';
import { DatabaseService } from '../src/database/database.service';
import { TurnstileService } from '../src/turnstile/turnstile.service';

const send = request as unknown as typeof import('supertest');

describe('Auth (e2e)', () => {
    let app: INestApplication;
    let dbQueryMock: jest.Mock;
    let redisMock: { get: jest.Mock; set: jest.Mock };
    let turnstileVerifyMock: jest.Mock;

    let passwordHash: string;
    const password = 'Password123';

    // Mutable per-test fixtures
    let existingEmailRows: unknown[] = [];
    let loginUserRows: unknown[] = [];

    const insertedUser = {
        id: 'user-1',
        name: 'New Rider',
        nickname: 'rider',
        email: 'rider@example.com',
        role: 'piloto',
        riderLevel: 'novato',
        joinDate: new Date().toISOString(),
        isActive: true,
    };

    beforeAll(async () => {
        passwordHash = await bcrypt.hash(password, 10);

        dbQueryMock = jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('INSERT INTO users')) return Promise.resolve({ rows: [insertedUser] });
            if (sql.includes('SELECT id FROM users WHERE email')) return Promise.resolve({ rows: existingEmailRows });
            if (sql.includes('FROM users WHERE email')) return Promise.resolve({ rows: loginUserRows });
            if (sql.includes('FROM club_members')) return Promise.resolve({ rows: [] });
            if (sql.includes('FROM users WHERE id')) {
                return Promise.resolve({ rows: [{ ...insertedUser, isActive: true }] });
            }
            if (sql.includes('FROM motorcycles')) return Promise.resolve({ rows: [] });
            if (sql.includes('user_positions')) return Promise.resolve({ rows: [] });
            return Promise.resolve({ rows: [] });
        });

        redisMock = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
        };

        turnstileVerifyMock = jest.fn().mockResolvedValue(true);

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    ignoreEnvFile: true,
                    load: [() => ({
                        JWT_SECRET: 'test-jwt-secret-32-characters-long',
                        JWT_EXPIRES_IN: '15m',
                        REFRESH_SECRET: 'test-refresh-secret-32-chars-long',
                        REFRESH_EXPIRES_IN: '30d',
                        REDIS_URL: 'redis://localhost:6379',
                    })],
                }),
                DatabaseModule,
                RedisModule,
                AuthModule,
            ],
        })
            .overrideProvider(DatabaseService)
            .useValue({ query: dbQueryMock, getPool: jest.fn() })
            .overrideProvider('REDIS_CLIENT')
            .useValue(redisMock)
            .overrideProvider(TurnstileService)
            .useValue({ verifyToken: turnstileVerifyMock })
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('POST /auth/register should create a user and return tokens', async () => {
        existingEmailRows = [];
        const res = await send(app.getHttpServer())
            .post('/auth/register')
            .send({ name: 'New Rider', email: 'rider@example.com', password });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
        expect(res.body.user.email).toBe('rider@example.com');
    });

    it('POST /auth/login should return tokens with valid credentials', async () => {
        loginUserRows = [{
            id: 'user-1',
            name: 'New Rider',
            email: 'rider@example.com',
            role: 'piloto',
            passwordHash,
            isActive: true,
        }];

        const res = await send(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'rider@example.com', password });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
    });

    it('POST /auth/login should return 401 with invalid credentials', async () => {
        loginUserRows = [];
        const res = await send(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'nobody@example.com', password: 'wrong' });

        expect(res.status).toBe(401);
    });

    it('POST /auth/login/web should return tokens with valid credentials and Turnstile token', async () => {
        turnstileVerifyMock.mockResolvedValueOnce(true);
        loginUserRows = [{
            id: 'user-1',
            name: 'New Rider',
            email: 'rider@example.com',
            role: 'piloto',
            passwordHash,
            isActive: true,
        }];

        const res = await send(app.getHttpServer())
            .post('/auth/login/web')
            .send({ email: 'rider@example.com', password, turnstileToken: 'valid-token' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
        expect(turnstileVerifyMock).toHaveBeenCalledWith('valid-token', expect.any(String));
    });

    it('POST /auth/login/web should return 401 when Turnstile verification fails', async () => {
        turnstileVerifyMock.mockResolvedValueOnce(false);
        loginUserRows = [{
            id: 'user-1',
            name: 'New Rider',
            email: 'rider@example.com',
            role: 'piloto',
            passwordHash,
            isActive: true,
        }];

        const res = await send(app.getHttpServer())
            .post('/auth/login/web')
            .send({ email: 'rider@example.com', password, turnstileToken: 'invalid-token' });

        expect(res.status).toBe(401);
        expect(turnstileVerifyMock).toHaveBeenCalledWith('invalid-token', expect.any(String));
    });

    it('POST /auth/refresh should issue new tokens with a valid refresh token', async () => {
        loginUserRows = [{
            id: 'user-1',
            name: 'New Rider',
            email: 'rider@example.com',
            role: 'piloto',
            passwordHash,
            isActive: true,
        }];

        const loginRes = await send(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'rider@example.com', password });

        const refreshToken = loginRes.body.refresh_token as string;

        const res = await send(app.getHttpServer())
            .post('/auth/refresh')
            .send({ refresh_token: refreshToken });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
    });

    it('POST /auth/refresh should return 401 when refresh token is missing', async () => {
        const res = await send(app.getHttpServer()).post('/auth/refresh').send({});
        expect(res.status).toBe(401);
    });
});
