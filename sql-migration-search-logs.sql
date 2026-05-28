-- ════════════════════════════════════════════════════════════
-- Migration : Analytics des recherches de trajets
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ride_search_logs (
  id            BIGSERIAL PRIMARY KEY,
  from_city     TEXT,
  to_city       TEXT,
  from_norm     TEXT,                          -- normalisé (lowercase, sans accent)
  to_norm       TEXT,
  results_count INTEGER NOT NULL DEFAULT 0,
  user_id       UUID,                          -- nullable (recherches anonymes OK)
  ip_hash       TEXT,                          -- SHA256 tronqué (RGPD-friendly, anti-dédup)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_searchlogs_from ON ride_search_logs(from_norm, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_searchlogs_to   ON ride_search_logs(to_norm, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_searchlogs_date ON ride_search_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_searchlogs_zero ON ride_search_logs(from_norm, to_norm) WHERE results_count = 0;

-- Permettre l'insertion publique (les recherches anonymes doivent être loggées)
ALTER TABLE ride_search_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS searchlogs_insert ON ride_search_logs;
CREATE POLICY searchlogs_insert ON ride_search_logs
  FOR INSERT WITH CHECK (true);

-- Seul admin peut lire
DROP POLICY IF EXISTS searchlogs_admin_read ON ride_search_logs;
CREATE POLICY searchlogs_admin_read ON ride_search_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
