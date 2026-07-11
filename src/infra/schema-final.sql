-- =============================================================================
-- BikerOS API — Schema final consolidado
-- Origen: src/infra/init.sql + migrations/001-multiclub-billing.sql
--         + migrations/002-support-points-city.sql + migrations/003-ride-roles.sql
--         + migrations/004-event-guests.sql
-- Notas:
--   - Solo estructura (DDL): extensiones, enums, tablas e índices.
--   - Sin sentencias UPDATE / DELETE / INSERT de datos.
--   - Los índices se agrupan al final del archivo.
-- =============================================================================

-- ==========================================
-- 0. EXTENSIONES REQUERIDAS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================
-- 1. ENUMS GLOBALES
-- ==========================================
CREATE TYPE user_role AS ENUM (
    'superadmin',
    'admin',
    'leader',
    'rider'
);

CREATE TYPE rider_level AS ENUM (
    'novato',
    'basico',
    'intermedio',
    'avanzado',
    'experto'
);

CREATE TYPE route_difficulty AS ENUM (
    'suave',
    'moderada',
    'expertos',
    'off_road',
    'viaje_largo'
);

CREATE TYPE event_status AS ENUM (
    'borrador',
    'proximo',
    'en_curso',
    'completado',
    'cancelado'
);

CREATE TYPE alert_type AS ENUM (
    'pinchazo',
    'sin_gasolina',
    'falla_mecanica',
    'accidente',
    'medica',
    'otro'
);

CREATE TYPE alert_status AS ENUM (
    'activa',
    'en_atencion',
    'resuelta'
);

CREATE TYPE maintenance_type AS ENUM (
    'aceite',
    'llantas',
    'cadena',
    'frenos',
    'filtros',
    'revision_general',
    'otro'
);

CREATE TYPE inventory_category AS ENUM (
    'herramienta',
    'seguridad',
    'comida',
    'otros'
);

CREATE TYPE support_type AS ENUM (
    'taller',
    'llanteria',
    'gasolinera',
    'grua',
    'descanso',
    'hospital'
);

CREATE TYPE waypoint_type AS ENUM (
    'inicio',
    'destino',
    'parada',
    'gasolinera',
    'restaurante'
);

CREATE TYPE guest_type AS ENUM (
    'acompañante',
    'invitado'
);

-- ==========================================
-- 2. TABLAS PRINCIPALES (Sin dependencias foráneas externas)
-- ==========================================
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(120) NOT NULL,
    nickname           VARCHAR(60),
    email              VARCHAR(200) UNIQUE NOT NULL,
    phone              VARCHAR(30),
    avatar_url         TEXT,
    avatar_initials    CHAR(2),
    role               user_role NOT NULL DEFAULT 'rider',
    rider_level        rider_level NOT NULL DEFAULT 'novato',
    password_hash      TEXT NOT NULL,
    fcm_token          TEXT,
    blood_type         VARCHAR(5),
    allergies          TEXT[],
    medical_conditions TEXT[],
    ec_name            VARCHAR(120),
    ec_phone           VARCHAR(30),
    ec_relationship    VARCHAR(60),
    join_date          DATE DEFAULT CURRENT_DATE,
    rides_completed    INT DEFAULT 0,
    total_km           NUMERIC(10,2) DEFAULT 0,
    is_active          BOOLEAN DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. CLUBS Y MEMBRESÍAS
-- ==========================================
CREATE TABLE clubs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    VARCHAR(200) NOT NULL,
    slug                    VARCHAR(100) UNIQUE NOT NULL,
    description             TEXT,
    city                    VARCHAR(100),
    department              VARCHAR(100),
    nit                     VARCHAR(50),
    billing_address         TEXT,
    billing_phone           VARCHAR(50),
    billing_contact_name    VARCHAR(120),
    billing_contact_email   VARCHAR(200),
    tax_regime              VARCHAR(30) DEFAULT 'simplificado',
    logo_url                TEXT,
    plan_id                 VARCHAR(50) DEFAULT 'prueba',
    wompi_customer_email    TEXT,
    wompi_payment_source_id TEXT,
    wompi_payment_method_type VARCHAR(20),
    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE club_positions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID REFERENCES clubs(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    icon        VARCHAR(10),
    sort_order  SMALLINT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE club_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        user_role NOT NULL DEFAULT 'rider',
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    UNIQUE (club_id, user_id)
);

