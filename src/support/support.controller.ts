import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, ParseFloatPipe, ParseEnumPipe } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateSupportDto, SupportType } from './dto/create-support.dto';
import { ReviewSupportDto } from './dto/review-support.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/users.types';

@Controller('support')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupportController {
    constructor(private readonly supportService: SupportService) { }

    @Get()
    async search(
        @Query('lat', ParseFloatPipe) lat: number,
        @Query('lng', ParseFloatPipe) lng: number,
        @Query('radius', ParseFloatPipe) radiusMs: number,
        @Query('type') type?: SupportType,
    ) {
        return await this.supportService.search(lat, lng, radiusMs, type);
    }

    @Post()
    async create(@Req() req, @Body() createSupportDto: CreateSupportDto) {
        const userId = req.user.sub || req.user.id;
        return await this.supportService.create(userId, createSupportDto);
    }

    @Patch(':id/verify')
    @Roles(UserRole.admin)
    async verify(@Param('id') id: string) {
        return await this.supportService.verify(id);
    }

    @Post(':id/review')
    async review(@Req() req, @Param('id') id: string, @Body() reviewDto: ReviewSupportDto) {
        const userId = req.user.sub || req.user.id;
        return await this.supportService.review(id, userId, reviewDto);
    }
}
