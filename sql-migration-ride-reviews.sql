-- ════════════════════════════════════════════════════════════
-- Migration : Évaluation bidirectionnelle covoiturage
-- À exécuter dans le SQL Editor Supabase
-- Date : 2026-05-27
-- ════════════════════════════════════════════════════════════

-- 1. Ajouter la colonne ride_id à la table reviews (si pas déjà présente)
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS ride_id UUID REFERENCES rides(id) ON DELETE CASCADE;

-- 2. Index pour rechercher rapidement les avis d'un trajet ou d'un user
CREATE INDEX IF NOT EXISTS idx_reviews_ride_id ON reviews(ride_id) WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_id ON reviews(reviewed_id);

-- 3. Contrainte d'unicité : un user ne peut évaluer qu'une fois la même personne pour le même trajet
DROP INDEX IF EXISTS uniq_reviews_ride_pair;
CREATE UNIQUE INDEX uniq_reviews_ride_pair
  ON reviews(ride_id, reviewer_id, reviewed_id)
  WHERE ride_id IS NOT NULL;

-- 4. Vérification : voir les avis covoit existants (devrait être 0 au début)
SELECT
  COUNT(*) FILTER (WHERE ride_id IS NOT NULL) AS avis_covoit,
  COUNT(*) FILTER (WHERE delivery_id IS NOT NULL) AS avis_livraison,
  COUNT(*) AS total
FROM reviews;
