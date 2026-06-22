import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';

interface SosPayload {
    type: 'sos';
    payload: {
        alertId: string;
        userId: string;
        clubId?: string;
        type: string;
        lat: number;
        lng: number;
        description?: string;
    };
}

@WebSocketGateway({
    namespace: '/sos',
    cors: { origin: '*' },
})
export class SosGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    private readonly logger = new Logger(SosGateway.name);

    @WebSocketServer()
    server!: Server;

    private redisSubscriber!: Redis;

    constructor(
        @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    ) { }

    afterInit(): void {
        this.redisSubscriber = this.redisClient.duplicate();
        void this.redisSubscriber.psubscribe('sos:*').then(() => {
            this.logger.log('Subscribed to SOS Redis pattern sos:*');
        }).catch((err) => {
            this.logger.error('Failed to subscribe to SOS Redis pattern', err instanceof Error ? err.stack : String(err));
        });

        this.redisSubscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
            this.logger.verbose(`Redis pmessage on ${channel}`);
            try {
                const data = JSON.parse(message) as SosPayload;
                if (data.type === 'sos') {
                    // Canal: sos:event:{id} | sos:club:{id} | sos:global
                    // El room es el id (último segmento), o 'global'.
                    const parts = channel.split(':');
                    const room = parts.length >= 3 ? parts.slice(2).join(':') : 'global';
                    this.server.to(room).emit('sos_alert', data.payload);
                }
            } catch (err) {
                this.logger.warn('Invalid SOS payload from Redis', err instanceof Error ? err.stack : String(err));
            }
        });
    }

    handleConnection(client: Socket): void {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket): void {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    onModuleDestroy(): void {
        if (this.redisSubscriber) {
            void this.redisSubscriber.punsubscribe('sos:*').catch(() => {
                // ignore cleanup errors
            });
            void this.redisSubscriber.quit().catch(() => {
                // ignore cleanup errors
            });
            this.logger.log('SOS Redis subscriber cleaned up');
        }
    }

    async subscribeClub(client: Socket, clubId: string): Promise<void> {
        await client.join(clubId);
        this.logger.verbose(`Client ${client.id} joined room ${clubId}`);
    }

    async subscribeEvent(client: Socket, eventId: string): Promise<void> {
        await client.join(eventId);
        this.logger.verbose(`Client ${client.id} joined room ${eventId}`);
    }

    async unsubscribeClub(client: Socket, clubId: string): Promise<void> {
        await client.leave(clubId);
    }

    async unsubscribeEvent(client: Socket, eventId: string): Promise<void> {
        await client.leave(eventId);
    }
}
