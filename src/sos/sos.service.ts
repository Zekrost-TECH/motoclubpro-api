import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Redis } from 'ioredis';
import { CreateSosDto } from './dto/create-sos.dto';
import { FcmService } from '../notifications/fcm.service';
import { SosAlertRow, SosAlertSummary } from './sos.types';

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
        //   sos:club:{id}  → club completo (dashboard web)
        //   sos:global     → fallback
        // FCM push: si hay event_id, solo a asistentes de ese evento; si no, a todo el club.
        const channel = event_id
            ? `sos:event:${event_id}`
            : (clubId ? `sos:club:${clubId}` : 'sos:global');

        void this.redisClient.publish(channel, wsPayload);

        // FCM push en background — no bloquea la respuesta al cliente
        this._sendFcmAlert(userId, type, lat, lng, clubId, event_id || null).catch((err) => {
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
        eventId?: string | null,
    ): Promise<void> {
        let tokenQuery = `SELECT fcm_token FROM users
                 WHERE fcm_token IS NOT NULL
                   AND is_active = true
                   AND id != $1`;
        const tokenParams: (string | null)[] = [excludeUserId];
        let paramIndex = 2;

        if (clubId) {
            tokenQuery += ` AND EXISTS (SELECT 1 FROM club_members cm WHERE cm.user_id = users.id AND cm.club_id = $${paramIndex} AND cm.is_active = true)`;
            tokenParams.push(clubId);
            paramIndex++;
        }

        if (eventId) {
            tokenQuery += ` AND EXISTS (SELECT 1 FROM event_attendees ea WHERE ea.user_id = users.id AND ea.event_id = $${paramIndex})`;
            tokenParams.push(eventId);
            paramIndex++;
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
            SELECT s.id, s.user_id, u.name AS user_name, s.event_id, s.type, s.status, s.description,
                   s.resolved_by, s.created_at, s.resolved_at,
                   ST_Y(s.location::geometry) as lat,
                   ST_X(s.location::geometry) as lng
            FROM sos_alerts s
            LEFT JOIN users u ON u.id = s.user_id`;
        let countQuery = `SELECT COUNT(*)::int as count FROM sos_alerts`;
        const params: (string | null)[] = [];

        if (clubId) {
            query += ' WHERE s.club_id = $1';
            countQuery += ' WHERE club_id = $1';
            params.push(clubId);
        }
        query += ' ORDER BY s.created_at DESC';

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
            SELECT s.id, s.user_id, u.name AS user_name, s.event_id, s.type, s.status, s.description, s.created_at,
                   ST_Y(s.location::geometry) as lat,
                   ST_X(s.location::geometry) as lng
            FROM sos_alerts s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.status = 'activa'`;
        let countQuery = `SELECT COUNT(*)::int as count FROM sos_alerts WHERE status = 'activa'`;
        const params: (string | null)[] = [];

        if (clubId) {
            query += ' AND s.club_id = $1';
            countQuery += ' AND club_id = $1';
            params.push(clubId);
        }
        query += ' ORDER BY s.created_at DESC';

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