-- ==========================================
-- 4. TABLAS DEPENDIENTES NIVEL 1
-- ==========================================
CREATE TABLE motorcycles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    club_id            UUID REFERENCES clubs(id),
    brand              VARCHAR(80) NOT NULL,
    model              VARCHAR(80) NOT NULL,
    year               SMALLINT NOT NULL,
    cc                 SMALLINT,
    plate              VARCHAR(20) UNIQUE NOT NULL,
    color              VARCHAR(40),
    current_km         INT DEFAULT 0,
    next_service_km    INT,
    soat_expiry        DATE,
    tech_review_expiry DATE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE routes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id         UUID REFERENCES clubs(id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    difficulty      route_difficulty NOT NULL,
    distance_km     NUMERIC(8,2),
    estimated_time  VARCHAR(30),
    elevation_min   INT,
    elevation_max   INT,
    geojson         JSONB,
    start_lat       NUMERIC(10,8),
    start_lng       NUMERIC(11,8),
    start_name      VARCHAR(200),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_positions (
    user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    position_id UUID NOT NULL UNIQUE REFERENCES club_positions(id) ON DELETE CASCADE,
    assigned_at DATE DEFAULT CURRENT_DATE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id)
);

CREATE TABLE support_points (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id      UUID REFERENCES clubs(id),
    name         VARCHAR(200) NOT NULL,
    type         support_type NOT NULL,
    city         VARCHAR(100),
    location     GEOGRAPHY(POINT, 4326) NOT NULL,
    address      TEXT,
    phone        VARCHAR(30),
    hours        VARCHAR(100),
    rating       NUMERIC(2,1) DEFAULT 0,
    review_count INT DEFAULT 0,
    verified     BOOLEAN DEFAULT FALSE,
    added_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 5. TABLAS DEPENDIENTES NIVEL 2
-- ==========================================
CREATE TABLE maintenance_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    motorcycle_id   UUID NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
    type            maintenance_type NOT NULL,
    description     TEXT,
    km              INT NOT NULL,
    date            DATE NOT NULL,
    cost            NUMERIC(12,2),
    receipt_url     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE route_waypoints (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id          UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name              VARCHAR(200),
    location          GEOGRAPHY(POINT, 4326) NOT NULL,
    type              waypoint_type NOT NULL,
    estimated_arrival VARCHAR(10),
    notes             TEXT,
    sort_order        SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id           UUID REFERENCES clubs(id),
    title             VARCHAR(200) NOT NULL,
    description       TEXT,
    date              DATE NOT NULL,
    time              TIME NOT NULL,
    difficulty        route_difficulty NOT NULL,
    route_id          UUID REFERENCES routes(id) ON DELETE SET NULL,
    status            event_status NOT NULL DEFAULT 'borrador',
    max_attendees     SMALLINT,
    min_rider_level   rider_level DEFAULT 'novato',
    meeting_point     VARCHAR(300),
    meeting_point_lat NUMERIC(10,8),
    meeting_point_lng NUMERIC(11,8),
    organizer_id      UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 6. TABLAS DEPENDIENTES NIVEL 3 (Operativas de Eventos)
-- ==========================================
CREATE TABLE event_attendees (
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ride_role           VARCHAR(50) NOT NULL DEFAULT 'rider',
    checklist_completed BOOLEAN DEFAULT FALSE,
    confirmed_at        TIMESTAMPTZ,
    PRIMARY KEY (event_id, user_id)
);

CREATE TABLE event_guests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    invited_by   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    guest_type   guest_type NOT NULL DEFAULT 'invitado',
    full_name    VARCHAR(200) NOT NULL,
    phone        VARCHAR(30),
    notes        TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (event_id, full_name)
);

CREATE TABLE club_ride_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    slug        VARCHAR(50) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    is_unique   BOOLEAN DEFAULT FALSE,
    sort_order  SMALLINT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (club_id, slug)
);

CREATE TABLE checklist_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
    label       VARCHAR(200) NOT NULL,
    required    BOOLEAN DEFAULT TRUE,
    sort_order  SMALLINT DEFAULT 0
);

CREATE TABLE checklist_responses (
    item_id  UUID NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    checked  BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (item_id, user_id, event_id)
);

CREATE TABLE inventory_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    category    inventory_category NOT NULL,
    quantity    SMALLINT DEFAULT 1,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    icon        VARCHAR(60),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sos_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID REFERENCES clubs(id),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
    type        alert_type NOT NULL,
    location    GEOGRAPHY(POINT, 4326),
    status      alert_status NOT NULL DEFAULT 'activa',
    description TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ==========================================
-- 7. BILLING / SUSCRIPCIONES
-- ==========================================
CREATE TABLE plans (
    id                  VARCHAR(20) PRIMARY KEY,
    name                VARCHAR(50) NOT NULL,
    description         TEXT,
    price_monthly_cents INT NOT NULL,
    price_yearly_cents  INT,
    max_members         INT,
    max_events_month    INT,
    overage_member_cents INT,
    features            JSONB DEFAULT '{}',
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE club_subscriptions (
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

CREATE TABLE payment_transactions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id               UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    subscription_id       UUID NOT NULL REFERENCES club_subscriptions(id),
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

CREATE TABLE club_usage (
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

-- ==========================================
-- 8. ÍNDICES (agrupados al final)
-- ==========================================
-- clubs
CREATE INDEX idx_clubs_slug ON clubs(slug);
CREATE INDEX idx_clubs_active ON clubs(is_active) WHERE is_active = TRUE;

-- club_members
CREATE INDEX idx_club_members_club ON club_members(club_id);
CREATE INDEX idx_club_members_user ON club_members(user_id);
CREATE INDEX idx_club_members_club_active ON club_members(club_id, is_active);

-- motorcycles
CREATE INDEX idx_motorcycles_club ON motorcycles(club_id);

-- routes
CREATE INDEX idx_routes_club ON routes(club_id);

-- club_positions
CREATE INDEX idx_club_positions_club ON club_positions(club_id);

-- support_points
CREATE INDEX idx_support_location ON support_points USING GIST(location);
CREATE INDEX idx_support_points_club ON support_points(club_id);

-- route_waypoints
CREATE INDEX idx_waypoints_route ON route_waypoints(route_id);
CREATE INDEX idx_waypoints_location ON route_waypoints USING GIST(location);

-- event_attendees
CREATE UNIQUE INDEX idx_event_unique_puntero
    ON event_attendees (event_id, ride_role)
    WHERE ride_role = 'puntero';

CREATE UNIQUE INDEX idx_event_unique_barredora
    ON event_attendees (event_id, ride_role)
    WHERE ride_role = 'barredora';

-- event_guests
CREATE INDEX idx_event_guests_event ON event_guests(event_id);
CREATE INDEX idx_event_guests_inviter ON event_guests(invited_by);
CREATE UNIQUE INDEX idx_one_acompanante_per_rider
    ON event_guests (event_id, invited_by)
    WHERE guest_type = 'acompañante';

-- club_ride_roles
CREATE INDEX idx_club_ride_roles_club ON club_ride_roles(club_id, sort_order);

-- sos_alerts
CREATE INDEX idx_sos_location ON sos_alerts USING GIST(location);
CREATE INDEX idx_sos_status ON sos_alerts(status) WHERE status = 'activa';
CREATE INDEX idx_sos_alerts_club ON sos_alerts(club_id);

-- events
CREATE INDEX idx_events_club ON events(club_id);

-- subscriptions
CREATE INDEX idx_subscriptions_period_end ON club_subscriptions(current_period_end, status);

-- payment_transactions
CREATE INDEX idx_payment_transactions_club ON payment_transactions(club_id, created_at DESC);
CREATE INDEX idx_payment_transactions_wompi ON payment_transactions(wompi_transaction_id);

-- club_usage
CREATE INDEX idx_club_usage_year_month ON club_usage(club_id, year_month);
