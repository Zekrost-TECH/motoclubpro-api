import * as admin from 'firebase-admin';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FcmService implements OnModuleInit {
    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        if (admin.apps.length > 0) return;

        const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
        const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
        const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

        if (!projectId || !privateKey) {
            Logger.warn('[FCM] Variables de entorno no configuradas — push deshabilitado', 'FcmService');
            return;
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });

        Logger.log('[FCM] firebase-admin inicializado', 'FcmService');
    }

    private get isReady(): boolean {
        return admin.apps.length > 0;
    }

    async sendToTokens(
        tokens: string[],
        notification: { title: string; body: string },
        data?: Record<string, string>,
    ): Promise<void> {
        if (!this.isReady || !tokens.length) return;

        try {
            const response = await admin.messaging().sendEachForMulticast({
                tokens,
                notification,
                data,
                android: { priority: 'high' },
                apns: { payload: { aps: { sound: 'default', badge: 1 } } },
            });

            const failed = response.responses
                .filter(r => !r.success)
                .map(r => r.error?.message);

            if (failed.length) {
                Logger.warn(`[FCM] ${failed.length} tokens fallidos: ${failed.join(', ')}`, 'FcmService');
            }
        } catch (err) {
            Logger.error('[FCM] Error enviando push', err instanceof Error ? err.stack : String(err), 'FcmService');
        }
    }

    async sendSOSAlert(params: {
        senderName: string;
        type: string;
        lat: number;
        lng: number;
        tokens: string[];
    }): Promise<void> {
        const typeLabels: Record<string, string> = {
            pinchazo: 'Pinchazo',
            falla_mecanica: 'Falla Mecánica',
            accidente: 'Accidente',
            sin_gasolina: 'Sin Gasolina',
            medica: 'Emergencia Médica',
            otro: 'Emergencia',
        };

        await this.sendToTokens(
            params.tokens,
            {
                title: `SOS — ${params.senderName}`,
                body: typeLabels[params.type] ?? params.type,
            },
            {
                type: 'sos',
                lat: String(params.lat),
                lng: String(params.lng),
            },
        );
    }
}