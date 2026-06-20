import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Redis } from 'ioredis';
import { CreateSosDto } from './dto/create-sos.dto';
import { FcmService } from '../notifications/fcm.service';

@Injectable()
export class SosService {
    constructor(
        private rawDb: DatabaseService,
        @Inject('REDIS_CLIENT') private redisClient: Redis,
        private fcm: FcmService,
    ) { }

    // El controller llama a este método: sosService.create(userId, dto)
    async create(userId: string, data: CreateSosDto) {
        const { type, lat, lng, event_id, description } = data;

        // Insertar en BD con PostGIS — ST_MakePoint(lng, lat)
        const { rows } = await this.rawDb.query(`
            INSERT INTO sos_alerts (user_id, event_id, type, location, status, description)
            VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, 'activa', $6)
            RETURNING id, type, status, created_at
        `, [userId, event_id || null, type, lng, lat, description || null]);

        const alert = rows[0];

        // Publicar en Redis → tracker WebSocket lo reenvía a los riders conectados
        const wsPayload = JSON.stringify({
            type: 'sos',
            payload: { alertId: alert.id, userId, type, lat, lng, description },
        });

        this.redisClient.publish(
            event_id ? `sos:${event_id}` : 'sos:global',
            wsPayload,
        );

        // FCM push en background — no bloquea la respuesta al cliente
        this._sendFcmAlert(userId, type, lat, lng).catch((err) => {
            console.error('[FCM] Error en push SOS:', err);
        });

        return alert;
    }

    private async _sendFcmAlert(
        excludeUserId: string,
        type: string,
        lat: number,
        lng: number,
    ): Promise<void> {
        const [userRow, tokenRows] = await Promise.all([
            this.rawDb.query<{ name: string }>(
                'SELECT name FROM users WHERE id = $1',
                [excludeUserId],
            ),
            this.rawDb.query<{ fcm_token: string }>(
                `SELECT fcm_token FROM users
                 WHERE fcm_token IS NOT NULL
                   AND is_active = true
                   AND id != $1`,
                [excludeUserId],
            ),
        ]);

        const senderName = userRow.rows[0]?.name ?? 'Un rider';
        const tokens = tokenRows.rows.map((r) => r.fcm_token);

        await this.fcm.sendSOSAlert({ senderName, type, lat, lng, tokens });
    }

    async findAll() {
        const { rows } = await this.rawDb.query(`
            SELECT id, user_id, event_id, type, status, description,
                   resolved_by, created_at, resolved_at,
                   ST_Y(location::geometry) as lat,
                   ST_X(location::geometry) as lng
            FROM sos_alerts
            ORDER BY created_at DESC
        `);
        return rows;
    }

    async findActive() {
        const { rows } = await this.rawDb.query(`
            SELECT id, user_id, event_id, type, status, description, created_at,
                   ST_Y(location::geometry) as lat,
                   ST_X(location::geometry) as lng
            FROM sos_alerts
            WHERE status = 'activa'
            ORDER BY created_at DESC
        `);
        return rows;
    }

    async resolve(id: string, userId: string) {
        const { rows, rowCount } = await this.rawDb.query(`
            UPDATE sos_alerts
            SET status = 'resuelta', resolved_by = $1, resolved_at = NOW()
            WHERE id = $2 AND status != 'resuelta'
            RETURNING id, status
        `, [userId, id]);

        if (rowCount === 0) {
            throw new NotFoundException('Alert not found or already resolved');
        }

        return rows[0];
    }
}