import {
    Injectable, UnauthorizedException,
    Inject,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { User, UserRole } from '../users/users.types';
import { RegisterDto } from './dto/register.dto';

// TTL de la blacklist = duración máxima del refresh token (30 días en segundos)
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private db: DatabaseService,
        private jwtService: JwtService,
        private configService: ConfigService,
        @Inject('REDIS_CLIENT') private redis: Redis,
    ) { }

    async validateUser(email: string, pass: string): Promise<Omit<User, 'passwordHash'> | null> {
        const user = await this.usersService.findByEmail(email);
        if (!user) return null;

        const isMatch = await bcrypt.compare(pass, user.passwordHash);
        if (!isMatch) return null;

        const { passwordHash: _pw, ...result } = user;
        void _pw;
        return result as Omit<User, 'passwordHash'>;
    }

    async login(user: Omit<User, 'passwordHash'>): Promise<{ access_token: string; refresh_token: string; user: Omit<User, 'passwordHash'> & { clubs: { club_id: string; role: UserRole }[] } }> {
        const clubs = await this.usersService.getUserClubs(user.id);
        const payload = { sub: user.id, email: user.email, role: user.role, clubs };
        const refreshSecret = this.configService.get<string>('REFRESH_SECRET');
        const refreshExpiresIn = this.configService.get<string>('REFRESH_EXPIRES_IN') ?? '30d';

        return {
            access_token: this.jwtService.sign(payload),
            refresh_token: this.jwtService.sign(payload, {
                secret: refreshSecret,
                expiresIn: refreshExpiresIn as `${number}d`,
            }),
            user: { ...user, clubs },
        };
    }

    async register(data: RegisterDto): Promise<{ access_token: string; refresh_token: string; user: Omit<User, 'passwordHash'> & { clubs: { club_id: string; role: UserRole }[] } }> {
        const user = await this.usersService.createUser(data);
        const { passwordHash: _ph, ...result } = user;
        void _ph;
        return this.login(result as Omit<User, 'passwordHash'>);
    }

    async refresh(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
        // 1. Verificar que no está en la blacklist (logout previo)
        const blacklisted = await this.redis.get(`blacklist:${refreshToken}`);
        if (blacklisted) throw new UnauthorizedException('Token revocado');

        try {
            const secret = this.configService.get<string>('REFRESH_SECRET') ?? 'refreshSecretChangeThis';
            const rawPayload = this.jwtService.verify(refreshToken, { secret }) as unknown;
            const payload = rawPayload as { sub: string };

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

            const clubs = await this.usersService.getUserClubs(user.id);
            const newPayload = { sub: user.id, email: user.email, role: user.role, clubs };
            const refreshSecret = this.configService.get<string>('REFRESH_SECRET') ?? 'refreshSecretChangeThis';
            const refreshExpiresIn = this.configService.get<string>('REFRESH_EXPIRES_IN') ?? '30d';

            return {
                access_token: this.jwtService.sign(newPayload),
                refresh_token: this.jwtService.sign(newPayload, {
                    secret: refreshSecret,
                    expiresIn: refreshExpiresIn as `${number}d`,
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

    async getUserClubs(userId: string): Promise<{ club_id: string; role: UserRole; name: string; slug: string; logo_url: string | null; city: string | null; department: string | null }[]> {
        const { rows } = await this.db.query<{
            club_id: string;
            role: UserRole;
            name: string;
            slug: string;
            logo_url: string | null;
            city: string | null;
            department: string | null;
        }>(
            `SELECT c.id as club_id, cm.role, c.name, c.slug, c.logo_url, c.city, c.department
             FROM club_members cm
             JOIN clubs c ON c.id = cm.club_id
             WHERE cm.user_id = $1 AND cm.is_active = TRUE AND c.is_active = TRUE
             ORDER BY cm.joined_at DESC`,
            [userId],
        );
        return rows;
    }

    async switchClub(userId: string, clubId: string): Promise<{ access_token: string; refresh_token: string }> {
        // Verify active membership
        const { rows } = await this.db.query<{ role: UserRole }>(
            `SELECT role FROM club_members WHERE club_id = $1 AND user_id = $2 AND is_active = TRUE`,
            [clubId, userId],
        );
        if (rows.length === 0) {
            throw new UnauthorizedException('No eres miembro activo de este club');
        }

        const clubs = await this.usersService.getUserClubs(userId);
        const user = await this.usersService.findOne(userId);
        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        const payload = { sub: user.id, email: user.email, role: rows[0].role, clubs };
        const refreshSecret = this.configService.get<string>('REFRESH_SECRET');
        const refreshExpiresIn = this.configService.get<string>('REFRESH_EXPIRES_IN') ?? '30d';

        return {
            access_token: this.jwtService.sign(payload),
            refresh_token: this.jwtService.sign(payload, {
                secret: refreshSecret,
                expiresIn: refreshExpiresIn as `${number}d`,
            }),
        };
    }
}