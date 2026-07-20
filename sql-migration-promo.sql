-- PorteàPorte — Migration codes promotionnels
-- À exécuter dans Supabase → SQL Editor

-- ── Table codes promo ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT        NOT NULL,
  type            TEXT        NOT NULL CHECK (type IN ('fixed_price','discount_pct','discount_cad','insurance_upgrade','free_delivery')),
  value           NUMERIC(10,2) NOT NULL DEFAULT 0,
  description     TEXT,
  conditions      JSONB       NOT NULL DEFAULT '{}',
  partner_name    TEXT,
  max_uses        INTEGER,
  uses_count      INTEGER     NOT NULL DEFAULT 0,
  per_user_limit  INTEGER     NOT NULL DEFAULT 1,
  valid_from      TIMESTAMPTZ DEFAULT now(),
  valid_until     TIMESTAMPTZ,
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Index unique insensible à la casse
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code_upper ON promo_codes(UPPER(code));

-- ── Table suivi des usages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_code_uses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id   UUID        NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL,
  livraison_id    UUID,
  discount_applied NUMERIC(10,2),
  used_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_code_uses_user  ON promo_code_uses(user_id, promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_uses_promo ON promo_code_uses(promo_code_id);

-- ── RPC : incrément atomique du compteur ─────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_promo_uses(p_promo_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = p_promo_id;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE promo_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses ENABLE ROW LEVEL SECURITY;

-- Lecture publique des codes (pour validation côté API avec clé anon)
DROP POLICY IF EXISTS "promo_codes_select" ON promo_codes;
CREATE POLICY "promo_codes_select" ON promo_codes FOR SELECT USING (true);

-- Écriture réservée à l'admin (via service_role côté API, ou is_admin() côté client)
DROP POLICY IF EXISTS "promo_codes_admin" ON promo_codes;
CREATE POLICY "promo_codes_admin" ON promo_codes FOR ALL USING (public.is_admin());

-- Usages : lecture par l'utilisateur lui-même ou admin
DROP POLICY IF EXISTS "promo_code_uses_select" ON promo_code_uses;
CREATE POLICY "promo_code_uses_select" ON promo_code_uses
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- ── Code exemple (facultatif, supprimer si non voulu) ────────────────────────
INSERT INTO promo_codes (code, type, value, description, partner_name, max_uses, conditions)
VALUES (
  'INTACT2026',
  'fixed_price',
  1.00,
  'Livraison à 1 $ pour les assurés Intact',
  'Intact Assurance',
  500,
  '{"max_distance_km": 50}'
)
ON CONFLICT DO NOTHING;

-- ── Vérification ─────────────────────────────────────────────────────────────
SELECT id, code, type, value, partner_name, max_uses, active
FROM promo_codes
ORDER BY created_at DESC
LIMIT 5;
