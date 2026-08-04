import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { ClubMemberGuard } from './guards/club-member.guard';
import { ClubMemberRolesGuard } from './guards/club-member-roles.guard';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RideRolesModule } from '../ride-roles/ride-roles.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [UsersModule, NotificationsModule, RideRolesModule, PlansModule],
  controllers: [ClubsController],
  providers: [ClubsService, ClubMemberGuard, ClubMemberRolesGuard],
  exports: [ClubsService],
})
export class ClubsModule { }
