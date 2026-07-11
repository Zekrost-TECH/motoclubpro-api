import { Injectable, Inject, UnauthorizedException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DatabaseService } from '../database/database.service';
import type { CreatePositionDto } from './dto/create-position.dto';
import type { AuthUser } from '../auth/auth.types';

interface RiderStatus {
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    timestamp: number;
    role: string;
    userId: string;
    name: string;
}

@Injectable()
export class TrackerService {
    constructor(
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
        private readonly db: DatabaseService,
    ) { }

    private trackKey(eventId: string, userId: string): string {
        return `track:${eventId}:${userId}`;
    }

    private positionTTL(): number {
        // 30 segundos por defecto, igual que el tracker Go
        const ttl = parseInt(process.env.POSITION_TTL_SEC ?? '', 10);
        return Number.isNaN(ttl) ? 30 : ttl;
    }

    /**
     * Guarda la posición de un rider en Redis para que el tracker la
     * broadcastee a los demás conectados. El TTL corto asegura que si un
     * rider deja de enviar posiciones, su marca desaparezca rápidamente.
     */
    async savePosition(user: AuthUser, dto: CreatePositionDto): Promise<{ saved: boolean }> {
        const { eventId, lat, lng, speed, heading, timestamp, name } = dto;

        // 1. Verificar que el evento existe y está en curso
        const eventRes = await this.db.query(
            `SELECT id, status, club_id FROM events WHERE id = $1`,
            [eventId],
        );
        const event = eventRes.rows[0];
        if (!event) {
            throw new NotFoundException('Evento no encontrado');
        }
        if (event.status !== 'en_curso') {
            throw new ForbiddenException('El evento no está en curso');
        }

        // 2. Verificar que el usuario es asistente del evento o admin/líder del club
        const attendeeRes = await this.db.query(
            `SELECT 1 FROM event_attendees WHERE event_id = $1 AND user_id = $2 LIMIT 1`,
            [eventId, user.id],
        );
        const isAttendee = attendeeRes.rows.length > 0;
        const isManager = user.role === 'admin' || user.role === 'leader' || user.role === 'superadmin';
        // Opcional: verificar que el admin/líder pertenezca al club del evento
        if (!isAttendee && !isManager) {
            throw new UnauthorizedException('No estás autorizado para este evento');
        }

        // 3. Construir payload igual que el tracker Go
        const status: RiderStatus = {
            lat,
            lng,
            speed: speed ?? 0,
            heading: heading ?? 0,
            timestamp: timestamp ?? Date.now(),
            role: user.role,
            userId: user.id,
            name: name ?? '',
        };

        // 4. Guardar en Redis con TTL
        await this.redis.set(
            this.trackKey(eventId, user.id),
            JSON.stringify(status),
            'EX',
            this.positionTTL(),
        );

        return { saved: true };
    }
}
