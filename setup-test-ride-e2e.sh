#!/bin/bash
# ============================================================================
# setup-test-ride-e2e.sh — versión para docker-compose.e2e.yml
# ============================================================================
# Usa contenedores con sufijo _e2e y puertos e2e (13000, 18081).
# Requisito: docker-compose -f docker-compose.e2e.yml up -d  ya ejecutado.
# ============================================================================

set -euo pipefail

PG="biker-os_postgres_e2e"
RD="biker-os_redis_e2e"

echo "[e2e] 1/4 Ejecutando seed-minimal-ironbikers.sql..."
docker exec -i "$PG" psql -U biker-os -d biker-os < src/infra/seed-minimal-ironbikers.sql

echo "[e2e] 2/4 Ejecutando seed-test-ride.sql..."
docker exec -i "$PG" psql -U biker-os -d biker-os < src/infra/seed-test-ride.sql

echo "[e2e] 3/4 Recuperando IDs dinámicos..."
IDS=$(docker exec "$PG" psql -U biker-os -d biker-os -tA -c "
SELECT id FROM users WHERE email = 'deiver.vasquezm@gmail.com';
SELECT id FROM users WHERE email = 'carlos@test.com';
SELECT id FROM clubs WHERE slug = 'iron-bikers';
SELECT id FROM events WHERE title = 'Rodada Test Local';
")

readarray -t LINES <<< "$IDS"
ADMIN_ID="${LINES[0]}"
RIDER2_ID="${LINES[1]}"
CLUB_ID="${LINES[2]}"
EVENT_ID="${LINES[3]}"

echo "[e2e]    admin_id  = $ADMIN_ID"
echo "[e2e]    rider2_id = $RIDER2_ID"
echo "[e2e]    club_id   = $CLUB_ID"
echo "[e2e]    event_id  = $EVENT_ID"

echo "[e2e] 4/4 Poblando Redis e2e..."
docker exec "$RD" redis-cli SADD "event:${EVENT_ID}:members" "$ADMIN_ID" "$RIDER2_ID"
docker exec "$RD" redis-cli SET  "event:${EVENT_ID}:club"    "$CLUB_ID"

echo "[e2e] Verificación Redis:"
docker exec "$RD" redis-cli SMEMBERS "event:${EVENT_ID}:members"
docker exec "$RD" redis-cli GET      "event:${EVENT_ID}:club"

echo ""
echo "✅  Rodada lista en E2E. Datos de login:"
echo "   Admin:   deiver.vasquezm@gmail.com / password123"
echo "   Rider 2: carlos@test.com          / password123"
echo ""
echo "   URLs para emuladores (10.0.2.2):"
echo "   API:     http://10.0.2.2:13000/api/v1"
echo "   Tracker: ws://10.0.2.2:18081"
echo "   Adminer: http://localhost:18080"
