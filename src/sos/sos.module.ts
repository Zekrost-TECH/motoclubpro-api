import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosGateway } from './sos.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [
        NotificationsModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.getOrThrow<string>('JWT_SECRET'),
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [SosController],
    providers: [SosService, SosGateway],
})
export class SosModule { }
