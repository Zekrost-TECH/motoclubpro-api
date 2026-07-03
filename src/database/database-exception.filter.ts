import { ExceptionFilter, Catch, ArgumentsHost, Logger, HttpStatus } from '@nestjs/common';

interface PgError {
    code?: string;
    message?: string;
    detail?: string;
    constraint?: string;
}

interface FastifyReply {
    status: (code: number) => FastifyReply;
    send: (payload: unknown) => void;
}

@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(DatabaseExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();

        const pgError = exception as PgError;
        const pgCode = pgError.code;

        const send = (status: number, payload: { statusCode: number; message: string; error: string }) => {
            response.status(status).send(payload);
        };

        switch (pgCode) {
            case '23505': // unique_violation
                this.logger.warn(`Unique violation: ${pgError.detail}`);
                return send(409, {
                    statusCode: 409,
                    message: 'Ya existe un registro con esos datos',
                    error: 'Conflicto',
                });
            case '23503': // foreign_key_violation
                this.logger.warn(`Foreign key violation: ${pgError.detail}`);
                return send(400, {
                    statusCode: 400,
                    message: 'El recurso relacionado no existe',
                    error: 'Solicitud inválida',
                });
            case '23502': // not_null_violation
                this.logger.warn(`Not null violation: ${pgError.detail}`);
                return send(400, {
                    statusCode: 400,
                    message: 'Faltan datos obligatorios',
                    error: 'Solicitud inválida',
                });
            case '08000': // connection_exception
            case '08003': // connection_does_not_exist
            case '08006': // connection_failure
                this.logger.error(`Database connection error: ${pgError.message}`);
                return send(503, {
                    statusCode: 503,
                    message: 'La base de datos no está disponible temporalmente',
                    error: 'Servicio no disponible',
                });
            case '42P18': // indeterminate_datatype
            case '42601': // syntax_error
            case '22P02': // invalid_text_representation
                this.logger.error(`Database query error [${pgCode}]: ${pgError.message}`);
                return send(500, {
                    statusCode: 500,
                    message: 'Ocurrió un error interno al consultar la base de datos. Inténtalo de nuevo más tarde.',
                    error: 'Error interno del servidor',
                });
            default:
                // Hide unexpected technical errors from the client
                if (pgCode) {
                    this.logger.error(`Unexpected database error [${pgCode}]: ${pgError.message}`);
                    return send(HttpStatus.INTERNAL_SERVER_ERROR, {
                        statusCode: 500,
                        message: 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
                        error: 'Error interno del servidor',
                    });
                }
                // Let NestJS handle non-pg errors with its default exception filter
                throw exception;
        }
    }
}
