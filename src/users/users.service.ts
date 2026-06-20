import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './users.types';

@Injectable()
export class UsersService {
    constructor(private db: DatabaseService) { }

    private toSnakeCase(str: string): string {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    async createUser(data: CreateUserDto): Promise<User> {
        const { rows: existingUser } = await this.db.query(
            'SELECT id FROM users WHERE email = $1 LIMIT 1',
            [data.email]
        );

        if (existingUser.length > 0) {
            throw new ConflictException('Email already in use');
        }

        const passToHash = data.password || data.passwordHash || data.password_hash;
        if (!passToHash) throw new ConflictException('Password required');
        const hashedPassword = await bcrypt.hash(passToHash, 10);

        const { rows } = await this.db.query<User>(
            `INSERT INTO users (
                id, name, nickname, email, role, rider_level, password_hash, join_date, is_active
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), true) 
            RETURNING id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate", is_active AS "isActive"`,
            [
                data.name,
                data.nickname,
                data.email,
                data.role || 'piloto',
                data.riderLevel || data.rider_level || 'novato',
                hashedPassword
            ]
        );

        return rows[0];
    }

    async findAll(): Promise<User[]> {
        const { rows } = await this.db.query<User>(`
            SELECT id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate", is_active AS "isActive"
            FROM users
            WHERE is_active = true
        `);
        return rows;
    }

    async findOne(id: string) {
        const { rows: userRows } = await this.db.query<User>(`
            SELECT
                id, name, nickname, email, phone, avatar_url, avatar_initials,
                role, rider_level AS "riderLevel", password_hash AS "passwordHash", fcm_token,
                blood_type AS "bloodType", allergies, medical_conditions AS "medicalConditions",
                ec_name AS "ecName", ec_phone AS "ecPhone", ec_relationship AS "ecRelationship",
                join_date AS "joinDate", rides_completed AS "ridesCompleted", total_km AS "totalKm", is_active AS "isActive"
            FROM users WHERE id = $1
        `, [id]);

        if (userRows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        const user: any = userRows[0];

        const { rows: motorcycles } = await this.db.query(`
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

        const { rows: positions } = await this.db.query(`
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
                join_date AS "joinDate", rides_completed AS "ridesCompleted", total_km AS "totalKm", is_active AS "isActive"
            FROM users WHERE email = $1 LIMIT 1
        `, [email]);
        return rows[0] || null;
    }

    async updateUser(id: string, data: UpdateUserDto): Promise<User> {
        const typedData: any = { ...data };

        if (typedData.passwordHash) {
            typedData.passwordHash = await bcrypt.hash(typedData.passwordHash, 10);
            typedData.password_hash = typedData.passwordHash;
            delete typedData.passwordHash;
        }

        const keys = Object.keys(typedData).filter(x => typedData[x] !== undefined);
        if (keys.length === 0) return this.findOne(id);

        const setString = keys.map((key, i) => `"${this.toSnakeCase(key)}" = $${i + 1}`).join(', ');
        const values = keys.map(k => typedData[k]);
        values.push(id);

        console.log('Updating user with:', { id, data, setString, values }); // Debug log

        const query = `
            UPDATE users
            SET ${setString}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate", is_active AS "isActive"
        `;

        const { rows } = await this.db.query(query, values);
        if (rows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        return rows[0];
    }

    async getMedicalInfo(id: string) {
        const { rows } = await this.db.query(`
            SELECT blood_type AS "bloodType", allergies, medical_conditions AS "medicalConditions",
                   ec_name AS "ecName", ec_phone AS "ecPhone", ec_relationship AS "ecRelationship"
            FROM users WHERE id = $1
        `, [id]);

        if (rows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return rows[0];
    }

    async remove(id: string) {
        const { rows } = await this.db.query(`
            UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 
            RETURNING id, name, nickname, email, role, rider_level AS "riderLevel", join_date AS "joinDate", is_active AS "isActive"
        `, [id]);

        if (rows.length === 0) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return rows[0];
    }
}
