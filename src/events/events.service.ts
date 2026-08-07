import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
    Inject,
    Logger,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { DatabaseService } from '../database/database.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateEventGuestDto } from './dto/create-event-guest.dto';
import { UpdateEventGuestDto } from './dto/update-event-guest.dto';
import { RideRole, GuestType } from './events.types';
import { RideRolesService } from '../ride-roles/ride-roles.service';
import { PlansService } from '../plans/plans.service';
import { UserRole } from '../users/users.types';
import { FcmService } from '../notifications/fcm.service';

export interface EventRow {
    id: string;
    status: string;
    title: string;
    description?: string;
    date?: string;
    time?: string;
    difficulty?: string;
    route_id?: string;
    max_attendees?: number;
    min_rider_level?: string;
    meeting_point?: string;
    meeting_point_lat?: number;
    meeting_point_lng?: number;
    organizer_id?: string;
    club_id?: string;
    created_at?: string;
    updated_at?: string;
}

export interface AttendeeRow {
    user_id: string;
    ride_role: string;
    confirmed_at: string;
    checklist_completed: boolean;
    name: string;
    nickname: string;
    rider_level: string;
}

export interface InventoryRow {
    id: string;
    event_id: string;
    name: string;
    category: string;
    quantity: number;
    icon?: string;
    assigned_to?: string;
}

export interface ChecklistItemRow {
    id: string;
    event_id?: string;
    required: boolean;
    sort_order: number;
}

export interface GuestRow {
    id: string;
    event_id: string;
    invited_by: string;
    guest_type: GuestType;
    full_name: string;
    phone?: string;
    notes?: string;
    confirmed_at?: string;
    created_at?: string;
    inviter_name?: string;
}

interface CountRow {
    count: number;
}

interface UserLevelRow {
    rider_level: string;
}

interface MotorcycleRow {
    soat_expiry: string;
    tech_review_expiry: string;
}

@Injectable()
export class EventsService {
    private readonly logger = new Logger(EventsService.name);

    constructor(
        private readonly db: DatabaseService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
        private readonly rideRolesService: RideRolesService,
        private readonly plansService: PlansService,
        private readonly fcm: FcmService,
    ) { }

    // ── Contrato Redis de autorización del tracker ─────────────────────────────
    // event:{id}:club    → clubId dueño del evento
    // event:{id}:members → SET de userId autorizados a ver el tracking en vivo
    // event:{id}:roles   → HASH userId → ride_role (rol canónico del radar)
    private eventClubKey(eventId: string): string {
        return `event:${eventId}:club`;
    }

    private eventMembersKey(eventId: string): string {
        return `event:${eventId}:members`;
    }

    private eventRolesKey(eventId: string): string {
        return `event:${eventId}:roles`;
    }

    // El estado en Redis es best-effort: un fallo no debe tumbar la operación de negocio.
    private async safeRedis(op: () => Promise<unknown>, context: string): Promise<void> {
        try {
            await op();
        } catch (err) {
            this.logger.error(`Redis sync failed (${context})`, err instanceof Error ? err.stack : String(err));
        }
    }

    // Sincroniza las claves de autorización del tracker con la BD.
    // Útil cuando los asistentes se modifican fuera del flujo RSVP (DB directa,
    // imports, scripts) o simplemente como medida de seguridad en el read-path.
    // - Atómico: DEL + SADD/HSET en una sola transacción (evita la ventana donde
    //   un rider desaparece del SET y su WS es rechazado).
    // - Con 0 asistentes se BORRAN las claves: un rider dado de baja no puede
    //   quedar autorizado (antes el early-return dejaba el SET viejo en Redis).
    private async syncTrackerAuth(eventId: string, clubId?: string | null): Promise<void> {
        if (clubId) {
            await this.safeRedis(
                () => this.redis.set(this.eventClubKey(eventId), clubId),
                `set club key event ${eventId}`,
            );
        }

        const attendees = await this.getAttendees(eventId);

        await this.safeRedis(async () => {
            const membersKey = this.eventMembersKey(eventId);
            const rolesKey = this.eventRolesKey(eventId);

            const tx = this.redis.multi();
            tx.del(membersKey, rolesKey);
            if (attendees.length > 0) {
                tx.sadd(membersKey, ...attendees.map((a) => a.user_id));
                for (const a of attendees) {
                    tx.hset(rolesKey, a.user_id, a.ride_role);
                }
            }
            await tx.exec();
        }, `sync members event ${eventId}`);
    }

