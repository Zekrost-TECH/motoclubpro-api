import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosGateway } from './sos.gateway';
import { FcmService } from '../notifications/fcm.service';

@Module({
    controllers: [SosController],
    providers: [SosService, SosGateway, FcmService],
})
export class SosModule { }