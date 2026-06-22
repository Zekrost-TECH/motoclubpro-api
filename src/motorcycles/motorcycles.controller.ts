import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, HttpCode, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MotorcyclesService } from './motorcycles.service';
import { CreateMotorcycleDto } from './dto/create-motorcycle.dto';
import { UpdateMotorcycleDto } from './dto/update-motorcycle.dto';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { OwnerGuard } from './guards/owner.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import type { AuthRequest } from '../auth/auth.types';
import type { Motorcycle, MaintenanceRecord } from './motorcycles.types';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('motorcycles')
@ApiTags('motorcycles')
@UseGuards(JwtAuthGuard, ClubGuard)
export class MotorcyclesController {
    constructor(private readonly motorcyclesService: MotorcyclesService) { }

    @Post()
    create(@Request() req: AuthRequest, @Body() createMotorcycleDto: CreateMotorcycleDto, @CurrentClub() clubId?: string): Promise<Motorcycle> {
        return this.motorcyclesService.create(req.user.id, createMotorcycleDto, clubId);
    }

    @Get()
    findAll(@CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: Motorcycle[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        return this.motorcyclesService.findAll(undefined, clubId, pagination?.page, pagination?.limit);
    }

    @Get('mine')
    findMine(@Request() req: AuthRequest, @CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: Motorcycle[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        return this.motorcyclesService.findAll(req.user.id, clubId, pagination?.page, pagination?.limit);
    }

    @Get(':id')
    @UseGuards(OwnerGuard)
    findOne(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<Motorcycle> {
        return this.motorcyclesService.findOne(id, clubId);
    }

    @Patch(':id')
    @UseGuards(OwnerGuard)
    update(@Param('id') id: string, @Body() updateMotorcycleDto: UpdateMotorcycleDto, @CurrentClub() clubId?: string): Promise<Motorcycle> {
        return this.motorcyclesService.update(id, updateMotorcycleDto, clubId);
    }

    @Delete(':id')
    @UseGuards(OwnerGuard)
    @HttpCode(204)
    remove(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<void> {
        return this.motorcyclesService.remove(id, clubId);
    }

    @Post(':id/maintenance')
    @UseGuards(OwnerGuard)
    addMaintenance(
        @Param('id') id: string,
        @Body() createMaintenanceDto: CreateMaintenanceDto,
        @CurrentClub() clubId?: string,
    ): Promise<MaintenanceRecord> {
        return this.motorcyclesService.addMaintenance(id, createMaintenanceDto, clubId);
    }

    @Get(':id/maintenance')
    @UseGuards(OwnerGuard)
    getMaintenances(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<MaintenanceRecord[]> {
        return this.motorcyclesService.getMaintenances(id, clubId);
    }
}
