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
        const maxConnections = parseInt(this.configService.get<string>('DATABASE_POOL_MAX') ?? '', 10);
        const statementTimeout = parseInt(this.configService.get<string>('DATABASE_STATEMENT_TIMEOUT_MS') ?? '', 10);
        const queryTimeout = parseInt(this.configService.get<string>('DATABASE_QUERY_TIMEOUT_MS') ?? '', 10);

        this.pool = new Pool({
            connectionString,
            max: Number.isNaN(maxConnections) ? 20 : maxConnections,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            statement_timeout: Number.isNaN(statementTimeout) ? undefined : statementTimeout,
            query_timeout: Number.isNaN(queryTimeout) ? undefined : queryTimeout,
            ...(ssl === 'true' || ssl === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
        });

        this.pool.on('error', (err) => {
            this.logger.error('Unexpected PostgreSQL pool error', err instanceof Error ? err.stack : String(err));
        });
    }

    private static readonly MAX_RETRIES = 5;
    private static readonly RETRY_DELAY_MS = 3000;

    async onModuleInit() {
        let lastError: unknown;
        for (let attempt = 1; attempt <= DatabaseService.MAX_RETRIES; attempt++) {
            try {
                const client = await this.pool.connect();
                this.logger.log('PostgreSQL pool connected');
                client.release();
                return;
            } catch (err) {
                lastError = err;
                if (attempt < DatabaseService.MAX_RETRIES) {
                    this.logger.warn(
                        `PostgreSQL connection attempt ${attempt}/${DatabaseService.MAX_RETRIES} failed, retrying in ${DatabaseService.RETRY_DELAY_MS}ms...`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, DatabaseService.RETRY_DELAY_MS));
                }
            }
        }
        this.logger.error(
            `PostgreSQL connection failed after ${DatabaseService.MAX_RETRIES} attempts`,
            lastError instanceof Error ? lastError.stack : String(lastError),
        );
        throw lastError;
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
