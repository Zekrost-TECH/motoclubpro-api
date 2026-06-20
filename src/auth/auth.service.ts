import {
    Injectable, UnauthorizedException,
    Inject,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { User } from '../users/users.types';
import { RegisterDto } from './dto/register.dto';

// TTL de la blacklist = duración máxima del refresh token (30 días en segundos)
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private configService: ConfigService,
        @Inject('REDIS_CLIENT') private redis: Redis,
    ) { }

    async validateUser(email: string, pass: string): Promise<Omit<User, 'passwordHash'> | null> {
        const user = await this.usersService.findByEmail(email);
        if (!user) return null;

        const isMatch = await bcrypt.compare(pass, user.passwordHash);
        if (!isMatch) return null;

        const { passwordHash, ...result } = user;
        return result as Omit<User, 'passwordHash'>;
    }

    login(user: Omit<User, 'passwordHash'>) {
        const payload = { sub: user.id, email: user.email, role: user.role };
        const refreshSecret = this.configService.get<string>('REFRESH_SECRET');
        const refreshExpiresIn = this.configService.get<string>('REFRESH_EXPIRES_IN') ?? '30d';

        return {
            access_token: this.jwtService.sign(payload),
            refresh_token: this.jwtService.sign(payload, {
                secret: refreshSecret,
                expiresIn: refreshExpiresIn as any,
            }),
            user,
        };
    }

    async register(data: RegisterDto) {
        const user = await this.usersService.createUser(data);
        const { passwordHash, ...result } = user;
        return this.login(result);
    }

    async refresh(refreshToken: string) {
        // 1. Verificar que no está en la blacklist (logout previo)
        const blacklisted = await this.redis.get(`blacklist:${refreshToken}`);
        if (blacklisted) throw new UnauthorizedException('Token revocado');

        try {
            const secret = this.configService.get<string>('REFRESH_SECRET') ?? 'refreshSecretChangeThis';
            const payload = this.jwtService.verify(refreshToken, { secret });

            const user = await this.usersService.findOne(payload.sub);
            if (!user || !user.isActive) {
                throw new UnauthorizedException('Usuario inactivo o no encontrado');
            }

            // 2. Rotar: invalidar el refresh token usado y emitir uno nuevo
            await this.redis.set(
                `blacklist:${refreshToken}`,
                '1',
                'EX',
                REFRESH_TTL_SECONDS,
            );

            const newPayload = { sub: user.id, email: user.email, role: user.role };
            const refreshSecret = this.configService.get<string>('REFRESH_SECRET') ?? 'refreshSecretChangeThis';
            const refreshExpiresIn = this.configService.get<string>('REFRESH_EXPIRES_IN') ?? '30d';

            return {
                access_token: this.jwtService.sign(newPayload),
                refresh_token: this.jwtService.sign(newPayload, {
                    secret: refreshSecret,
                    expiresIn: refreshExpiresIn as any,
                }),
            };
        } catch (e) {
            if (e instanceof UnauthorizedException) throw e;
            throw new UnauthorizedException('Refresh token inválido o expirado');
        }
    }

    async logout(refreshToken?: string, accessToken?: string): Promise<void> {
        if (refreshToken) {
            await this.redis.set(
                `blacklist:${refreshToken}`,
                '1',
                'EX',
                REFRESH_TTL_SECONDS,
            );
        }
        if (accessToken) {
            // Un access_token por lo general expira en digamos, 15-60m
            // Configurar a un valor sensato que cubra su vida útil para la blacklist
            await this.redis.set(
                `blacklist:${accessToken}`,
                '1',
                'EX',
                60 * 60 * 24, // 24H de reserva
            );
        }
    }
}