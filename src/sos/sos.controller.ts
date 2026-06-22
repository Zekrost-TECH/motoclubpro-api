import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { SosService, type SosAlertRow, type SosAlertSummary } from './sos.service';
import { CreateSosDto } from './dto/create-sos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { UserRole } from '../users/users.types';
import type { AuthRequest } from '../auth/auth.types';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('sos')
@ApiTags('sos')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class SosController {
    constructor(private readonly sosService: SosService) { }

    // Limitar crear alertas SOS: max 2 requests en 1 minuto (60000ms)
    @Throttle({ default: { limit: 2, ttl: 60000 } })
    @Post()
    async create(@Req() req: AuthRequest, @Body() createSosDto: CreateSosDto, @CurrentClub() clubId?: string): Promise<SosAlertSummary> {
        const userId = req.user.id;
        return await this.sosService.create(userId, createSosDto, clubId);
    }

    @Get()
    async findAll(@CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: SosAlertRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        return await this.sosService.findAll(clubId, pagination?.page, pagination?.limit);
    }

    @Get('active')
    async findActive(@CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: SosAlertRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        return await this.sosService.findActive(clubId, pagination?.page, pagination?.limit);
    }

    @Patch(':id/resolve')
    @ClubRoles(UserRole.admin, UserRole.lider)
    async resolve(@Param('id') id: string, @Req() req: AuthRequest, @CurrentClub() clubId?: string): Promise<SosAlertSummary> {
        const userId = req.user.id;
        return await this.sosService.resolve(id, userId, clubId);
    }
}
