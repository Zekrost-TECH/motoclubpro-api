import { Injectable, Inject, UnauthorizedException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { DatabaseService } from '../database/database.service';
import type { CreatePositionDto } from './dto/create-position.dto';
import type { BatchPositionsDto, PositionPointDto } from './dto/batch-positions.dto';
import { trackerSecret } from '../auth/strategies/tracker-jwt.strategy';
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
    battery?: number;
    isCharging?: boolean;
}

// Usuario autenticado por token de tracking (scope 'tracker', atado a un evento).
interface TrackingScopedUser extends AuthUser {
    scope?: 'tracker';
    trackingEventId?: string;
}

@Injectable()
export class TrackerService {
    constructor(
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
        private readonly db: DatabaseService,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
    ) { }

    private trackKey(eventId: string, userId: string): string {
        return `track:${eventId}:${userId}`;
    }

    private eventCacheKey(eventId: string): string {
        return `track:event:${eventId}`;
    }

    private attendeeCacheKey(eventId: string, userId: string): string {
        return `track:attendee:${eventId}:${userId}`;
    }

    private static readonly CACHE_TTL = 30; // seconds

    private positionTTL(): number {
        // 90 segundos por defecto: en carretera la señal se cae con frecuencia.
        // Un TTL de 30s hacía que un rider desapareciera del radar tras un
        // breve túnel o zona sin cobertura, aunque siguiera rodando.
        const ttl = parseInt(process.env.POSITION_TTL_SEC ?? '', 10);
        return Number.isNaN(ttl) ? 90 : ttl;
    }

    // ── Token de tracking (scope limitado, larga duración) ─────────────────
    // Emite un JWT que solo sirve para publicar posiciones en este evento.
    // Lo usa el servicio nativo de Android, que no puede depender del access
    // token de 15 minutos porque corre sin WebView durante toda la rodada.
    async createTrackingToken(user: AuthUser, eventId: string): Promise<{ tracking_token: string; expires_in: number }> {
        await this.assertPublishable(eventId, user);

        const ttlSec = parseInt(this.config.get<string>('TRACKER_TOKEN_TTL_SEC') ?? '', 10);
        const expiresIn = Number.isNaN(ttlSec) ? 12 * 3600 : ttlSec;

        const token = this.jwtService.sign(
            { sub: user.id, role: user.role, scope: 'tracker', eventId },
            {
                secret: trackerSecret(this.config),
                expiresIn,
                issuer: 'biker-os-api',
                audience: 'biker-os-clients',
                algorithm: 'HS256',
            },
        );

        return { tracking_token: token, expires_in: expiresIn };
    }

