-- ============================================================================
-- SCRIPT DE SEMILLA (SEED) PARA BIKEROS
-- ============================================================================
-- Limpieza de tablas para permitir ejecuciones repetibles del seed
-- Asegurar tablas de multiclub + billing (si el volumen se recrea sin migraciones)
CREATE TABLE IF NOT EXISTS clubs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(100) UNIQUE NOT NULL,
  logo_url          TEXT,
  description       TEXT,
  city              VARCHAR(100),
  department        VARCHAR(100),
  nit               VARCHAR(20),
  billing_address   TEXT,
  billing_phone     VARCHAR(30),
  billing_contact_name    VARCHAR(120),
  billing_contact_email   VARCHAR(200),
  tax_regime        VARCHAR(20),
  wompi_customer_email    TEXT,
  wompi_payment_source_id TEXT,
  wompi_payment_method_type VARCHAR(20),
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id   UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      user_role NOT NULL DEFAULT 'rider',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS plans (
  id                VARCHAR(20) PRIMARY KEY,
  name              VARCHAR(50) NOT NULL,
  description       TEXT,
  price_monthly_cents INT NOT NULL,
  price_yearly_cents  INT,
  max_members       INT,          -- -1 = unlimited
  max_events_month  INT,          -- -1 = unlimited
  overage_member_cents INT,
  features          JSONB DEFAULT '{}',
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                 UUID NOT NULL UNIQUE REFERENCES clubs(id) ON DELETE CASCADE,
  plan_id                 VARCHAR(20) NOT NULL REFERENCES plans(id),
  status                  VARCHAR(20) DEFAULT 'trial',
  billing_cycle           VARCHAR(10) DEFAULT 'monthly',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  trial_ends_at           TIMESTAMPTZ,
  retry_count             INT DEFAULT 0,
  last_payment_attempt_at TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN DEFAULT FALSE,
  canceled_at             TIMESTAMPTZ,
  cancellation_reason     TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  subscription_id     UUID NOT NULL REFERENCES club_subscriptions(id),
  wompi_transaction_id  TEXT,
  wompi_reference       TEXT NOT NULL,
  amount_cents          INT NOT NULL,
  plan_amount_cents     INT NOT NULL,
  overage_amount_cents  INT DEFAULT 0,
  currency              VARCHAR(3) DEFAULT 'COP',
  status                VARCHAR(20),
  status_message        TEXT,
  paid_at               TIMESTAMPTZ,
  payment_method        TEXT,
  last_four             VARCHAR(4),
  invoice_generated     BOOLEAN DEFAULT FALSE,
  dian_invoice_number   TEXT,
  cufe                  TEXT,
  pdf_url               TEXT,
  retry_count           INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_usage (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  year_month            VARCHAR(7) NOT NULL,
  member_count          INT DEFAULT 0,
  event_count           INT DEFAULT 0,
  overage_members       INT DEFAULT 0,
  overage_charge_cents  INT DEFAULT 0,
  calculated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (club_id, year_month)
);

-- Agregar columnas club_id a tablas del dominio si vienen del init.sql base
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='motorcycles' AND column_name='club_id') THEN
        ALTER TABLE motorcycles ADD COLUMN club_id UUID REFERENCES clubs(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='club_id') THEN
        ALTER TABLE events ADD COLUMN club_id UUID REFERENCES clubs(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routes' AND column_name='club_id') THEN
        ALTER TABLE routes ADD COLUMN club_id UUID REFERENCES clubs(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='club_positions' AND column_name='club_id') THEN
        ALTER TABLE club_positions ADD COLUMN club_id UUID REFERENCES clubs(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sos_alerts' AND column_name='club_id') THEN
        ALTER TABLE sos_alerts ADD COLUMN club_id UUID REFERENCES clubs(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_points' AND column_name='club_id') THEN
        ALTER TABLE support_points ADD COLUMN club_id UUID REFERENCES clubs(id);
    END IF;
END $$;

TRUNCATE TABLE
plans,
    club_usage,
    payment_transactions,
    club_subscriptions,
    club_members,
    clubs,
    sos_alerts,
    inventory_items,
    checklist_responses,
    checklist_items,
    event_attendees,
    events,
    route_waypoints,
    routes,
    maintenance_history,
    motorcycles,
    support_points,
    user_positions,
    club_positions,
    users
RESTART IDENTITY CASCADE;

-- Hash de contraseña universal para pruebas: 'Password123!'
-- Generado con bcrypt (Cost 10)
DO $$
DECLARE
    pwd_hash TEXT := '$2b$10$4Wlx68JxyJ.bhr4dySxONehSp6TCYBUZaQvgpW8cDmtHNMuxQrKp2'; 
BEGIN

-- ── 1. CARGOS DEL CLUB ──────────────────────────────────────────────────────
INSERT INTO club_positions (id, name, icon, sort_order) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Presidente', '👑', 1),
    ('a0000000-0000-0000-0000-000000000002', 'Vice', '🥈', 2),
    ('a0000000-0000-0000-0000-000000000003', 'Tesorera', '💰', 3),
    ('a0000000-0000-0000-0000-000000000004', 'Redes sociales', '📱', 4),
    ('a0000000-0000-0000-0000-000000000005', 'Jefe de armas', '⚔️', 5),
    ('a0000000-0000-0000-0000-000000000006', 'Barredor', '🧹', 6),
    ('a0000000-0000-0000-0000-000000000007', 'Bloqueador', '🚧', 7);

-- ── 2. USUARIOS ─────────────────────────────────────────────────────────────
INSERT INTO users (id, name, nickname, email, phone, avatar_initials, role, rider_level, password_hash, blood_type, allergies, medical_conditions, ec_name, ec_phone, ec_relationship, rides_completed, total_km) VALUES
    -- Carlos (Admin)
    ('b0000000-0000-0000-0000-000000000001', 'Carlos Herrera', 'El Capitán', 'carlos@ironbikers.co', '+57 315 432 1098', 'CH', 'admin', 'experto', pwd_hash, 'O+', ARRAY['Penicilina'], NULL, 'María Herrera', '+57 310 876 5432', 'Esposa', 47, 8500),
    -- Andrea (Líder)
    ('b0000000-0000-0000-0000-000000000002', 'Andrea Martínez', 'La Sombra', 'andrea@ironbikers.co', '+57 300 654 3210', 'AM', 'leader', 'avanzado', pwd_hash, 'A+', NULL, ARRAY['Asma leve'], 'Luis Martínez', '+57 312 345 6789', 'Hermano', 38, 7200),
    -- Jorge
    ('b0000000-0000-0000-0000-000000000003', 'Jorge Páez', 'El Escoba', 'jorge@ironbikers.co', '+57 318 987 6543', 'JP', 'rider', 'intermedio', pwd_hash, 'B+', ARRAY['Ibuprofeno'], NULL, 'Carmen Páez', '+57 314 111 2233', 'Madre', 52, 11000),
    -- Daniela
    ('b0000000-0000-0000-0000-000000000004', 'Daniela Guzmán', 'Dani Turbo', 'daniela@ironbikers.co', '+57 301 222 3344', 'DG', 'rider', 'basico', pwd_hash, 'O-', NULL, NULL, 'Pedro Guzmán', '+57 316 444 5566', 'Padre', 21, 4500),
    -- Roberto (Líder)
    ('b0000000-0000-0000-0000-000000000005', 'Roberto Cassiani', 'Robo', 'roberto@ironbikers.co', '+57 305 555 6677', 'RC', 'leader', 'avanzado', pwd_hash, 'AB+', ARRAY['Mariscos'], ARRAY['Hipertensión controlada'], 'Lucía Cassiani', '+57 319 777 8899', 'Esposa', 14, 2800),
    -- Valentina
    ('b0000000-0000-0000-0000-000000000006', 'Valentina Orozco', 'La Flecha', 'valentina@ironbikers.co', '+57 311 888 9900', 'VO', 'rider', 'novato', pwd_hash, 'A-', NULL, NULL, 'Ana Orozco', '+57 317 000 1122', 'Hermana', 9, 1800),
    -- Miguel (Líder)
    ('b0000000-0000-0000-0000-000000000007', 'Miguel Ángel Torres', 'El Toro', 'miguel@ironbikers.co', '+57 312 111 2222', 'MT', 'leader', 'experto', pwd_hash, 'O+', NULL, NULL, 'Rosa Torres', '+57 313 333 4444', 'Madre', 88, 22000),
    -- Paola
    ('b0000000-0000-0000-0000-000000000008', 'Paola Jiménez', 'La Vikinga', 'paola@ironbikers.co', '+57 314 555 6666', 'PJ', 'rider', 'intermedio', pwd_hash, 'B-', NULL, NULL, 'Juan Jiménez', '+57 315 777 8888', 'Esposo', 31, 6400),
    -- Sofía (Admin de Cali Thunder)
    ('b0000000-0000-0000-0000-000000000009', 'Sofía Mendoza', 'La Jefa', 'sofia@calithunder.co', '+57 316 999 0000', 'SM', 'admin', 'avanzado', pwd_hash, 'O+', NULL, NULL, 'Diego Mendoza', '+57 317 111 2222', 'Hermano', 25, 5200),
    -- Superadmin (dueño de la plataforma)
    ('b0000000-0000-0000-0000-000000000000', 'Deiver Vasquez', 'Superadmin', 'deiver@admin.com', '+57 300 000 0000', 'DZ', 'superadmin', 'experto', pwd_hash, 'O+', NULL, NULL, 'Soporte', '+57 300 000 0000', 'Yo', 0, 0),
    -- Miembros genéricos para llenar Cali Thunder (plan Prueba = 15 miembros)
    ('b0000000-0000-0000-0000-000000000010', 'Alejandro Ríos', 'Alex', 'alex@calithunder.co', '+57 320 111 0001', 'AR', 'rider', 'intermedio', pwd_hash, 'A+', NULL, NULL, 'Marta Ríos', '+57 321 222 0001', 'Esposa', 12, 2400),
    ('b0000000-0000-0000-0000-000000000011', 'Beatriz Naranjo', 'Bea', 'bea@calithunder.co', '+57 320 111 0002', 'BN', 'rider', 'basico', pwd_hash, 'O+', NULL, NULL, 'Carlos Naranjo', '+57 321 222 0002', 'Padre', 8, 1600),
    ('b0000000-0000-0000-0000-000000000012', 'Camilo Soto', 'Cami', 'cami@calithunder.co', '+57 320 111 0003', 'CS', 'rider', 'novato', pwd_hash, 'B+', NULL, NULL, 'Diana Soto', '+57 321 222 0003', 'Madre', 5, 900),
    ('b0000000-0000-0000-0000-000000000013', 'Diana Vargas', 'Diana', 'diana@calithunder.co', '+57 320 111 0004', 'DV', 'rider', 'intermedio', pwd_hash, 'AB+', NULL, NULL, 'Ernesto Vargas', '+57 321 222 0004', 'Hermano', 18, 3600),
    ('b0000000-0000-0000-0000-000000000014', 'Esteban Cárdenas', 'Este', 'este@calithunder.co', '+57 320 111 0005', 'EC', 'rider', 'avanzado', pwd_hash, 'A-', NULL, NULL, 'Fernanda Cárdenas', '+57 321 222 0005', 'Esposa', 22, 4800),
    ('b0000000-0000-0000-0000-000000000015', 'Fernanda López', 'Fer', 'fer@calithunder.co', '+57 320 111 0006', 'FL', 'rider', 'basico', pwd_hash, 'O-', NULL, NULL, 'Gabriel López', '+57 321 222 0006', 'Padre', 10, 2000),
    -- Miembros adicionales para evitar membresías cruzadas entre clubes
    -- Medellín Riders
    ('b0000000-0000-0000-0000-000000000016', 'Lucía Fernández', 'Luci', 'lucia@medellin-riders.co', '+57 320 111 0007', 'LF', 'admin', 'avanzado', pwd_hash, 'A+', NULL, NULL, 'Sofía Fernández', '+57 321 222 0007', 'Hermana', 20, 4100),
    ('b0000000-0000-0000-0000-000000000017', 'Diego Ramírez', 'D-Ram', 'diego@medellin-riders.co', '+57 320 111 0008', 'DR', 'leader', 'experto', pwd_hash, 'O+', NULL, NULL, 'María Ramírez', '+57 321 222 0008', 'Esposa', 35, 7800),
    ('b0000000-0000-0000-0000-000000000018', 'Elena Gómez', 'Elen', 'elena@medellin-riders.co', '+57 320 111 0009', 'EG', 'rider', 'intermedio', pwd_hash, 'B+', NULL, NULL, 'Jorge Gómez', '+57 321 222 0009', 'Padre', 15, 3100),
    -- Bogotá Rebels
    ('b0000000-0000-0000-0000-000000000019', 'Ricardo Mendoza', 'Rich', 'ricardo@bogota-rebels.co', '+57 320 111 0010', 'RM', 'admin', 'avanzado', pwd_hash, 'O-', NULL, NULL, 'Luisa Mendoza', '+57 321 222 0010', 'Esposa', 28, 6200),
    ('b0000000-0000-0000-0000-000000000020', 'Natalia Silva', 'Nata', 'natalia@bogota-rebels.co', '+57 320 111 0011', 'NS', 'rider', 'basico', pwd_hash, 'A-', NULL, NULL, 'Diego Silva', '+57 321 222 0011', 'Hermano', 7, 1300),
    -- Cali Thunder (completar 15 miembros del plan Prueba)
    ('b0000000-0000-0000-0000-000000000021', 'Andrés Medina', 'Andres', 'andres@calithunder.co', '+57 320 111 0012', 'AM', 'rider', 'intermedio', pwd_hash, 'A+', NULL, NULL, 'Lina Medina', '+57 321 222 0012', 'Esposa', 11, 2300),
    ('b0000000-0000-0000-0000-000000000022', 'Isabel Reyes', 'Isa', 'isabel@calithunder.co', '+57 320 111 0013', 'IR', 'rider', 'basico', pwd_hash, 'O+', NULL, NULL, 'Pedro Reyes', '+57 321 222 0013', 'Padre', 6, 1200),
    ('b0000000-0000-0000-0000-000000000023', 'Martín Herrera', 'Marto', 'martin@calithunder.co', '+57 320 111 0014', 'MH', 'rider', 'avanzado', pwd_hash, 'B-', NULL, NULL, 'Ana Herrera', '+57 321 222 0014', 'Madre', 19, 3900),
    ('b0000000-0000-0000-0000-000000000024', 'Luciana Castro', 'Luchi', 'luciana@calithunder.co', '+57 320 111 0015', 'LC', 'rider', 'intermedio', pwd_hash, 'AB+', NULL, NULL, 'Hugo Castro', '+57 321 222 0015', 'Hermano', 14, 2700),
    ('b0000000-0000-0000-0000-000000000025', 'Tomás Ortega', 'Tomi', 'tomas@calithunder.co', '+57 320 111 0016', 'TO', 'rider', 'novato', pwd_hash, 'O-', NULL, NULL, 'Carla Ortega', '+57 321 222 0016', 'Esposa', 3, 600),
    ('b0000000-0000-0000-0000-000000000026', 'Paula Rivas', 'Pau', 'paula@calithunder.co', '+57 320 111 0017', 'PR', 'rider', 'basico', pwd_hash, 'A+', NULL, NULL, 'Mario Rivas', '+57 321 222 0017', 'Padre', 9, 1800),
    ('b0000000-0000-0000-0000-000000000027', 'Javier Salazar', 'Javi', 'javier@calithunder.co', '+57 320 111 0018', 'JS', 'rider', 'intermedio', pwd_hash, 'B+', NULL, NULL, 'Nora Salazar', '+57 321 222 0018', 'Madre', 13, 2900),
    ('b0000000-0000-0000-0000-000000000028', 'Carolina Mejía', 'Caro', 'caro@calithunder.co', '+57 320 111 0019', 'CM', 'rider', 'avanzado', pwd_hash, 'O+', NULL, NULL, 'Daniel Mejía', '+57 321 222 0019', 'Hermano', 17, 3500);

-- ── 3. ASIGNACIÓN DE CARGOS ─────────────────────────────────────────────────
INSERT INTO user_positions (user_id, position_id, assigned_by) VALUES
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'), -- Andrea -> Presidente
    ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001'), -- Roberto -> Vice
    ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001'); -- Miguel -> Jefe Armas

-- ── 4. MOTOCICLETAS ─────────────────────────────────────────────────────────
INSERT INTO motorcycles (id, user_id, brand, model, year, cc, plate, color, current_km, next_service_km, soat_expiry, tech_review_expiry) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'KTM', 'Duke 390', 2023, 373, 'ABC-12D', 'Naranja', 12500, 15000, '2026-11-15', '2026-08-20'),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Yamaha', 'MT-07', 2024, 689, 'DEF-34E', 'Azul', 8200, 10000, '2027-03-10', '2026-12-01'),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'Honda', 'CB 500X', 2022, 471, 'GHI-56F', 'Rojo', 22000, 25000, '2026-09-30', '2026-07-15'),
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 'Suzuki', 'V-Strom 650', 2023, 645, 'JKL-78G', 'Blanco', 9800, 12000, '2026-12-20', '2027-01-10'),
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 'Bajaj', 'Dominar 400', 2024, 373, 'MNO-90H', 'Negro', 5600, 8000, '2027-02-28', '2026-11-05'),
    ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000006', 'Kawasaki', 'Ninja 400', 2024, 399, 'PQR-12I', 'Verde', 3200, 5000, '2027-05-01', '2027-02-15'),
    ('c0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000007', 'BMW', 'R 1250 GS', 2023, 1254, 'STU-34J', 'Gris', 18000, 20000, '2026-10-15', '2026-09-01'),
    ('c0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000008', 'Royal Enfield', 'Meteor 350', 2023, 349, 'VWX-56K', 'Rojo vino', 7100, 9000, '2027-01-20', '2026-11-30');

