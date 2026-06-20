import { Module, Global } from '@nestjs/common';
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

                return new Redis(redisUrl, {
                    ...(isTLS && {
                        tls: {
                            rejectUnauthorized: false,
                        },
                    }),
                });
            },
            inject: [ConfigService],
        },
    ],
    exports: ['REDIS_CLIENT'],
})
export class RedisModule { }