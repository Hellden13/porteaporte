-- Migration assurance + plafond colis + revenu fondateur (Go-Live ready)
-- À exécuter dans Supabase SQL Editor une seule fois
-- URL : https://supabase.com/dashboard/project/_/sql/new

-- 1. Ajoute les colonnes au platform_settings
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS max_colis_value_cents INTEGER DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS insurance_pct NUMERIC(5,4) DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS insurance_fund_topup_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS founder_revenue_pct NUMERIC(5,4) DEFAULT 0.05;

-- 2. Initialise les valeurs par défaut sur la ligne 'default' si vides
UPDATE platform_settings
SET
  max_colis_value_cents = COALESCE(max_colis_value_cents, 25000),
  insurance_pct = COALESCE(insurance_pct, 0.02),
  insurance_fund_topup_cents = COALESCE(insurance_fund_topup_cents, 0),
  founder_revenue_pct = COALESCE(founder_revenue_pct, 0.05)
WHERE id = 'default';

-- 3. Si la ligne 'default' n'existe pas, la créer
INSERT INTO platform_settings (id, max_colis_value_cents, insurance_pct, insurance_fund_topup_cents, founder_revenue_pct)
VALUES ('default', 25000, 0.02, 0, 0.05)
ON CONFLICT (id) DO NOTHING;

-- 4. Vérification
SELECT id, max_colis_value_cents, insurance_pct, insurance_fund_topup_cents, founder_revenue_pct
FROM platform_settings WHERE id = 'default';

-- 5. Diagnostic : voir tous les statuts de livraisons existants (pour comprendre où va l'argent)
SELECT statut, COUNT(*) as nb, SUM(prix_total) as total_cad
FROM livraisons
GROUP BY statut
ORDER BY nb DESC;
