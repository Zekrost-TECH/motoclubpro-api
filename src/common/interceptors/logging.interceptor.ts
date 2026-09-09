import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const req = context.switchToHttp().getRequest<{ method?: string; url?: string; user?: { id?: string } }>();
        const res = context.switchToHttp().getResponse<{ statusCode?: number }>();
        const method = req.method ?? 'UNKNOWN';
        const url = req.url ?? 'UNKNOWN';
        const userId = req.user?.id ?? 'anonymous';
        const now = Date.now();

        return next.handle().pipe(
            tap(() => {
                const duration = Date.now() - now;
                const statusCode = res.statusCode ?? 200;
                this.logger.log(JSON.stringify({
                    method,
                    url,
                    statusCode,
                    userId,
                    durationMs: duration,
                }));
            }),
        );
    }
}
