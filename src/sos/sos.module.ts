import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosGateway } from './sos.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [NotificationsModule],
    controllers: [SosController],
    providers: [SosService, SosGateway],
})
export class SosModule { }