-- ── 5. MANTENIMIENTO ────────────────────────────────────────────────────────
INSERT INTO maintenance_history (motorcycle_id, type, description, km, date, cost) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'aceite', 'Cambio aceite + filtro Motul 5100', 10000, '2026-01-15', 85000),
    ('c0000000-0000-0000-0000-000000000001', 'llantas', 'Llanta trasera Pirelli Diablo Rosso', 8500, '2025-10-20', 380000),
    ('c0000000-0000-0000-0000-000000000001', 'cadena', 'Kit arrastre DID + piñones', 7000, '2025-07-10', 220000),
    ('c0000000-0000-0000-0000-000000000001', 'revision_general', 'Revisión 5.000 km completa', 5000, '2025-03-01', 150000),
    ('c0000000-0000-0000-0000-000000000002', 'aceite', 'Cambio aceite Yamalube', 6000, '2025-12-05', 95000),
    ('c0000000-0000-0000-0000-000000000002', 'frenos', 'Pastillas delanteras Brembo', 5000, '2025-09-15', 120000),
    ('c0000000-0000-0000-0000-000000000003', 'aceite', 'Cambio aceite Honda GN4', 20000, '2026-02-10', 75000),
    ('c0000000-0000-0000-0000-000000000003', 'cadena', 'Tensión y engrase cadena', 18000, '2025-11-20', 30000),
    ('c0000000-0000-0000-0000-000000000003', 'llantas', 'Par de llantas Michelin Road 5', 15000, '2025-08-05', 650000),
    ('c0000000-0000-0000-0000-000000000003', 'revision_general', 'Revisión 10.000 km', 10000, '2025-01-15', 200000),
    ('c0000000-0000-0000-0000-000000000003', 'frenos', 'Líquido de frenos + pastillas', 12000, '2025-04-20', 160000),
    ('c0000000-0000-0000-0000-000000000004', 'aceite', 'Cambio aceite Motul 7100', 8000, '2026-01-25', 110000),
    ('c0000000-0000-0000-0000-000000000004', 'filtros', 'Filtro de aire K&N', 6000, '2025-09-10', 85000),
    ('c0000000-0000-0000-0000-000000000005', 'aceite', 'Cambio aceite Bajaj original', 4000, '2025-12-15', 60000),
    ('c0000000-0000-0000-0000-000000000006', 'revision_general', 'Revisión 1er servicio', 1000, '2025-06-10', 120000),
    ('c0000000-0000-0000-0000-000000000006', 'aceite', 'Cambio aceite Kawasaki K-Tech', 3000, '2025-12-20', 90000),
    ('c0000000-0000-0000-0000-000000000007', 'revision_general', 'Revisión 10.000 km BMW Service', 10000, '2025-05-20', 480000),
    ('c0000000-0000-0000-0000-000000000007', 'aceite', 'Aceite BMW Motorrad LS-X 10W-40', 16000, '2025-11-10', 185000),
    ('c0000000-0000-0000-0000-000000000007', 'llantas', 'Par Metzeler Karoo Street', 14000, '2025-09-05', 920000),
    ('c0000000-0000-0000-0000-000000000008', 'aceite', 'Cambio aceite 15W-50 sintético', 5000, '2025-10-30', 70000),
    ('c0000000-0000-0000-0000-000000000008', 'cadena', 'Kit cadena + piñones RK', 6000, '2025-12-01', 190000);

