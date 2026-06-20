import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { RideRole } from './events.types';

@Injectable()
export class EventsService {
    constructor(private readonly db: DatabaseService) { }

    async create(createEventDto: CreateEventDto, userId: string) {
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
        } = createEventDto;

        const res = await this.db.query(
            `INSERT INTO events (
        title, description, date, time, difficulty, route_id, 
        max_attendees, min_rider_level, meeting_point, organizer_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
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
                userId,
            ],
        );
        return res.rows[0];
    }

    async findAll(status?: string, upcoming?: boolean) {
        let queryStr = 'SELECT * FROM events';
        const params: any[] = [];
        const conditions: string[] = [];

        if (status) {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }

        if (upcoming) {
            conditions.push(`date >= CURRENT_DATE`);
        }

        if (conditions.length > 0) {
            queryStr += ` WHERE ${conditions.join(' AND ')}`;
        }

        queryStr += ` ORDER BY date ASC, time ASC`;

        const res = await this.db.query(queryStr, params);

        await Promise.all(
            res.rows.map(async (event) => {
                event.attendees = await this.getAttendees(event.id);
                event.inventory = await this.getInventory(event.id);
            })
        );

        return res.rows;
    }

    async findOne(id: string) {
        const res = await this.db.query('SELECT * FROM events WHERE id = $1', [id]);
        if (!res.rows[0]) throw new NotFoundException('Event not found');

        const event = res.rows[0];
        event.attendees = await this.getAttendees(id);
        event.inventory = (await this.getInventory(id));
        return event;
    }

    async update(id: string, updateEventDto: UpdateEventDto) {
        const keys = Object.keys(updateEventDto);
        if (keys.length === 0) return this.findOne(id);

        const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        const params = Object.values(updateEventDto);
        params.push(id);

        const res = await this.db.query(
            `UPDATE events SET ${setClauses}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
            params,
        );

