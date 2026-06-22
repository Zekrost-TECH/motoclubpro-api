import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, ParseFloatPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupportService, type SupportPointRow, type SupportPointSummary, type SupportPointVerify, type SupportPointReview } from './support.service';
import { CreateSupportDto, SupportType } from './dto/create-support.dto';
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
        @Query('lat', ParseFloatPipe) lat: number,
        @Query('lng', ParseFloatPipe) lng: number,
        @Query('radius', ParseFloatPipe) radiusMs: number,
        @Query('type') type?: SupportType,
        @CurrentClub() clubId?: string,
    ): Promise<SupportPointRow[]> {
        return await this.supportService.search(lat, lng, radiusMs, type, clubId);
    }

    @Post()
    async create(@Req() req: AuthRequest, @Body() createSupportDto: CreateSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointSummary> {
        const userId = req.user.id;
        return await this.supportService.create(userId, createSupportDto, clubId);
    }

    @Patch(':id/verify')
    @ClubRoles(UserRole.admin, UserRole.lider)
    async verify(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<SupportPointVerify> {
        return await this.supportService.verify(id, clubId);
    }

    @Post(':id/review')
    async review(@Req() req: AuthRequest, @Param('id') id: string, @Body() reviewDto: ReviewSupportDto, @CurrentClub() clubId?: string): Promise<SupportPointReview> {
        const userId = req.user.id;
        return await this.supportService.review(id, userId, reviewDto, clubId);
    }
}