-- ── 6. RUTAS ────────────────────────────────────────────────────────────────
INSERT INTO routes (id, name, description, difficulty, distance_km, estimated_time, elevation_min, elevation_max, start_lat, start_lng, start_name) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'Cartagena → Volcán del Totumo', 'Ruta costera pasando por Bayunca...', 'suave', 52, '1h 30min', 2, 45, 10.3997, -75.5144, 'Centro Comercial Caribe Plaza'),
    ('d0000000-0000-0000-0000-000000000002', 'Vuelta a la Ciénaga de la Virgen', 'Circuito alrededor de la Ciénaga...', 'suave', 38, '1h 15min', 0, 15, 10.3932, -75.556, 'Parqueadero Bocagrande'),
    ('d0000000-0000-0000-0000-000000000003', 'Cartagena → San Jacinto (Sierra)', 'Ruta de montaña hacia los Montes de María...', 'expertos', 148, '4h 00min', 10, 820, 10.33, -75.41, 'Peaje Turbaco'),
    ('d0000000-0000-0000-0000-000000000004', 'Travesía Costera: Cartagena → Tolú', 'Viaje largo por la costa caribe...', 'viaje_largo', 230, '5h 30min', 0, 60, 10.3997, -75.5144, 'CC Caribe Plaza');

