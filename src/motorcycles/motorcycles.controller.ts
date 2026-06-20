import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, HttpCode } from '@nestjs/common';
import { MotorcyclesService } from './motorcycles.service';
import { CreateMotorcycleDto } from './dto/create-motorcycle.dto';
import { UpdateMotorcycleDto } from './dto/update-motorcycle.dto';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { OwnerGuard } from './guards/owner.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('motorcycles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MotorcyclesController {
    constructor(private readonly motorcyclesService: MotorcyclesService) { }

    @Post()
    create(@Request() req, @Body() createMotorcycleDto: CreateMotorcycleDto) {
        return this.motorcyclesService.create(req.user.id, createMotorcycleDto);
    }

    @Get()
    findAll(@Request() req) {
        // Obtains all motorcycles, mainly for admins if needed
        return this.motorcyclesService.findAll(undefined);
    }

    @Get('mine')
    findMine(@Request() req) {
        // Obtenemos estrictamente las motos del usuario actual sin importar su rol
        return this.motorcyclesService.findAll(req.user.id);
    }

    @Get(':id')
    @UseGuards(OwnerGuard)
    findOne(@Param('id') id: string) {
        return this.motorcyclesService.findOne(id);
    }

    @Patch(':id')
    @UseGuards(OwnerGuard)
    update(@Param('id') id: string, @Body() updateMotorcycleDto: UpdateMotorcycleDto) {
        return this.motorcyclesService.update(id, updateMotorcycleDto);
    }

    @Delete(':id')
    @UseGuards(OwnerGuard)
    @HttpCode(204)
    remove(@Param('id') id: string) {
        return this.motorcyclesService.remove(id);
    }

    @Post(':id/maintenance')
    @UseGuards(OwnerGuard)
    addMaintenance(
        @Param('id') id: string,
        @Body() createMaintenanceDto: CreateMaintenanceDto
    ) {
        return this.motorcyclesService.addMaintenance(id, createMaintenanceDto);
    }

    @Get(':id/maintenance')
    @UseGuards(OwnerGuard)
    getMaintenances(@Param('id') id: string) {
        return this.motorcyclesService.getMaintenances(id);
    }
}
