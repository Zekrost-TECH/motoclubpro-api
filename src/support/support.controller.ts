import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService, type SupportPointRow, type SupportPointSummary, type SupportPointVerify, type SupportPointReview } from './support.service';
import { CreateSupportDto, SupportType } from './dto/create-support.dto';
import { UpdateSupportDto } from './dto/update-support.dto';
import { ReviewSupportDto } from './dto/review-support.dto';
import { VerifySupportPointDto } from './dto/verify-support.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { UserRole } from '../users/users.types';
import type { AuthRequest } from '../auth/auth.types';

@Controller('support')
@ApiTags('support')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class SupportController {
    constructor(private readonly supportService: SupportService) { }

    @Get()
    @ApiOperation({ summary: 'Buscar puntos de apoyo', description: 'Busca puntos de apoyo por ubicación o lista todos con paginación' })
    @ApiBearerAuth()
    async search(
        @Query('lat') lat?: string,
        @Query('lng') lng?: string,
        @Query('radius') radius?: string,
        @Query('type') type?: SupportType,
        @CurrentClub() clubId?: string,
        @Query() pagination?: PaginationDto,
    ): Promise<SupportPointRow[] | { data: SupportPointRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        const latNum = lat ? parseFloat(lat) : NaN;
        const lngNum = lng ? parseFloat(lng) : NaN;
        const radiusNum = radius ? parseFloat(radius) : NaN;
        if (Number.isFinite(latNum) && Number.isFinite(lngNum) && Number.isFinite(radiusNum)) {
            return await this.supportService.search(latNum, lngNum, radiusNum, type, clubId);
        }
        return await this.supportService.findAll(clubId, pagination?.page, pagination?.limit);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener punto de apoyo', description: 'Obtiene un punto de apoyo por su ID' })
    @ApiBearerAuth()
    async findOne(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<SupportPointRow> {
        return await this.supportService.findOne(id, clubId);
    }

    @Post()
    @ApiOperation({ summary: 'Crear punto de apoyo', description: 'Crea un nuevo punto de apoyo' })
    @ApiBearerAuth()
    async create(@Req() req: AuthRequest, @Body() createSupportDto: CreateSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointSummary> {
        const userId = req.user.id;
        return await this.supportService.create(userId, createSupportDto, clubId);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar punto de apoyo', description: 'Actualiza los datos de un punto de apoyo existente' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    async update(@Param('id') id: string, @Body() updateSupportDto: UpdateSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointSummary> {
        return await this.supportService.update(id, updateSupportDto, clubId);
    }

    @Patch(':id/verify')
    @ApiOperation({ summary: 'Verificar punto de apoyo', description: 'Verifica o desverifica un punto de apoyo' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    async verify(@Param('id') id: string, @Body() dto: VerifySupportPointDto, @CurrentClub() clubId?: string): Promise<SupportPointVerify> {
        return await this.supportService.verify(id, dto.verified ?? true, clubId);
    }

    @Post(':id/review')
    @ApiOperation({ summary: 'Reseñar punto de apoyo', description: 'Crea una reseña para un punto de apoyo' })
    @ApiBearerAuth()
    async review(@Req() req: AuthRequest, @Param('id') id: string, @Body() reviewDto: ReviewSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointReview> {
        const userId = req.user.id;
        return await this.supportService.review(id, userId, reviewDto, clubId);
    }
}
