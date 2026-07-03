import { Module } from '@nestjs/common';
import { RideRolesController } from './ride-roles.controller';
import { RideRolesService } from './ride-roles.service';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [RideRolesController],
    providers: [RideRolesService],
    exports: [RideRolesService],
})
export class RideRolesModule { }