    async create(createEventDto: CreateEventDto, userId: string, clubId?: string, userRole?: UserRole): Promise<EventRow> {
        if (clubId) {
            await this.plansService.assertCanCreateEvent(clubId, userRole);
        }

        const {
            title,
            description,
            date,
            time,
            difficulty,
            route_id,
            max_attendees,
            min_rider_level,
            meeting_point,
            meeting_point_lat,
            meeting_point_lng,
        } = createEventDto;

        const res = await this.db.query<EventRow>(
            `INSERT INTO events (
        title, description, date, time, difficulty, route_id,
        max_attendees, min_rider_level, meeting_point, meeting_point_lat, meeting_point_lng, organizer_id, club_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [
                title,
                description,
                date,
                time,
                difficulty,
                route_id || null,
                max_attendees || null,
                min_rider_level || 'novato',
                meeting_point || null,
                meeting_point_lat ?? null,
                meeting_point_lng ?? null,
                userId,
                clubId || null,
            ],
        );
        const event = res.rows[0];

        // Registrar el club dueño para que el tracker pueda autorizar a admins/líderes.
        if (event?.id && clubId) {
            await this.safeRedis(
                () => this.redis.set(this.eventClubKey(event.id), clubId),
                `set club key event ${event.id}`,
            );
        }

        return event;
    }

    async findAll(status?: string, upcoming?: boolean, clubId?: string, page = 1, limit = 20): Promise<{ data: EventRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        let queryStr = `SELECT id, status, title, description, date, time, difficulty, route_id,
                               max_attendees, min_rider_level, meeting_point, meeting_point_lat,
                               meeting_point_lng, organizer_id, club_id, created_at, updated_at
                        FROM events`;
        let countQuery = 'SELECT COUNT(*)::int as count FROM events';
        const params: (string | boolean | null)[] = [];
        const conditions: string[] = [];

        if (clubId) {
            params.push(clubId);
            conditions.push(`club_id = $${params.length}`);
        }

        if (status) {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }

        if (upcoming) {
            conditions.push(`date >= CURRENT_DATE`);
        }

        const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
        queryStr += whereClause;
        countQuery += whereClause;

        // Orden: primero rodadas en curso, luego próximas, luego las demás.
        // Sin esto, una rodada en_curso con fecha pasada o futura podía quedar
        // fuera de la página 1 con clubes de >20 eventos (ROD-10).
        queryStr += ` ORDER BY CASE status WHEN 'en_curso' THEN 0 WHEN 'proximo' THEN 1 ELSE 2 END, date ASC, time ASC`;

        const offset = (page - 1) * limit;
        queryStr += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const [countRes, res] = await Promise.all([
            this.db.query<{ count: number }>(countQuery, params),
            this.db.query<EventRow>(queryStr, [...params, limit, offset]),
        ]);

        // Batch de attendees/inventory/guests para la página completa (evita N+1).
        await this._attachDetails(res.rows);

        const total = countRes.rows[0]?.count ?? 0;
        return {
            data: res.rows,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    // Adjunta attendees/inventory/guests a una lista de eventos con 3 queries
    // batch (evita N+1). Mutates las filas recibidas.
    private async _attachDetails(rows: EventRow[]): Promise<void> {
        const eventIds = rows.map((event) => event.id);
        if (eventIds.length === 0) return;

        const [attendeeRes, inventoryRes, guestRes] = await Promise.all([
            this.db.query<AttendeeRow & { event_id: string }>(
                `SELECT a.event_id, a.user_id, a.ride_role, a.confirmed_at, a.checklist_completed,
                        u.name, u.nickname, u.rider_level
                 FROM event_attendees a
                 JOIN users u ON u.id = a.user_id
                 WHERE a.event_id = ANY($1::uuid[])`,
                [eventIds],
            ),
            this.db.query<InventoryRow & { event_id: string }>(
                `SELECT * FROM inventory_items WHERE event_id = ANY($1::uuid[])`,
                [eventIds],
            ),
            this.db.query<GuestRow & { event_id: string }>(
                `SELECT g.id, g.event_id, g.invited_by, g.guest_type, g.full_name,
                        g.phone, g.notes, g.confirmed_at, g.created_at,
                        u.name AS inviter_name
                 FROM event_guests g
                 LEFT JOIN users u ON u.id = g.invited_by
                 WHERE g.event_id = ANY($1::uuid[])
                 ORDER BY g.created_at ASC`,
                [eventIds],
            ),
        ]);

        const attendeesByEvent = new Map<string, AttendeeRow[]>();
        for (const row of attendeeRes.rows) {
            const { event_id: rowEventId, ...attendee } = row;
            const list = attendeesByEvent.get(rowEventId) ?? [];
            list.push(attendee);
            attendeesByEvent.set(rowEventId, list);
        }

        const inventoryByEvent = new Map<string, InventoryRow[]>();
        for (const row of inventoryRes.rows) {
            const list = inventoryByEvent.get(row.event_id) ?? [];
            list.push(row);
            inventoryByEvent.set(row.event_id, list);
        }

        const guestsByEvent = new Map<string, GuestRow[]>();
        for (const row of guestRes.rows) {
            const list = guestsByEvent.get(row.event_id) ?? [];
            list.push(row);
            guestsByEvent.set(row.event_id, list);
        }

        for (const event of rows) {
            const ev = event as EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] };
            ev.attendees = attendeesByEvent.get(event.id) ?? [];
            ev.inventory = inventoryByEvent.get(event.id) ?? [];
            ev.guests = guestsByEvent.get(event.id) ?? [];
        }
    }

    // Rodadas en curso de TODOS los clubes donde el usuario es miembro activo.
    // Resuelve ROD-15: un rider con club activo ≠ club de la rodada seguía sin
    // detectarla porque la lista normal está filtrada por el club activo.
    async findActiveAcrossClubs(userId: string): Promise<Array<EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }>> {
        const res = await this.db.query<EventRow>(
            `SELECT e.id, e.status, e.title, e.description, e.date, e.time, e.difficulty, e.route_id,
                    e.max_attendees, e.min_rider_level, e.meeting_point, e.meeting_point_lat,
                    e.meeting_point_lng, e.organizer_id, e.club_id, e.created_at, e.updated_at
             FROM events e
             JOIN club_members cm ON cm.club_id = e.club_id
             WHERE e.status = 'en_curso'
               AND cm.user_id = $1
               AND cm.is_active = TRUE
               AND e.club_id IS NOT NULL
             ORDER BY e.date ASC, e.time ASC`,
            [userId],
        );
        await this._attachDetails(res.rows);
        return res.rows as Array<EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }>;
    }

    async findOne(id: string, clubId?: string): Promise<EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }> {
        let query = 'SELECT * FROM events WHERE id = $1';
        const params: (string | null)[] = [id];
        if (clubId) {
            query += ' AND club_id = $2';
            params.push(clubId);
        }
        const res = await this.db.query<EventRow>(query, params);
        if (!res.rows[0]) throw new NotFoundException('Event not found');

        const event = res.rows[0];
        (event as EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }).attendees = await this.getAttendees(id, clubId);
        (event as EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }).inventory = await this.getInventory(id, clubId);
        (event as EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] }).guests = await this.getGuests(id, clubId);

        // Sincronizar autorización del tracker con la fuente de verdad (BD).
        // Esto recupera asistentes añadidos manualmente en DB y repara drift.
        await this.syncTrackerAuth(event.id, event.club_id ?? null);

        return event as EventRow & { attendees: AttendeeRow[]; inventory: InventoryRow[]; guests: GuestRow[] };
    }

    async update(id: string, updateEventDto: UpdateEventDto, clubId?: string): Promise<EventRow> {
        // El estado de un evento NO se cambia por aquí: si se aceptara, se
        // saltaría la máquina de estados y la sincronización del tracker
        // (syncTrackerAuth). Usar PATCH /events/:id/status.
        const { status: _status, ...rest } = updateEventDto as { status?: string };
        if (_status !== undefined) {
            throw new BadRequestException('El estado no se modifica por este endpoint. Usa PATCH /events/:id/status');
        }

        const keys = Object.keys(rest);
        if (keys.length === 0) return this.findOne(id, clubId);

        const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        const params: unknown[] = Object.values(rest);
        params.push(id);

        let query = `UPDATE events SET ${setClauses}, updated_at = NOW() WHERE id = $${params.length}`;
        if (clubId) {
            params.push(clubId);
            query += ` AND club_id = $${params.length}`;
        }
        query += ' RETURNING *';

        const res = await this.db.query<EventRow>(query, params);

        if (!res.rows[0]) throw new NotFoundException('Event not found');
        return res.rows[0];
    }

    async remove(id: string, clubId?: string): Promise<{ deleted: boolean }> {
        let query = 'DELETE FROM events WHERE id = $1';
        const params: (string | null)[] = [id];
        if (clubId) {
            query += ' AND club_id = $2';
            params.push(clubId);
        }
        query += ' RETURNING *';
        const res = await this.db.query<EventRow>(query, params);
        if (!res.rows[0]) throw new NotFoundException('Event not found');

        // Limpiar las claves de autorización del tracker.
        await this.safeRedis(
            () => this.redis.del(this.eventClubKey(id), this.eventMembersKey(id), this.eventRolesKey(id)),
            `del auth keys event ${id}`,
        );

        return { deleted: true };
    }

    async updateStatus(id: string, newStatus: string, clubId?: string): Promise<EventRow> {
        const event = await this.findOne(id, clubId);
        const validTransitions: Record<string, string[]> = {
            'borrador': ['proximo', 'cancelado'],
            'proximo': ['en_curso', 'cancelado'],
            'en_curso': ['completado', 'cancelado'],
            'completado': [],
            'cancelado': []
        };

        const allowed = validTransitions[event.status] || [];
        if (!allowed.includes(newStatus)) {
            throw new BadRequestException(`Cannot transition from ${event.status} to ${newStatus}`);
        }

        const res = await this.db.query<EventRow>(
            `UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
            [newStatus, id]
        );

        const updated = res.rows[0];
        if (updated && newStatus === 'en_curso') {
            // Antes de que los riders intenten conectarse, asegurar que Redis
            // refleje los asistentes actuales de la BD (members + roles).
            await this.syncTrackerAuth(updated.id, updated.club_id ?? null);
            // ROD-03: avisar a los asistentes que la rodada arrancó.
            this.notifyRideStarted(updated.id, updated.title).catch((err) => {
                this.logger.error('Error notificando inicio de rodada', err instanceof Error ? err.stack : String(err));
            });
        }

        // ROD-02/09: avisar al tracker de cualquier cambio de estado. Al dejar
        // de estar en curso, el tracker cierra los sockets del evento y purga
        // las posiciones para que el radar muera de inmediato.
        await this.publishEventStatus(updated.id, newStatus);

        if (updated && newStatus === 'completado') {
            // Obtener distancia de la ruta y actualizar estadísticas de attendees
            await this._updateRiderStatsOnCompletion(updated.id, updated.route_id ?? null);
        }

        return updated;
    }

