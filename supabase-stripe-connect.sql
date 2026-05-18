-- ============================================================
-- PorteàPorte — Stripe Connect Express (paiements livreurs)
-- Executer dans Supabase > SQL Editor
-- ============================================================

-- ── 1. Comptes Stripe Connect des livreurs ───────────────────
CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
  user_id           UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE NOT NULL,
  status            TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','onboarding','active','restricted')),
  charges_enabled   BOOLEAN DEFAULT false,
  payouts_enabled   BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  country           TEXT DEFAULT 'CA',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stripe_connect_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sca_own_read"  ON stripe_connect_accounts;
DROP POLICY IF EXISTS "sca_admin_all" ON stripe_connect_accounts;
CREATE POLICY "sca_own_read" ON stripe_connect_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sca_admin_all" ON stripe_connect_accounts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS sca_updated_at ON stripe_connect_accounts;
CREATE TRIGGER sca_updated_at
  BEFORE UPDATE ON stripe_connect_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. Gains livreur (source de verite des revenus) ──────────
CREATE TABLE IF NOT EXISTS livreur_earnings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type        TEXT NOT NULL
                     CHECK (source_type IN ('delivery','ride','bonus','referral','adjustment')),
  source_id          UUID,
  gross_amount       NUMERIC(10,2) NOT NULL CHECK (gross_amount >= 0),
  platform_fee       NUMERIC(10,2) DEFAULT 0 CHECK (platform_fee >= 0),
  net_amount         NUMERIC(10,2) NOT NULL CHECK (net_amount >= 0),
  status             TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','available','transferred','cancelled')),
  stripe_transfer_id TEXT,
  available_after    TIMESTAMPTZ DEFAULT (now() + INTERVAL '48 hours'),
  created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE livreur_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "le_own_read"  ON livreur_earnings;
DROP POLICY IF EXISTS "le_admin_all" ON livreur_earnings;
CREATE POLICY "le_own_read" ON livreur_earnings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "le_admin_all" ON livreur_earnings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_earnings_user_status ON livreur_earnings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_earnings_source      ON livreur_earnings(source_type, source_id);

-- ── 3. Demandes de virement ───────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents       INTEGER NOT NULL CHECK (amount_cents > 0),
  currency           TEXT DEFAULT 'cad',
  status             TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','paid','failed')),
  stripe_transfer_id TEXT,
  failure_reason     TEXT,
  requested_at       TIMESTAMPTZ DEFAULT now(),
  processed_at       TIMESTAMPTZ
);

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_own_read"  ON payout_requests;
DROP POLICY IF EXISTS "pr_admin_all" ON payout_requests;
CREATE POLICY "pr_own_read" ON payout_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pr_admin_all" ON payout_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_payouts_user   ON payout_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payout_requests(status);

-- ── 4. Vue solde disponible par livreur ───────────────────────
CREATE OR REPLACE VIEW v_livreur_balance AS
SELECT
  user_id,
  COALESCE(SUM(net_amount) FILTER (WHERE status = 'available' AND available_after <= now()), 0) AS balance_available,
  COALESCE(SUM(net_amount) FILTER (WHERE status = 'pending'),   0)                              AS balance_pending,
  COALESCE(SUM(net_amount) FILTER (WHERE status = 'transferred'), 0)                            AS total_transferred,
  COALESCE(SUM(net_amount), 0)                                                                  AS total_earned
FROM livreur_earnings
GROUP BY user_id;

-- ── Verification ─────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('stripe_connect_accounts','livreur_earnings','payout_requests');