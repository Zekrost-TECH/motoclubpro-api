import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../users/users.types';
import type { AuthUser } from '../auth.types';

// Token de larga duración con scope limitado a la publicación de posiciones
// GPS (POST /tracker/position y /tracker/positions). Se emite desde
// POST /tracker/session firmado con un secret distinto (TRACKER_JWT_SECRET),
// por lo que un token filtrado NO sirve para el resto de la API ni para el
// WebSocket del tracker.
//
// Motivación: el servicio nativo de Android publica posiciones sin pasar por
// el WebView, donde un access token de 15 minutos expira mientras el usuario
// duerme o la app está en background. Este token vive lo que dura una rodada
// (12h por defecto, TRACKER_TOKEN_TTL_SEC) y va atado a un solo evento.
export interface TrackerJwtPayload {
    sub: string;
    role: UserRole;
    scope: 'tracker';
    eventId: string;
}

export interface TrackerTokenUser extends AuthUser {
    scope: 'tracker';
    trackingEventId: string;
}

export function trackerSecret(config: ConfigService): string {
    return (
        config.get<string>('TRACKER_JWT_SECRET') ??
        `tracker:${config.getOrThrow<string>('JWT_SECRET')}`
    );
}

@Injectable()
export class TrackerJwtStrategy extends PassportStrategy(Strategy, 'tracker-jwt') {
    constructor(configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: trackerSecret(configService),
            issuer: 'biker-os-api',
            audience: 'biker-os-clients',
        });
    }

    // Sin consultas a BD: la autorización real la hace TrackerService
    // (asistencia al evento + estado en_curso) en cada posición recibida.
    validate(payload: TrackerJwtPayload): TrackerTokenUser {
        if (payload.scope !== 'tracker' || !payload.eventId) {
            throw new UnauthorizedException('Token sin scope de tracking');
        }
        return {
            id: payload.sub,
            email: '',
            role: payload.role,
            scope: 'tracker',
            trackingEventId: payload.eventId,
        };
    }
}
