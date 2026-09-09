import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, HttpCode, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
import { UserRole } from '../users/users.types';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('motorcycles')
@ApiTags('motorcycles')
@UseGuards(JwtAuthGuard, ClubGuard)
export class MotorcyclesController {
    constructor(private readonly motorcyclesService: MotorcyclesService) { }

    @Post()
    @ApiOperation({ summary: 'Crear motocicleta', description: 'Crea una nueva motocicleta para el usuario autenticado' })
    @ApiBearerAuth()
    create(@Request() req: AuthRequest, @Body() createMotorcycleDto: CreateMotorcycleDto, @CurrentClub() clubId?: string): Promise<Motorcycle> {
        return this.motorcyclesService.create(req.user.id, createMotorcycleDto, clubId);
    }

    @Get()
    @ApiOperation({ summary: 'Listar motocicletas', description: 'Obtiene la lista de motocicletas del club con paginación' })
    @ApiBearerAuth()
    findAll(@Request() req: AuthRequest, @CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: Motorcycle[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        if (!clubId && req.user.role !== UserRole.superadmin && req.user.role !== UserRole.admin) {
            throw new ForbiddenException('Se requiere un club activo (x-club-id) para listar motocicletas');
        }
        return this.motorcyclesService.findAll(undefined, clubId, pagination?.page, pagination?.limit);
    }

    @Get('mine')
    @ApiOperation({ summary: 'Mis motocicletas', description: 'Obtiene las motocicletas del usuario autenticado' })
    @ApiBearerAuth()
    findMine(@Request() req: AuthRequest, @CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: Motorcycle[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        if (!clubId && req.user.role !== UserRole.superadmin && req.user.role !== UserRole.admin) {
            throw new ForbiddenException('Se requiere un club activo (x-club-id) para listar motocicletas');
        }
        return this.motorcyclesService.findAll(req.user.id, clubId, pagination?.page, pagination?.limit);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener motocicleta', description: 'Obtiene una motocicleta por su ID' })
    @ApiBearerAuth()
    @UseGuards(OwnerGuard)
    findOne(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<Motorcycle> {
        return this.motorcyclesService.findOne(id, clubId);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar motocicleta', description: 'Actualiza los datos de una motocicleta existente' })
    @ApiBearerAuth()
    @UseGuards(OwnerGuard)
    update(@Param('id') id: string, @Body() updateMotorcycleDto: UpdateMotorcycleDto, @CurrentClub() clubId?: string): Promise<Motorcycle> {
        return this.motorcyclesService.update(id, updateMotorcycleDto, clubId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Eliminar motocicleta', description: 'Elimina una motocicleta por su ID' })
    @ApiBearerAuth()
    @UseGuards(OwnerGuard)
    @HttpCode(204)
    remove(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<void> {
        return this.motorcyclesService.remove(id, clubId);
    }

    @Post(':id/maintenance')
    @ApiOperation({ summary: 'Agregar mantenimiento', description: 'Registra un nuevo registro de mantenimiento para una motocicleta' })
    @ApiBearerAuth()
    @UseGuards(OwnerGuard)
    addMaintenance(
        @Param('id') id: string,
        @Body() createMaintenanceDto: CreateMaintenanceDto,
        @CurrentClub() clubId?: string,
    ): Promise<MaintenanceRecord> {
        return this.motorcyclesService.addMaintenance(id, createMaintenanceDto, clubId);
    }

    @Get(':id/maintenance')
    @ApiOperation({ summary: 'Obtener mantenimientos', description: 'Obtiene el historial de mantenimiento de una motocicleta' })
    @ApiBearerAuth()
    @UseGuards(OwnerGuard)
    getMaintenances(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<MaintenanceRecord[]> {
        return this.motorcyclesService.getMaintenances(id, clubId);
    }
}
