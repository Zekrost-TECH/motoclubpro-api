import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const req = context.switchToHttp().getRequest<{ method?: string; url?: string; user?: { id?: string } }>();
        const method = req.method ?? 'UNKNOWN';
        const url = req.url ?? 'UNKNOWN';
        const userId = req.user?.id ?? 'anonymous';
        const now = Date.now();

        return next.handle().pipe(
            tap(() => {
                const duration = Date.now() - now;
                this.logger.log(`${method} ${url} — ${userId} — ${duration}ms`);
            }),
        );
    }
}
