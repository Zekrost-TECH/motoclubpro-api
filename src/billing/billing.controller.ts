import { BadRequestException, Body, Controller, Delete, Get, Logger, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { UserRole } from '../users/users.types';
import { DatabaseService } from '../database/database.service';
import { BillingService } from './billing.service';
import { WompiService } from './wompi.service';
import { CreatePaymentSourceDto } from './dto/create-payment-source.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { ChangeSubscriptionDto } from './dto/change-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';

@Controller('billing')
@ApiTags('billing')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class BillingController {
    private readonly logger = new Logger(BillingController.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly billingService: BillingService,
        private readonly wompiService: WompiService,
        private readonly config: ConfigService,
    ) { }

    @Get('acceptance-token')
    async acceptanceToken() {
        const merchant = await this.wompiService.getMerchantInfo();
        return {
            acceptanceToken: merchant.presigned_acceptance.acceptance_token,
            permalink: merchant.presigned_acceptance.permalink ?? null,
            policies: merchant.acceptance_policies ?? {},
            ...this.wompiService.getPublicConfig(),
            dryRun: this.wompiService.dryRun,
        };
    }

    @Post('payment-sources')
    @ClubRoles(UserRole.admin, UserRole.leader)
    async createPaymentSource(@CurrentClub() clubId: string | null, @Body() dto: CreatePaymentSourceDto) {
        if (!clubId) {
            throw new BadRequestException('Club no especificado');
        }
        return this.billingService.attachPaymentSource(clubId, dto);
    }

    @Delete('payment-source')
    @ClubRoles(UserRole.admin, UserRole.leader)
    async deletePaymentSource(@CurrentClub() clubId: string | null) {
        if (!clubId) {
            throw new BadRequestException('Club no especificado');
        }
        await this.billingService.clearPaymentSource(clubId);
        return { ok: true };
    }

    @Post('checkout')
    @ClubRoles(UserRole.admin, UserRole.leader)
    async checkout(@CurrentClub() clubId: string | null, @Body() dto: SubscribeDto) {
        if (!clubId) {
            throw new BadRequestException('Club no especificado');
        }
        const redirectUrl = this.config.get<string>('BILLING_REDIRECT_URL') ?? undefined;
        return this.billingService.createCheckout(clubId, dto.planId, dto.billingCycle, redirectUrl);
    }

    @Post('subscription')
    @ClubRoles(UserRole.admin, UserRole.leader)
    async subscribe(@CurrentClub() clubId: string | null, @Body() dto: SubscribeDto) {
        if (!clubId) {
            throw new BadRequestException('Club no especificado');
        }
        return this.billingService.createSubscription(clubId, dto.planId, dto.billingCycle);
    }

    @Patch('subscription')
    @ClubRoles(UserRole.admin, UserRole.leader)
    async changeSubscription(@CurrentClub() clubId: string | null, @Body() dto: ChangeSubscriptionDto) {
        if (!clubId) {
            throw new BadRequestException('Club no especificado');
        }
        return this.billingService.changeSubscription(clubId, dto.planId, dto.billingCycle);
    }

    @Post('subscription/cancel')
    @ClubRoles(UserRole.admin, UserRole.leader)
    async cancelSubscription(@CurrentClub() clubId: string | null, @Body() dto: CancelSubscriptionDto) {
        if (!clubId) {
            throw new BadRequestException('Club no especificado');
        }
        await this.billingService.cancelSubscription(clubId, dto?.reason);
        return { ok: true, cancelAtPeriodEnd: true };
    }

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
            cancel_at_period_end: boolean;
            retry_count: number;
        }
        const { rows: subRows } = await this.db.query<SubscriptionDb>(
            `SELECT s.plan_id, s.status, s.current_period_start, s.current_period_end,
                    s.billing_cycle, s.cancel_at_period_end, s.retry_count,
                    p.name AS plan_name, p.max_members,
                    p.price_monthly_cents, p.price_yearly_cents
             FROM club_subscriptions s
             JOIN plans p ON s.plan_id = p.id
             WHERE s.club_id = $1`,
            [clubId || null],
        );
        const sub = subRows[0];
        if (!sub) {
            return {
                hasSubscription: false,
                planId: 'prueba',
                plan: 'prueba',
                planName: 'Prueba',
                status: 'sin_suscripcion',
                startDate: null,
                endDate: null,
                memberLimit: 0,
                currentMembers: 0,
                price: 0,
                priceYearly: 0,
                billingCycle: 'monthly',
                currency: 'COP',
                cancelAtPeriodEnd: false,
                retryCount: 0,
                hasPaymentSource: false,
            };
        }
        const { rows: memberRows } = await this.db.query(
            `SELECT COUNT(*)::int AS count FROM club_members WHERE club_id = $1 AND is_active = TRUE`,
            [clubId || null],
        );
        const { rows: paymentRows } = await this.db.query<{ has_source: boolean; last4: string | null }>(
            `SELECT wompi_payment_source_id IS NOT NULL AS has_source, wompi_payment_last4 AS last4
             FROM clubs WHERE id = $1`,
            [clubId || null],
        );
        const currentMembers = memberRows[0]?.count ?? 0;
        return {
            hasSubscription: true,
            planId: sub.plan_id ?? 'prueba',
            plan: sub.plan_name || 'prueba',
            planName: sub.plan_name || 'Prueba',
            status: sub.status || 'trial',
            startDate: sub.current_period_start ? new Date(sub.current_period_start).toISOString() : null,
            endDate: sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
            memberLimit: sub.max_members ?? 0,
            currentMembers,
            price: (sub.price_monthly_cents ?? 0) / 100,
            priceYearly: (sub.price_yearly_cents ?? 0) / 100,
            billingCycle: sub.billing_cycle ?? 'monthly',
            currency: 'COP',
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            retryCount: sub.retry_count ?? 0,
            hasPaymentSource: paymentRows[0]?.has_source ?? false,
            paymentMethodLast4: paymentRows[0]?.last4 ?? null,
        };
    }

    @Get('payments')
    async payments(@CurrentClub() clubId?: string) {
        const { rows } = await this.db.query(
            `SELECT id, paid_at AS date, (amount_cents / 100.0)::float8 AS amount,
                    status, payment_method AS method, pdf_url AS invoiceUrl
             FROM payment_transactions
             WHERE club_id = $1
             ORDER BY paid_at DESC NULLS LAST, created_at DESC`,
            [clubId || null],
        );
        return rows || [];
    }
}