-- WAYPOINTS (IMPORTANTE: ST_MakePoint requiere longitud primero, luego latitud)
INSERT INTO route_waypoints (route_id, name, location, type, estimated_arrival, sort_order, notes) VALUES
    -- Ruta 1: Totumo
    ('d0000000-0000-0000-0000-000000000001', 'Centro Comercial Caribe Plaza', ST_SetSRID(ST_MakePoint(-75.5144, 10.3997), 4326), 'inicio', '07:00', 0, NULL),
    ('d0000000-0000-0000-0000-000000000001', 'Bomba Terpel Bayunca', ST_SetSRID(ST_MakePoint(-75.4215, 10.4531), 4326), 'gasolinera', '07:25', 1, NULL),
    ('d0000000-0000-0000-0000-000000000001', 'Restaurante El Kiosco', ST_SetSRID(ST_MakePoint(-75.3876, 10.5012), 4326), 'restaurante', '07:45', 2, 'Desayuno rápido'),
    ('d0000000-0000-0000-0000-000000000001', 'Volcán del Totumo', ST_SetSRID(ST_MakePoint(-75.3265, 10.6547), 4326), 'destino', '08:30', 3, NULL),
    -- Ruta 2: Cienaga
    ('d0000000-0000-0000-0000-000000000002', 'Parqueadero Bocagrande', ST_SetSRID(ST_MakePoint(-75.556, 10.3932), 4326), 'inicio', '06:30', 0, NULL),
    ('d0000000-0000-0000-0000-000000000002', 'Mirador Ciénaga', ST_SetSRID(ST_MakePoint(-75.49, 10.42), 4326), 'parada', '07:00', 1, NULL),
    ('d0000000-0000-0000-0000-000000000002', 'Bomba Biomax La Cordialidad', ST_SetSRID(ST_MakePoint(-75.47, 10.445), 4326), 'gasolinera', '07:15', 2, NULL),
    ('d0000000-0000-0000-0000-000000000002', 'Parqueadero Bocagrande', ST_SetSRID(ST_MakePoint(-75.556, 10.3932), 4326), 'destino', '07:45', 3, NULL),
    -- Ruta 3: San Jacinto
    ('d0000000-0000-0000-0000-000000000003', 'Peaje Turbaco', ST_SetSRID(ST_MakePoint(-75.41, 10.33), 4326), 'inicio', '06:00', 0, NULL),
    ('d0000000-0000-0000-0000-000000000003', 'Bomba Primax Arjona', ST_SetSRID(ST_MakePoint(-75.35, 10.26), 4326), 'gasolinera', '06:40', 1, NULL),
    ('d0000000-0000-0000-0000-000000000003', 'Mirador El Carmen', ST_SetSRID(ST_MakePoint(-75.12, 9.98), 4326), 'parada', '08:00', 2, 'Foto grupal obligatoria'),
    ('d0000000-0000-0000-0000-000000000003', 'Restaurante La Montaña', ST_SetSRID(ST_MakePoint(-75.08, 9.89), 4326), 'restaurante', '08:45', 3, NULL),
    ('d0000000-0000-0000-0000-000000000003', 'Plaza San Jacinto', ST_SetSRID(ST_MakePoint(-75.1227, 9.831), 4326), 'destino', '09:45', 4, NULL),
    -- Ruta 4: Tolú
    ('d0000000-0000-0000-0000-000000000004', 'CC Caribe Plaza', ST_SetSRID(ST_MakePoint(-75.5144, 10.3997), 4326), 'inicio', '05:30', 0, NULL),
    ('d0000000-0000-0000-0000-000000000004', 'Bomba Sincelejo', ST_SetSRID(ST_MakePoint(-75.3954, 9.3047), 4326), 'gasolinera', '08:30', 1, NULL),
    ('d0000000-0000-0000-0000-000000000004', 'Restaurante Don Pedro - Toluviejo', ST_SetSRID(ST_MakePoint(-75.58, 9.45), 4326), 'restaurante', '09:45', 2, NULL),
    ('d0000000-0000-0000-0000-000000000004', 'Malecón de Tolú', ST_SetSRID(ST_MakePoint(-75.5832, 9.5233), 4326), 'destino', '11:00', 3, NULL);

