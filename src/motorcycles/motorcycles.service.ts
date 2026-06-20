import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateMotorcycleDto } from './dto/create-motorcycle.dto';
import { UpdateMotorcycleDto } from './dto/update-motorcycle.dto';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { Motorcycle, MaintenanceRecord } from './motorcycles.types';

@Injectable()
export class MotorcyclesService {
    constructor(private db: DatabaseService) { }

    private toSnakeCase(str: string): string {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    async create(userId: string, data: CreateMotorcycleDto): Promise<Motorcycle> {
        const { rows } = await this.db.query<Motorcycle>(
            `INSERT INTO motorcycles (
                id, user_id, brand, model, year, cc, plate, color, 
                current_km, next_service_km, soat_expiry, tech_review_expiry,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 
                $8, $9, $10, $11, 
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
                data.techReviewExpiry || null
            ]
        );

        return rows[0];
    }

    async findAll(userId?: string): Promise<Motorcycle[]> {
        let query = `
            SELECT id, user_id AS "userId", brand, model, year, cc, plate, color,
                   current_km AS "currentKm", next_service_km AS "nextServiceKm",
                   soat_expiry AS "soatExpiry", tech_review_expiry AS "techReviewExpiry",
                   created_at AS "createdAt", updated_at AS "updatedAt"
            FROM motorcycles
        `;
        const params: any[] = [];

        if (userId) {
            query += ` WHERE user_id = $1`;
            params.push(userId);
        }

        query += ` ORDER BY created_at DESC`;

        const { rows } = await this.db.query<Motorcycle>(query, params);
        return rows;
    }

    async findOne(id: string): Promise<Motorcycle> {
        const { rows } = await this.db.query<Motorcycle>(
            `SELECT id, user_id AS "userId", brand, model, year, cc, plate, color,
                   current_km AS "currentKm", next_service_km AS "nextServiceKm",
                   soat_expiry AS "soatExpiry", tech_review_expiry AS "techReviewExpiry",
                   created_at AS "createdAt", updated_at AS "updatedAt"
            FROM motorcycles
            WHERE id = $1 LIMIT 1`,
            [id]
        );

        if (rows.length === 0) {
            throw new NotFoundException(`Motorcycle with ID ${id} not found`);
        }

        return rows[0];
    }

    async update(id: string, data: UpdateMotorcycleDto): Promise<Motorcycle> {
        const typedData: any = { ...data };

        const keys = Object.keys(typedData).filter(x => typedData[x] !== undefined);
        if (keys.length === 0) return this.findOne(id);

        const setString = keys.map((key, i) => `"${this.toSnakeCase(key)}" = $${i + 1}`).join(', ');
        const values = keys.map(k => typedData[k]);
        values.push(id);

        const query = `
            UPDATE motorcycles
            SET ${setString}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING id, user_id AS "userId", brand, model, year, cc, plate, color,
                      current_km AS "currentKm", next_service_km AS "nextServiceKm",
                      soat_expiry AS "soatExpiry", tech_review_expiry AS "techReviewExpiry",
                      created_at AS "createdAt", updated_at AS "updatedAt"
        `;

        const { rows } = await this.db.query<Motorcycle>(query, values);
        if (rows.length === 0) {
            throw new NotFoundException(`Motorcycle with ID ${id} not found`);
        }

        return rows[0];
    }

    async remove(id: string): Promise<void> {
        const { rowCount } = await this.db.query(
            `DELETE FROM motorcycles WHERE id = $1`,
            [id]
        );

        if (rowCount === 0) {
            throw new NotFoundException(`Motorcycle with ID ${id} not found`);
        }
    }

    async addMaintenance(motorcycleId: string, data: CreateMaintenanceDto): Promise<MaintenanceRecord> {
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
                data.receiptUrl || null
            ]
        );

        return rows[0];
    }

    async getMaintenances(motorcycleId: string): Promise<MaintenanceRecord[]> {
        const { rows } = await this.db.query<MaintenanceRecord>(
            `SELECT id, motorcycle_id AS "motorcycleId", type, description, km, date, cost,
                    receipt_url AS "receiptUrl", created_at AS "createdAt"
             FROM maintenance_history
             WHERE motorcycle_id = $1
             ORDER BY date DESC, created_at DESC`,
            [motorcycleId]
        );

        return rows;
    }
}
