-- Migration: Multi-club SaaS + Billing (Wompi + Alegra)
-- Project: MotoClubPro by Zekrost
-- Run this manually against your PostgreSQL instance

BEGIN;

-- ============================================================
-- 1. CLUBS
-- ============================================================

CREATE TABLE clubs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(100) UNIQUE NOT NULL,
  logo_url          TEXT,
  description       TEXT,
  city              VARCHAR(100),
  department        VARCHAR(100),
  -- Billing / DIAN data
  nit               VARCHAR(20),
  billing_address   TEXT,
  billing_phone     VARCHAR(30),
  billing_contact_name    VARCHAR(120),
  billing_contact_email   VARCHAR(200),
  tax_regime        VARCHAR(20),   -- simplificado | comun | no_responsable
  -- Wompi default
  wompi_customer_email    TEXT,
  wompi_payment_source_id TEXT,
  wompi_payment_method_type VARCHAR(20), -- CARD | NEQUI | PSE | BANCOLOMBIA
  -- Metadata
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clubs_slug ON clubs(slug);
CREATE INDEX idx_clubs_active ON clubs(is_active) WHERE is_active = TRUE;

-- ============================================================
-- 2. CLUB MEMBERS (per-club roles)
-- ============================================================

CREATE TABLE club_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id   UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      user_role NOT NULL DEFAULT 'piloto',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE (club_id, user_id)
);

CREATE INDEX idx_club_members_club ON club_members(club_id, is_active);
CREATE INDEX idx_club_members_user ON club_members(user_id);

-- ============================================================
-- 3. ADD club_id TO EXISTING DOMAIN TABLES
-- ============================================================

ALTER TABLE motorcycles ADD COLUMN club_id UUID REFERENCES clubs(id);
ALTER TABLE events      ADD COLUMN club_id UUID REFERENCES clubs(id);
ALTER TABLE routes      ADD COLUMN club_id UUID REFERENCES clubs(id);
ALTER TABLE club_positions ADD COLUMN club_id UUID REFERENCES clubs(id);
ALTER TABLE sos_alerts  ADD COLUMN club_id UUID REFERENCES clubs(id);
ALTER TABLE support_points ADD COLUMN club_id UUID REFERENCES clubs(id);

CREATE INDEX idx_motorcycles_club ON motorcycles(club_id);
CREATE INDEX idx_events_club ON events(club_id);
CREATE INDEX idx_routes_club ON routes(club_id);
CREATE INDEX idx_club_positions_club ON club_positions(club_id);
CREATE INDEX idx_sos_alerts_club ON sos_alerts(club_id);
CREATE INDEX idx_support_points_club ON support_points(club_id);

-- ============================================================
-- 4. PLANS
-- ============================================================

CREATE TABLE plans (
  id                VARCHAR(20) PRIMARY KEY,
  name              VARCHAR(50) NOT NULL,
  description       TEXT,
  price_monthly_cents INT NOT NULL,
  price_yearly_cents  INT,
  max_members       INT,
  max_events_month  INT,
  overage_member_cents INT,
  features          JSONB DEFAULT '{}',
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Seed plans (COP, net prices — Zekrost is IVA-exempt)
INSERT INTO plans (id, name, price_monthly_cents, price_yearly_cents, max_members, max_events_month, overage_member_cents, features) VALUES
('prueba',      'Prueba',       0,          0,          15,  5,    0,     '{"analytics":false,"white_label":false,"priority_support":false}'::jsonb),
('basico',      'Basico',       5900000,    59000000,   50,  NULL, 80000, '{"analytics":false,"white_label":false,"priority_support":false}'::jsonb),
('pro',         'Pro',          14900000,   149000000,  150, NULL, 50000, '{"analytics":true, "white_label":false,"priority_support":true}'::jsonb),
('empresarial', 'Empresarial',  37900000,   379000000,  500, NULL, 30000, '{"analytics":true, "white_label":true, "priority_support":true}'::jsonb);

-- ============================================================
-- 5. CLUB SUBSCRIPTIONS
-- ============================================================

CREATE TABLE club_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                 UUID NOT NULL UNIQUE REFERENCES clubs(id) ON DELETE CASCADE,
  plan_id                 VARCHAR(20) NOT NULL REFERENCES plans(id),
  status                  VARCHAR(20) DEFAULT 'trial',  -- trial | active | past_due | canceled | suspended
  billing_cycle           VARCHAR(10) DEFAULT 'monthly', -- monthly | yearly
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

CREATE INDEX idx_subscriptions_period_end ON club_subscriptions(current_period_end, status);

-- ============================================================
-- 6. PAYMENT TRANSACTIONS
-- ============================================================

CREATE TABLE payment_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  subscription_id     UUID NOT NULL REFERENCES club_subscriptions(id),
  wompi_transaction_id  TEXT,
  wompi_reference       TEXT NOT NULL,
  amount_cents          INT NOT NULL,
  plan_amount_cents     INT NOT NULL,
  overage_amount_cents  INT DEFAULT 0,
  currency              VARCHAR(3) DEFAULT 'COP',
  status                VARCHAR(20),  -- pending | approved | declined | voided | error
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

CREATE INDEX idx_payment_transactions_club ON payment_transactions(club_id, created_at DESC);
CREATE INDEX idx_payment_transactions_wompi ON payment_transactions(wompi_transaction_id);

-- ============================================================
-- 7. CLUB USAGE (monthly overage tracking)
-- ============================================================

CREATE TABLE club_usage (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  year_month            VARCHAR(7) NOT NULL,  -- "2026-06"
  member_count          INT DEFAULT 0,
  event_count           INT DEFAULT 0,
  overage_members       INT DEFAULT 0,
  overage_charge_cents  INT DEFAULT 0,
  calculated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (club_id, year_month)
);

CREATE INDEX idx_club_usage_year_month ON club_usage(club_id, year_month);

COMMIT;
