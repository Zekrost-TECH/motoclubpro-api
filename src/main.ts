import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter } from './database/database-exception.filter';

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled Rejection', reason instanceof Error ? reason.stack : String(reason));
});

process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception', err.stack);
  process.exit(1);
});

function validateEnv(config: ConfigService): void {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REFRESH_SECRET',
    'REDIS_URL',
    'WOMPI_PRIVATE_KEY',
    'WOMPI_PUBLIC_KEY',
    'WOMPI_BASE_URL',
    'WOMPI_EVENTS_SECRET',
    'ALEGRA_EMAIL',
    'ALEGRA_API_KEY',
    'ALEGRA_BASE_URL',
  ];
  const missing = required.filter((key) => !config.get<string>(key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV !== 'production',
      trustProxy: true,
    }),
  );

  const configService = app.get(ConfigService);
  validateEnv(configService);

  app.useGlobalFilters(new DatabaseExceptionFilter());

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS — compatible con app móvil Capacitor
  const allowedOrigins = (configService.get<string>('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Capacitor Android/iOS sirve la WebView desde estos orígenes
  const capacitorOrigins = new Set([
    'capacitor://localhost',
    'https://localhost',
    'http://localhost',
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (capacitorOrigins.has(origin) || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS bloqueado: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-club-id'],
    credentials: true,
  });

  // Cierre limpio del pool de Postgres y Redis en SIGTERM/SIGINT (deploys)
  app.enableShutdownHooks();

  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const swaggerEnabled = !isProduction || configService.get<string>('SWAGGER_ENABLED') === 'true';

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('MotoClubPro API')
      .setDescription('Multi-tenant SaaS API for managing motorcycle clubs in Colombia')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth')
      .addTag('users')
      .addTag('clubs')
      .addTag('events')
      .addTag('motorcycles')
      .addTag('routes')
      .addTag('sos')
      .addTag('support')
      .addTag('billing')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT') ?? 3000;
  const host = '0.0.0.0';

  await app.listen(port, host);
  Logger.log(`Ironbikers API corriendo en http://${host}:${port}/api/v1`, 'Bootstrap');
  if (swaggerEnabled) {
    Logger.log(`Swagger docs available at http://${host}:${port}/api/docs`, 'Bootstrap');
  }
}

void bootstrap();