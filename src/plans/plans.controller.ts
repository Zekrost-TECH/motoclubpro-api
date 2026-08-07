import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { DatabaseService } from '../database/database.service';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard, ClubGuard)
export class PlansController {
    constructor(
        private readonly plansService: PlansService,
        private readonly db: DatabaseService,
    ) { }

    @Get()
    async list() {
        const { rows } = await this.db.query(
            `SELECT id, name, description, price_monthly_cents, price_yearly_cents,
                    max_members, max_events_month, overage_member_cents, features
             FROM plans
             WHERE is_active = TRUE
             ORDER BY price_monthly_cents`,
        );
        return rows;
    }

    @Get('limits')
    async getLimits(@CurrentClub() clubId: string) {
        return this.plansService.getClubLimits(clubId);
    }
}
