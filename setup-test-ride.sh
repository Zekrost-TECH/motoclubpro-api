#!/bin/bash
# ============================================================================
# setup-test-ride.sh — automatiza la preparación de Redis para simular una
# rodada local con 2 emuladores.
# ============================================================================
# Uso:
#   chmod +x setup-test-ride.sh
#   ./setup-test-ride.sh
#
# Requisitos:
#   - docker-compose up postgres redis  (ya corriendo)
#   - seed-minimal-ironbikers.sql ya aplicado
#
# ============================================================================

set -euo pipefail

echo "[setup] Ejecutando seed-test-ride.sql..."
docker exec -i biker-os_postgres_e2e psql -U biker-os -d biker-os < src/infra/seed-test-ride.sql

echo "[setup] Recuperando IDs dinámicos del seed..."
IDS=$(docker exec biker-os_postgres_e2e psql -U biker-os -d biker-os -tA -c "
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

echo "[setup] admin_id   = $ADMIN_ID"
echo "[setup] rider2_id  = $RIDER2_ID"
echo "[setup] club_id    = $CLUB_ID"
echo "[setup] event_id   = $EVENT_ID"

echo "[setup] Poblando Redis (autorización del tracker)..."
docker exec biker-os_redis_e2e redis-cli SADD "event:${EVENT_ID}:members" "$ADMIN_ID" "$RIDER2_ID"
docker exec biker-os_redis_e2e redis-cli SET  "event:${EVENT_ID}:club"    "$CLUB_ID"

echo "[setup] Verificando Redis..."
docker exec biker-os_redis_e2e redis-cli SMEMBERS "event:${EVENT_ID}:members"
docker exec biker-os_redis_e2e redis-cli GET      "event:${EVENT_ID}:club"

echo ""
echo "✅  Rodada lista. Datos de login:"
echo "   Admin:   deiver.vasquezm@gmail.com / password123"
echo "   Rider 2: carlos@test.com          / password123"
echo ""
echo "   URLs para emuladores (10.0.2.2):"
echo "   API:     http://10.0.2.2:3000/api/v1"
echo "   Tracker: ws://10.0.2.2:8081"
echo "   Adminer: http://localhost:8080"
