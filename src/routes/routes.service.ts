import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateWaypointDto } from './dto/create-waypoint.dto';
import { Route, Waypoint } from './routes.types';

@Injectable()
export class RoutesService {
    constructor(private db: DatabaseService) { }

    private toSnakeCase(str: string): string {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    async create(userId: string, data: CreateRouteDto): Promise<Route> {
        const { rows } = await this.db.query<Route>(
            `INSERT INTO routes (
                id, name, description, difficulty, distance_km, estimated_time,
                elevation_min, elevation_max, geojson, created_by,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
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
                userId
            ]
        );

        return rows[0];
    }

    async findAll(): Promise<Route[]> {
        const { rows } = await this.db.query<Route>(
            `SELECT id, name, description, difficulty, distance_km AS "distanceKm",
                    estimated_time AS "estimatedTime", elevation_min AS "elevationMin",
                    elevation_max AS "elevationMax", geojson, created_by AS "createdBy",
                    created_at AS "createdAt", updated_at AS "updatedAt"
             FROM routes
             ORDER BY created_at DESC`
        );
        return rows;
    }

    async findOne(id: string): Promise<Route> {
        const { rows } = await this.db.query<Route>(
            `SELECT id, name, description, difficulty, distance_km AS "distanceKm",
                    estimated_time AS "estimatedTime", elevation_min AS "elevationMin",
                    elevation_max AS "elevationMax", geojson, created_by AS "createdBy",
                    created_at AS "createdAt", updated_at AS "updatedAt"
             FROM routes
             WHERE id = $1 LIMIT 1`,
            [id]
        );

        if (rows.length === 0) {
            throw new NotFoundException(`Route with ID ${id} not found`);
        }

        return rows[0];
    }

    async update(id: string, data: UpdateRouteDto): Promise<Route> {
        const typedData: any = { ...data };

        // Handling jsonb 
        if (typedData.geojson) {
            typedData.geojson = JSON.stringify(typedData.geojson);
        }

        const keys = Object.keys(typedData).filter(x => typedData[x] !== undefined);
        if (keys.length === 0) return this.findOne(id);

        const setString = keys.map((key, i) => `"${this.toSnakeCase(key)}" = $${i + 1}`).join(', ');
        const values = keys.map(k => typedData[k]);
        values.push(id);

        const { rows } = await this.db.query<Route>(
            `UPDATE routes
             SET ${setString}, updated_at = NOW()
             WHERE id = $${values.length}
             RETURNING id, name, description, difficulty, distance_km AS "distanceKm",
                       estimated_time AS "estimatedTime", elevation_min AS "elevationMin",
                       elevation_max AS "elevationMax", geojson, created_by AS "createdBy",
                       created_at AS "createdAt", updated_at AS "updatedAt"`,
            values
        );

        if (rows.length === 0) {
            throw new NotFoundException(`Route with ID ${id} not found`);
        }

        return rows[0];
    }

    async remove(id: string): Promise<void> {
        const { rowCount } = await this.db.query(`DELETE FROM routes WHERE id = $1`, [id]);
        if (rowCount === 0) {
            throw new NotFoundException(`Route with ID ${id} not found`);
        }
    }

    // WAYPOINTS Logic using PostGIS
    async addWaypoint(routeId: string, data: CreateWaypointDto): Promise<Waypoint> {
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
                data.sortOrder
            ]
        );

        return rows[0];
    }

    async getWaypoints(routeId: string): Promise<Waypoint[]> {
        const { rows } = await this.db.query<Waypoint>(
            `SELECT id, route_id AS "routeId", name, 
                    ST_AsGeoJSON(location)::json AS location, 
                    type, estimated_arrival AS "estimatedArrival", 
                    notes, sort_order AS "sortOrder"
             FROM route_waypoints
             WHERE route_id = $1
             ORDER BY sort_order ASC`,
            [routeId]
        );
        return rows;
    }

    async addBatchWaypoints(routeId: string, geojson: any): Promise<void> {
        // If a FeatureCollection is provided, iterate and insert waypoints
        if (geojson && geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
            for (const [index, feature] of geojson.features.entries()) {
                if (feature.geometry && feature.geometry.type === 'Point') {
                    await this.addWaypoint(routeId, {
                        location: feature.geometry,
                        type: feature.properties?.type || 'parada',
                        name: feature.properties?.name || `WP ${index + 1}`,
                        sortOrder: feature.properties?.sortOrder !== undefined ? feature.properties.sortOrder : index,
                        notes: feature.properties?.notes || null
                    });
                }
            }
        }
    }
}
