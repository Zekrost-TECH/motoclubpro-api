import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClubsService } from './clubs.service';
import type { ClubRow, MemberRow, SubscriptionRow } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateBillingDto } from './dto/update-billing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubMemberGuard } from './guards/club-member.guard';
import { ClubMemberRolesGuard } from './guards/club-member-roles.guard';
import { ClubRoles } from '../auth/decorators/club-role.decorator';
import { UserRole } from '../users/users.types';
import type { AuthRequest } from '../auth/auth.types';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('clubs')
@ApiTags('clubs')
@UseGuards(JwtAuthGuard)
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) { }

  @Post()
  async create(@Body() dto: CreateClubDto, @Request() req: AuthRequest): Promise<ClubRow> {
    return this.clubsService.create({
      name: dto.name,
      slug: dto.slug,
      city: dto.city,
      department: dto.department,
      ownerUserId: req.user.id,
    });
  }

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string): Promise<ClubRow> {
    const club = await this.clubsService.findBySlug(slug);
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return club;
  }

  @Get(':id/members')
  @UseGuards(ClubMemberGuard)
  async findMembers(@Param('id') clubId: string, @Query() pagination?: PaginationDto): Promise<{ data: MemberRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    return this.clubsService.findMembers(clubId, pagination?.page, pagination?.limit);
  }

  @Post(':id/members')
  @UseGuards(ClubMemberGuard, ClubMemberRolesGuard)
  @ClubRoles(UserRole.admin, UserRole.lider)
  async inviteMember(@Param('id') clubId: string, @Body() dto: InviteMemberDto): Promise<{ ok: boolean }> {
    await this.clubsService.inviteMember(clubId, dto.userId, dto.role || 'piloto');
    return { ok: true };
  }

  @Post(':id/join')
  async joinClub(@Param('id') clubId: string, @Request() req: AuthRequest): Promise<{ ok: boolean }> {
    await this.clubsService.joinClub(clubId, req.user.id);
    return { ok: true };
  }

  @Patch(':id')
  @UseGuards(ClubMemberGuard, ClubMemberRolesGuard)
  @ClubRoles(UserRole.admin, UserRole.lider)
  async updateClub(@Param('id') clubId: string, @Body() dto: { name?: string; city?: string; department?: string; description?: string }): Promise<ClubRow> {
    return this.clubsService.update(clubId, dto);
  }

  @Get(':id/billing')
  @UseGuards(ClubMemberGuard)
  async getBilling(@Param('id') clubId: string): Promise<Pick<ClubRow, 'nit' | 'billing_address' | 'billing_phone' | 'billing_contact_name' | 'billing_contact_email' | 'tax_regime'> | null> {
    return this.clubsService.getBillingInfo(clubId);
  }

  @Patch(':id/billing')
  @UseGuards(ClubMemberGuard, ClubMemberRolesGuard)
  @ClubRoles(UserRole.admin)
  async updateBilling(@Param('id') clubId: string, @Body() dto: UpdateBillingDto): Promise<{ ok: boolean }> {
    await this.clubsService.updateBillingInfo(clubId, dto);
    return { ok: true };
  }

  @Get(':id/subscription')
  @UseGuards(ClubMemberGuard)
  async getSubscription(@Param('id') clubId: string): Promise<SubscriptionRow | null> {
    return this.clubsService.getSubscription(clubId);
  }
}
