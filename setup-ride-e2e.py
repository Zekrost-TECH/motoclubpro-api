#!/usr/bin/env python3
# setup-ride-e2e.py — poblar rodada de prueba en el stack E2E
# Uso: python3 setup-ride-e2e.py

import subprocess
import sys

def psql(sql, db="biker-os", host="biker-os_postgres_e2e"):
    """Ejecuta SQL y devuelve stdout limpio."""
    cmd = ["docker", "exec", "-i", host, "psql", "-U", db, "-d", db, "-qtA"]
    result = subprocess.run(cmd, input=sql, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[ERROR] SQL falló:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    # Limpiar líneas vacías y mensajes de psql
    lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip() and not l.strip().startswith("INSERT") and not l.strip().startswith("UPDATE")]
    return lines

def redis_cmd(*args):
    cmd = ["docker", "exec", "biker-os_redis_e2e", "redis-cli"] + list(args)
    subprocess.run(cmd, check=True)

print("[1/6] Recuperando club iron-bikers...")
rows = psql("SELECT id FROM clubs WHERE slug LIKE 'iron-bikers%' LIMIT 1;")
if not rows:
    print("[FATAL] No hay club iron-bikers. El seed base no cargó.", file=sys.stderr)
    sys.exit(1)
club_id = rows[0]
print(f"      club_id = {club_id}")

print("[2/6] Insertando/actualizando usuarios...")
admin_id = psql(f"""
INSERT INTO users (name, nickname, email, phone, avatar_initials, role, rider_level, password_hash, blood_type, rides_completed, total_km, is_active)
VALUES ('Deiver Vasquez', 'El patrón', 'deiver.vasquezm@gmail.com', '3046701922', 'DV', 'admin', 'avanzado', '$2b$10$WD.kYgd9aTMr8G3Va2LVee8pja8/9ltGhsJxOrARfxjWZzF5Tddfq', 'O+', 0, 0, TRUE)
ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, nickname=EXCLUDED.nickname, phone=EXCLUDED.phone, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, rider_level=EXCLUDED.rider_level, is_active=TRUE
RETURNING id;
""")[0]

rider2_id = psql(f"""
INSERT INTO users (name, nickname, email, phone, avatar_initials, role, rider_level, password_hash, blood_type, rides_completed, total_km, is_active)
VALUES ('Carlos Rider', 'Carlitos', 'carlos@test.com', '3001234567', 'CR', 'rider', 'intermedio', '$2b$10$WD.kYgd9aTMr8G3Va2LVee8pja8/9ltGhsJxOrARfxjWZzF5Tddfq', 'A+', 0, 0, TRUE)
ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, nickname=EXCLUDED.nickname, phone=EXCLUDED.phone, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, rider_level=EXCLUDED.rider_level, is_active=TRUE
RETURNING id;
""")[0]
print(f"      admin_id  = {admin_id}")
print(f"      rider2_id = {rider2_id}")

print("[3/6] Membresías y motos...")
psql(f"""
INSERT INTO club_members (club_id, user_id, role, is_active) VALUES
('{club_id}', '{admin_id}', 'admin', TRUE),
('{club_id}', '{rider2_id}', 'rider', TRUE)
ON CONFLICT (club_id, user_id) DO UPDATE SET role=EXCLUDED.role, is_active=TRUE;
""")

psql(f"""
INSERT INTO motorcycles (user_id, brand, model, year, plate, color, soat_expiry, tech_review_expiry, current_km) VALUES
('{admin_id}',  'Yamaha', 'MT-07',  2022, 'ABC123', 'Negro', CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 12000),
('{rider2_id}', 'Honda',  'CB500X', 2021, 'XYZ789', 'Rojo',  CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 8000)
ON CONFLICT (plate) DO NOTHING;
""")

print("[4/6] Ruta y evento...")
route_rows = psql(f"""
INSERT INTO routes (name, description, difficulty, distance_km, estimated_time, start_lat, start_lng, start_name, created_by)
VALUES ('Prueba Local Cartagena', 'Ruta corta para testear radar', 'suave', 15.5, '45 min', 10.3997, -75.5144, 'Torre del Reloj, Cartagena', '{admin_id}')
ON CONFLICT DO NOTHING RETURNING id;
""")
if route_rows:
    route_id = route_rows[0]
else:
    route_id = psql("SELECT id FROM routes WHERE name = 'Prueba Local Cartagena' LIMIT 1;")[0]
print(f"      route_id = {route_id}")

event_rows = psql(f"""
INSERT INTO events (title, description, date, time, difficulty, route_id, status, max_attendees, min_rider_level, meeting_point, meeting_point_lat, meeting_point_lng, organizer_id, club_id)
VALUES ('Rodada Test Local', 'Evento de prueba para 2 emuladores', CURRENT_DATE, CURRENT_TIME::TIME, 'suave', '{route_id}', 'en_curso', 20, 'novato', 'Torre del Reloj, Cartagena', 10.3997, -75.5144, '{admin_id}', '{club_id}')
ON CONFLICT DO NOTHING RETURNING id;
""")
if event_rows:
    event_id = event_rows[0]
else:
    event_id = psql("SELECT id FROM events WHERE title = 'Rodada Test Local' LIMIT 1;")[0]
print(f"      event_id = {event_id}")

print("[5/6] Attendees...")
psql(f"""
INSERT INTO event_attendees (event_id, user_id, ride_role, confirmed_at, checklist_completed) VALUES
('{event_id}', '{admin_id}',  'puntero',   NOW(), TRUE),
('{event_id}', '{rider2_id}', 'barredora', NOW(), TRUE)
ON CONFLICT (event_id, user_id) DO UPDATE SET
ride_role=EXCLUDED.ride_role, confirmed_at=EXCLUDED.confirmed_at, checklist_completed=EXCLUDED.checklist_completed;
""")

print("[6/6] Redis...")
redis_cmd("SADD", f"event:{event_id}:members", admin_id, rider2_id)
redis_cmd("SET",  f"event:{event_id}:club",    club_id)

members = subprocess.run(
    ["docker","exec","biker-os_redis_e2e","redis-cli","SMEMBERS",f"event:{event_id}:members"],
    capture_output=True, text=True, check=True
).stdout.strip()
print(f"      Redis members: {members}")

print("\n✅ Rodada lista en E2E.")
print(f"   Admin:   deiver.vasquezm@gmail.com / password123   (id={admin_id})")
print(f"   Rider 2: carlos@test.com          / password123   (id={rider2_id})")
print(f"   Event:   {event_id}")
print(f"   Club:    {club_id}")
print(f"   URLs:")
print(f"   API:     http://10.0.2.2:13000/api/v1")
print(f"   Tracker: ws://10.0.2.2:18081")
print(f"   Adminer: http://localhost:18080")
