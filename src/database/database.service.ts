import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });
    }

    async onModuleInit() {
        await this.pool.connect();
        console.log('Database connection established');
    }

    async onModuleDestroy() {
        await this.pool.end();
        console.log('Database connection closed');
    }

    getPool(): Pool { return this.pool; }

    async query<T extends QueryResultRow = any>(queryText: string, values?: any[]): Promise<QueryResult<T>> {
        return this.pool.query<T>(queryText, values);
    }
}
