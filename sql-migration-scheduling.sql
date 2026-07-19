-- Migration : livraisons programmées + disponibilité livreur
-- Exécuter dans Supabase SQL Editor
-- URL : https://supabase.com/dashboard/project/miqrircrfpzkmvvacgwt/sql/new

-- 1. Colonne date souhaitée sur les livraisons
ALTER TABLE livraisons
  ADD COLUMN IF NOT EXISTS date_souhaitee TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_window_start TIME,
  ADD COLUMN IF NOT EXISTS pickup_window_end   TIME;

CREATE INDEX IF NOT EXISTS idx_livraisons_date_souhaitee
  ON livraisons(date_souhaitee)
  WHERE date_souhaitee IS NOT NULL;

-- 2. Disponibilité livreur sur les profils
-- Format JSONB : { "asap": true } OU { "asap": false, "slots": ["lun_matin","lun_soir","ven_apres_midi"] }
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS availability_schedule JSONB DEFAULT '{"asap": true}'::jsonb;

-- Initialiser à asap:true pour les livreurs existants
UPDATE profiles
SET availability_schedule = '{"asap": true}'::jsonb
WHERE availability_schedule IS NULL
  AND role IN ('livreur', 'les deux');

-- 3. Vérifications
SELECT id, date_souhaitee, pickup_window_start FROM livraisons LIMIT 1;
SELECT id, role, availability_schedule FROM profiles WHERE role IN ('livreur','les deux') LIMIT 3;
