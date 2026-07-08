import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ClubGuard } from './guards/club.guard';
import { ClubRolesGuard } from './guards/club-roles.guard';
import { SelfOrAdminGuard } from './guards/self-or-admin.guard';
import { TurnstileModule } from '../turnstile/turnstile.module';

@Module({
    imports: [
        UsersModule,
        TurnstileModule,
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET') || 'defaultSecretChangeThis',
                signOptions: {
                    expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '15m') as unknown as '15m',
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, ClubGuard, ClubRolesGuard, SelfOrAdminGuard],
    controllers: [AuthController],
    exports: [AuthService, JwtAuthGuard, RolesGuard, ClubGuard, ClubRolesGuard, SelfOrAdminGuard],
})
export class AuthModule { }
