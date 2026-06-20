import { Module } from '@nestjs/common';
import { MotorcyclesService } from './motorcycles.service';
import { MotorcyclesController } from './motorcycles.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [MotorcyclesController],
    providers: [MotorcyclesService],
    exports: [MotorcyclesService]
})
export class MotorcyclesModule { }
