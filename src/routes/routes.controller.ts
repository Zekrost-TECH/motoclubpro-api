import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, HttpCode } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateWaypointDto } from './dto/create-waypoint.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('routes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutesController {
    constructor(private readonly routesService: RoutesService) { }

    @Post()
    create(@Request() req, @Body() createRouteDto: CreateRouteDto) {
        return this.routesService.create(req.user.id, createRouteDto);
    }

    @Get()
    findAll() {
        return this.routesService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.routesService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateRouteDto: UpdateRouteDto) {
        return this.routesService.update(id, updateRouteDto);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@Param('id') id: string) {
        return this.routesService.remove(id);
    }

    @Post(':id/waypoints')
    addWaypoint(@Param('id') id: string, @Body() createWaypointDto: CreateWaypointDto) {
        return this.routesService.addWaypoint(id, createWaypointDto);
    }

    @Get(':id/waypoints')
    getWaypoints(@Param('id') id: string) {
        return this.routesService.getWaypoints(id);
    }

    // Process a full GeoJSON payload (FeatureCollection) into waypoints
    @Post(':id/waypoints/batch')
    @HttpCode(204)
    async addBatchWaypoints(@Param('id') id: string, @Body() geojson: any) {
        await this.routesService.addBatchWaypoints(id, geojson);
    }
}
