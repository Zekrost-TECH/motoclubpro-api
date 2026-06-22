/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    handleRequest<TUser>(err: Error | null, user: unknown, _info: unknown, _context: ExecutionContext, _status?: unknown): TUser {
        if (err || !user) {
            throw err || new UnauthorizedException('Authentication token is missing or invalid');
        }
        return user as TUser;
    }
}
