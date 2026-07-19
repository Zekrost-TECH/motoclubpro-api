import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './users.types';
import { toSnakeCase } from '../common/utils/string.utils';

@Injectable()
export class UsersService {
    constructor(private db: DatabaseService) { }

    async createUser(data: CreateUserDto): Promise<User> {
        const { rows: existingUser } = await this.db.query(
            'SELECT id FROM users WHERE email = $1 LIMIT 1',
            [data.email]
        );

        if (existingUser.length > 0) {
            throw new ConflictException('Email already in use');
        }

        if (!data.password) throw new ConflictException('Password required');
        const hashedPassword = await bcrypt.hash(data.password, 10);

        const { rows } = await this.db.query<User>(
            `INSERT INTO users (
                id, name, nickname, email, role, rider_level, password_hash, join_date, is_active
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), true) 
            RETURNING id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate", is_active AS "isActive"`,
            [
                data.name,
                data.nickname,
                data.email,
                data.role || 'rider',
                data.riderLevel || 'novato',
                hashedPassword
            ]
        );

        return rows[0];
    }

    async findAll(clubId?: string, page = 1, limit = 20): Promise<{ data: User[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        let query: string;
        let countQuery: string;
        let params: (string | null)[] = [];

        if (clubId) {
            query = `
                SELECT u.id, u.name, u.nickname, u.email, u.role, u.rider_level AS "riderLevel", u.join_date AS "joinDate",
                       u.rides_completed AS "ridesCompleted", u.total_km AS "totalKm", u.is_active AS "isActive"
                FROM users u
                JOIN club_members cm ON u.id = cm.user_id
                WHERE cm.club_id = $1 AND cm.is_active = TRUE AND u.is_active = true
            `;
            countQuery = `SELECT COUNT(*)::int as count FROM users u JOIN club_members cm ON u.id = cm.user_id WHERE cm.club_id = $1 AND cm.is_active = TRUE AND u.is_active = true`;
            params = [clubId];
        } else {
            query = `
                SELECT id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate",
                       rides_completed AS "ridesCompleted", total_km AS "totalKm", is_active AS "isActive"
                FROM users
                WHERE is_active = true
            `;
            countQuery = `SELECT COUNT(*)::int as count FROM users WHERE is_active = true`;
        }

        const offset = (page - 1) * limit;
        query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const [{ rows: countRows }, { rows }] = await Promise.all([
            this.db.query<{ count: number }>(countQuery, params),
            this.db.query<User>(query, [...params, limit, offset]),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    private async computeUserStats(userId: string): Promise<{ ridesCompleted: number; totalKm: number }> {
        const { rows } = await this.db.query<{ ridesCompleted: number; totalKm: number }>(
            `SELECT
                COUNT(ea.event_id)::int AS "ridesCompleted",
                COALESCE(SUM(r.distance_km), 0)::numeric AS "totalKm"
             FROM event_attendees ea
             JOIN events e ON e.id = ea.event_id
             LEFT JOIN routes r ON r.id = e.route_id
             WHERE ea.user_id = $1 AND e.status = 'completado'`,
            [userId],
        );
        return rows[0] ?? { ridesCompleted: 0, totalKm: 0 };
    }

    async findOne(id: string): Promise<User & { motorcycle?: unknown; userPositions?: unknown }> {
        const { rows: userRows } = await this.db.query<User>(`
            SELECT
                id, name, nickname, email, phone, avatar_url, avatar_initials,
                role, rider_level AS "riderLevel", password_hash AS "passwordHash", fcm_token,
                blood_type AS "bloodType", allergies, medical_conditions AS "medicalConditions",
                ec_name AS "ecName", ec_phone AS "ecPhone", ec_relationship AS "ecRelationship",
                join_date AS "joinDate", is_active AS "isActive"
            FROM users WHERE id = $1
        `, [id]);

        if (userRows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        const user = userRows[0] as User & { motorcycle?: unknown; userPositions?: unknown };

        // Calcular estadísticas dinámicamente desde eventos completados
        const stats = await this.computeUserStats(id);
        user.ridesCompleted = stats.ridesCompleted;
        user.totalKm = Number(stats.totalKm);

        const { rows: motorcycles } = await this.db.query<Record<string, unknown>>(`
            SELECT
                id,
                user_id as userId,
                brand,
                model,
                year,
                cc,
                plate,
                color,
                current_km AS "currentKm",
                next_service_km AS "nextServiceKm",
                soat_expiry AS "soatExpiry",
                tech_review_expiry AS "techReviewExpiry",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM motorcycles WHERE user_id = $1
        `, [id]);
        user.motorcycle = motorcycles[0] || null;

        const { rows: positions } = await this.db.query<Record<string, unknown>>(`
            SELECT up.*, cp.name as "clubPositionName", cp.icon as "clubPositionIcon"
            FROM user_positions up
            JOIN club_positions cp ON up.position_id = cp.id
            WHERE up.user_id = $1
        `, [id]);
        user.userPositions = positions;

        return user;
    }

    async findByEmail(email: string): Promise<User | null> {
        const { rows } = await this.db.query<User>(`
            SELECT
                id, name, nickname, email, phone, avatar_url, avatar_initials,
                role, rider_level AS "riderLevel", password_hash AS "passwordHash", fcm_token,
                blood_type AS "bloodType", allergies, medical_conditions AS "medicalConditions",
                ec_name AS "ecName", ec_phone AS "ecPhone", ec_relationship AS "ecRelationship",
                join_date AS "joinDate", is_active AS "isActive"
            FROM users WHERE email = $1 LIMIT 1
        `, [email]);

        const user = rows[0] || null;
        if (user) {
            const stats = await this.computeUserStats(user.id);
            user.ridesCompleted = stats.ridesCompleted;
            user.totalKm = Number(stats.totalKm);
        }
        return user;
    }

    async updateUser(id: string, data: UpdateUserDto): Promise<User> {
        const typedData: Record<string, unknown> = { ...data };

        if (typedData.emergencyContact && typeof typedData.emergencyContact === 'object') {
            const ec = typedData.emergencyContact as Record<string, unknown>;
            typedData.ecName = ec.name ?? typedData.ecName;
            typedData.ecPhone = ec.phone ?? typedData.ecPhone;
            typedData.ecRelationship = ec.relationship ?? typedData.ecRelationship;
            delete typedData.emergencyContact;
        }

        if (typedData.passwordHash) {
            typedData.passwordHash = await bcrypt.hash(typedData.passwordHash as string, 10);
            typedData.password_hash = typedData.passwordHash;
            delete typedData.passwordHash;
        }

        const keys = Object.keys(typedData).filter(x => typedData[x] !== undefined);
        if (keys.length === 0) return this.findOne(id);

        const setString = keys.map((key, i) => `"${toSnakeCase(key)}" = $${i + 1}`).join(', ');
        const values = keys.map(k => typedData[k]);
        values.push(id);

        const query = `
            UPDATE users
            SET ${setString}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate", is_active AS "isActive"
        `;

        const { rows } = await this.db.query<User>(query, values);
        if (rows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        return rows[0];
    }

    async getMedicalInfo(id: string): Promise<User> {
        const { rows } = await this.db.query<User>(`
            SELECT blood_type AS "bloodType", allergies, medical_conditions AS "medicalConditions",
                   ec_name AS "ecName", ec_phone AS "ecPhone", ec_relationship AS "ecRelationship"
            FROM users WHERE id = $1
        `, [id]);

        if (rows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return rows[0];
    }

    async remove(id: string): Promise<User> {
        const { rows } = await this.db.query<User>(`
            UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1
            RETURNING id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate", is_active AS "isActive"
        `, [id]);

        if (rows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return rows[0];
    }

    async getUserClubs(userId: string): Promise<{ club_id: string; role: UserRole }[]> {
        const userRows = await this.db.query<{ role: UserRole }>(
            `SELECT role FROM users WHERE id = $1`,
            [userId],
        );
        const userRole = userRows.rows[0]?.role;

        if (userRole === UserRole.superadmin) {
            const { rows } = await this.db.query<{ club_id: string; role: UserRole }>(
                `SELECT c.id as club_id, $1::user_role as role
                 FROM clubs c
                 WHERE c.is_active = TRUE`,
                [UserRole.superadmin],
            );
            return rows;
        }

        const { rows } = await this.db.query<{ club_id: string; role: UserRole }>(
            `SELECT club_id, role
             FROM club_members
             WHERE user_id = $1 AND is_active = TRUE`,
            [userId],
        );
        return rows;
    }
}
