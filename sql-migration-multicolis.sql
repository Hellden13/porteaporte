-- Migration : multi-colis
-- Exécuter dans Supabase SQL Editor
-- URL : https://supabase.com/dashboard/project/miqrircrfpzkmvvacgwt/sql/new

ALTER TABLE livraisons
  ADD COLUMN IF NOT EXISTS quantite_colis INTEGER DEFAULT 1;

-- Vérification
SELECT id, code, quantite_colis FROM livraisons LIMIT 3;
