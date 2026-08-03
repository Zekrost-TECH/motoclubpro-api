import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';
import type { AuthRequest } from '../../auth/auth.types';

@Injectable()
export class ClubGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest & { headers: { 'x-club-id'?: string } }>();

    const user = request.user;
    const clubId = request.headers['x-club-id'];

    if (!user) {
      return false;
    }

    if (user.role === UserRole.superadmin || user.role === UserRole.admin) {
      return true;
    }

    if (!clubId) {
      return true;
    }

    const { rows } = await this.db.query<{ '1': number }>(
      `SELECT 1 FROM club_members
       WHERE club_id = $1 AND user_id = $2 AND is_active = TRUE
       LIMIT 1`,
      [clubId, user.id],
    );

    if (rows.length === 0) {
      throw new ForbiddenException('No perteneces a este club');
    }

    return true;
  }
}
