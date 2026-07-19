-- ============================================================================
-- SEED: Rodada de prueba con 2 riders para emuladores
-- ============================================================================
-- Requisitos: seed-minimal-ironbikers.sql ya ejecutado (deja un club y un
-- admin). Este script crea un segundo usuario, motos, ruta, evento en_curso
-- y RSVPs, dejando todo listo para conectar 2 emuladores.

DO $$
DECLARE
    -- Misma contraseña: "password123" (bcrypt cost 10)
    -- Generada online: https://bcrypt-generator.com/
    pwd_hash TEXT := '$2b$10$WD.kYgd9aTMr8G3Va2LVee8pja8/9ltGhsJxOrARfxjWZzF5Tddfq';

    v_admin_id      UUID;
    v_rider2_id     UUID;
    v_club_id       UUID;
    v_route_id      UUID;
    v_event_id      UUID;
BEGIN
    -- ── 1. IDs existentes del seed mínimo ──────────────────────────────────────
    SELECT id INTO v_admin_id   FROM users WHERE email = 'deiver.vasquezm@gmail.com';
    SELECT id INTO v_club_id   FROM clubs  WHERE slug   = 'iron-bikers';

    IF v_admin_id IS NULL OR v_club_id IS NULL THEN
        RAISE EXCEPTION 'Seed mínimo no encontrado. Ejecuta primero seed-minimal-ironbikers.sql';
    END IF;

    -- ── 2. SEGUNDO USUARIO (Rider 2) ─────────────────────────────────────────
    INSERT INTO users (
        name, nickname, email, phone, avatar_initials,
        role, rider_level, password_hash, blood_type,
        rides_completed, total_km, is_active
    ) VALUES (
        'Carlos Rider', 'Carlitos', 'carlos@test.com', '3001234567', 'CR',
        'rider', 'intermedio', pwd_hash, 'A+',
        0, 0, TRUE
    )
    ON CONFLICT (email) DO UPDATE SET
        name          = EXCLUDED.name,
        nickname      = EXCLUDED.nickname,
        phone         = EXCLUDED.phone,
        password_hash = EXCLUDED.password_hash,
        role          = EXCLUDED.role,
        rider_level   = EXCLUDED.rider_level
    RETURNING id INTO v_rider2_id;

    -- ── 3. MEMBRESÍA EN EL CLUB ─────────────────────────────────────────────
    INSERT INTO club_members (club_id, user_id, role, is_active)
    VALUES (v_club_id, v_rider2_id, 'rider', TRUE)
    ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE;

    -- ── 4. MOTOS (SOAT + RTM vigentes — requerido por RSVP) ─────────────────
    INSERT INTO motorcycles (
        user_id, brand, model, year, plate, color,
        soat_expiry, tech_review_expiry, current_km
    ) VALUES
        (v_admin_id,   'Yamaha',  'MT-07',  2022, 'ABC123', 'Negro',
         CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 12000),
        (v_rider2_id,  'Honda',   'CB500X', 2021, 'XYZ789', 'Rojo',
         CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 8000)
    ON CONFLICT (plate) DO NOTHING;

    -- ── 5. RUTA ─────────────────────────────────────────────────────────────
    INSERT INTO routes (
        name, description, difficulty, distance_km, estimated_time,
        start_lat, start_lng, start_name, created_by
    ) VALUES (
        'Prueba Local Cartagena',
        'Ruta corta para testear radar con 2 emuladores',
        'suave',
        15.5,
        '45 min',
        10.3997, -75.5144,
        'Torre del Reloj, Cartagena',
        v_admin_id
    )
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO v_route_id;

    -- Si ya existía, recuperar su id
    IF v_route_id IS NULL THEN
        SELECT id INTO v_route_id FROM routes WHERE name = 'Prueba Local Cartagena';
    END IF;

    -- ── 6. EVENTO EN CURSO ──────────────────────────────────────────────────
    -- Fecha=hoy, hora=ahora, status=en_curso
    INSERT INTO events (
        title, description, date, time, difficulty, route_id,
        status, max_attendees, min_rider_level, meeting_point,
        meeting_point_lat, meeting_point_lng, organizer_id, club_id
    ) VALUES (
        'Rodada Test Local',
        'Evento de prueba para 2 emuladores. No borrar en producción.',
        CURRENT_DATE,
        CURRENT_TIME::TIME,
        'suave',
        v_route_id,
        'en_curso',
        20,
        'novato',
        'Torre del Reloj, Cartagena',
        10.3997, -75.5144,
        v_admin_id,
        v_club_id
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_event_id;

    -- Si ya existía, recuperar su id (y forzar status=en_curso)
    IF v_event_id IS NULL THEN
        SELECT id INTO v_event_id FROM events WHERE title = 'Rodada Test Local';
        UPDATE events SET status = 'en_curso' WHERE id = v_event_id;
    END IF;

    -- ── 7. RSVP (attendees con ride roles) ───────────────────────────────────
    -- Puntero = admin, Barredora = rider2, otros = riders
    INSERT INTO event_attendees (event_id, user_id, ride_role, confirmed_at, checklist_completed)
    VALUES
        (v_event_id, v_admin_id,   'puntero',   NOW(), TRUE),
        (v_event_id, v_rider2_id,  'barredora', NOW(), TRUE)
    ON CONFLICT (event_id, user_id) DO UPDATE SET
        ride_role          = EXCLUDED.ride_role,
        confirmed_at       = EXCLUDED.confirmed_at,
        checklist_completed = EXCLUDED.checklist_completed;

    -- ── 8. PRE-POBLAR REDIS (autorización del tracker) ──────────────────────
    -- Esto normalmente lo hace EventsService.rsvp(), pero para dev local
    -- ejecutamos directamente para no depender del backend NestJS corriendo
    -- cuando ejecutamos este seed.
    PERFORM pg_notify('redis_sync', format(
        'SADD event:%s:members %s %s',
        v_event_id::TEXT, v_admin_id::TEXT, v_rider2_id::TEXT
    ));

    RAISE NOTICE '✅ Rodada test creada: evento=%, rider2=%, admin=%', v_event_id, v_rider2_id, v_admin_id;
END $$;
