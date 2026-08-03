import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLUB_ROLES_KEY } from '../decorators/club-role.decorator';
import { DatabaseService } from '../../database/database.service';
import { UserRole } from '../../users/users.types';
import type { AuthRequest } from '../../auth/auth.types';

@Injectable()
export class ClubRolesGuard implements CanActivate {
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

    const request = context.switchToHttp().getRequest<AuthRequest & { headers: { 'x-club-id'?: string } }>();
    const user = request.user;
    const clubId = request.headers['x-club-id'];

    if (!user || !clubId) {
      throw new ForbiddenException('Club no especificado');
    }

    if (user.role === UserRole.superadmin || user.role === UserRole.admin) {
      return true;
    }

    const { rows } = await this.db.query<{ role: UserRole }>(
      `SELECT role FROM club_members
       WHERE club_id = $1 AND user_id = $2 AND is_active = TRUE
       LIMIT 1`,
      [clubId, user.id],
    );

    if (!rows[0] || !requiredRoles.includes(rows[0].role)) {
      throw new ForbiddenException('Rol insuficiente en este club');
    }

    return true;
  }
}