-- ── 7. EVENTOS Y LOGÍSTICA ──────────────────────────────────────────────────
INSERT INTO events (id, title, description, date, time, difficulty, route_id, status, max_attendees, min_rider_level, meeting_point, meeting_point_lat, meeting_point_lng, organizer_id) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'Rodada al Volcán del Totumo', 'Rodada dominical clásica. Salida temprana...', '2026-06-25', '07:00:00', 'suave', 'd0000000-0000-0000-0000-000000000001', 'proximo', 20, 'novato', 'Parqueadero CC Caribe Plaza', 10.3997, -75.5144, 'b0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000002', 'Travesía a San Jacinto — Solo Expertos', 'Ruta de montaña exigente por los Montes de María...', '2026-06-28', '06:00:00', 'expertos', 'd0000000-0000-0000-0000-000000000003', 'proximo', 12, 'avanzado', 'Peaje de Turbaco', 10.33, -75.41, 'b0000000-0000-0000-0000-000000000002'),
    ('e0000000-0000-0000-0000-000000000003', 'Vuelta a la Ciénaga — Rodada Fotográfica', 'Rodada tranquila alrededor de la Ciénaga...', '2026-06-20', '06:30:00', 'suave', 'd0000000-0000-0000-0000-000000000002', 'completado', 25, 'novato', 'Parqueadero Bocagrande', 10.3932, -75.556, 'b0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000004', 'Gran Travesía Costera a Tolú', 'Viaje de fin de semana completo...', '2026-07-05', '05:30:00', 'viaje_largo', 'd0000000-0000-0000-0000-000000000004', 'proximo', 15, 'intermedio', 'CC Caribe Plaza', 10.3997, -75.5144, 'b0000000-0000-0000-0000-000000000001');

INSERT INTO event_attendees (event_id, user_id, ride_role, checklist_completed, confirmed_at) VALUES
    -- Evento 1: Totumo
    ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'puntero', true, '2026-03-28'),
    ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'barredora', true, '2026-03-28'),
    ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'rider', true, '2026-03-29'),
    ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'rider', false, NULL),
    ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'rider', true, '2026-03-30'),
    -- Evento 2: San Jacinto
    ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'puntero', true, '2026-03-25'),
    ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'barredora', true, '2026-03-25'),
    ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'jefe_armas', true, '2026-03-26'),
    ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000007', 'capitan_ruta', true, '2026-03-26'),
    ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005', 'coordinador_logistico', true, '2026-03-27');

INSERT INTO inventory_items (event_id, name, category, quantity, assigned_to, icon) VALUES
    -- Evento 1
    ('e0000000-0000-0000-0000-000000000001', 'Compresor portátil', 'herramienta', 1, 'b0000000-0000-0000-0000-000000000003', 'build'),
    ('e0000000-0000-0000-0000-000000000001', 'Botiquín de primeros auxilios', 'seguridad', 1, 'b0000000-0000-0000-0000-000000000001', 'medkit'),
    ('e0000000-0000-0000-0000-000000000001', 'Kit de arrastre', 'herramienta', 1, NULL, 'link'),
    ('e0000000-0000-0000-0000-000000000001', 'Agua (paca x12)', 'comida', 2, 'b0000000-0000-0000-0000-000000000006', 'water'),
    -- Evento 2
    ('e0000000-0000-0000-0000-000000000002', 'Compresor portátil', 'herramienta', 1, 'b0000000-0000-0000-0000-000000000003', 'build'),
    ('e0000000-0000-0000-0000-000000000002', 'Botiquín completo', 'seguridad', 2, 'b0000000-0000-0000-0000-000000000002', 'medkit');

