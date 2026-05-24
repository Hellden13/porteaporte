-- Migration assurance & plafond colis (Go-Live ready)
-- À exécuter dans Supabase SQL Editor une seule fois

-- 1. Ajoute les colonnes au platform_settings
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS max_colis_value_cents INTEGER DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS insurance_pct NUMERIC(5,4) DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS insurance_fund_topup_cents INTEGER DEFAULT 0;

-- 2. Initialise les valeurs par défaut sur la ligne 'default' si vides
UPDATE platform_settings
SET
  max_colis_value_cents = COALESCE(max_colis_value_cents, 25000),
  insurance_pct = COALESCE(insurance_pct, 0.02),
  insurance_fund_topup_cents = COALESCE(insurance_fund_topup_cents, 0)
WHERE id = 'default';

-- 3. Vérification
SELECT id, max_colis_value_cents, insurance_pct, insurance_fund_topup_cents
FROM platform_settings WHERE id = 'default';
