-- ═══════════════════════════════════════════════════════════════════════════
-- Rate limiting — table + RPC atomique
-- Exécuter dans Supabase → SQL Editor (une seule fois)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT        PRIMARY KEY,
  count        INTEGER     NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accès uniquement via service key (RLS bloque les appels anon/user)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Aucune politique publique → seul le service key passe (SECURITY DEFINER sur la RPC)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rate_limits' AND policyname = 'deny_all'
  ) THEN
    CREATE POLICY deny_all ON rate_limits USING (false);
  END IF;
END $$;

-- Index pour le cleanup (optionnel mais utile si la table grandit)
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);

-- ─── RPC : incrément atomique + reset fenêtre ─────────────────────────────────
-- Retourne TRUE si la requête est autorisée, FALSE si bloquée.
-- Un seul UPSERT → pas de race condition.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER   -- s'exécute avec les droits du propriétaire (service role)
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO rate_limits (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    -- Si la fenêtre a expiré : reset à 1 + nouvelle fenêtre
    -- Sinon : incrément dans la fenêtre courante
    count        = CASE
                     WHEN NOW() - rate_limits.window_start
                            > (p_window_seconds || ' seconds')::INTERVAL
                     THEN 1
                     ELSE rate_limits.count + 1
                   END,
    window_start = CASE
                     WHEN NOW() - rate_limits.window_start
                            > (p_window_seconds || ' seconds')::INTERVAL
                     THEN NOW()
                     ELSE rate_limits.window_start
                   END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- ─── RPC : nettoyage des entrées expirées (à lancer via cron ou manuellement) ──
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$;

-- ─── Vérification ─────────────────────────────────────────────────────────────
-- SELECT check_rate_limit('test:ip:1.2.3.4', 3, 60);  -- doit retourner TRUE
-- SELECT check_rate_limit('test:ip:1.2.3.4', 3, 60);  -- TRUE
-- SELECT check_rate_limit('test:ip:1.2.3.4', 3, 60);  -- TRUE
-- SELECT check_rate_limit('test:ip:1.2.3.4', 3, 60);  -- FALSE (bloqué)
-- DELETE FROM rate_limits WHERE key = 'test:ip:1.2.3.4';
