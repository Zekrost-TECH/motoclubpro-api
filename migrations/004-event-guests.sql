-- Migration: Event guests (acompañantes e invitados sin cuenta)
-- Project: BikerOS by Zekrost
-- Run this manually against existing PostgreSQL instances

BEGIN;

-- 1. Tipo de invitado
DO $$ BEGIN
    CREATE TYPE guest_type AS ENUM ('acompañante', 'invitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Registro de invitados por evento
CREATE TABLE IF NOT EXISTS event_guests (
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

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_event_guests_event
    ON event_guests(event_id);

CREATE INDEX IF NOT EXISTS idx_event_guests_inviter
    ON event_guests(invited_by);

-- 4. Un solo acompañante (parrillero) por piloto por evento
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_acompanante_per_rider
    ON event_guests (event_id, invited_by)
    WHERE guest_type = 'acompañante';

COMMIT;