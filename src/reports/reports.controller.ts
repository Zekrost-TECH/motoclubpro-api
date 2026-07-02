import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@ApiTags('reports')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    @Get('events')
    async events(
        @Query('from') from: string,
        @Query('to') to: string,
        @CurrentClub() clubId: string,
    ) {
        const r = await this.reportsService.eventsReport(clubId, from, to);
        return {
            total: Number(r.total),
            km: Number(r.km),
            avgAttendees: Number(r.avg_attendees),
        };
    }

    @Get('sos')
    async sos(
        @Query('from') from: string,
        @Query('to') to: string,
        @CurrentClub() clubId: string,
    ) {
        const r = await this.reportsService.sosReport(clubId, from, to);
        return {
            total: Number(r.total),
            resolved: Number(r.resolved),
            avgResolutionTime: Number(r.avg_resolution_minutes),
        };
    }

    @Get('members')
    async members(@CurrentClub() clubId: string) {
        const r = await this.reportsService.membersReport(clubId);
        return {
            total: Number(r.total),
            activeThisMonth: Number(r.active_this_month),
            avgSkill: Number(r.avg_skill),
        };
    }

    @Get('financial')
    async financial(
        @Query('from') from: string,
        @Query('to') to: string,
        @CurrentClub() clubId: string,
    ) {
        const r = await this.reportsService.financialReport(clubId, from, to);
        return {
            totalPaid: Number(r.total_paid),
            totalPending: Number(r.total_pending),
            totalFailed: Number(r.total_failed),
            transactionsCount: Number(r.transactions_count),
        };
    }

    @Get('support-points')
    async supportPoints(@CurrentClub() clubId: string) {
        const r = await this.reportsService.supportPointsReport(clubId);
        return {
            total: Number(r.total),
            verified: Number(r.verified),
            pending: Number(r.pending),
            avgRating: Number(r.avg_rating),
        };
    }
}
