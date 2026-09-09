import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { DatabaseService } from '../database/database.service';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard, ClubGuard)
export class PlansController {
    private static readonly CACHE_KEY = 'plans:active';
    private static readonly CACHE_TTL = 300; // 5 minutes

    constructor(
        private readonly plansService: PlansService,
        private readonly db: DatabaseService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) { }

    @Get()
    async list() {
        const cached = await this.redis.get(PlansController.CACHE_KEY);
        if (cached) return JSON.parse(cached);

        const { rows } = await this.db.query(
            `SELECT id, name, description, price_monthly_cents, price_yearly_cents,
                    max_members, max_events_month, overage_member_cents, features
             FROM plans
             WHERE is_active = TRUE
             ORDER BY price_monthly_cents`,
        );
        await this.redis.set(PlansController.CACHE_KEY, JSON.stringify(rows), 'EX', PlansController.CACHE_TTL);
        return rows;
    }

    @Get('limits')
    async getLimits(@CurrentClub() clubId: string) {
        return this.plansService.getClubLimits(clubId);
    }
}
