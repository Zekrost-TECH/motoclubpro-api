import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AuthRequest } from '../../auth/auth.types';
import { UserRole } from '../../users/users.types';

@Injectable()
export class EventCaptainGuard implements CanActivate {
    constructor(private readonly databaseService: DatabaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthRequest & { params: { id: string } }>();
        const eventId = request.params.id;
        const user = request.user;

        if (!user) {
            return false;
        }

        if (user.role === UserRole.admin) {
            return true;
        }

        if (!eventId) {
            return false;
        }

        const { rows } = await this.databaseService.query<{ organizer_id: string }>(
            'SELECT organizer_id FROM events WHERE id = $1',
            [eventId],
        );

        if (rows.length === 0) {
            throw new NotFoundException('Event not found');
        }

        if (rows[0].organizer_id !== user.id) {
            throw new ForbiddenException('Only the event captain or an admin can perform this action');
        }

        return true;
    }
}
