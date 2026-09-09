import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClubsService } from './clubs.service';
import type { ClubRow, PublicClubRow, MemberRow, SubscriptionRow } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateBillingDto } from './dto/update-billing.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClubMemberGuard } from './guards/club-member.guard';
import { ClubMemberRolesGuard } from './guards/club-member-roles.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/users.types';
import type { AuthRequest } from '../auth/auth.types';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('clubs')
@ApiTags('clubs')
@UseGuards(JwtAuthGuard)
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) { }

  @Post()
  @ApiOperation({ summary: 'Crear club', description: 'Crea un nuevo club con los datos proporcionados' })
  @ApiBearerAuth()
  async create(@Body() dto: CreateClubDto, @Request() req: AuthRequest): Promise<ClubRow> {
    return this.clubsService.create({
      name: dto.name,
      slug: dto.slug,
      city: dto.city,
      department: dto.department,
      ownerUserId: req.user.id,
      ownerEmail: req.user.email,
    });
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Buscar por slug', description: 'Obtiene un club público por su slug' })
  @ApiBearerAuth()
  async findBySlug(@Param('slug') slug: string): Promise<PublicClubRow> {
    const club = await this.clubsService.findBySlug(slug);
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return club;
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Listar miembros', description: 'Obtiene la lista de miembros de un club con paginación' })
  @ApiBearerAuth()
  @UseGuards(ClubMemberGuard)
  async findMembers(@Param('id') clubId: string, @Query() pagination?: PaginationDto): Promise<{ data: MemberRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    return this.clubsService.findMembers(clubId, pagination?.page, pagination?.limit);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Invitar miembro', description: 'Invita a un usuario al club con un rol específico' })
  @ApiBearerAuth()
  @UseGuards(ClubMemberGuard, ClubMemberRolesGuard)
  @ClubRoles(UserRole.admin, UserRole.leader)
  async inviteMember(@Param('id') clubId: string, @Body() dto: InviteMemberDto, @Request() req: AuthRequest): Promise<{ ok: boolean }> {
    await this.clubsService.inviteMember(clubId, dto.userId, dto.email, dto.role || 'rider', req.user);
    return { ok: true };
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Eliminar miembro', description: 'Elimina un miembro del club' })
  @ApiBearerAuth()
  @UseGuards(ClubMemberGuard, ClubMemberRolesGuard)
  @ClubRoles(UserRole.admin)
  async removeMember(@Param('id') clubId: string, @Param('userId') userId: string): Promise<{ ok: boolean }> {
    await this.clubsService.removeMember(clubId, userId);
    return { ok: true };
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los clubes', description: 'Obtiene todos los clubes con paginación (solo superadmin)' })
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.superadmin)
  async findAll(@Query() pagination?: PaginationDto): Promise<{ data: ClubRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    return this.clubsService.findAll(pagination?.page, pagination?.limit);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Unirse al club', description: 'El usuario autenticado se une al club especificado' })
  @ApiBearerAuth()
  async joinClub(@Param('id') clubId: string, @Request() req: AuthRequest): Promise<{ ok: boolean }> {
    await this.clubsService.joinClub(clubId, req.user.id);
    return { ok: true };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar club', description: 'Actualiza los datos de un club existente' })
  @ApiBearerAuth()
  @UseGuards(ClubMemberGuard, ClubMemberRolesGuard)
  @ClubRoles(UserRole.admin, UserRole.leader)
  async updateClub(@Param('id') clubId: string, @Body() dto: UpdateClubDto): Promise<ClubRow> {
    return this.clubsService.update(clubId, dto);
  }

  @Get(':id/billing')
  @ApiOperation({ summary: 'Obtener facturación', description: 'Obtiene la información de facturación del club' })
  @ApiBearerAuth()
  @UseGuards(ClubMemberGuard)
  async getBilling(@Param('id') clubId: string): Promise<Pick<ClubRow, 'nit' | 'billing_address' | 'billing_phone' | 'billing_contact_name' | 'billing_contact_email' | 'tax_regime'> | null> {
    return this.clubsService.getBillingInfo(clubId);
  }

  @Patch(':id/billing')
  @ApiOperation({ summary: 'Actualizar facturación', description: 'Actualiza la información de facturación del club' })
  @ApiBearerAuth()
  @UseGuards(ClubMemberGuard, ClubMemberRolesGuard)
  @ClubRoles(UserRole.admin)
  async updateBilling(@Param('id') clubId: string, @Body() dto: UpdateBillingDto): Promise<{ ok: boolean }> {
    await this.clubsService.updateBillingInfo(clubId, dto);
    return { ok: true };
  }

  @Get(':id/subscription')
  @ApiOperation({ summary: 'Obtener suscripción', description: 'Obtiene la suscripción del club' })
  @ApiBearerAuth()
  @UseGuards(ClubMemberGuard)
  async getSubscription(@Param('id') clubId: string): Promise<SubscriptionRow | null> {
    return this.clubsService.getSubscription(clubId);
  }
}
