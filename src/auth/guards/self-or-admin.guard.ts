import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AuthRequest } from '../auth.types';
import { UserRole } from '../../users/users.types';

@Injectable()
export class SelfOrAdminGuard implements CanActivate {
    constructor(private readonly db: DatabaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthRequest & { params: { id: string } }>();
        const user = request.user;
        const targetUserId = request.params.id;

        if (!user) {
            throw new ForbiddenException('User context is missing');
        }

        if (user.role === UserRole.superadmin || user.role === UserRole.admin) {
            return true;
        }

        if (user.id === targetUserId) {
            return true;
        }

        // Leader/rider global: permitido si es admin/leader de un club
        // donde el usuario objetivo también es miembro activo
        const { rows } = await this.db.query<{ '1': number }>(
            `SELECT 1
             FROM club_members cm1
             JOIN club_members cm2 ON cm1.club_id = cm2.club_id
             WHERE cm1.user_id = $1 AND cm1.is_active = TRUE
               AND cm1.role IN ($3, $4)
               AND cm2.user_id = $2 AND cm2.is_active = TRUE
             LIMIT 1`,
            [user.id, targetUserId, UserRole.admin, UserRole.leader],
        );

        if (rows.length === 0) {
            throw new ForbiddenException('You can only access your own data');
        }

        return true;
    }
}
