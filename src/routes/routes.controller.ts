import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, HttpCode, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateWaypointDto } from './dto/create-waypoint.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { UserRole } from '../users/users.types';
import type { AuthRequest } from '../auth/auth.types';
import type { Route, Waypoint } from './routes.types';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('routes')
@ApiTags('routes')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class RoutesController {
    constructor(private readonly routesService: RoutesService) { }

    @Post()
    @ClubRoles(UserRole.admin, UserRole.leader)
    create(@Request() req: AuthRequest, @Body() createRouteDto: CreateRouteDto, @CurrentClub() clubId?: string): Promise<Route> {
        return this.routesService.create(req.user.id, createRouteDto, clubId);
    }

    @Get()
    findAll(@CurrentClub() clubId?: string, @Query() pagination?: PaginationDto): Promise<{ data: Route[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        return this.routesService.findAll(clubId, pagination?.page, pagination?.limit);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<Route> {
        return this.routesService.findOne(id, clubId);
    }

    @Patch(':id')
    @ClubRoles(UserRole.admin, UserRole.leader)
    update(@Param('id') id: string, @Body() updateRouteDto: UpdateRouteDto, @CurrentClub() clubId?: string): Promise<Route> {
        return this.routesService.update(id, updateRouteDto, clubId);
    }

    @Delete(':id')
    @ClubRoles(UserRole.admin)
    @HttpCode(204)
    remove(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<void> {
        return this.routesService.remove(id, clubId);
    }

    @Post(':id/waypoints')
    addWaypoint(@Param('id') id: string, @Body() createWaypointDto: CreateWaypointDto, @CurrentClub() clubId?: string): Promise<Waypoint> {
        return this.routesService.addWaypoint(id, createWaypointDto, clubId);
    }

    @Get(':id/waypoints')
    getWaypoints(@Param('id') id: string, @CurrentClub() clubId?: string): Promise<Waypoint[]> {
        return this.routesService.getWaypoints(id, clubId);
    }

    // Process a full GeoJSON payload (FeatureCollection) into waypoints
    @Post(':id/waypoints/batch')
    @HttpCode(204)
    async addBatchWaypoints(@Param('id') id: string, @Body() geojson: unknown, @CurrentClub() clubId?: string): Promise<void> {
        await this.routesService.addBatchWaypoints(id, geojson, clubId);
    }
}
