import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentClub = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<{ headers: { 'x-club-id'?: string } }>();
    return request.headers['x-club-id'] ?? null;
  },
);