-- ── 8. ALERTAS SOS ──────────────────────────────────────────────────────────
INSERT INTO sos_alerts (id, user_id, event_id, type, location, status, description, resolved_by, created_at, resolved_at) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000003', 'pinchazo', ST_SetSRID(ST_MakePoint(-75.46, 10.42), 4326), 'resuelta', 'Llanta trasera pinchada en la vía a Bayunca', 'b0000000-0000-0000-0000-000000000003', '2026-03-22 08:30:00', '2026-03-22 09:15:00'),
    ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000003', 'sin_gasolina', ST_SetSRID(ST_MakePoint(-75.5, 10.37), 4326), 'resuelta', 'Se quedó sin gasolina cerca del anillo vial', 'b0000000-0000-0000-0000-000000000001', '2026-03-22 10:00:00', '2026-03-22 10:45:00'),
    ('f0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000006', NULL, 'falla_mecanica', ST_SetSRID(ST_MakePoint(-75.41, 10.33), 4326), 'resuelta', 'Cadena suelta en la vía Turbaco', 'b0000000-0000-0000-0000-000000000003', '2026-03-10 10:20:00', '2026-03-10 12:00:00'),
    ('f0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000008', NULL, 'falla_mecanica', ST_SetSRID(ST_MakePoint(-75.5, 10.41), 4326), 'resuelta', 'Pinchazo en llanta delantera saliendo de Bocagrande', 'b0000000-0000-0000-0000-000000000007', '2026-02-14 09:10:00', '2026-02-14 10:00:00'),
    ('f0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'sin_gasolina', ST_SetSRID(ST_MakePoint(-75.48, 10.39), 4326), 'activa', 'Reserva baja en la vía a Turbaco', NULL, '2026-06-23 15:30:00', NULL);

-- ── 9. PUNTOS DE APOYO (SOPORTE) ────────────────────────────────────────────
INSERT INTO support_points (id, name, type, city, location, address, phone, rating, review_count, verified, hours, added_by) VALUES
    ('10000000-0000-0000-0000-000000000001', 'Taller Motos El Paisa', 'taller', 'Cartagena', ST_SetSRID(ST_MakePoint(-75.51, 10.395), 4326), 'Cra 30 #45-12, Cartagena', '+57 315 111 2233', 4.7, 32, true, 'Lun-Sáb 7am-6pm', 'b0000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000002', 'Llantería Rápida Don José', 'llanteria', 'Cartagena', ST_SetSRID(ST_MakePoint(-75.52, 10.405), 4326), 'Calle 31 #25-08, Cartagena', '+57 300 444 5566', 4.3, 18, true, 'Lun-Dom 6am-8pm', 'b0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000003', 'Bomba Terpel Manga', 'gasolinera', 'Cartagena', ST_SetSRID(ST_MakePoint(-75.535, 10.41), 4326), 'Av. Pedro de Heredia, Manga', '+57 5 660 1234', 4.1, 45, true, '24 horas', 'b0000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000004', 'Grúa Express Cartagena', 'grua', 'Cartagena', ST_SetSRID(ST_MakePoint(-75.498, 10.388), 4326), 'Bosque, Transversal 54', '+57 318 777 8899', 4.5, 12, true, '24 horas', 'b0000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000005', 'Punto de Descanso Bayunca', 'descanso', 'Bayunca', ST_SetSRID(ST_MakePoint(-75.4215, 10.4531), 4326), 'Vía Bayunca, km 12', '', 3.8, 8, false, 'Libre acceso', 'b0000000-0000-0000-0000-000000000005'),
    ('10000000-0000-0000-0000-000000000006', 'Moto Repuestos Cartagena', 'taller', 'Cartagena', ST_SetSRID(ST_MakePoint(-75.54, 10.42), 4326), 'Bazurto, Calle 30', '+57 312 999 0011', 4.0, 25, true, 'Lun-Sáb 8am-5pm', 'b0000000-0000-0000-0000-000000000007');

-- ── 10. MULTI-CLUB, BILLING Y USAGE ─────────────────────────────────────────

-- Planes
-- Functional limits: max_members (-1 = unlimited), max_events_month (-1 = unlimited)
INSERT INTO plans (id, name, price_monthly_cents, price_yearly_cents, max_members, max_events_month, overage_member_cents, features) VALUES
('prueba',      'Prueba',       0,          0,           15,  5,     0,       '{"web_panel":true,"route_library":false,"advanced_routes":false,"checklist":false,"event_inventory":false,"support_points":false,"verified_support_points":false,"maintenance_history":false,"local_notifications":false,"analytics":false,"csv_export":false,"multiple_admins":false,"branding":false,"private_routes":false,"national_support_points":false,"sub_clubs":false,"simultaneous_events":false,"api_webhooks":false,"white_label":false,"priority_support":false,"unlimited":false}'::jsonb),
('esencial',    'Esencial',     7990000,    79900000,    25,  -1,    250000,  '{"web_panel":true,"route_library":true,"advanced_routes":false,"checklist":false,"event_inventory":false,"support_points":false,"verified_support_points":false,"maintenance_history":false,"local_notifications":false,"analytics":false,"csv_export":false,"multiple_admins":false,"branding":false,"private_routes":false,"national_support_points":false,"sub_clubs":false,"simultaneous_events":false,"api_webhooks":false,"white_label":false,"priority_support":false,"unlimited":false}'::jsonb),
('basico',      'Basico',       14990000,   149900000,   50,  -1,    200000,  '{"web_panel":true,"route_library":true,"advanced_routes":true,"checklist":true,"event_inventory":true,"support_points":true,"verified_support_points":true,"maintenance_history":true,"local_notifications":true,"analytics":false,"csv_export":false,"multiple_admins":false,"branding":false,"private_routes":false,"national_support_points":false,"sub_clubs":false,"simultaneous_events":false,"api_webhooks":false,"white_label":false,"priority_support":false,"unlimited":false}'::jsonb),
('pro',         'Pro',          24990000,   249900000,   100, -1,    150000,  '{"web_panel":true,"route_library":true,"advanced_routes":true,"checklist":true,"event_inventory":true,"support_points":true,"verified_support_points":true,"maintenance_history":true,"local_notifications":true,"analytics":true,"csv_export":true,"multiple_admins":true,"branding":true,"private_routes":true,"national_support_points":true,"sub_clubs":false,"simultaneous_events":false,"api_webhooks":false,"white_label":false,"priority_support":true,"unlimited":false}'::jsonb),
('empresarial', 'Empresarial',  69990000,   699900000,   250, -1,    120000,  '{"web_panel":true,"route_library":true,"advanced_routes":true,"checklist":true,"event_inventory":true,"support_points":true,"verified_support_points":true,"maintenance_history":true,"local_notifications":true,"analytics":true,"csv_export":true,"multiple_admins":true,"branding":true,"private_routes":true,"national_support_points":true,"sub_clubs":true,"simultaneous_events":true,"api_webhooks":true,"white_label":false,"priority_support":true,"unlimited":false}'::jsonb),
('elite',       'Elite',        0,          0,           -1,  -1,    0,     '{"web_panel":true,"route_library":true,"advanced_routes":true,"checklist":true,"event_inventory":true,"support_points":true,"verified_support_points":true,"maintenance_history":true,"local_notifications":true,"analytics":true,"csv_export":true,"multiple_admins":true,"branding":true,"private_routes":true,"national_support_points":true,"sub_clubs":true,"simultaneous_events":true,"api_webhooks":true,"white_label":true,"priority_support":true,"unlimited":true}'::jsonb);

-- Clubs
INSERT INTO clubs (id, name, slug, description, city, department, nit, billing_address, billing_phone, billing_contact_name, billing_contact_email, tax_regime, is_active, created_at) VALUES
('d0000000-0000-0000-0000-000000000010', 'Iron Biker''s Cartagena', 'iron-bikers-cartagena', 'Club de motociclismo de Cartagena y la región Caribe.', 'Cartagena', 'Bolívar', '900123456-7', 'Cra 15 #23-45, Cartagena', '+57 315 432 1098', 'Carlos Herrera', 'carlos@ironbikers.co', 'simplificado', TRUE, '2026-01-10 10:00:00'),
('d0000000-0000-0000-0000-000000000020', 'Medellín Riders', 'medellin-riders', 'Comunidad de motociclistas paisas.', 'Medellín', 'Antioquia', '901234567-8', 'Calle 10 #40-20, Medellín', '+57 320 111 0007', 'Lucía Fernández', 'lucia@medellin-riders.co', 'simplificado', TRUE, '2026-02-15 09:00:00'),
('d0000000-0000-0000-0000-000000000030', 'Bogotá Rebels', 'bogota-rebels', 'Motoclub urbano de Bogotá.', 'Bogotá', 'Cundinamarca', '902345678-9', 'Carrera 7 #30-15, Bogotá', '+57 320 111 0010', 'Ricardo Mendoza', 'ricardo@bogota-rebels.co', 'comun', TRUE, '2026-03-01 08:00:00'),
('d0000000-0000-0000-0000-000000000040', 'Cali Thunder', 'cali-thunder', 'Club de motociclismo de Cali con plan de prueba.', 'Cali', 'Valle del Cauca', '903456789-0', 'Av. Circunvalar #15-20, Cali', '+57 318 222 3333', 'Sofía Mendoza', 'sofia@calithunder.co', 'simplificado', TRUE, '2026-04-10 10:00:00');

-- Roles de rodada por defecto para cada club
INSERT INTO club_ride_roles (club_id, slug, name, is_unique, sort_order) VALUES
('d0000000-0000-0000-0000-000000000010', 'puntero', 'Puntero', true, 1),
('d0000000-0000-0000-0000-000000000010', 'barredora', 'Barredora', true, 2),
('d0000000-0000-0000-0000-000000000010', 'capitan_ruta', 'Capitán de ruta', false, 3),
('d0000000-0000-0000-0000-000000000010', 'bloqueador', 'Bloqueador', false, 4),
('d0000000-0000-0000-0000-000000000010', 'cierre_seguridad', 'Cierre / Seguridad', false, 5),
('d0000000-0000-0000-0000-000000000010', 'jefe_armas', 'Jefe de armas', false, 6),
('d0000000-0000-0000-0000-000000000010', 'primeros_auxilios', 'Primeros auxilios', false, 7),
('d0000000-0000-0000-0000-000000000010', 'coordinador_logistico', 'Coordinador logístico', false, 8),
('d0000000-0000-0000-0000-000000000010', 'comunicador', 'Comunicador', false, 9),
('d0000000-0000-0000-0000-000000000010', 'rider', 'Piloto', false, 10),
('d0000000-0000-0000-0000-000000000020', 'puntero', 'Puntero', true, 1),
('d0000000-0000-0000-0000-000000000020', 'barredora', 'Barredora', true, 2),
('d0000000-0000-0000-0000-000000000020', 'capitan_ruta', 'Capitán de ruta', false, 3),
('d0000000-0000-0000-0000-000000000020', 'bloqueador', 'Bloqueador', false, 4),
('d0000000-0000-0000-0000-000000000020', 'cierre_seguridad', 'Cierre / Seguridad', false, 5),
('d0000000-0000-0000-0000-000000000020', 'jefe_armas', 'Jefe de armas', false, 6),
('d0000000-0000-0000-0000-000000000020', 'primeros_auxilios', 'Primeros auxilios', false, 7),
('d0000000-0000-0000-0000-000000000020', 'coordinador_logistico', 'Coordinador logístico', false, 8),
('d0000000-0000-0000-0000-000000000020', 'comunicador', 'Comunicador', false, 9),
('d0000000-0000-0000-0000-000000000020', 'rider', 'Piloto', false, 10),
('d0000000-0000-0000-0000-000000000030', 'puntero', 'Puntero', true, 1),
('d0000000-0000-0000-0000-000000000030', 'barredora', 'Barredora', true, 2),
('d0000000-0000-0000-0000-000000000030', 'capitan_ruta', 'Capitán de ruta', false, 3),
('d0000000-0000-0000-0000-000000000030', 'bloqueador', 'Bloqueador', false, 4),
('d0000000-0000-0000-0000-000000000030', 'cierre_seguridad', 'Cierre / Seguridad', false, 5),
('d0000000-0000-0000-0000-000000000030', 'jefe_armas', 'Jefe de armas', false, 6),
('d0000000-0000-0000-0000-000000000030', 'primeros_auxilios', 'Primeros auxilios', false, 7),
('d0000000-0000-0000-0000-000000000030', 'coordinador_logistico', 'Coordinador logístico', false, 8),
('d0000000-0000-0000-0000-000000000030', 'comunicador', 'Comunicador', false, 9),
('d0000000-0000-0000-0000-000000000030', 'rider', 'Piloto', false, 10),
('d0000000-0000-0000-0000-000000000040', 'puntero', 'Puntero', true, 1),
('d0000000-0000-0000-0000-000000000040', 'barredora', 'Barredora', true, 2),
('d0000000-0000-0000-0000-000000000040', 'capitan_ruta', 'Capitán de ruta', false, 3),
('d0000000-0000-0000-0000-000000000040', 'bloqueador', 'Bloqueador', false, 4),
('d0000000-0000-0000-0000-000000000040', 'cierre_seguridad', 'Cierre / Seguridad', false, 5),
('d0000000-0000-0000-0000-000000000040', 'jefe_armas', 'Jefe de armas', false, 6),
('d0000000-0000-0000-0000-000000000040', 'primeros_auxilios', 'Primeros auxilios', false, 7),
('d0000000-0000-0000-0000-000000000040', 'coordinador_logistico', 'Coordinador logístico', false, 8),
('d0000000-0000-0000-0000-000000000040', 'comunicador', 'Comunicador', false, 9),
('d0000000-0000-0000-0000-000000000040', 'rider', 'Piloto', false, 10);

-- Miembros de Iron Biker's Cartagena (8 miembros)
INSERT INTO club_members (club_id, user_id, role, joined_at, invited_by, is_active) VALUES
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', 'admin', '2026-01-10 10:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE),
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000002', 'leader', '2026-01-12 09:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE),
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000003', 'rider', '2026-01-15 08:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE),
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000004', 'rider', '2026-01-20 08:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE),
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000005', 'leader', '2026-01-22 07:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE),
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000006', 'rider', '2026-01-25 07:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE),
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000007', 'leader', '2026-01-28 06:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE),
('d0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000008', 'rider', '2026-01-30 06:00:00', 'b0000000-0000-0000-0000-000000000001', TRUE);

