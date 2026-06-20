import * as admin from 'firebase-admin';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class FcmService implements OnModuleInit {

    onModuleInit() {
        if (admin.apps.length > 0) return;

        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!process.env.FIREBASE_PROJECT_ID || !privateKey) {
            console.warn('[FCM] Variables de entorno no configuradas — push deshabilitado');
            return;
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey,
            }),
        });

        console.log('[FCM] firebase-admin inicializado');
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
                console.warn(`[FCM] ${failed.length} tokens fallidos:`, failed);
            }
        } catch (err) {
            console.error('[FCM] Error enviando push:', err);
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