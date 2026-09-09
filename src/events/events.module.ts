import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { RideRolesModule } from '../ride-roles/ride-roles.module';
import { PlansModule } from '../plans/plans.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [RideRolesModule, PlansModule, NotificationsModule],
    controllers: [EventsController],
    providers: [EventsService],
    exports: [EventsService],
})
export class EventsModule { }
