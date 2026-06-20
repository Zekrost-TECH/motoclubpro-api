import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { FcmService } from '../notifications/fcm.service';

@Module({
    controllers: [SosController],
    providers:   [SosService, FcmService],
})
export class SosModule { }