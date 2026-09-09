import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
    imports: [DatabaseModule, RedisModule],
    providers: [PlansService],
    controllers: [PlansController],
    exports: [PlansService],
})
export class PlansModule { }
