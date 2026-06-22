import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: 'REDIS_CLIENT',
            useFactory: (configService: ConfigService) => {
                const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
                const isTLS = redisUrl.startsWith('rediss://');

                const client = new Redis(redisUrl, {
                    maxRetriesPerRequest: 3,
                    ...(isTLS && {
                        tls: {
                            rejectUnauthorized: false,
                        },
                    }),
                });

                client.on('error', (err) => {
                    Logger.error('Redis connection error', err instanceof Error ? err.stack : String(err), 'RedisModule');
                });

                client.on('reconnecting', () => {
                    Logger.warn('Redis reconnecting...', 'RedisModule');
                });

                client.on('connect', () => {
                    Logger.log('Redis connected', 'RedisModule');
                });

                return client;
            },
            inject: [ConfigService],
        },
    ],
    exports: ['REDIS_CLIENT'],
})
export class RedisModule { }