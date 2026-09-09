# Migraciones de Base de Datos

## Uso

```bash
# Ejecutar migraciones pendientes
npm run migrate

# Ver estado de migraciones
npm run migrate:status
```

Requiere `DATABASE_URL` configurada en el entorno.

## Cómo funciona

1. El runner crea una tabla `_migrations` para trackear qué migraciones se han aplicado.
2. Lee los archivos `migrations/*.sql` en orden alfabético.
3. Ejecuta los que no se han aplicado, dentro de una transacción.
4. Marca cada migración como aplicada en `_migrations`.

## Orden de migraciones

| # | Archivo | Descripción |
|---|---------|-------------|
| 001 | `001-multiclub-billing.sql` | Multi-club billing (planes, suscripciones, pagos) |
| 002 | `002-support-points-city.sql` | Columna city en support_points |
| 003 | `003-ride-roles.sql` | Roles de rodada |
| 004 | `004-event-guests.sql` | Invitados a eventos |
| 005 | `005-billing-payment-methods.sql` | Métodos de pago Wompi |
| 006 | `006-performance-indexes.sql` | Índices de performance |

## Crear una nueva migración

1. Crea un archivo `NNN-descripcion.sql` en `migrations/` (donde NNN es el siguiente número).
2. Usa `BEGIN; ... COMMIT;` para envolver los cambios.
3. Usa `IF NOT EXISTS` / `IF EXISTS` para idempotencia.
4. Ejecuta `npm run migrate` para aplicarla.

## Nota

El schema completo está en `src/infra/schema-final.sql`. Las migraciones son incrementales sobre el schema base. Si estás configurando desde cero, usa `schema-final.sql`. Si ya tienes la BD y necesitas aplicar cambios, usa las migraciones.
