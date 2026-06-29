-- Migration: Add city column to support_points

BEGIN;

ALTER TABLE support_points
    ADD COLUMN IF NOT EXISTS city VARCHAR(100);

ALTER TABLE support_points
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE support_points
    SET city = COALESCE(city, '');

COMMIT;
