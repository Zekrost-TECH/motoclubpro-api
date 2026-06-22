import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthRequest } from '../auth.types';
import { UserRole } from '../../users/users.types';

@Injectable()
export class SelfOrAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<AuthRequest & { params: { id: string } }>();
        const user = request.user;
        const targetUserId = request.params.id;

        if (!user) {
            throw new ForbiddenException('User context is missing');
        }

        if (user.role === UserRole.admin) {
            return true;
        }

        if (user.id === targetUserId) {
            return true;
        }

        throw new ForbiddenException('You can only access your own data');
    }
}
