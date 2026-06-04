-- ════════════════════════════════════════════════════════════════
-- Migration : Redistribution de la commission COVOITURAGE
-- À exécuter dans Supabase → SQL Editor
-- Le conducteur garde déjà sa part (transfert Stripe existant).
-- Ici on configure SEULEMENT où va la commission plateforme.
-- ════════════════════════════════════════════════════════════════

-- 1) Colonne JSON pour les postes de redistribution
ALTER TABLE impact_settings
  ADD COLUMN IF NOT EXISTS ride_redistribution jsonb;

-- 2) Valeurs de départ (postes modifiables ensuite depuis le hub admin)
--    total = 100% de la commission plateforme covoiturage
UPDATE impact_settings
SET ride_redistribution = '[
  {"key":"operations","label":"Frais & opérations","emoji":"⚙️","pct":30},
  {"key":"securite","label":"Fond de sécurité","emoji":"🛡️","pct":35},
  {"key":"dons","label":"Dons organismes","emoji":"❤️","pct":25},
  {"key":"developpeur","label":"Développeur","emoji":"💻","pct":10}
]'::jsonb
WHERE id = 'default'
  AND ride_redistribution IS NULL;

-- 3) Vérification
SELECT id, ride_redistribution FROM impact_settings WHERE id = 'default';
