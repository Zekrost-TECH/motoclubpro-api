import { Module } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [RoutesController],
    providers: [RoutesService],
    exports: [RoutesService]
})
export class RoutesModule { }
