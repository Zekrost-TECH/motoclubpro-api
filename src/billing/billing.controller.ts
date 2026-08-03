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
            plan_id: string;
            status: string;
            current_period_start: string | Date | null;
            current_period_end: string | Date | null;
            billing_cycle: string;
            plan_name: string;
            max_members: number;
            price_monthly_cents: number;
            price_yearly_cents: number;
        }
        const { rows: subRows } = await this.db.query<SubscriptionDb>(
            `SELECT s.plan_id, s.status, s.current_period_start, s.current_period_end,
                    s.billing_cycle, p.name AS plan_name, p.max_members,
                    p.price_monthly_cents, p.price_yearly_cents
             FROM club_subscriptions s
             JOIN plans p ON s.plan_id = p.id
             WHERE s.club_id = $1`,
            [clubId || null],
        );
        const sub = subRows[0];
        if (!sub) {
            const { rows: fallbackRows } = await this.db.query<{ price_monthly_cents: number }>(
                `SELECT price_monthly_cents FROM plans WHERE id = 'prueba'`,
            );
            const price = (fallbackRows[0]?.price_monthly_cents ?? 0) / 100;
            return {
                planId: 'prueba', plan: 'prueba', planName: 'Prueba', status: 'activa',
                startDate: null, endDate: null, memberLimit: 0, currentMembers: 0,
                price, priceYearly: 0, billingCycle: 'monthly', currency: 'COP',
            };
        }
        const { rows: memberRows } = await this.db.query(
            `SELECT COUNT(*)::int AS count FROM club_members WHERE club_id = $1 AND is_active = TRUE`,
            [clubId || null],
        );
        const currentMembers = memberRows[0]?.count ?? 0;
        return {
            planId: sub.plan_id ?? 'prueba',
            plan: sub.plan_name || 'prueba',
            planName: sub.plan_name || 'Prueba',
            status: sub.status || 'activa',
            startDate: sub.current_period_start ? new Date(sub.current_period_start).toISOString() : null,
            endDate: sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
            memberLimit: sub.max_members ?? 0,
            currentMembers,
            price: (sub.price_monthly_cents ?? 0) / 100,
            priceYearly: (sub.price_yearly_cents ?? 0) / 100,
            billingCycle: sub.billing_cycle ?? 'monthly',
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
