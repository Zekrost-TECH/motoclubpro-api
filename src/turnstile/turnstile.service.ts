import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TurnstileVerifyResponse {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    'error-codes'?: string[];
    action?: string;
    cdata?: string;
}

@Injectable()
export class TurnstileService {
    private readonly logger = new Logger(TurnstileService.name);
    private readonly verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    constructor(private readonly configService: ConfigService) { }

    /**
     * Verifica un token de Turnstile contra la API de Cloudflare.
     * Si no esta configurada la secret key, se omite la validacion y se permite
     * el login (util para desarrollo o si se desactiva temporalmente).
     */
    async verifyToken(token?: string | null, remoteip?: string): Promise<boolean> {
        const secretKey = this.configService.get<string>('TURNSTILE_SECRET_KEY');

        if (!secretKey) {
            this.logger.warn('TURNSTILE_SECRET_KEY no esta configurada. Omitiendo validacion de Turnstile.');
            return true;
        }

        if (!token) {
            this.logger.warn('Token de Turnstile ausente pero la validacion esta habilitada.');
            return false;
        }

        try {
            const response = await fetch(this.verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: secretKey,
                    response: token,
                    ...(remoteip ? { remoteip } : {}),
                }),
            });

            const data = (await response.json()) as TurnstileVerifyResponse;

            if (!data.success) {
                this.logger.warn(`Turnstile rechazo el token: ${JSON.stringify(data['error-codes'])}`);
            }

            return data.success;
        } catch (error) {
            this.logger.error('Error al contactar la API de Turnstile', error);
            // Fail-open: si Cloudflare no responde, permitimos el login pero lo registramos.
            // Esto evita bloquear a todos los administradores si Turnstile tiene downtime.
            return true;
        }
    }
}