    // Publica el cambio de estado en Redis para que el tracker Go lo escuche
    // (canal event:{id}:status → cierra WS del evento y purga track:*).
    private async publishEventStatus(eventId: string, status: string): Promise<void> {
        await this.safeRedis(
            () => this.redis.publish(
                `event:${eventId}:status`,
                JSON.stringify({ type: 'event_status', payload: { eventId, status } }),
            ),
            `publish status event ${eventId}`,
        );
    }

    // Push FCM a los asistentes cuando la rodada pasa a en_curso, para que
    // abran el radar (ROD-03). No bloquea la respuesta (fire-and-forget).
    private async notifyRideStarted(eventId: string, title: string): Promise<void> {
        const { rows } = await this.db.query<{ fcm_token: string }>(
            `SELECT u.fcm_token
             FROM event_attendees a
             JOIN users u ON u.id = a.user_id
             WHERE a.event_id = $1 AND u.fcm_token IS NOT NULL`,
            [eventId],
        );
        const tokens = rows.map((r) => r.fcm_token);
        if (tokens.length === 0) return;

        await this.fcm.sendToTokens(
            tokens,
            {
                title: 'Rodada iniciada',
                body: `"${title}" está en marcha. Abre el mapa para activar tu radar.`,
            },
            { eventId, type: 'ride_started' },
        );
    }

