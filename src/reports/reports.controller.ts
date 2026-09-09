import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
    @ApiOperation({ summary: 'Reporte de rodadas', description: 'Genera un reporte de rodadas del club en un rango de fechas' })
    @ApiBearerAuth()
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
    @ApiOperation({ summary: 'Reporte de SOS', description: 'Genera un reporte de alertas SOS del club en un rango de fechas' })
    @ApiBearerAuth()
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
    @ApiOperation({ summary: 'Reporte de miembros', description: 'Genera un reporte de miembros del club' })
    @ApiBearerAuth()
    async members(@CurrentClub() clubId: string) {
        const r = await this.reportsService.membersReport(clubId);
        return {
            total: Number(r.total),
            activeThisMonth: Number(r.active_this_month),
            avgSkill: Number(r.avg_skill),
        };
    }

    @Get('financial')
    @ApiOperation({ summary: 'Reporte financiero', description: 'Genera un reporte financiero del club en un rango de fechas' })
    @ApiBearerAuth()
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
    @ApiOperation({ summary: 'Reporte puntos de apoyo', description: 'Genera un reporte de puntos de apoyo del club' })
    @ApiBearerAuth()
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
