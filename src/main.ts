import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV !== 'production',
      trustProxy: true,
    }),
  );

  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/health', () => ({ status: 'ok' }));

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
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];

  // Capacitor Android/iOS sirve la WebView desde estos orígenes (no vienen de ALLOWED_ORIGINS).
  // Android default: https://localhost — sin esto el login falla en dispositivo físico.
  const capacitorOrigins = new Set([
    'capacitor://localhost',
    'https://localhost',
    'http://localhost',
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      // Sin origin = Postman, curl, algunos clientes nativos — permitir siempre
      if (!origin) {
        return callback(null, true);
      }

      if (capacitorOrigins.has(origin) || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS bloqueado: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  const host = '0.0.0.0';

  await app.listen(port, host);
  console.log(`IronBykers API corriendo en http://${host}:${port}/api/v1`);
}

void bootstrap();