import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { DatabaseService } from '../database/database.service';

@Controller('billing')
@ApiTags('billing')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class BillingController {
    constructor(private readonly db: DatabaseService) { }

    @Get('subscription')
    async subscription(@CurrentClub() clubId?: string) {
        interface SubscriptionDb {
            status: string;
            current_period_start: string | Date | null;
            current_period_end: string | Date | null;
            plan_name: string;
            max_members: number;
        }
        const { rows: subRows } = await this.db.query<SubscriptionDb>(
            `SELECT s.status, s.current_period_start, s.current_period_end,
                    p.name AS plan_name, p.max_members
             FROM club_subscriptions s
             JOIN plans p ON s.plan_id = p.id
             WHERE s.club_id = $1`,
            [clubId || null],
        );
        const sub = subRows[0];
        if (!sub) {
            return { plan: 'prueba', status: 'activa', startDate: null, endDate: null, memberLimit: 0, currentMembers: 0, price: 0, currency: 'COP' };
        }
        const { rows: memberRows } = await this.db.query(
            `SELECT COUNT(*)::int AS count FROM club_members WHERE club_id = $1 AND is_active = TRUE`,
            [clubId || null],
        );
        const currentMembers = memberRows[0]?.count ?? 0;
        return {
            plan: sub.plan_name || 'prueba',
            status: sub.status || 'activa',
            startDate: sub.current_period_start ? new Date(sub.current_period_start).toISOString() : null,
            endDate: sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
            memberLimit: sub.max_members ?? 0,
            currentMembers,
            price: 0,
            currency: 'COP',
        };
    }

    @Get('payments')
    async payments(@CurrentClub() clubId?: string) {
        const { rows } = await this.db.query(
            `SELECT id, paid_at AS date, (amount_cents / 100.0)::numeric(10,2) AS amount,
                    status, payment_method AS method, pdf_url AS invoiceUrl
             FROM payment_transactions
             WHERE club_id = $1
             ORDER BY paid_at DESC`,
            [clubId || null],
        );
        return rows || [];
    }
}
