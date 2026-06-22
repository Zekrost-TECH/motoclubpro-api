import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { ClubMemberGuard } from './guards/club-member.guard';
import { ClubMemberRolesGuard } from './guards/club-member-roles.guard';

@Module({
  controllers: [ClubsController],
  providers: [ClubsService, ClubMemberGuard, ClubMemberRolesGuard],
  exports: [ClubsService],
})
export class ClubsModule { }
