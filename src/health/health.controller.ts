import { Controller, Get, ServiceUnavailableException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';

@Controller('health')
@ApiTags('health')
export class HealthController {
    private readonly logger = new Logger(HealthController.name);

    constructor(
        private readonly db: DatabaseService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Health check', description: 'Verifica el estado de la base de datos y Redis' })
    async check(): Promise<{ status: string; services: { database: string; redis: string } }> {
        const services: { database: string; redis: string } = { database: 'ok', redis: 'ok' };

        try {
            await this.db.query('SELECT 1');
        } catch (err) {
            services.database = 'error';
            this.logger.error('Health check: database error', err instanceof Error ? err.stack : String(err));
        }

        try {
            await this.redis.ping();
        } catch (err) {
            services.redis = 'error';
            this.logger.error('Health check: redis error', err instanceof Error ? err.stack : String(err));
        }

        if (services.database !== 'ok' || services.redis !== 'ok') {
            throw new ServiceUnavailableException({ status: 'error', services });
        }

        return { status: 'ok', services };
    }
}
