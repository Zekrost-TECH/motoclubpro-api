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
        // 90 segundos por defecto: en carretera la señal se cae con frecuencia.
        // Un TTL de 30s hacía que un rider desapareciera del radar tras un
        // breve túnel o zona sin cobertura, aunque siguiera rodando.
        const ttl = parseInt(process.env.POSITION_TTL_SEC ?? '', 10);
        return Number.isNaN(ttl) ? 90 : ttl;
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

        // 2. Verificar que el usuario es asistente del evento o admin/líder del club.
        // También recuperamos su ride_role operativo (puntero, barredora, ...)
        // para que el radar muestre el rol real de la rodada, no el rol del
        // sistema (admin/leader/rider).
        const attendeeRes = await this.db.query<{ ride_role: string }>(
            `SELECT ride_role FROM event_attendees WHERE event_id = $1 AND user_id = $2 LIMIT 1`,
            [eventId, user.id],
        );
        const attendee = attendeeRes.rows[0];
        const isAttendee = !!attendee;
        const isManager = user.role === 'admin' || user.role === 'leader' || user.role === 'superadmin';
        if (!isAttendee && !isManager) {
            throw new UnauthorizedException('No estás autorizado para este evento');
        }

        // 3. Construir payload igual que el tracker Go.
        // role = rol operativo de la rodada; un manager que no es asistente
        // cae al fallback de su rol del sistema.
        const status: RiderStatus = {
            lat,
            lng,
            speed: speed ?? 0,
            heading: heading ?? 0,
            timestamp: timestamp ?? Date.now(),
            role: attendee?.ride_role ?? user.role,
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
