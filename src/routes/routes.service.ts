import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateWaypointDto } from './dto/create-waypoint.dto';
import { Route, Waypoint } from './routes.types';
import { toSnakeCase } from '../common/utils/string.utils';

@Injectable()
export class RoutesService {
    constructor(private db: DatabaseService) { }

    async create(userId: string, data: CreateRouteDto, clubId?: string): Promise<Route> {
        const { rows } = await this.db.query<Route>(
            `INSERT INTO routes (
                id, name, description, difficulty, distance_km, estimated_time,
                elevation_min, elevation_max, geojson, created_by, club_id,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
            ) RETURNING
                id, name, description, difficulty, distance_km AS "distanceKm",
                estimated_time AS "estimatedTime", elevation_min AS "elevationMin",
                elevation_max AS "elevationMax", geojson, created_by AS "createdBy",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
            [
                data.name,
                data.description || null,
                data.difficulty,
                data.distanceKm || null,
                data.estimatedTime || null,
                data.elevationMin || null,
                data.elevationMax || null,
                data.geojson ? JSON.stringify(data.geojson) : null,
                userId,
                clubId || null,
            ],
        );

        return rows[0];
    }

    async findAll(clubId?: string, page = 1, limit = 20): Promise<{ data: Route[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        let query = `SELECT id, name, description, difficulty, distance_km AS "distanceKm",
                    estimated_time AS "estimatedTime", elevation_min AS "elevationMin",
                    elevation_max AS "elevationMax", geojson, created_by AS "createdBy",
                    created_at AS "createdAt", updated_at AS "updatedAt",
                    (SELECT COUNT(*) FROM route_waypoints WHERE route_id = routes.id) AS "waypointsCount"
             FROM routes`;
        let countQuery = 'SELECT COUNT(*)::int as count FROM routes';
        const params: (string | null)[] = [];

        if (clubId) {
            query += ' WHERE club_id = $1';
            countQuery += ' WHERE club_id = $1';
            params.push(clubId);
        }
        query += ' ORDER BY created_at DESC';

        const offset = (page - 1) * limit;
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const [{ rows: countRows }, { rows }] = await Promise.all([
            this.db.query<{ count: number }>(countQuery, params),
            this.db.query<Route>(query, [...params, limit, offset]),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: string, clubId?: string): Promise<Route> {
        let query = `SELECT id, name, description, difficulty, distance_km AS "distanceKm",
                    estimated_time AS "estimatedTime", elevation_min AS "elevationMin",
                    elevation_max AS "elevationMax", geojson, created_by AS "createdBy",
                    created_at AS "createdAt", updated_at AS "updatedAt"
             FROM routes
             WHERE id = $1`;
        const params: (string | null)[] = [id];

        if (clubId) {
            query += ' AND club_id = $2';
            params.push(clubId);
        }
        query += ' LIMIT 1';

        const { rows } = await this.db.query<Route>(query, params);

        if (rows.length === 0) {
            throw new NotFoundException(`Route with ID ${id} not found`);
        }

        return rows[0];
    }

    async update(id: string, data: UpdateRouteDto, clubId?: string): Promise<Route> {
        const typedData: Record<string, unknown> = { ...data };

        // Handling jsonb
        if (typedData.geojson) {
            typedData.geojson = JSON.stringify(typedData.geojson);
        }

        const keys = Object.keys(typedData).filter((x) => typedData[x] !== undefined);
        if (keys.length === 0) return this.findOne(id, clubId);

        const setString = keys.map((key, i) => `"${toSnakeCase(key)}" = $${i + 1}`).join(', ');
        const values: unknown[] = keys.map((k) => typedData[k]);
        values.push(id);

        let query = `UPDATE routes
             SET ${setString}, updated_at = NOW()
             WHERE id = $${values.length}`;
        if (clubId) {
            values.push(clubId);
            query += ` AND club_id = $${values.length}`;
        }
        query += ` RETURNING id, name, description, difficulty, distance_km AS "distanceKm",
                       estimated_time AS "estimatedTime", elevation_min AS "elevationMin",
                       elevation_max AS "elevationMax", geojson, created_by AS "createdBy",
                       created_at AS "createdAt", updated_at AS "updatedAt"`;

        const { rows } = await this.db.query<Route>(query, values);

        if (rows.length === 0) {
            throw new NotFoundException(`Route with ID ${id} not found`);
        }

        return rows[0];
    }

    async remove(id: string, clubId?: string): Promise<void> {
        let query = 'DELETE FROM routes WHERE id = $1';
        const params: (string | null)[] = [id];
        if (clubId) {
            query += ' AND club_id = $2';
            params.push(clubId);
        }
        const { rowCount } = await this.db.query<Route>(query, params);
        if (rowCount === 0) {
            throw new NotFoundException(`Route with ID ${id} not found`);
        }
    }

    private async verifyRouteClub(routeId: string, clubId?: string): Promise<void> {
        if (!clubId) return;
        const { rows } = await this.db.query<{ '1': number }>(
            'SELECT 1 FROM routes WHERE id = $1 AND club_id = $2',
            [routeId, clubId],
        );
        if (rows.length === 0) {
            throw new NotFoundException('Route not found in this club');
        }
    }

    // WAYPOINTS Logic using PostGIS
    async addWaypoint(routeId: string, data: CreateWaypointDto, clubId?: string): Promise<Waypoint> {
        await this.verifyRouteClub(routeId, clubId);
        const { rows } = await this.db.query<Waypoint>(
            `INSERT INTO route_waypoints (
                id, route_id, name, location, type, estimated_arrival, notes, sort_order
            ) VALUES (
                gen_random_uuid(), $1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5, $6, $7
            ) RETURNING
                id, route_id AS "routeId", name,
                ST_AsGeoJSON(location)::json AS location,
                type, estimated_arrival AS "estimatedArrival",
                notes, sort_order AS "sortOrder"`,
            [
                routeId,
                data.name || null,
                JSON.stringify(data.location),
                data.type,
                data.estimatedArrival || null,
                data.notes || null,
                data.sortOrder,
            ],
        );

        return rows[0];
    }

    async getWaypoints(routeId: string, clubId?: string): Promise<Waypoint[]> {
        await this.verifyRouteClub(routeId, clubId);
        const { rows } = await this.db.query<Waypoint>(
            `SELECT id, route_id AS "routeId", name,
                    ST_AsGeoJSON(location)::json AS location,
                    type, estimated_arrival AS "estimatedArrival",
                    notes, sort_order AS "sortOrder"
             FROM route_waypoints
             WHERE route_id = $1
             ORDER BY sort_order ASC`,
            [routeId],
        );
        return rows;
    }

    async addBatchWaypoints(routeId: string, geojson: unknown, clubId?: string): Promise<void> {
        await this.verifyRouteClub(routeId, clubId);
        const g = geojson as { type?: string; features?: Array<{ geometry?: unknown; properties?: Record<string, unknown> }> };
        if (g && g.type === 'FeatureCollection' && Array.isArray(g.features)) {
            for (const [index, feature] of g.features.entries()) {
                const geom = feature.geometry as { type?: string; coordinates?: [number, number] } | undefined;
                if (geom && geom.type === 'Point' && geom.coordinates) {
                    await this.addWaypoint(routeId, {
                        location: { type: 'Point', coordinates: geom.coordinates },
                        type: (feature.properties?.type as string) || 'parada',
                        name: (feature.properties?.name as string) || `WP ${index + 1}`,
                        sortOrder: feature.properties?.sortOrder !== undefined ? (feature.properties.sortOrder as number) : index,
                        notes: (feature.properties?.notes as string) || undefined,
                    } as CreateWaypointDto, clubId);
                }
            }
        }
    }
}
