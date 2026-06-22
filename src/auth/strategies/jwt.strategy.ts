import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { UsersService } from '../../users/users.service';
import type { Request } from 'express';
import { UserRole, User } from '../../users/users.types';

export interface JwtClub {
    club_id: string;
    role: UserRole;
}

export type JwtPayload = {
    sub: string;
    email: string;
    role: UserRole;
    clubs: JwtClub[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
            passReqToCallback: true,
        });
    }

    async validate(req: Request, payload: JwtPayload) {
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

        if (token) {
            const blacklisted = await this.redis.get(`blacklist:${token}`);
            if (blacklisted) {
                throw new UnauthorizedException('Token revocado o sesión inválida');
            }
        }

        const user = (await this.usersService.findOne(payload.sub)) as User | null;

        if (!user) {
            throw new UnauthorizedException('Usuario no existe');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User account is inactive');
        }

        return { ...user, clubs: payload.clubs ?? [] };
    }
}
