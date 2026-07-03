import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { DatabaseModule } from '../database/database.module';
import { RideRolesModule } from '../ride-roles/ride-roles.module';
import { PlansModule } from '../plans/plans.module';

@Module({
    imports: [DatabaseModule, RideRolesModule, PlansModule],
    controllers: [EventsController],
    providers: [EventsService],
    exports: [EventsService],
})
export class EventsModule { }