-- Miembros de Medellín Riders (3 miembros)
INSERT INTO club_members (club_id, user_id, role, joined_at, invited_by, is_active) VALUES
('d0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000016', 'admin', '2026-02-15 09:00:00', 'b0000000-0000-0000-0000-000000000016', TRUE),
('d0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000017', 'leader', '2026-02-16 10:00:00', 'b0000000-0000-0000-0000-000000000016', TRUE),
('d0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000018', 'rider', '2026-02-18 08:00:00', 'b0000000-0000-0000-0000-000000000016', TRUE);

-- Miembros de Bogotá Rebels (2 miembros)
INSERT INTO club_members (club_id, user_id, role, joined_at, invited_by, is_active) VALUES
('d0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000019', 'admin', '2026-03-01 08:00:00', 'b0000000-0000-0000-0000-000000000019', TRUE),
('d0000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000020', 'rider', '2026-03-05 09:00:00', 'b0000000-0000-0000-0000-000000000019', TRUE);

-- Miembros de Cali Thunder (15 = límite del plan Prueba)
INSERT INTO club_members (club_id, user_id, role, joined_at, invited_by, is_active) VALUES
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000009', 'admin', '2026-04-10 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000010', 'rider', '2026-04-11 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000011', 'rider', '2026-04-12 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000012', 'rider', '2026-04-13 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000013', 'rider', '2026-04-14 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000014', 'rider', '2026-04-15 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000015', 'rider', '2026-04-16 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000021', 'rider', '2026-04-17 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000022', 'rider', '2026-04-18 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000023', 'rider', '2026-04-19 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000024', 'rider', '2026-04-20 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000025', 'rider', '2026-04-21 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000026', 'rider', '2026-04-22 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000027', 'rider', '2026-04-23 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE),
('d0000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000028', 'rider', '2026-04-24 10:00:00', 'b0000000-0000-0000-0000-000000000009', TRUE);

