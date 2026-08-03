import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';
import type { AuthRequest } from '../../auth/auth.types';

@Injectable()
export class UserManagerGuard implements CanActivate {
    constructor(private readonly db: DatabaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthRequest & { headers: { 'x-club-id'?: string } }>();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('User context is missing');
        }

        // Admin global o superadmin: permitido sin contexto de club
        if (user.role === UserRole.superadmin || user.role === UserRole.admin) {
            return true;
        }

        // Leader/rider global: necesita ser admin/leader de un club activo (x-club-id)
        const clubId = request.headers['x-club-id'];
        if (!clubId) {
            throw new ForbiddenException('No tienes permisos para crear usuarios');
        }

        const { rows } = await this.db.query<{ '1': number }>(
            `SELECT 1 FROM club_members
             WHERE club_id = $1 AND user_id = $2 AND is_active = TRUE
               AND role IN ($3, $4)
             LIMIT 1`,
            [clubId, user.id, UserRole.admin, UserRole.leader],
        );

        if (rows.length === 0) {
            throw new ForbiddenException('No tienes permisos para crear usuarios');
        }

        return true;
    }
}
