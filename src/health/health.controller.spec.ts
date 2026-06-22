import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DatabaseService } from '../database/database.service';

describe('HealthController', () => {
    let controller: HealthController;
    let dbMock: { query: jest.Mock };
    let redisMock: { ping: jest.Mock };

    beforeEach(async () => {
        dbMock = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        redisMock = { ping: jest.fn().mockResolvedValue('PONG') };

        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                { provide: DatabaseService, useValue: dbMock },
                { provide: 'REDIS_CLIENT', useValue: redisMock },
            ],
        }).compile();

        controller = moduleRef.get<HealthController>(HealthController);
    });

    describe('check', () => {
        it('should return ok when DB and Redis are healthy', async () => {
            const result = await controller.check();
            expect(result).toEqual({ status: 'ok', services: { database: 'ok', redis: 'ok' } });
            expect(dbMock.query).toHaveBeenCalledWith('SELECT 1');
            expect(redisMock.ping).toHaveBeenCalled();
        });

        it('should throw ServiceUnavailableException when DB fails', async () => {
            dbMock.query.mockRejectedValueOnce(new Error('DB down'));
            await expect(controller.check()).rejects.toThrow('DB down');
        });

        it('should throw ServiceUnavailableException when Redis fails', async () => {
            redisMock.ping.mockRejectedValueOnce(new Error('Redis down'));
            await expect(controller.check()).rejects.toThrow('Redis down');
        });
    });
});
