import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class OwnerGuard implements CanActivate {
    constructor(private readonly db: DatabaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const motorcycleId = request.params.id;

        if (!user) {
            throw new ForbiddenException('User context is missing');
        }

        // Allow admins to override
        if (user.role === 'admin') {
            return true;
        }

        if (!motorcycleId) {
            throw new ForbiddenException('Motorcycle ID is required for owner validation');
        }

        // Fetch user_id for the given motorcycle
        const { rows } = await this.db.query(
            'SELECT user_id FROM motorcycles WHERE id = $1 LIMIT 1',
            [motorcycleId]
        );

        if (rows.length === 0) {
            throw new NotFoundException('Motorcycle not found');
        }

        const ownerId = rows[0].user_id;

        // Verify ownership
        if (ownerId !== user.id && ownerId !== user.userId) {
            throw new ForbiddenException('You do not have permission to modify this motorcycle');
        }

        return true;
    }
}
