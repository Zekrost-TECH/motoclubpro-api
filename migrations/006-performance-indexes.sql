-- Migration: Performance indexes for frequent filters and FKs
-- Project: BikerOS by Zekrost
-- Run this manually against your PostgreSQL instance

BEGIN;

-- events(club_id, status, date): filtro compuesto frecuente en findAll
CREATE INDEX IF NOT EXISTS idx_events_club_status_date ON events(club_id, status, date);

-- inventory_items(event_id): consultas por evento (getInventory)
CREATE INDEX IF NOT EXISTS idx_inventory_items_event ON inventory_items(event_id);

-- checklist_items(event_id): consultas por evento (getChecklist, respondChecklist)
CREATE INDEX IF NOT EXISTS idx_checklist_items_event ON checklist_items(event_id);

-- motorcycles(user_id): consultas por usuario (findMine)
CREATE INDEX IF NOT EXISTS idx_motorcycles_user ON motorcycles(user_id);

-- payment_transactions(status, wompi_transaction_id): conciliación
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status_wompi
    ON payment_transactions(status, wompi_transaction_id)
    WHERE wompi_transaction_id IS NOT NULL;

COMMIT;
