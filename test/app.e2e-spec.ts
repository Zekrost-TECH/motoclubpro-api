import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';
import { DatabaseModule } from '../src/database/database.module';
import { RedisModule } from '../src/redis/redis.module';
import { DatabaseService } from '../src/database/database.service';

describe('AppController (e2e)', () => {
    let app: INestApplication;
    let dbQueryMock: jest.Mock;

    beforeAll(async () => {
        dbQueryMock = jest.fn().mockResolvedValue({ rows: [{ count: 0 }] });

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [DatabaseModule, RedisModule, HealthModule],
        })
            .overrideProvider(DatabaseService)
            .useValue({
                query: dbQueryMock,
                getPool: jest.fn().mockReturnValue({ connect: jest.fn().mockReturnValue({ query: jest.fn(), release: jest.fn() }) }),
            })
            .overrideProvider('REDIS_CLIENT')
            .useValue({ ping: jest.fn().mockResolvedValue('PONG') })
            .compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('/health (GET) should return status ok', async () => {
        dbQueryMock.mockResolvedValueOnce({ rows: [{}] });
        const response = await (request as unknown as typeof import('supertest'))(app.getHttpServer()).get('/health');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
    });

    it('/nonexistent (GET) should return 404', async () => {
        const response = await (request as unknown as typeof import('supertest'))(app.getHttpServer()).get('/nonexistent');
        expect(response.status).toBe(404);
    });
});
