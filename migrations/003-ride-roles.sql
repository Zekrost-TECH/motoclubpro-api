-- Migration: Dynamic ride roles per club
-- Project: MotoClubPro by Zekrost
-- Run this manually against existing PostgreSQL instances

BEGIN;

-- 1. Create per-club ride roles table
CREATE TABLE IF NOT EXISTS club_ride_roles (
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

-- 2. Convert event_attendees.ride_role from enum to varchar
-- Existing data is compatible because slugs are the same as enum values
ALTER TABLE event_attendees
    ALTER COLUMN ride_role DROP DEFAULT,
    ALTER COLUMN ride_role TYPE VARCHAR(50) USING ride_role::text;

-- 3. Remove hardcoded partial unique indexes for puntero/barredora
DROP INDEX IF EXISTS idx_one_puntero_per_event;
DROP INDEX IF EXISTS idx_one_barredora_per_event;

-- 4. Seed default roles for every existing club (if not already present)
INSERT INTO club_ride_roles (club_id, slug, name, is_unique, sort_order)
SELECT c.id, r.slug, r.name, r.is_unique, r.sort_order
FROM clubs c
CROSS JOIN (
    VALUES
        ('puntero', 'Puntero', true, 1),
        ('barredora', 'Barredora', true, 2),
        ('capitan_ruta', 'Capitán de ruta', false, 3),
        ('bloqueador', 'Bloqueador', false, 4),
        ('cierre_seguridad', 'Cierre / Seguridad', false, 5),
        ('jefe_armas', 'Jefe de armas', false, 6),
        ('primeros_auxilios', 'Primeros auxilios', false, 7),
        ('coordinador_logistico', 'Coordinador logístico', false, 8),
        ('comunicador', 'Comunicador', false, 9),
        ('rider', 'Piloto', false, 10)
) AS r(slug, name, is_unique, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM club_ride_roles x WHERE x.club_id = c.id AND x.slug = r.slug
);

-- 5. Set default for new rows referencing the club's generic rider role
ALTER TABLE event_attendees
    ALTER COLUMN ride_role SET DEFAULT 'rider';

-- 6. Recreate unique indexes for currently known unique roles (puntero, barredora)
-- These prevent duplicates at the database level. If a club changes its unique roles,
-- the application layer enforces uniqueness before insert/update and the index should be recreated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_unique_puntero
ON event_attendees (event_id, ride_role)
WHERE ride_role = 'puntero';

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_unique_barredora
ON event_attendees (event_id, ride_role)
WHERE ride_role = 'barredora';

COMMIT;
