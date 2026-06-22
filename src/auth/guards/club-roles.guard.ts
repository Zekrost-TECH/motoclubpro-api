import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLUB_ROLES_KEY } from '../decorators/club-role.decorator';
import { UserRole } from '../../users/users.types';

interface ClubMember {
  club_id: string;
  role: UserRole;
}

@Injectable()
export class ClubRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(CLUB_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { role: UserRole; clubs?: ClubMember[] };
      headers: { 'x-club-id'?: string };
    }>();

    const user = request.user;
    const clubId = request.headers['x-club-id'];

    if (!user || !clubId) {
      throw new ForbiddenException('Club no especificado');
    }

    if (user.role === UserRole.admin) {
      return true;
    }

    const member = user.clubs?.find((c) => c.club_id === clubId);

    if (!member || !requiredRoles.includes(member.role)) {
      throw new ForbiddenException('Rol insuficiente en este club');
    }

    return true;
  }
}
