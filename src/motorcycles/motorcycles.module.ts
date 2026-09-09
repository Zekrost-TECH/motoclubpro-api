import { Module } from '@nestjs/common';
import { MotorcyclesService } from './motorcycles.service';
import { MotorcyclesController } from './motorcycles.controller';

@Module({
    imports: [],
    controllers: [MotorcyclesController],
    providers: [MotorcyclesService],
    exports: [MotorcyclesService]
})
export class MotorcyclesModule { }
