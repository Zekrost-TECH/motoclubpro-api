# MotoClub Pro API

Backend API REST para MotoClub Pro, plataforma SaaS multiclub para gestion de clubes de motociclismo en Colombia.

## Stack Tecnologico

| Tecnologia | Version | Proposito |
|---|---|---|
| NestJS | ^11.1.17 | Framework backend (Fastify adapter) |
| TypeScript | ^6.0.2 | Tipado estatico |
| PostgreSQL | 15+ | Base de datos principal |
| PostGIS | 3.4+ | Geospatial queries para rutas y waypoints |
| Redis | 7+ | Cache, pub/sub SOS, token blacklist |
| Bun | 1.3+ | Runtime y gestor de paquetes |
| JWT | - | Auth access + refresh tokens con rotacion |
| Firebase Admin | ^13.7.0 | Push notifications (FCM) |
| WomPI | - | Pasarela de pagos Colombia |
| Alegra | - | Facturacion electronica DIAN |

## Arquitectura

- **Multi-tenancy:** Cada endpoint protegido usa header `x-club-id` + `ClubGuard` / `ClubRolesGuard`.
- **Rate Limiting:** `@nestjs/throttler` — 60 req/min por IP.
- **Auth:** JWT access (15min) + refresh (30d). Tokens invalidados se agregan a blacklist en Redis.
- **SOS Alerts:** Pub/sub Redis entre API y Tracker para broadcast en tiempo real.
- **Webhooks:** WomPI webhook controller con verificacion de checksum.

## Modulos

| Modulo | Descripcion |
|---|---|
| `auth` | Login, registro, refresh, logout, guards, decorators |
| `users` | CRUD usuarios, info medica, membresias de club |
| `clubs` | Creacion de clubes, miembros, billing, suscripciones |
| `events` | Rodadas, RSVP, roles de rodada, checklist, inventario |
| `motorcycles` | Perfiles de motocicletas, historial de mantenimiento |
| `routes` | Rutas PostGIS, waypoints, import batch GeoJSON |
| `sos` | Alertas de emergencia con geolocalizacion y FCM push |
| `support` | Puntos de apoyo con reviews y verificacion |
| `billing` | Webhooks WomPI, pagos recurrentes, facturacion DIAN |
| `notifications` | Multicast FCM para SOS y alertas generales |

## Estructura del Proyecto

```
src/
|-- auth/           # Auth module (JWT, guards, decorators)
|-- billing/        # WomPI webhooks, Alegra invoicing
|-- clubs/          # Club CRUD, members, billing endpoints
|-- events/         # Event CRUD, attendees, checklist, inventory
|-- motorcycles/    # Motorcycle profiles, maintenance
|-- notifications/  # FCM push service
|-- routes/         # Route CRUD, waypoints (PostGIS)
|-- sos/            # SOS alerts, geolocation
|-- support/        # Support points, reviews
|-- users/          # User CRUD, medical info
|-- app.module.ts   # Root module
|-- main.ts         # Bootstrap (Fastify adapter)
```

## Requisitos

- Bun 1.3+ (o Node.js 20+)
- PostgreSQL 15+ con extensiones `pgcrypto` y `postgis`
- Redis 7+
- Cuenta Firebase (para FCM)
- Credenciales WomPI (sandbox o produccion)
- Cuenta Alegra (para facturacion DIAN)

## Instalacion

```bash
cd motoclubpro-api

# Dependencias
bun install

# Variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Base de datos (crear DB y ejecutar migraciones)
# Ver motoclubpro-api/infra/ para scripts SQL

# Desarrollo con hot-reload
bun run start:dev
```

La API estara en `http://localhost:3000/api/v1`.

## Scripts

```bash
bun run start:dev      # Desarrollo con hot-reload
bun run build          # Compilar TypeScript
bun run start:prod     # Produccion (dist/main.js)
bun run lint           # ESLint
bun run test           # Unit tests (Jest)
bun run test:e2e       # End-to-end tests
bun run test:cov       # Coverage report
```

## Variables de Entorno

Ver `.env.example` para la lista completa. Clave:

| Variable | Descripcion |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` / `REFRESH_SECRET` | Secrets para firmar tokens (min 32 chars) |
| `ALLOWED_ORIGINS` | Origenes CORS permitidos |
| `WOMPI_*` | Credenciales WomPI (public, private, webhook secret) |
| `ALEGRA_*` | Credenciales Alegra (email, API key) |
| `FIREBASE_*` | Firebase Admin SDK (projectId, privateKey, clientEmail) |

## Docker

```bash
# Build de produccion
docker build -f Dockerfile -t motoclubpro-api:latest .

# Build de desarrollo
docker build -f Dockerfile.dev -t motoclubpro-api:dev .

# Correr
docker run -d -p 3000:3000 --env-file .env motoclubpro-api:latest
```

## Convenciones API

- Prefijo base: `/api/v1`
- Auth: `Authorization: Bearer <token>`
- Multi-tenant: `x-club-id: <clubId>`
- Validacion: `class-validator` DTOs
- Rate limit: 60 req/min por IP
- Healthcheck: `GET /api/v1/health`

## Documentacion Relacionada

- [Guia de Desarrollo Local](../../docs/LOCAL-DEVELOPMENT-GUIDE.md)
- [Guia de Despliegue a Produccion](../../docs/PRODUCTION-DEPLOYMENT-GUIDE.md)
- [Documentacion Tecnica Web](../../docs/WEB-TECHNICAL-DOCUMENTATION.md)

## Licencia

UNLICENSED — Software comercial privado.
