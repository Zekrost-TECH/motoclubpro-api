import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { ClubMemberGuard } from './guards/club-member.guard';
import { ClubMemberRolesGuard } from './guards/club-member-roles.guard';
import { UsersModule } from '../users/users.module';
import { MailService } from '../notifications/mail.service';
import { RideRolesModule } from '../ride-roles/ride-roles.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [UsersModule, RideRolesModule, PlansModule],
  controllers: [ClubsController],
  providers: [ClubsService, ClubMemberGuard, ClubMemberRolesGuard, MailService],
  exports: [ClubsService, MailService],
})
export class ClubsModule { }
