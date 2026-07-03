import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/users.types';

interface ClubMember {
  club_id: string;
  role: UserRole;
}

@Injectable()
export class ClubGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { role: UserRole; clubs?: ClubMember[] };
      headers: { 'x-club-id'?: string };
    }>();

    const user = request.user;
    const clubId = request.headers['x-club-id'];

    if (!user) {
      return false;
    }

    if (user.role === UserRole.admin || user.role === UserRole.superadmin) {
      return true;
    }

    if (!clubId) {
      return true;
    }

    const member = user.clubs?.find((c) => c.club_id === clubId);

    if (!member) {
      throw new ForbiddenException('No perteneces a este club');
    }

    return true;
  }
}
