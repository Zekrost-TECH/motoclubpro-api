import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubGuard } from '../auth/guards/club.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { CurrentClub } from '../auth/decorators/club.decorator';
import { UserRole } from '../users/users.types';
import { RideRolesService } from './ride-roles.service';
import { CreateRideRoleDto } from './dto/create-ride-role.dto';
import { UpdateRideRoleDto } from './dto/update-ride-role.dto';
import type { ClubRideRole } from './ride-roles.types';

@Controller('ride-roles')
@ApiTags('ride-roles')
@UseGuards(JwtAuthGuard, ClubGuard, ClubRolesGuard)
export class RideRolesController {
    constructor(private readonly rideRolesService: RideRolesService) { }

    @Get()
    @ApiOperation({ summary: 'Listar roles', description: 'Obtiene la lista de roles de rodada del club' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    findAll(@CurrentClub('id') clubId: string): Promise<ClubRideRole[]> {
        return this.rideRolesService.findByClub(clubId);
    }

    @Post()
    @ApiOperation({ summary: 'Crear rol', description: 'Crea un nuevo rol de rodada para el club' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    create(
        @CurrentClub('id') clubId: string,
        @Body() dto: CreateRideRoleDto,
    ): Promise<ClubRideRole> {
        return this.rideRolesService.create(clubId, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar rol', description: 'Actualiza un rol de rodada existente' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    update(
        @CurrentClub('id') clubId: string,
        @Param('id') id: string,
        @Body() dto: UpdateRideRoleDto,
    ): Promise<ClubRideRole> {
        return this.rideRolesService.update(clubId, id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Eliminar rol', description: 'Elimina un rol de rodada del club' })
    @ApiBearerAuth()
    @ClubRoles(UserRole.admin, UserRole.leader)
    remove(
        @CurrentClub('id') clubId: string,
        @Param('id') id: string,
    ): Promise<void> {
        return this.rideRolesService.delete(clubId, id);
    }
}
