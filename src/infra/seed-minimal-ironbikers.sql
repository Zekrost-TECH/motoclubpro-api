-- ============================================================================
-- SEED MÍNIMO: Iron Biker's + Deiver Vasquez
-- ============================================================================
-- Ejecutar después de init.sql y las migraciones.
-- No contiene IDs fijos: todo se genera automáticamente y se encadena con
-- variables PL/pgSQL.

DO $$
DECLARE
    -- Hash de @Deijose1230 (bcrypt, cost 10)
    pwd_hash TEXT := '$2b$10$WD.kYgd9aTMr8G3Va2LVee8pja8/9ltGhsJxOrARfxjWZzF5Tddfq';

    v_user_id          UUID;
    v_club_id          UUID;
    v_position_id      UUID;
    v_plan_id          VARCHAR(20) := 'empresarial';
    v_subscription_id  UUID;
BEGIN
    -- ── 0. ASEGURAR COLUMNAS QUE FALTAN EN INIT.SQL ──────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clubs' AND column_name = 'plan_id'
    ) THEN
        ALTER TABLE clubs ADD COLUMN plan_id VARCHAR(50) DEFAULT 'prueba';
    END IF;

    -- ── 1. CARGOS DEL CLUB ───────────────────────────────────────────────────
    INSERT INTO club_positions (name, icon, sort_order) VALUES
        ('Presidente', '👑', 1),
        ('Vice', '🥈', 2),
        ('Tesorera', '💰', 3),
        ('Redes sociales', '📱', 4),
        ('Jefe de armas', '⚔️', 5),
        ('Barredor', '🧹', 6),
        ('Bloqueador', '🚧', 7)
    ON CONFLICT (name) DO NOTHING;

    SELECT id INTO v_position_id FROM club_positions WHERE name = 'Presidente';

    -- ── 2. USUARIO ─────────────────────────────────────────────────────────
    INSERT INTO users (
        name, nickname, email, phone, avatar_initials,
        role, rider_level, password_hash, blood_type,
        rides_completed, total_km
    ) VALUES (
        'Deiver Vasquez', 'El patróm', 'deiver.vasquezm@gmail.com', '3046701922', 'DV',
        'admin', 'avanzado', pwd_hash, 'O+',
        0, 0
    )
    ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        nickname = EXCLUDED.nickname,
        phone = EXCLUDED.phone,
        password_hash = EXCLUDED.password_hash,
        blood_type = EXCLUDED.blood_type,
        role = EXCLUDED.role,
        rider_level = EXCLUDED.rider_level
    RETURNING id INTO v_user_id;

    -- ── 3. CLUB ─────────────────────────────────────────────────────────────
    INSERT INTO clubs (
        name, slug, description, city, department,
        tax_regime, is_active, plan_id
    ) VALUES (
        'Iron Biker''s', 'iron-bikers', 'Club de motociclismo Iron Biker''s.', 'Cartagena', 'Bolívar',
        'simplificado', TRUE, v_plan_id
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        city = EXCLUDED.city,
        department = EXCLUDED.department,
        tax_regime = EXCLUDED.tax_regime,
        plan_id = EXCLUDED.plan_id
    RETURNING id INTO v_club_id;

    -- ── 4. MEMBRESÍA ───────────────────────────────────────────────────────
    INSERT INTO club_members (club_id, user_id, role, is_active)
    VALUES (v_club_id, v_user_id, 'admin', TRUE)
    ON CONFLICT (club_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active;

    -- ── 5. CARGO DEL USUARIO ───────────────────────────────────────────────
    INSERT INTO user_positions (user_id, position_id, assigned_by)
    VALUES (v_user_id, v_position_id, v_user_id)
    ON CONFLICT (user_id) DO UPDATE SET
        position_id = EXCLUDED.position_id,
        assigned_by = EXCLUDED.assigned_by;

    -- ── 6. ROLES DE RODADA PARA EL CLUB ────────────────────────────────────
    INSERT INTO club_ride_roles (club_id, slug, name, is_unique, sort_order) VALUES
        (v_club_id, 'puntero', 'Puntero', true, 1),
        (v_club_id, 'barredora', 'Barredora', true, 2),
        (v_club_id, 'capitan_ruta', 'Capitán de ruta', false, 3),
        (v_club_id, 'bloqueador', 'Bloqueador', false, 4),
        (v_club_id, 'cierre_seguridad', 'Cierre / Seguridad', false, 5),
        (v_club_id, 'jefe_armas', 'Jefe de armas', false, 6),
        (v_club_id, 'primeros_auxilios', 'Primeros auxilios', false, 7),
        (v_club_id, 'coordinador_logistico', 'Coordinador logístico', false, 8),
        (v_club_id, 'comunicador', 'Comunicador', false, 9),
        (v_club_id, 'rider', 'Piloto', false, 10)
    ON CONFLICT (club_id, slug) DO NOTHING;

    -- ── 7. SUSCRIPCIÓN ───────────────────────────────────────────────────────
    INSERT INTO club_subscriptions (
        club_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end
    ) VALUES (
        v_club_id, v_plan_id, 'active', 'yearly',
        NOW(), NOW() + INTERVAL '1 year'
    )
    ON CONFLICT (club_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        billing_cycle = EXCLUDED.billing_cycle,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end
    RETURNING id INTO v_subscription_id;

    -- ── 8. USO MENSUAL INICIAL ──────────────────────────────────────────────
    INSERT INTO club_usage (club_id, year_month, member_count, event_count)
    VALUES (
        v_club_id,
        TO_CHAR(NOW(), 'YYYY-MM'),
        1,
        0
    )
    ON CONFLICT (club_id, year_month) DO UPDATE SET
        member_count = EXCLUDED.member_count,
        event_count = EXCLUDED.event_count;

    RAISE NOTICE 'Seed mínimo aplicado: usuario %, club %, subscription %', v_user_id, v_club_id, v_subscription_id;
END $$;
