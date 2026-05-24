-- Migration complete : assurance + plafond + revenu fondateur + zones bêta
-- À exécuter dans Supabase SQL Editor une seule fois
-- URL : https://supabase.com/dashboard/project/_/sql/new

-- 1. Ajoute les colonnes au platform_settings
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS max_colis_value_cents INTEGER DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS insurance_pct NUMERIC(5,4) DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS insurance_fund_topup_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS founder_revenue_pct NUMERIC(5,4) DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS beta_cities JSONB DEFAULT '["Québec", "Lévis"]'::jsonb,
  ADD COLUMN IF NOT EXISTS beta_cities_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS profit_to_insurance BOOLEAN DEFAULT true;

-- 2. Initialise les valeurs sur la ligne 'default' si vides
UPDATE platform_settings
SET
  max_colis_value_cents = COALESCE(max_colis_value_cents, 25000),
  insurance_pct = COALESCE(insurance_pct, 0.02),
  insurance_fund_topup_cents = COALESCE(insurance_fund_topup_cents, 0),
  founder_revenue_pct = COALESCE(founder_revenue_pct, 0.05),
  beta_cities = COALESCE(beta_cities, '["Québec", "Lévis"]'::jsonb),
  beta_cities_active = COALESCE(beta_cities_active, true)
WHERE id = 'default';

-- 3. Si la ligne 'default' n'existe pas, la créer
INSERT INTO platform_settings (id, max_colis_value_cents, insurance_pct, insurance_fund_topup_cents, founder_revenue_pct, beta_cities, beta_cities_active)
VALUES ('default', 25000, 0.02, 0, 0.05, '["Québec", "Lévis"]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

-- ─── Liste d'attente autres villes ───
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  ville TEXT NOT NULL,
  role TEXT DEFAULT 'expediteur',
  message TEXT,
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_waitlist_ville ON waitlist(LOWER(ville));
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);
-- RLS : personne ne peut lire la table sauf via API service key
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- 4. PROMOUVOIR ADMIN denismorneaubtc@gmail.com
INSERT INTO profiles (id, email, role, suspendu, created_at)
SELECT id, email, 'admin', false, NOW()
FROM auth.users WHERE email = 'denismorneaubtc@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET role = 'admin', suspendu = false, email = EXCLUDED.email;

-- 5. Vérifications
SELECT id, max_colis_value_cents, insurance_pct, insurance_fund_topup_cents, founder_revenue_pct, beta_cities, beta_cities_active
FROM platform_settings WHERE id = 'default';

SELECT p.id, p.email, p.role, p.suspendu
FROM profiles p WHERE p.email = 'denismorneaubtc@gmail.com';

SELECT statut, COUNT(*) as nb, SUM(prix_total) as total_cad
FROM livraisons GROUP BY statut ORDER BY nb DESC;
