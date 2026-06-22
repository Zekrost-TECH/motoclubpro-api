import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateMotorcycleDto } from './dto/create-motorcycle.dto';
import { UpdateMotorcycleDto } from './dto/update-motorcycle.dto';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { Motorcycle, MaintenanceRecord } from './motorcycles.types';
import { toSnakeCase } from '../common/utils/string.utils';

@Injectable()
export class MotorcyclesService {
    constructor(private db: DatabaseService) { }

    async create(userId: string, data: CreateMotorcycleDto, clubId?: string): Promise<Motorcycle> {
        const { rows } = await this.db.query<Motorcycle>(
            `INSERT INTO motorcycles (
                id, user_id, brand, model, year, cc, plate, color,
                current_km, next_service_km, soat_expiry, tech_review_expiry,
                club_id, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12,
                NOW(), NOW()
            ) RETURNING
                id, user_id AS "userId", brand, model, year, cc, plate, color,
                current_km AS "currentKm", next_service_km AS "nextServiceKm",
                soat_expiry AS "soatExpiry", tech_review_expiry AS "techReviewExpiry",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
            [
                userId,
                data.brand,
                data.model,
                data.year,
                data.cc || null,
                data.plate,
                data.color || null,
                data.currentKm || 0,
                data.nextServiceKm || null,
                data.soatExpiry || null,
                data.techReviewExpiry || null,
                clubId || null,
            ],
        );

        return rows[0];
    }

    async findAll(userId?: string, clubId?: string, page = 1, limit = 20): Promise<{ data: Motorcycle[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        let query = `
            SELECT id, user_id AS "userId", brand, model, year, cc, plate, color,
                   current_km AS "currentKm", next_service_km AS "nextServiceKm",
                   soat_expiry AS "soatExpiry", tech_review_expiry AS "techReviewExpiry",
                   created_at AS "createdAt", updated_at AS "updatedAt"
            FROM motorcycles
        `;
        let countQuery = `SELECT COUNT(*)::int as count FROM motorcycles`;
        const params: (string | null)[] = [];
        const conditions: string[] = [];

        if (clubId) {
            params.push(clubId);
            conditions.push(`club_id = $${params.length}`);
        }

        if (userId) {
            params.push(userId);
            conditions.push(`user_id = $${params.length}`);
        }

        const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
        query += whereClause;
        countQuery += whereClause;

        query += ` ORDER BY created_at DESC`;

        const offset = (page - 1) * limit;
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const [{ rows: countRows }, { rows }] = await Promise.all([
            this.db.query<{ count: number }>(countQuery, params),
            this.db.query<Motorcycle>(query, [...params, limit, offset]),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: string, clubId?: string): Promise<Motorcycle> {
        let query = `SELECT id, user_id AS "userId", brand, model, year, cc, plate, color,
                   current_km AS "currentKm", next_service_km AS "nextServiceKm",
                   soat_expiry AS "soatExpiry", tech_review_expiry AS "techReviewExpiry",
                   created_at AS "createdAt", updated_at AS "updatedAt"
            FROM motorcycles
            WHERE id = $1`;
        const params: (string | null)[] = [id];

        if (clubId) {
            query += ' AND club_id = $2';
            params.push(clubId);
        }
        query += ' LIMIT 1';

        const { rows } = await this.db.query<Motorcycle>(query, params);

        if (rows.length === 0) {
            throw new NotFoundException(`Motorcycle with ID ${id} not found`);
        }

        return rows[0];
    }

    async update(id: string, data: UpdateMotorcycleDto, clubId?: string): Promise<Motorcycle> {
        const typedData: Record<string, unknown> = { ...data };

        const keys = Object.keys(typedData).filter((x) => typedData[x] !== undefined);
        if (keys.length === 0) return this.findOne(id, clubId);

        const setString = keys.map((key, i) => `"${toSnakeCase(key)}" = $${i + 1}`).join(', ');
        const values: unknown[] = keys.map((k) => typedData[k]);
        values.push(id);

        let query = `
            UPDATE motorcycles
            SET ${setString}, updated_at = NOW()
            WHERE id = $${values.length}`;
        if (clubId) {
            values.push(clubId);
            query += ` AND club_id = $${values.length}`;
        }
        query += ` RETURNING id, user_id AS "userId", brand, model, year, cc, plate, color,
                      current_km AS "currentKm", next_service_km AS "nextServiceKm",
                      soat_expiry AS "soatExpiry", tech_review_expiry AS "techReviewExpiry",
                      created_at AS "createdAt", updated_at AS "updatedAt"`;

        const { rows } = await this.db.query<Motorcycle>(query, values);
        if (rows.length === 0) {
            throw new NotFoundException(`Motorcycle with ID ${id} not found`);
        }

        return rows[0];
    }

    async remove(id: string, clubId?: string): Promise<void> {
        let query = `DELETE FROM motorcycles WHERE id = $1`;
        const params: (string | null)[] = [id];
        if (clubId) {
            query += ' AND club_id = $2';
            params.push(clubId);
        }

        const { rowCount } = await this.db.query<Motorcycle>(query, params);

        if (rowCount === 0) {
            throw new NotFoundException(`Motorcycle with ID ${id} not found`);
        }
    }

    private async verifyMotorcycleClub(motorcycleId: string, clubId?: string): Promise<void> {
        if (!clubId) return;
        const { rows } = await this.db.query<{ '1': number }>(
            'SELECT 1 FROM motorcycles WHERE id = $1 AND club_id = $2',
            [motorcycleId, clubId],
        );
        if (rows.length === 0) {
            throw new NotFoundException('Motorcycle not found in this club');
        }
    }

    async addMaintenance(motorcycleId: string, data: CreateMaintenanceDto, clubId?: string): Promise<MaintenanceRecord> {
        await this.verifyMotorcycleClub(motorcycleId, clubId);
        const { rows } = await this.db.query<MaintenanceRecord>(
            `INSERT INTO maintenance_history (
                id, motorcycle_id, type, description, km, date, cost, receipt_url, created_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW()
            ) RETURNING
                id, motorcycle_id AS "motorcycleId", type, description, km, date, cost,
                receipt_url AS "receiptUrl", created_at AS "createdAt"`,
            [
                motorcycleId,
                data.type,
                data.description || null,
                data.km,
                data.date,
                data.cost || null,
                data.receiptUrl || null,
            ],
        );

        return rows[0];
    }

    async getMaintenances(motorcycleId: string, clubId?: string): Promise<MaintenanceRecord[]> {
        await this.verifyMotorcycleClub(motorcycleId, clubId);
        const { rows } = await this.db.query<MaintenanceRecord>(
            `SELECT id, motorcycle_id AS "motorcycleId", type, description, km, date, cost,
                    receipt_url AS "receiptUrl", created_at AS "createdAt"
             FROM maintenance_history
             WHERE motorcycle_id = $1
             ORDER BY date DESC, created_at DESC`,
            [motorcycleId],
        );

        return rows;
    }
}
