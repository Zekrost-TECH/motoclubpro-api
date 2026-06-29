import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupportService, type SupportPointRow, type SupportPointSummary, type SupportPointVerify, type SupportPointReview } from './support.service';
import { CreateSupportDto, SupportType } from './dto/create-support.dto';
import { UpdateSupportDto } from './dto/update-support.dto';
import { ReviewSupportDto } from './dto/review-support.dto';
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
    async search(
        @Query('lat') lat?: string,
        @Query('lng') lng?: string,
        @Query('radius') radius?: string,
        @Query('type') type?: SupportType,
        @CurrentClub() clubId?: string,
    ): Promise<SupportPointRow[]> {
        const latNum = lat ? parseFloat(lat) : NaN;
        const lngNum = lng ? parseFloat(lng) : NaN;
        const radiusNum = radius ? parseFloat(radius) : NaN;
        if (Number.isFinite(latNum) && Number.isFinite(lngNum) && Number.isFinite(radiusNum)) {
            return await this.supportService.search(latNum, lngNum, radiusNum, type, clubId);
        }
        return await this.supportService.findAll(clubId);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<SupportPointRow> {
        return await this.supportService.findOne(id, clubId);
    }

    @Post()
    async create(@Req() req: AuthRequest, @Body() createSupportDto: CreateSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointSummary> {
        const userId = req.user.id;
        return await this.supportService.create(userId, createSupportDto, clubId);
    }

    @Patch(':id')
    @ClubRoles(UserRole.admin, UserRole.lider)
    async update(@Param('id') id: string, @Body() updateSupportDto: UpdateSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointSummary> {
        return await this.supportService.update(id, updateSupportDto, clubId);
    }

    @Patch(':id/verify')
    @ClubRoles(UserRole.admin, UserRole.lider)
    async verify(@Param('id') id: string, @Body() body: { verified: boolean }, @CurrentClub() clubId?: string): Promise<SupportPointVerify> {
        return await this.supportService.verify(id, body.verified, clubId);
    }

    @Post(':id/review')
    async review(@Req() req: AuthRequest, @Param('id') id: string, @Body() reviewDto: ReviewSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointReview> {
        const userId = req.user.id;
        return await this.supportService.review(id, userId, reviewDto, clubId);
    }
}
