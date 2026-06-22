import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';

@Controller('health')
@ApiTags('health')
export class HealthController {
    constructor(
        private readonly db: DatabaseService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) { }

    @Get()
    async check(): Promise<{ status: string; services: { database: string; redis: string } }> {
        try {
            await this.db.query('SELECT 1');
            await this.redis.ping();
            return { status: 'ok', services: { database: 'ok', redis: 'ok' } };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            throw new ServiceUnavailableException({ status: 'error', message: errorMessage });
        }
    }
}
