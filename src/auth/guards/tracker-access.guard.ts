import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Acepta el JWT de usuario normal (app/web) O el token de tracking con scope
// limitado que usa el servicio nativo de Android para reportar posiciones sin
// depender del WebView. Passport prueba las estrategias en orden.
@Injectable()
export class TrackerAccessGuard extends AuthGuard(['jwt', 'tracker-jwt']) {
    handleRequest<TUser>(err: Error | null, user: unknown): TUser {
        if (err || !user) {
            throw err || new UnauthorizedException('Authentication token is missing or invalid');
        }
        return user as TUser;
    }
}
