import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DatabaseService.name);
    private pool: Pool;

    constructor(private readonly configService: ConfigService) {
        const connectionString = this.configService.get<string>('DATABASE_URL');
        if (!connectionString) {
            throw new Error('DATABASE_URL is not configured');
        }

        const ssl = this.configService.get<string>('DATABASE_SSL');
        this.pool = new Pool({
            connectionString,
            max: 20,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            ...(ssl === 'true' || ssl === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
        });

        this.pool.on('error', (err) => {
            this.logger.error('Unexpected PostgreSQL pool error', err instanceof Error ? err.stack : String(err));
        });
    }

    async onModuleInit() {
        const client = await this.pool.connect();
        this.logger.log('PostgreSQL pool connected');
        client.release();
    }

    async onModuleDestroy() {
        await this.pool.end();
        this.logger.log('PostgreSQL pool closed');
    }

    getPool(): Pool { return this.pool; }

    async query<T extends QueryResultRow = Record<string, unknown>>(queryText: string, values?: unknown[]): Promise<QueryResult<T>> {
        return this.pool.query<T>(queryText, values);
    }
}
