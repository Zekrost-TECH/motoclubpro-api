import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { Response } from 'express';

interface PgError {
    code?: string;
    message?: string;
    detail?: string;
    constraint?: string;
}

@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(DatabaseExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        const pgError = exception as PgError;
        const pgCode = pgError.code;

        switch (pgCode) {
            case '23505': // unique_violation
                this.logger.warn(`Unique violation: ${pgError.detail}`);
                return response.status(409).json({
                    statusCode: 409,
                    message: 'Duplicate entry',
                    error: 'Conflict',
                });
            case '23503': // foreign_key_violation
                this.logger.warn(`Foreign key violation: ${pgError.detail}`);
                return response.status(400).json({
                    statusCode: 400,
                    message: 'Referenced resource does not exist',
                    error: 'Bad Request',
                });
            case '23502': // not_null_violation
                this.logger.warn(`Not null violation: ${pgError.detail}`);
                return response.status(400).json({
                    statusCode: 400,
                    message: 'Missing required field',
                    error: 'Bad Request',
                });
            case '08000': // connection_exception
            case '08003': // connection_does_not_exist
            case '08006': // connection_failure
                this.logger.error(`Database connection error: ${pgError.message}`);
                return response.status(503).json({
                    statusCode: 503,
                    message: 'Database temporarily unavailable',
                    error: 'Service Unavailable',
                });
            default:
                // Let NestJS handle non-pg errors with its default exception filter
                throw exception;
        }
    }
}
