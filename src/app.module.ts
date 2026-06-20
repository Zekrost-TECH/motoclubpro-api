import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MotorcyclesModule } from './motorcycles/motorcycles.module';
import { RoutesModule } from './routes/routes.module';
import { EventsModule } from './events/events.module';
import { SosModule } from './sos/sos.module';
import { SupportModule } from './support/support.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    // Variables de entorno disponibles en toda la app via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Cron jobs (validación RUNT, alertas de mantenimiento)
    ScheduleModule.forRoot(),

    // Rate limiting general de 60 request por minuto (protección por defecto)
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),

    DatabaseModule,
    AuthModule,
    UsersModule,
    MotorcyclesModule,
    RoutesModule,
    EventsModule,
    RedisModule,
    SosModule,
    SupportModule,
    // RuntModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }