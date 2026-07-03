-- PostGIS: coordenadas geográficas, ST_DWithin, GEOGRAPHY type
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- uuid_generate_v4() — alternativa a gen_random_uuid() de pg 13+
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_trgm: búsqueda de texto aproximado (útil para buscar talleres por nombre)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==========================================
-- 0. EXTENSIONES REQUERIDAS
-- ==========================================
-- Habilita funciones espaciales para GEOGRAPHY
CREATE EXTENSION IF NOT EXISTS postgis;
-- Habilita gen_random_uuid() (opcional en Postgres 13+, pero buena práctica)
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
    'off_road',     -- Ajustado a snake_case
    'viaje_largo'   -- Ajustado a snake_case
);

CREATE TYPE event_status AS ENUM (
    'borrador',
    'proximo',      -- Sin tilde
    'en_curso',     -- Ajustado a snake_case
    'completado',
    'cancelado'
);

CREATE TYPE alert_type AS ENUM (
    'pinchazo',
    'sin_gasolina', -- Ajustado a snake_case
    'falla_mecanica', -- Sin tilde, snake_case
    'accidente',
    'medica',       -- Sin tilde
    'otro'
);

CREATE TYPE alert_status AS ENUM (
    'activa',
    'en_atencion',  -- Sin tilde, snake_case
    'resuelta'
);

CREATE TYPE maintenance_type AS ENUM (
    'aceite',
    'llantas',
    'cadena',
    'frenos',
    'filtros',
    'revision_general', -- Ajustado a snake_case
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
    'llanteria',    -- Sin tilde
    'gasolinera',
    'grua',         -- Sin tilde
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
    fcm_token          TEXT,  -- Añadido para notificaciones push
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

CREATE TABLE club_positions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    icon        VARCHAR(10),
    sort_order  SMALLINT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ==========================================
-- 2b. CLUBS Y MEMBRESÍAS (Nivel 0 - requerido por el resto del schema)
-- ==========================================

CREATE TABLE clubs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(200) NOT NULL,
    slug               VARCHAR(100) UNIQUE NOT NULL,
    description        TEXT,
    city               VARCHAR(100),
    department         VARCHAR(100),
    nit                VARCHAR(50),
    billing_address    VARCHAR(250),
    billing_phone      VARCHAR(50),
    billing_contact_name VARCHAR(120),
    billing_contact_email VARCHAR(200),
    tax_regime         VARCHAR(30) DEFAULT 'simplificado',
    logo_url           TEXT,
    plan_id            VARCHAR(50) DEFAULT 'prueba',
    is_active          BOOLEAN DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
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

CREATE INDEX idx_club_members_club ON club_members(club_id);
CREATE INDEX idx_club_members_user ON club_members(user_id);

-- ==========================================
-- 3. TABLAS DEPENDIENTES NIVEL 1
-- ==========================================

CREATE TABLE motorcycles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    difficulty      route_difficulty NOT NULL,
    distance_km     NUMERIC(8,2),
    estimated_time  VARCHAR(30),
    elevation_min   INT,
    elevation_max   INT,
    geojson         JSONB,
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
CREATE INDEX idx_support_location ON support_points USING GIST(location);


-- ==========================================
-- 4. TABLAS DEPENDIENTES NIVEL 2
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
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id         UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name             VARCHAR(200),
    location         GEOGRAPHY(POINT, 4326) NOT NULL,
    type             waypoint_type NOT NULL,
    estimated_arrival VARCHAR(10),
    notes            TEXT,
    sort_order       SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_waypoints_route ON route_waypoints(route_id);
CREATE INDEX idx_waypoints_location ON route_waypoints USING GIST(location);

CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    date            DATE NOT NULL,
    time            TIME NOT NULL,
    difficulty      route_difficulty NOT NULL,
    route_id        UUID REFERENCES routes(id) ON DELETE SET NULL,
    status          event_status NOT NULL DEFAULT 'borrador',
    max_attendees   SMALLINT,
    min_rider_level rider_level DEFAULT 'novato',
    meeting_point   VARCHAR(300),
    organizer_id    UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ==========================================
-- 5. TABLAS DEPENDIENTES NIVEL 3 (Operativas de Eventos)
-- ==========================================

CREATE TABLE event_attendees (
    event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ride_role          VARCHAR(50) NOT NULL DEFAULT 'rider',
    checklist_completed BOOLEAN DEFAULT FALSE,
    confirmed_at       TIMESTAMPTZ,
    PRIMARY KEY (event_id, user_id)
);
CREATE UNIQUE INDEX idx_one_puntero_per_event ON event_attendees (event_id) WHERE ride_role = 'puntero';
CREATE UNIQUE INDEX idx_one_barredora_per_event ON event_attendees (event_id) WHERE ride_role = 'barredora';

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
CREATE INDEX idx_club_ride_roles_club ON club_ride_roles(club_id, sort_order);

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
CREATE INDEX idx_sos_location ON sos_alerts USING GIST(location);
CREATE INDEX idx_sos_status ON sos_alerts(status) WHERE status = 'activa';