        if (!res.rows[0]) throw new NotFoundException('Event not found');
        return res.rows[0];
    }

    async remove(id: string) {
        const res = await this.db.query('DELETE FROM events WHERE id = $1 RETURNING *', [id]);
        if (!res.rows[0]) throw new NotFoundException('Event not found');
        return { deleted: true };
    }

    async updateStatus(id: string, newStatus: string) {
        const event = await this.findOne(id);
        const validTransitions: Record<string, string[]> = {
            'borrador': ['próximo', 'cancelado'],
            'próximo': ['en-curso', 'cancelado'],
            'en-curso': ['completado', 'cancelado'],
            'completado': [],
            'cancelado': []
        };

        const allowed = validTransitions[event.status] || [];
        if (!allowed.includes(newStatus)) {
            throw new BadRequestException(`Cannot transition from ${event.status} to ${newStatus}`);
        }

        const res = await this.db.query(
            `UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
            [newStatus, id]
        );

        return res.rows[0];
    }

    // --- RSVP LOGIC ---
    async rsvp(eventId: string, user: any, requestedRideRole?: string) {
        const userId = user.id;
        const userRole = user.role;
        let rideRole = requestedRideRole || 'rider';

        // Solo admin o lider pueden elegir un rol distinto a rider
        if (rideRole !== 'rider' && userRole !== 'admin' && userRole !== 'lider') {
            rideRole = 'rider';
        }

        const event = await this.findOne(eventId);

        if (event.status !== 'proximo') {
            throw new BadRequestException('Can only RSVP to events that are "próximo"');
        }

        // Validate max attendees
        if (event.max_attendees) {
            const attendeesCount = await this.db.query(
                'SELECT COUNT(*) FROM event_attendees WHERE event_id = $1',
                [eventId],
            );
            if (parseInt(attendeesCount.rows[0].count) >= event.max_attendees) {
                throw new BadRequestException('Event is full');
            }
        }

        // Validate rider level
        const userRes = await this.db.query('SELECT rider_level FROM users WHERE id = $1', [userId]);
        const userLevel = userRes.rows[0].rider_level;

        const levels = ['novato', 'basico', 'intermedio', 'avanzado', 'experto'];
        const requiredLevelIdx = levels.indexOf(event.min_rider_level);
        const userLevelIdx = levels.indexOf(userLevel);

        if (userLevelIdx < requiredLevelIdx) {
            throw new BadRequestException(`Required rider level is ${event.min_rider_level} but user is ${userLevel}`);
        }

        // Validate motorcycle constraints (SOAT & RTM)
        const activeMoto = await this.db.query(
            `SELECT soat_expiry, tech_review_expiry 
       FROM motorcycles 
       WHERE user_id = $1 AND soat_expiry > CURRENT_DATE AND tech_review_expiry > CURRENT_DATE
       LIMIT 1`,
            [userId],
        );

        if (activeMoto.rows.length === 0) {
            throw new BadRequestException('No active motorcycle with valid SOAT and Tech Review found for the user');
        }

        // Insert RSVP
        try {
            await this.db.query(
                `INSERT INTO event_attendees (event_id, user_id, ride_role, confirmed_at) 
                VALUES ($1, $2, $3, NOW())`,
                [eventId, userId, rideRole],
            );
        } catch (e: any) {
            if (e.code === '23505') { // Unique violation
                throw new ConflictException('User is already RSVPd to this event');
            }
            throw e;
        }

        return { success: true, message: 'RSVP confirmed' };
    }

    async cancelRsvp(eventId: string, userId: string) {
        const res = await this.db.query(
            'DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2 RETURNING *',
            [eventId, userId],
        );
        if (!res.rows[0]) throw new NotFoundException('RSVP not found');
        return { deleted: true };
    }

    async getAttendees(eventId: string) {
        const res = await this.db.query(
            `SELECT a.user_id, a.ride_role, a.confirmed_at, a.checklist_completed,
              u.name, u.nickname, u.rider_level 
       FROM event_attendees a
       JOIN users u ON u.id = a.user_id
       WHERE a.event_id = $1`,
            [eventId],
        );
        return res.rows;
    }

    async updateAttendeeRole(eventId: string, targetUserId: string, role: RideRole) {
        // Basic unique checks for 'puntero' and 'barredora' are handled by PG unique indexes
        try {
            const res = await this.db.query(
                `UPDATE event_attendees SET ride_role = $1 WHERE event_id = $2 AND user_id = $3 RETURNING *`,
                [role, eventId, targetUserId],
            );
            if (!res.rows[0]) throw new NotFoundException('Attendee not found in this event');
            return res.rows[0];
        } catch (e: any) {
            if (e.code === '23505') { // Unique mapping failure
                throw new ConflictException(`A \${role} already exists for this event.`);
            }
            throw e;
        }
    }

    // --- CHECKLIST LOGIC ---
    async getChecklist(eventId: string) {
        const res = await this.db.query(
            `SELECT * FROM checklist_items WHERE event_id = $1 OR event_id IS NULL ORDER BY sort_order ASC`,
            [eventId]
        );
        return res.rows;
    }

    async respondChecklist(eventId: string, userId: string, responses: { itemId: string; checked: boolean }[]) {
        // Bulk insert/update logic
        for (const r of responses) {
            await this.db.query(
                `INSERT INTO checklist_responses (item_id, user_id, event_id, checked)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (item_id, user_id, event_id) DO UPDATE SET checked = EXCLUDED.checked`,
                [r.itemId, userId, eventId, r.checked]
            );
        }

        // Determine if all required are checked and update attendee
        const requiredItems = await this.db.query(
            `SELECT id FROM checklist_items WHERE (event_id = $1 OR event_id IS NULL) AND required = true`,
            [eventId]
        );

        const requiredIds = requiredItems.rows.map(r => r.id);
        let allChecked = true;

        if (requiredIds.length > 0) {
            const userResp = await this.db.query(
                `SELECT item_id FROM checklist_responses 
         WHERE event_id = $1 AND user_id = $2 AND checked = true AND item_id = ANY($3::uuid[])`,
                [eventId, userId, requiredIds]
            );
            if (userResp.rows.length < requiredIds.length) allChecked = false;
        }

        await this.db.query(
            `UPDATE event_attendees SET checklist_completed = $1 WHERE event_id = $2 AND user_id = $3`,
            [allChecked, eventId, userId]
        );

        return { success: true, checklist_completed: allChecked };
    }

    async getChecklistStatus(eventId: string) {
        const attendees = await this.getAttendees(eventId);
        return attendees.map(a => ({
            userId: a.user_id,
            name: a.name,
            checklist_completed: a.checklist_completed
        }));
    }

    // --- INVENTORY LOGIC (SELECT FOR UPDATE SKIP LOCKED) ---
    async getInventory(eventId: string) {
        const res = await this.db.query('SELECT * FROM inventory_items WHERE event_id = $1', [eventId]);
        return res.rows;
    }

    async addInventoryItem(eventId: string, item: CreateInventoryItemDto) {
        const { name, category, quantity, icon } = item;
        const res = await this.db.query(
            `INSERT INTO inventory_items (event_id, name, category, quantity, icon) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [eventId, name, category, quantity || 1, icon || null]
        );
        return res.rows[0];
    }

    async claimInventoryItem(eventId: string, itemId: string, userId: string) {
        const client = await this.db.getPool().connect();
        try {
            await client.query('BEGIN');

            const lockRes = await client.query(
                'SELECT assigned_to FROM inventory_items WHERE id = $1 AND event_id = $2 FOR UPDATE SKIP LOCKED',
                [itemId, eventId]
            );

            if (lockRes.rows.length === 0) {
                throw new NotFoundException('Item not found or currently locked by another process');
            }

            if (lockRes.rows[0].assigned_to) {
                throw new ConflictException('Item is already claimed');
            }

            const updateRes = await client.query(
                'UPDATE inventory_items SET assigned_to = $1 WHERE id = $2 RETURNING *',
                [userId, itemId]
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

    async releaseInventoryItem(eventId: string, itemId: string, userId: string) {
        // Only the assigned user (or admin/captain implicitly through routes later) should release it
        const res = await this.db.query(
            'UPDATE inventory_items SET assigned_to = NULL WHERE id = $1 AND event_id = $2 AND assigned_to = $3 RETURNING *',
            [itemId, eventId, userId]
        );
        if (!res.rows[0]) throw new ConflictException('Not assigned to you or already unassigned');
        return { released: true, item: res.rows[0] };
    }

    async removeInventoryItem(eventId: string, itemId: string) {
        const res = await this.db.query('DELETE FROM inventory_items WHERE id = $1 AND event_id = $2 RETURNING *', [itemId, eventId]);
        if (!res.rows[0]) throw new NotFoundException('Item not found');
        return { deleted: true };
    }
}
