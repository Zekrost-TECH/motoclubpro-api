import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
    imports: [DatabaseModule],
    providers: [PlansService],
    controllers: [PlansController],
    exports: [PlansService],
})
export class PlansModule { }
