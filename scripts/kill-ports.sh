#!/usr/bin/env bash
# Mata procesos locales que ocupan los puertos de desarrollo del stack MotoClub Pro.
# Puertos cubiertos: API (3000), Web/App Vite (5173), Tracker (8081),
# Adminer (8080), Postgres (5432), Redis (6379), y los puertos de E2E
# (13000, 18081, 18080, 15432, 16379).
# Uso: ./scripts/kill-ports.sh

PORTS=(3000 5173 8081 8080 5432 6379 13000 18081 18080 15432 16379)

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

for port in "${PORTS[@]}"; do
  $SUDO lsof -ti :"$port" 2>/dev/null | xargs -r $SUDO kill -9 2>/dev/null || true
done