    /**
     * Guarda la posición de un rider en Redis para que el tracker la
     * broadcastee a los demás conectados. El TTL corto asegura que si un
     * rider deja de enviar posiciones, su marca desaparezca rápidamente.
     */
    async savePosition(user: AuthUser, dto: CreatePositionDto): Promise<{ saved: boolean }> {
        const { eventId, lat, lng, speed, heading, timestamp, name, battery, is_charging } = dto;

        // ROD-08: descartar coordenadas fuera de rango (GPS corrupto/manipulado)
        // antes de contaminar el radar.
        this.assertValidPoint(lat, lng, speed);

        const { attendeeRole } = await this.assertPublishable(eventId, user);

        // 3. Construir payload igual que el tracker Go.
        // role = rol operativo de la rodada; un manager que no es asistente
        // cae al fallback de su rol del sistema.
        const status: RiderStatus = {
            lat,
            lng,
            speed: speed ?? 0,
            heading: heading ?? 0,
            timestamp: timestamp ?? Date.now(),
            role: attendeeRole ?? user.role,
            userId: user.id,
            name: name ?? '',
            battery,
            isCharging: is_charging,
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

    /**
     * Batch de posiciones acumuladas offline por el servicio nativo. Valida
     * el evento y la membresía UNA vez y escribe todas las keys en un solo
     * pipeline Redis (un round-trip en vez de N).
     */
    async savePositions(user: AuthUser, dto: BatchPositionsDto): Promise<{ saved: number }> {
        const { eventId, positions } = dto;
        const { attendeeRole } = await this.assertPublishable(eventId, user);

        const ttl = this.positionTTL();
        const tx = this.redis.multi();
        let count = 0;

        for (const p of positions) {
            try {
                this.assertValidPoint(p.lat, p.lng, p.speed);
            } catch {
                continue; // punto corrupto en la cola: se descarta, no aborta el batch
            }
            const status: RiderStatus = this.buildStatus(p, user, attendeeRole);
            tx.set(this.trackKey(eventId, user.id), JSON.stringify(status), 'EX', ttl);
            count++;
        }

        if (count > 0) await tx.exec();
        return { saved: count };
    }

    private buildStatus(p: PositionPointDto, user: AuthUser, attendeeRole?: string): RiderStatus {
        return {
            lat: p.lat,
            lng: p.lng,
            speed: p.speed ?? 0,
            heading: p.heading ?? 0,
            timestamp: p.timestamp ?? Date.now(),
            role: attendeeRole ?? user.role,
            userId: user.id,
            name: p.name ?? '',
            battery: p.battery,
            isCharging: p.is_charging,
        };
    }

    private assertValidPoint(lat: number, lng: number, speed?: number): void {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new BadRequestException('Coordenadas fuera de rango');
        }
        if (speed !== undefined && (speed < 0 || speed > 500)) {
            throw new BadRequestException('Velocidad fuera de rango');
        }
    }

    /**
     * Validación compartida de publicación: evento existe y está en_curso,
     * el token de tracking (si aplica) corresponde a este evento, y el usuario
     * es asistente o admin/líder. Devuelve el ride_role operativo del asistente.
     */
    private async assertPublishable(eventId: string, user: TrackingScopedUser): Promise<{ attendeeRole?: string }> {
        // Token con scope tracker: solo puede publicar en SU evento.
        if (user.scope === 'tracker' && user.trackingEventId !== eventId) {
            throw new ForbiddenException('Token de tracking no válido para este evento');
        }

        // 1. Verificar que el evento existe y está en curso (con cache Redis)
        const eventCacheKey = this.eventCacheKey(eventId);
        let event: { id: string; status: string; club_id: string } | undefined;
        const cachedEvent = await this.redis.get(eventCacheKey);
        if (cachedEvent) {
            event = JSON.parse(cachedEvent) as { id: string; status: string; club_id: string };
        } else {
            const eventRes = await this.db.query<{ id: string; status: string; club_id: string }>(
                `SELECT id, status, club_id FROM events WHERE id = $1`,
                [eventId],
            );
            event = eventRes.rows[0];
            if (event) {
                await this.redis.set(eventCacheKey, JSON.stringify(event), 'EX', TrackerService.CACHE_TTL);
            }
        }
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
        let attendee: { ride_role: string } | undefined;
        const attendeeCacheKey = this.attendeeCacheKey(eventId, user.id);
        const cachedAttendee = await this.redis.get(attendeeCacheKey);
        if (cachedAttendee) {
            attendee = JSON.parse(cachedAttendee) as { ride_role: string };
        } else {
            const attendeeRes = await this.db.query<{ ride_role: string }>(
                `SELECT ride_role FROM event_attendees WHERE event_id = $1 AND user_id = $2 LIMIT 1`,
                [eventId, user.id],
            );
            attendee = attendeeRes.rows[0];
            await this.redis.set(attendeeCacheKey, JSON.stringify(attendee ?? { ride_role: '' }), 'EX', TrackerService.CACHE_TTL);
        }
        const isAttendee = !!(attendee && attendee.ride_role);
        const isManager = user.role === 'admin' || user.role === 'leader' || user.role === 'superadmin';
        if (!isAttendee && !isManager) {
            throw new UnauthorizedException('No estás autorizado para este evento');
        }

        return { attendeeRole: attendee?.ride_role || undefined };
    }
}
