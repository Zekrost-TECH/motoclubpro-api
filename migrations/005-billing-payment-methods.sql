-- Migration: Billing payment methods (Wompi) — verified against sandbox 2026-08-06
-- Project: BikerOS by Zekrost
-- Run this manually against your PostgreSQL instance

BEGIN;

-- Estado de la fuente de pago Wompi (AVAILABLE | PENDING | UNAVAILABLE | DECLINED)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS wompi_payment_source_status VARCHAR(20);
-- Últimos 4 dígitos de la tarjeta (para mostrar en UI, no es PCI)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS wompi_payment_last4 VARCHAR(4);
-- Teléfono Nequi (requerido por Wompi para cobros recurrentes NEQUI)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS wompi_payment_phone VARCHAR(20);

-- Plan pendiente para downgrades (se aplica al final del período)
ALTER TABLE club_subscriptions ADD COLUMN IF NOT EXISTS pending_plan_id VARCHAR(20) REFERENCES plans(id);

-- Plan facturado por transacción (para aplicar el cambio de plan al confirmar el pago)
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS plan_id VARCHAR(20) REFERENCES plans(id);

COMMIT;
