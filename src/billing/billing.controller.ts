import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';

@Controller('billing')
@ApiTags('billing')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class BillingController {
    @Get('subscription')
    subscription() {
        return {
            plan: 'trial',
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            price: 0,
            currency: 'COP',
        };
    }

    @Get('payments')
    payments() {
        return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
}
