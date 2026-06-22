import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';
import type { AuthRequest } from '../../auth/auth.types';

@Injectable()
export class ClubMemberGuard implements CanActivate {
    constructor(private readonly db: DatabaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthRequest & { params: { id: string } }>();
        const user = request.user;
        const clubId = request.params.id;

        if (!user) {
            throw new ForbiddenException('User context is missing');
        }

        if (user.role === UserRole.admin) {
            return true;
        }

        const { rows } = await this.db.query<{ '1': number }>(
            'SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1',
            [clubId, user.id],
        );

        if (rows.length === 0) {
            throw new ForbiddenException('You do not belong to this club');
        }

        return true;
    }
}
