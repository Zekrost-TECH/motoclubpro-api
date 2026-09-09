import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter } from './database/database-exception.filter';
import { buildCorsOriginValidator } from './common/cors';

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled Rejection', reason instanceof Error ? reason.stack : String(reason));
});

process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception', err.stack);
  process.exit(1);
});

function validateEnv(config: ConfigService): void {
  const errors: string[] = [];
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const dryRun = config.get<string>('BILLING_DRY_RUN') === 'true';

  // --- Required vars (all environments) ---
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REFRESH_SECRET',
    'REDIS_URL',
  ];
  for (const key of required) {
    if (!config.get<string>(key)) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // --- Format: DATABASE_URL ---
  const dbUrl = config.get<string>('DATABASE_URL');
  if (dbUrl && !dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    errors.push('DATABASE_URL must start with postgresql:// or postgres://');
  }

  // --- Format: REDIS_URL ---
  const redisUrl = config.get<string>('REDIS_URL');
  if (redisUrl && !redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    errors.push('REDIS_URL must start with redis:// or rediss://');
  }

  // --- Min length: JWT_SECRET (32 chars) ---
  const jwtSecret = config.get<string>('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  // --- Min length: REFRESH_SECRET (32 chars) ---
  const refreshSecret = config.get<string>('REFRESH_SECRET');
  if (refreshSecret && refreshSecret.length < 32) {
    errors.push('REFRESH_SECRET must be at least 32 characters');
  }

  // --- Format: PORT (numeric, if present) ---
  const port = config.get<string>('PORT');
  if (port && !/^\d+$/.test(port)) {
    errors.push('PORT must be a numeric value');
  }

  // --- Production-only: ALLOWED_ORIGINS ---
  if (isProduction) {
    const origins = (config.get<string>('ALLOWED_ORIGINS') ?? '').trim();
    if (!origins) {
      errors.push('ALLOWED_ORIGINS is required in production');
    }
  }

  // --- Billing keys (only when not dry-run) ---
  if (!dryRun) {
    const billingKeys = [
      'WOMPI_PRIVATE_KEY',
      'WOMPI_PUBLIC_KEY',
      'WOMPI_BASE_URL',
      'WOMPI_EVENTS_SECRET',
      'ALEGRA_EMAIL',
      'ALEGRA_API_KEY',
      'ALEGRA_BASE_URL',
    ];
    for (const key of billingKeys) {
      if (!config.get<string>(key)) {
        errors.push(`Missing required environment variable: ${key}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  if (dryRun) {
    Logger.warn('BILLING_DRY_RUN activo: pagos y facturacion se simulan sin Wompi/Alegra', 'Bootstrap');
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

  // Security headers (Helmet)
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        scriptSrc: [`'self'`, `'unsafe-inline'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'https:'],
        connectSrc: [`'self'`, 'https:', 'wss:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

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

  app.enableCors({
    origin: buildCorsOriginValidator(allowedOrigins),
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
      .setTitle('BikerOS API')
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