import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SosService } from './sos.service';
import { CreateSosDto } from './dto/create-sos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/users.types';

@Controller('sos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SosController {
    constructor(private readonly sosService: SosService) { }

    // Limitar crear alertas SOS: max 2 requests en 1 minuto (60000ms)
    @Throttle({ default: { limit: 2, ttl: 60000 } })
    @Post()
    async create(@Req() req, @Body() createSosDto: CreateSosDto) {
        const userId = req.user.sub || req.user.id;
        return await this.sosService.create(userId, createSosDto);
    }

    @Get()
    @Roles(UserRole.admin, UserRole.lider, UserRole.piloto)
    async findAll() {
        return await this.sosService.findAll();
    }

    @Get('active')
    async findActive() {
        return await this.sosService.findActive();
    }

    @Patch(':id/resolve')
    async resolve(@Param('id') id: string, @Req() req) {
        const userId = req.user.sub || req.user.id;
        return await this.sosService.resolve(id, userId);
    }
}