-- Suscripciones
INSERT INTO club_subscriptions (id, club_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_ends_at, created_at) VALUES
('e0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', 'pro', 'active', 'monthly', '2026-06-01 00:00:00', '2026-07-01 00:00:00', NULL, '2026-01-10 10:00:00'),
('e0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000020', 'esencial', 'active', 'monthly', '2026-06-01 00:00:00', '2026-07-01 00:00:00', NULL, '2026-02-15 09:00:00'),
('e0000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000030', 'empresarial', 'active', 'yearly', '2026-01-01 00:00:00', '2027-01-01 00:00:00', NULL, '2026-03-01 08:00:00'),
('e0000000-0000-0000-0000-000000000040', 'd0000000-0000-0000-0000-000000000040', 'prueba', 'trial', 'monthly', '2026-06-01 00:00:00', '2026-07-01 00:00:00', '2026-06-21 00:00:00', '2026-04-10 10:00:00');

-- Pagos
INSERT INTO payment_transactions (id, club_id, subscription_id, wompi_reference, amount_cents, plan_amount_cents, overage_amount_cents, currency, status, paid_at, payment_method, last_four, created_at) VALUES
('f0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000010', 'MCP-001-2026-06', 14900000, 14900000, 0, 'COP', 'approved', '2026-06-01 10:00:00', 'CARD', '4242', '2026-06-01 10:00:00'),
('f0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000030', 'e0000000-0000-0000-0000-000000000030', 'MCP-002-2026-01', 37900000, 37900000, 0, 'COP', 'approved', '2026-01-01 09:00:00', 'CARD', '0000', '2026-01-01 09:00:00'),
('f0000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000020', 'e0000000-0000-0000-0000-000000000020', 'MCP-003-2026-06', 4990000, 4990000, 0, 'COP', 'approved', '2026-06-01 09:00:00', 'CARD', '1111', '2026-06-01 09:00:00');

-- Uso mensual
INSERT INTO club_usage (club_id, year_month, member_count, event_count, overage_members, overage_charge_cents, calculated_at) VALUES
('d0000000-0000-0000-0000-000000000010', '2026-06', 8, 2, 0, 0, '2026-06-01 00:00:00'),
('d0000000-0000-0000-0000-000000000020', '2026-06', 3, 0, 0, 0, '2026-06-01 00:00:00'),
('d0000000-0000-0000-0000-000000000030', '2026-06', 2, 1, 0, 0, '2026-06-01 00:00:00'),
('d0000000-0000-0000-0000-000000000040', '2026-06', 15, 0, 0, 0, '2026-06-01 00:00:00');

-- Vincular todo el contenido base al club principal
UPDATE motorcycles SET club_id = 'd0000000-0000-0000-0000-000000000010';
UPDATE events SET club_id = 'd0000000-0000-0000-0000-000000000010';
UPDATE routes SET club_id = 'd0000000-0000-0000-0000-000000000010';
UPDATE club_positions SET club_id = 'd0000000-0000-0000-0000-000000000010';
UPDATE sos_alerts SET club_id = 'd0000000-0000-0000-0000-000000000010';
UPDATE support_points SET club_id = 'd0000000-0000-0000-0000-000000000010';

END $$;