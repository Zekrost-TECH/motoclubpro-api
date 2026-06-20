import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/users.types';

export type JwtPayload = { sub: string; email: string; role: UserRole };

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
            secretOrKey: configService.get<string>('JWT_SECRET') || 'defaultSecretChangeThis',
            passReqToCallback: true,
        });
    }

    async validate(req: any, payload: JwtPayload) {
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

        if (token) {
            const blacklisted = await this.redis.get(`blacklist:${token}`);
            if (blacklisted) {
                throw new UnauthorizedException('Token revocado o sesión inválida');
            }
        }

        const user = await this.usersService.findOne(payload.sub);

        if (!user) {
            throw new UnauthorizedException('Usuario no existe');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User account is inactive');
        }

        return user;
    }
}
