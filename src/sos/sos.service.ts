import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Redis } from 'ioredis';
import { CreateSosDto } from './dto/create-sos.dto';
import { FcmService } from '../notifications/fcm.service';

export interface SosAlertRow {
    id: string;
    user_id: string;
    event_id?: string;
    club_id?: string;
    type: string;
    status: string;
    description?: string;
    resolved_by?: string;
    created_at: string;
    resolved_at?: string;
    lat: number;
    lng: number;
}

export interface SosAlertSummary {
    id: string;
    type: string;
    status: string;
    created_at: string;
}

@Injectable()
export class SosService {
    constructor(
        private rawDb: DatabaseService,
        @Inject('REDIS_CLIENT') private redisClient: Redis,
        private fcm: FcmService,
    ) { }

    // El controller llama a este método: sosService.create(userId, dto, clubId)
    async create(userId: string, data: CreateSosDto, clubId?: string): Promise<SosAlertSummary> {
        const { type, lat, lng, event_id, description } = data;

        // Insertar en BD con PostGIS — ST_MakePoint(lng, lat)
        const { rows } = await this.rawDb.query<SosAlertSummary>(`
            INSERT INTO sos_alerts (user_id, event_id, club_id, type, location, status, description)
            VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, 'activa', $7)
            RETURNING id, type, status, created_at
        `, [userId, event_id || null, clubId || null, type, lng, lat, description || null]);

        const alert = rows[0];

        // Publicar en Redis → tracker WebSocket lo reenvía a los riders conectados
        const wsPayload = JSON.stringify({
            type: 'sos',
            payload: { alertId: alert.id, userId, clubId, type, lat, lng, description },
        });

        // Convención de canal EXPLÍCITA por tipo de destino:
        //   sos:event:{id} → entregado en tiempo real por el tracker (riders del evento)
        //   sos:club:{id}  → club completo (FCM push + dashboard web)
        //   sos:global     → fallback
        const channel = event_id
            ? `sos:event:${event_id}`
            : (clubId ? `sos:club:${clubId}` : 'sos:global');

        void this.redisClient.publish(channel, wsPayload);

        // FCM push en background — no bloquea la respuesta al cliente
        this._sendFcmAlert(userId, type, lat, lng, clubId).catch((err) => {
            Logger.error('[FCM] Error en push SOS', err instanceof Error ? err.stack : String(err), 'SosService');
        });

        return alert;
    }

    private async _sendFcmAlert(
        excludeUserId: string,
        type: string,
        lat: number,
        lng: number,
        clubId?: string,
    ): Promise<void> {
        let tokenQuery = `SELECT fcm_token FROM users
                 WHERE fcm_token IS NOT NULL
                   AND is_active = true
                   AND id != $1`;
        const tokenParams: (string | null)[] = [excludeUserId];

        if (clubId) {
            tokenQuery += ` AND EXISTS (SELECT 1 FROM club_members cm WHERE cm.user_id = users.id AND cm.club_id = $2 AND cm.is_active = true)`;
            tokenParams.push(clubId);
        }

        const [userRow, tokenRows] = await Promise.all([
            this.rawDb.query<{ name: string }>(
                'SELECT name FROM users WHERE id = $1',
                [excludeUserId],
            ),
            this.rawDb.query<{ fcm_token: string }>(tokenQuery, tokenParams),
        ]);

        const senderName = userRow.rows[0]?.name ?? 'Un rider';
        const tokens = tokenRows.rows.map((r) => r.fcm_token);

        await this.fcm.sendSOSAlert({ senderName, type, lat, lng, tokens });
    }

    async findAll(clubId?: string, page = 1, limit = 20): Promise<{ data: SosAlertRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        let query = `
            SELECT id, user_id, event_id, type, status, description,
                   resolved_by, created_at, resolved_at,
                   ST_Y(location::geometry) as lat,
                   ST_X(location::geometry) as lng
            FROM sos_alerts`;
        let countQuery = `SELECT COUNT(*)::int as count FROM sos_alerts`;
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
            this.rawDb.query<{ count: number }>(countQuery, params),
            this.rawDb.query<SosAlertRow>(query, [...params, limit, offset]),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findActive(clubId?: string, page = 1, limit = 20): Promise<{ data: SosAlertRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        let query = `
            SELECT id, user_id, event_id, type, status, description, created_at,
                   ST_Y(location::geometry) as lat,
                   ST_X(location::geometry) as lng
            FROM sos_alerts
            WHERE status = 'activa'`;
        let countQuery = `SELECT COUNT(*)::int as count FROM sos_alerts WHERE status = 'activa'`;
        const params: (string | null)[] = [];

        if (clubId) {
            query += ' AND club_id = $1';
            countQuery += ' AND club_id = $1';
            params.push(clubId);
        }
        query += ' ORDER BY created_at DESC';

        const offset = (page - 1) * limit;
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const [{ rows: countRows }, { rows }] = await Promise.all([
            this.rawDb.query<{ count: number }>(countQuery, params),
            this.rawDb.query<SosAlertRow>(query, [...params, limit, offset]),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async resolve(id: string, userId: string, clubId?: string): Promise<SosAlertSummary> {
        let query = `
            UPDATE sos_alerts
            SET status = 'resuelta', resolved_by = $1, resolved_at = NOW()
            WHERE id = $2 AND status != 'resuelta'`;
        const params: (string | null)[] = [userId, id];

        if (clubId) {
            query += ' AND club_id = $3';
            params.push(clubId);
        }
        query += ' RETURNING id, status';

        const { rows, rowCount } = await this.rawDb.query<SosAlertSummary>(query, params);

        if (rowCount === 0) {
            throw new NotFoundException('Alert not found or already resolved');
        }

        return rows[0];
    }
}