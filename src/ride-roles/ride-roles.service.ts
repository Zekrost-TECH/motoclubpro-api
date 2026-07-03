import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ClubRideRole } from './ride-roles.types';
import type { CreateRideRoleDto } from './dto/create-ride-role.dto';
import type { UpdateRideRoleDto } from './dto/update-ride-role.dto';

@Injectable()
export class RideRolesService {
    constructor(private readonly db: DatabaseService) { }

    async findByClub(clubId: string): Promise<ClubRideRole[]> {
        const { rows } = await this.db.query<ClubRideRole>(
            `SELECT id, club_id, slug, name, is_unique, sort_order, created_at, updated_at
             FROM club_ride_roles
             WHERE club_id = $1
             ORDER BY sort_order ASC, name ASC`,
            [clubId],
        );
        return rows;
    }

    async findBySlug(clubId: string, slug: string): Promise<ClubRideRole | null> {
        const { rows } = await this.db.query<ClubRideRole>(
            `SELECT id, club_id, slug, name, is_unique, sort_order, created_at, updated_at
             FROM club_ride_roles
             WHERE club_id = $1 AND slug = $2
             LIMIT 1`,
            [clubId, slug],
        );
        return rows[0] || null;
    }

    async create(clubId: string, dto: CreateRideRoleDto): Promise<ClubRideRole> {
        const slug = dto.slug.trim().toLowerCase().replace(/\s+/g, '_');
        const existing = await this.findBySlug(clubId, slug);
        if (existing) {
            throw new BadRequestException(`El rol "${slug}" ya existe en este club`);
        }
        const { rows } = await this.db.query<ClubRideRole>(
            `INSERT INTO club_ride_roles (club_id, slug, name, is_unique, sort_order)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, club_id, slug, name, is_unique, sort_order, created_at, updated_at`,
            [clubId, slug, dto.name.trim(), dto.is_unique ?? false, dto.sort_order ?? 0],
        );
        return rows[0];
    }

    async update(clubId: string, id: string, dto: UpdateRideRoleDto): Promise<ClubRideRole> {
        const existing = await this.findById(clubId, id);
        if (!existing) {
            throw new NotFoundException('Rol de rodada no encontrado');
        }
        const slug = dto.slug ? dto.slug.trim().toLowerCase().replace(/\s+/g, '_') : existing.slug;
        if (slug !== existing.slug) {
            const conflict = await this.findBySlug(clubId, slug);
            if (conflict && conflict.id !== id) {
                throw new BadRequestException(`El rol "${slug}" ya existe en este club`);
            }
        }
        const { rows } = await this.db.query<ClubRideRole>(
            `UPDATE club_ride_roles
             SET slug = $1, name = $2, is_unique = COALESCE($3, is_unique), sort_order = COALESCE($4, sort_order), updated_at = NOW()
             WHERE id = $5 AND club_id = $6
             RETURNING id, club_id, slug, name, is_unique, sort_order, created_at, updated_at`,
            [slug, dto.name?.trim() ?? existing.name, dto.is_unique, dto.sort_order, id, clubId],
        );
        return rows[0];
    }

    async delete(clubId: string, id: string): Promise<void> {
        const { rowCount } = await this.db.query(
            `DELETE FROM club_ride_roles WHERE id = $1 AND club_id = $2`,
            [id, clubId],
        );
        if (rowCount === 0) {
            throw new NotFoundException('Rol de rodada no encontrado');
        }
    }

    async seedDefaults(clubId: string): Promise<void> {
        const defaults = [
            { slug: 'puntero', name: 'Puntero', is_unique: true, sort_order: 1 },
            { slug: 'barredora', name: 'Barredora', is_unique: true, sort_order: 2 },
            { slug: 'capitan_ruta', name: 'Capitán de ruta', is_unique: false, sort_order: 3 },
            { slug: 'bloqueador', name: 'Bloqueador', is_unique: false, sort_order: 4 },
            { slug: 'cierre_seguridad', name: 'Cierre / Seguridad', is_unique: false, sort_order: 5 },
            { slug: 'jefe_armas', name: 'Jefe de armas', is_unique: false, sort_order: 6 },
            { slug: 'primeros_auxilios', name: 'Primeros auxilios', is_unique: false, sort_order: 7 },
            { slug: 'coordinador_logistico', name: 'Coordinador logístico', is_unique: false, sort_order: 8 },
            { slug: 'comunicador', name: 'Comunicador', is_unique: false, sort_order: 9 },
            { slug: 'rider', name: 'Piloto', is_unique: false, sort_order: 10 },
        ];
        for (const role of defaults) {
            await this.db.query(
                `INSERT INTO club_ride_roles (club_id, slug, name, is_unique, sort_order)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (club_id, slug) DO NOTHING`,
                [clubId, role.slug, role.name, role.is_unique, role.sort_order],
            );
        }
    }

    private async findById(clubId: string, id: string): Promise<ClubRideRole | null> {
        const { rows } = await this.db.query<ClubRideRole>(
            `SELECT id, club_id, slug, name, is_unique, sort_order, created_at, updated_at
             FROM club_ride_roles
             WHERE id = $1 AND club_id = $2
             LIMIT 1`,
            [id, clubId],
        );
        return rows[0] || null;
    }
}
