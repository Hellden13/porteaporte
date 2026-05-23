-- ============================================================
-- Avis bidirectionnels PorteàPorte
-- Expéditeur ↔ Livreur, Destinataire → Livreur
-- ============================================================

-- 1. Nouvelles colonnes sur la table reviews existante
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_role TEXT DEFAULT 'expediteur'
  CHECK (reviewer_role IN ('expediteur', 'livreur', 'destinataire', 'passager', 'chauffeur'));

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewed_role TEXT DEFAULT 'livreur'
  CHECK (reviewed_role IN ('expediteur', 'livreur', 'destinataire', 'passager', 'chauffeur'));

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;

-- 2. Index d'unicité par direction (un seul avis par role par livraison)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_direction_unique
  ON reviews(delivery_id, reviewer_role)
  WHERE reviewer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_anon_destinataire
  ON reviews(delivery_id, reviewer_role)
  WHERE is_anonymous = TRUE AND reviewer_role = 'destinataire';

-- 3. Politiques RLS mises à jour
DROP POLICY IF EXISTS "avis visibles"           ON reviews;
DROP POLICY IF EXISTS "voir les avis publics"   ON reviews;
DROP POLICY IF EXISTS "expediteur laisse avis"  ON reviews;
DROP POLICY IF EXISTS "expéditeur laisse un avis" ON reviews;
DROP POLICY IF EXISTS "livreur laisse avis"     ON reviews;
DROP POLICY IF EXISTS "destinataire laisse avis" ON reviews;

-- Lecture publique
CREATE POLICY "avis visibles" ON reviews
  FOR SELECT USING (TRUE);

-- Expéditeur ou livreur authentifié peut créer un avis
CREATE POLICY "utilisateur laisse avis" ON reviews
  FOR INSERT WITH CHECK (
    auth.uid() = reviewer_id
    OR (is_anonymous = TRUE AND reviewer_role = 'destinataire')
  );

-- Admin peut tout faire
CREATE POLICY "admin avis all" ON reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin'))
  );
