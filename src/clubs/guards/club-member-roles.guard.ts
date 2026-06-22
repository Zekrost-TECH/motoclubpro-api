import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../../database/database.service';
import { CLUB_ROLES_KEY } from '../../auth/decorators/club-role.decorator';
import { UserRole } from '../../users/users.types';
import type { AuthRequest } from '../../auth/auth.types';

@Injectable()
export class ClubMemberRolesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly db: DatabaseService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(CLUB_ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles) {
            return true;
        }

        const request = context.switchToHttp().getRequest<AuthRequest & { params: { id: string } }>();
        const user = request.user;
        const clubId = request.params.id;

        if (!user) {
            throw new ForbiddenException('User context is missing');
        }

        if (user.role === UserRole.admin) {
            return true;
        }

        const { rows } = await this.db.query<{ role: UserRole }>(
            'SELECT role FROM club_members WHERE club_id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1',
            [clubId, user.id],
        );

        if (rows.length === 0 || !requiredRoles.includes(rows[0].role)) {
            throw new ForbiddenException('Insufficient role in this club');
        }

        return true;
    }
}