    private async _updateRiderStatsOnCompletion(eventId: string, routeId: string | null): Promise<void> {
        // Obtener distancia de la ruta (0 si no hay ruta)
        let distanceKm = 0;
        if (routeId) {
            const { rows: routeRows } = await this.db.query<{ distance_km: number }>(
                'SELECT distance_km FROM routes WHERE id = $1',
                [routeId],
            );
            distanceKm = Number(routeRows[0]?.distance_km ?? 0);
        }

        // Obtener todos los asistentes al evento
        const { rows: attendees } = await this.db.query<{ user_id: string }>(
            'SELECT user_id FROM event_attendees WHERE event_id = $1',
            [eventId],
        );

        // Actualizar estadísticas de cada rider
        for (const attendee of attendees) {
            await this.db.query(
                `UPDATE users
                 SET rides_completed = rides_completed + 1,
                     total_km = total_km + $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [distanceKm, attendee.user_id],
            );
        }
    }

    private async verifyEventClub(eventId: string, clubId?: string): Promise<void> {
        if (!clubId) return;
        const { rows } = await this.db.query<{ '1': number }>(
            'SELECT 1 FROM events WHERE id = $1 AND club_id = $2',
            [eventId, clubId],
        );
        if (rows.length === 0) {
            throw new NotFoundException('Event not found in this club');
        }
    }

    // --- RSVP LOGIC ---
    async rsvp(eventId: string, user: { id: string; role: string }, requestedRideRole?: string, clubId?: string): Promise<{ success: boolean; message: string }> {
        const userId = user.id;
        const userRole = user.role;
        let rideRole = requestedRideRole || 'rider';

        // Solo admin o leader pueden elegir un rol distinto a rider
        if (rideRole !== 'rider' && userRole !== 'admin' && userRole !== 'leader') {
            rideRole = 'rider';
        }

        const event = await this.findOne(eventId, clubId);

        if (event.status !== 'proximo') {
            throw new BadRequestException('Can only RSVP to events that are "proximo"');
        }

        // Validate max attendees
        if (event.max_attendees) {
            const attendeesCount = await this.db.query<CountRow>(
                'SELECT COUNT(*) FROM event_attendees WHERE event_id = $1',
                [eventId],
            );
            if (parseInt(String(attendeesCount.rows[0].count)) >= event.max_attendees) {
                throw new BadRequestException('Event is full');
            }
        }

        // Validate rider level
        const userRes = await this.db.query<UserLevelRow>('SELECT rider_level FROM users WHERE id = $1', [userId]);
        const userLevel = userRes.rows[0].rider_level;

        const levels = ['novato', 'basico', 'intermedio', 'avanzado', 'experto'];
        const requiredLevelIdx = levels.indexOf(event.min_rider_level ?? 'novato');
        const userLevelIdx = levels.indexOf(userLevel);

        if (userLevelIdx < requiredLevelIdx) {
            throw new BadRequestException(`Required rider level is ${event.min_rider_level} but user is ${userLevel}`);
        }

        // Validate motorcycle constraints (SOAT & RTM)
        const activeMoto = await this.db.query<MotorcycleRow>(
            `SELECT soat_expiry, tech_review_expiry
       FROM motorcycles
       WHERE user_id = $1 AND soat_expiry > CURRENT_DATE AND tech_review_expiry > CURRENT_DATE
       LIMIT 1`,
            [userId],
        );

        if (activeMoto.rows.length === 0) {
            throw new BadRequestException('No active motorcycle with valid SOAT and Tech Review found for the user');
        }

        // Validate role exists in the club and respect unique roles
        const clubRideRole = await this.rideRolesService.findBySlug(event.club_id ?? '', rideRole);
        if (!clubRideRole) {
            throw new BadRequestException(`El rol de rodada "${rideRole}" no existe en este club`);
        }
        if (clubRideRole.is_unique) {
            const existing = await this.db.query(
                `SELECT 1 FROM event_attendees WHERE event_id = $1 AND ride_role = $2 LIMIT 1`,
                [eventId, rideRole],
            );
            if (existing.rows.length > 0) {
                throw new ConflictException(`Ya existe un ${clubRideRole.name} asignado para este evento`);
            }
        }

        // Insert RSVP
        try {
            await this.db.query(
                `INSERT INTO event_attendees (event_id, user_id, ride_role, confirmed_at)
                VALUES ($1, $2, $3, NOW())`,
                [eventId, userId, rideRole],
            );
        } catch (e: unknown) {
            const err = e as { code?: string };
            if (err.code === '23505') { // Unique violation (event_id, user_id)
                throw new ConflictException('User is already RSVPd to this event');
            }
            throw e;
        }

        // Autorizar al rider en el tracker en tiempo real (members + rol canónico).
        await this.safeRedis(
            () => this.redis.multi()
                .sadd(this.eventMembersKey(eventId), userId)
                .hset(this.eventRolesKey(eventId), userId, rideRole)
                .exec(),
            `sadd member event ${eventId}`,
        );

        return { success: true, message: 'RSVP confirmed' };
    }

    async cancelRsvp(eventId: string, userId: string, clubId?: string): Promise<{ deleted: boolean }> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query(
            'DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2 RETURNING *',
            [eventId, userId],
        );
        if (!res.rows[0]) throw new NotFoundException('RSVP not found');

        // Eliminar los invitados registrados por este piloto para que no queden huérfanos.
        await this.db.query(
            'DELETE FROM event_guests WHERE event_id = $1 AND invited_by = $2',
            [eventId, userId],
        );

        // Revocar la autorización del rider en el tracker (members + rol).
        await this.safeRedis(
            () => this.redis.multi()
                .srem(this.eventMembersKey(eventId), userId)
                .hdel(this.eventRolesKey(eventId), userId)
                .exec(),
            `srem member event ${eventId}`,
        );

        return { deleted: true };
    }

    async getAttendees(eventId: string, clubId?: string): Promise<AttendeeRow[]> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query<AttendeeRow>(
            `SELECT a.user_id, a.ride_role, a.confirmed_at, a.checklist_completed,
              u.name, u.nickname, u.rider_level
       FROM event_attendees a
       JOIN users u ON u.id = a.user_id
       WHERE a.event_id = $1`,
            [eventId],
        );
        return res.rows;
    }

    async updateAttendeeRole(eventId: string, targetUserId: string, role: RideRole, clubId?: string): Promise<AttendeeRow> {
        const event = await this.findOne(eventId, clubId);
        const clubRideRole = await this.rideRolesService.findBySlug(event.club_id ?? '', role);
        if (!clubRideRole) {
            throw new BadRequestException(`El rol de rodada "${role}" no existe en este club`);
        }
        // Basic unique checks for roles flagged as is_unique are handled by PG unique indexes
        try {
            const res = await this.db.query<AttendeeRow>(
                `UPDATE event_attendees SET ride_role = $1 WHERE event_id = $2 AND user_id = $3 RETURNING *`,
                [role, eventId, targetUserId],
            );
            if (!res.rows[0]) throw new NotFoundException('Attendee not found in this event');

            // Reflejar el rol nuevo en el tracker de inmediato (ROD-07):
            // el radar usa el rol canónico del hash, no el que envía el cliente.
            await this.safeRedis(
                () => this.redis.hset(this.eventRolesKey(eventId), targetUserId, role),
                `hset role event ${eventId}`,
            );

            return res.rows[0];
        } catch (e: unknown) {
            const err = e as { code?: string };
            if (err.code === '23505') { // Unique mapping failure
                throw new ConflictException(`A ${role} already exists for this event.`);
            }
            throw e;
        }
    }

    // --- CHECKLIST LOGIC ---
    async getChecklist(eventId: string, clubId?: string): Promise<ChecklistItemRow[]> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query<ChecklistItemRow>(
            `SELECT * FROM checklist_items WHERE event_id = $1 OR event_id IS NULL ORDER BY sort_order ASC`,
            [eventId],
        );
        return res.rows;
    }

    async addChecklistItem(eventId: string, label: string, required: boolean, clubId?: string): Promise<ChecklistItemRow> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query<ChecklistItemRow>(
            `INSERT INTO checklist_items (event_id, label, required, sort_order)
       VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) FROM checklist_items WHERE event_id = $1), 0) + 1)
       RETURNING *`,
            [eventId, label, required],
        );
        return res.rows[0];
    }

    async removeChecklistItem(eventId: string, itemId: string, clubId?: string): Promise<{ deleted: boolean }> {
        await this.verifyEventClub(eventId, clubId);
        await this.db.query(
            `DELETE FROM checklist_responses WHERE item_id = $1`,
            [itemId],
        );
        const res = await this.db.query<ChecklistItemRow>(
            `DELETE FROM checklist_items WHERE id = $1 AND event_id = $2 RETURNING *`,
            [itemId, eventId],
        );
        if (!res.rows[0]) throw new NotFoundException('Checklist item not found');
        return { deleted: true };
    }

    async respondChecklist(eventId: string, userId: string, responses: { itemId: string; checked: boolean }[], clubId?: string): Promise<{ success: boolean; checklist_completed: boolean }> {
        await this.verifyEventClub(eventId, clubId);
        // Bulk insert/update logic
        for (const r of responses) {
            await this.db.query(
                `INSERT INTO checklist_responses (item_id, user_id, event_id, checked)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (item_id, user_id, event_id) DO UPDATE SET checked = EXCLUDED.checked`,
                [r.itemId, userId, eventId, r.checked],
            );
        }

        // Determine if all required are checked and update attendee
        const requiredItems = await this.db.query<ChecklistItemRow>(
            `SELECT id FROM checklist_items WHERE (event_id = $1 OR event_id IS NULL) AND required = true`,
            [eventId],
        );

        const requiredIds = requiredItems.rows.map((r) => r.id);
        let allChecked = true;

        if (requiredIds.length > 0) {
            const userResp = await this.db.query<{ item_id: string }>(
                `SELECT item_id FROM checklist_responses
         WHERE event_id = $1 AND user_id = $2 AND checked = true AND item_id = ANY($3::uuid[])`,
                [eventId, userId, requiredIds],
            );
            if (userResp.rows.length < requiredIds.length) allChecked = false;
        }

        await this.db.query(
            `UPDATE event_attendees SET checklist_completed = $1 WHERE event_id = $2 AND user_id = $3`,
            [allChecked, eventId, userId],
        );

        return { success: true, checklist_completed: allChecked };
    }

    async getChecklistStatus(eventId: string, clubId?: string): Promise<{ userId: string; name: string; checklist_completed: boolean }[]> {
        const attendees = await this.getAttendees(eventId, clubId);
        return attendees.map((a) => ({
            userId: a.user_id,
            name: a.name,
            checklist_completed: a.checklist_completed,
        }));
    }

    // --- INVENTORY LOGIC (SELECT FOR UPDATE SKIP LOCKED) ---
    async getInventory(eventId: string, clubId?: string): Promise<InventoryRow[]> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query<InventoryRow>('SELECT * FROM inventory_items WHERE event_id = $1', [eventId]);
        return res.rows;
    }

    async addInventoryItem(eventId: string, item: CreateInventoryItemDto, clubId?: string): Promise<InventoryRow> {
        await this.verifyEventClub(eventId, clubId);
        const { name, category, quantity, icon } = item;
        const res = await this.db.query<InventoryRow>(
            `INSERT INTO inventory_items (event_id, name, category, quantity, icon)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [eventId, name, category, quantity || 1, icon || null],
        );
        return res.rows[0];
    }

    async claimInventoryItem(eventId: string, itemId: string, userId: string, clubId?: string): Promise<InventoryRow> {
        await this.verifyEventClub(eventId, clubId);
        const client = await this.db.getPool().connect();
        try {
            await client.query('BEGIN');

            const lockRes = await client.query<{ assigned_to: string | null }>(
                'SELECT assigned_to FROM inventory_items WHERE id = $1 AND event_id = $2 FOR UPDATE SKIP LOCKED',
                [itemId, eventId],
            );

            if (lockRes.rows.length === 0) {
                throw new NotFoundException('Item not found or currently locked by another process');
            }

            if (lockRes.rows[0].assigned_to) {
                throw new ConflictException('Item is already claimed');
            }

            const updateRes = await client.query<InventoryRow>(
                'UPDATE inventory_items SET assigned_to = $1 WHERE id = $2 RETURNING *',
                [userId, itemId],
            );

            await client.query('COMMIT');
            return updateRes.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async releaseInventoryItem(eventId: string, itemId: string, userId: string, clubId?: string): Promise<{ released: boolean; item: InventoryRow }> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query<InventoryRow>(
            'UPDATE inventory_items SET assigned_to = NULL WHERE id = $1 AND event_id = $2 AND assigned_to = $3 RETURNING *',
            [itemId, eventId, userId],
        );
        if (!res.rows[0]) throw new ConflictException('Not assigned to you or already unassigned');
        return { released: true, item: res.rows[0] };
    }

    async removeInventoryItem(eventId: string, itemId: string, clubId?: string): Promise<{ deleted: boolean }> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query<InventoryRow>('DELETE FROM inventory_items WHERE id = $1 AND event_id = $2 RETURNING *', [itemId, eventId]);
        if (!res.rows[0]) throw new NotFoundException('Item not found');
        return { deleted: true };
    }

    // --- GUESTS LOGIC (acompañantes e invitados sin cuenta) ---
    async getGuests(eventId: string, clubId?: string): Promise<GuestRow[]> {
        await this.verifyEventClub(eventId, clubId);
        const res = await this.db.query<GuestRow>(
            `SELECT g.id, g.event_id, g.invited_by, g.guest_type, g.full_name,
                    g.phone, g.notes, g.confirmed_at, g.created_at,
                    u.name AS inviter_name
             FROM event_guests g
             LEFT JOIN users u ON u.id = g.invited_by
             WHERE g.event_id = $1
             ORDER BY g.created_at ASC`,
            [eventId],
        );
        return res.rows;
    }

    async addGuest(eventId: string, userId: string, dto: CreateEventGuestDto, clubId?: string): Promise<GuestRow> {
        await this.verifyEventClub(eventId, clubId);

        // El piloto debe estar inscrito al evento para poder invitar.
        const attending = await this.db.query<{ '1': number }>(
            'SELECT 1 FROM event_attendees WHERE event_id = $1 AND user_id = $2',
            [eventId, userId],
        );
        if (attending.rows.length === 0) {
            throw new BadRequestException('Debes confirmar tu asistencia antes de invitar acompañantes');
        }

        try {
            const res = await this.db.query<GuestRow>(
                `INSERT INTO event_guests (event_id, invited_by, guest_type, full_name, phone, notes)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [eventId, userId, dto.guest_type, dto.full_name, dto.phone ?? null, dto.notes ?? null],
            );
            return res.rows[0];
        } catch (e: unknown) {
            const err = e as { code?: string };
            // 23505: unique violation (event_id, full_name) o partial index idx_one_acompanante_per_rider
            if (err.code === '23505') {
                if (dto.guest_type === 'acompañante') {
                    throw new ConflictException('Ya tienes un acompañante en este evento');
                }
                throw new ConflictException('Ya existe un invitado con ese nombre en este evento');
            }
            throw e;
        }
    }

    async updateGuest(eventId: string, guestId: string, userId: string, dto: UpdateEventGuestDto, clubId?: string): Promise<GuestRow> {
        await this.verifyEventClub(eventId, clubId);
        const existing = await this.db.query<GuestRow>(
            'SELECT * FROM event_guests WHERE id = $1 AND event_id = $2',
            [guestId, eventId],
        );
        if (!existing.rows[0]) throw new NotFoundException('Guest not found');

        // Solo el piloto que lo invitó (o un admin/leader) puede editarlo.
        const guest = existing.rows[0];
        const isOwner = guest.invited_by === userId;

        if (!isOwner) {
            // Verificar si es admin/leader del club
            const userRes = await this.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
            const role = userRes.rows[0]?.role;
            if (role !== 'admin' && role !== 'leader' && role !== 'superadmin') {
                throw new BadRequestException('No tienes permisos para editar este invitado');
            }
        }

        const keys: string[] = [];
        const values: unknown[] = [];
        if (dto.full_name !== undefined) { keys.push('full_name'); values.push(dto.full_name); }
        if (dto.phone !== undefined) { keys.push('phone'); values.push(dto.phone || null); }
        if (dto.notes !== undefined) { keys.push('notes'); values.push(dto.notes || null); }
        if (dto.guest_type !== undefined) { keys.push('guest_type'); values.push(dto.guest_type); }

        if (keys.length === 0) return guest;

        const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        values.push(guestId, eventId);

        try {
            const res = await this.db.query<GuestRow>(
                `UPDATE event_guests SET ${setClauses} WHERE id = $${values.length - 1} AND event_id = $${values.length} RETURNING *`,
                values,
            );
            return res.rows[0];
        } catch (e: unknown) {
            const err = e as { code?: string };
            if (err.code === '23505') {
                throw new ConflictException('Ya existe un invitado con ese nombre en este evento');
            }
            throw e;
        }
    }

    async removeGuest(eventId: string, guestId: string, userId: string, clubId?: string): Promise<{ deleted: boolean }> {
        await this.verifyEventClub(eventId, clubId);
        const existing = await this.db.query<GuestRow>(
            'SELECT * FROM event_guests WHERE id = $1 AND event_id = $2',
            [guestId, eventId],
        );
        if (!existing.rows[0]) throw new NotFoundException('Guest not found');

        const guest = existing.rows[0];
        const isOwner = guest.invited_by === userId;

        if (!isOwner) {
            const userRes = await this.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
            const role = userRes.rows[0]?.role;
            if (role !== 'admin' && role !== 'leader' && role !== 'superadmin') {
                throw new BadRequestException('No tienes permisos para eliminar este invitado');
            }
        }

        await this.db.query('DELETE FROM event_guests WHERE id = $1 AND event_id = $2', [guestId, eventId]);
        return { deleted: true };
    }
}
