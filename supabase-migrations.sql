-- ============================================================
-- PorteàPorte — Migrations Supabase
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Extension profiles existante : ajouter colonnes manquantes
-- ────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS transport_mode  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS eco_bonus       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disponible      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS driver_status   TEXT    DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS streak_jours    INTEGER DEFAULT 0;

-- driver_status valeurs : 'none' | 'pending_review' | 'verified' | 'rejected'

-- ────────────────────────────────────────────────────────────
-- 2. Table kyc_submissions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name    TEXT        NOT NULL,
  last_name     TEXT        NOT NULL,
  dob           DATE        NOT NULL,
  phone         TEXT,
  address       TEXT,
  transport_mode TEXT       NOT NULL,
  eco_bonus     INTEGER     NOT NULL DEFAULT 0,
  doc_type      TEXT        NOT NULL,   -- 'permis' | 'assurance_maladie_ou_passeport'
  doc1_path     TEXT,                   -- chemin dans kyc-documents bucket
  doc2_path     TEXT,                   -- recto/verso permis (null si carte maladie)
  selfie_path   TEXT,                   -- null si non requis
  statut        TEXT        NOT NULL DEFAULT 'pending',  -- 'pending'|'verified'|'rejected'
  soumis_le     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewer_id   UUID        REFERENCES auth.users(id),
  reject_reason TEXT
);

-- Index pour les requêtes admin
CREATE INDEX IF NOT EXISTS idx_kyc_user_id  ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_statut   ON kyc_submissions(statut);
CREATE INDEX IF NOT EXISTS idx_kyc_soumis   ON kyc_submissions(soumis_le DESC);

-- ────────────────────────────────────────────────────────────
-- 3. Table messages (messagerie temps réel)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expediteur_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinataire_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  livraison_id    UUID        REFERENCES livraisons(id) ON DELETE SET NULL,
  contenu         TEXT        NOT NULL,
  lu              BOOLEAN     NOT NULL DEFAULT FALSE,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_expediteur    ON messages(expediteur_id);
CREATE INDEX IF NOT EXISTS idx_msg_destinataire  ON messages(destinataire_id);
CREATE INDEX IF NOT EXISTS idx_msg_livraison     ON messages(livraison_id);
CREATE INDEX IF NOT EXISTS idx_msg_cree_le       ON messages(cree_le DESC);

-- ────────────────────────────────────────────────────────────
-- 4. Table reviews (commentaires livreurs)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  livreur_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expediteur_id UUID       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  livraison_id UUID        REFERENCES livraisons(id) ON DELETE SET NULL,
  note         INTEGER     NOT NULL CHECK (note >= 1 AND note <= 5),
  commentaire  TEXT,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_livreur ON reviews(livreur_id);

-- ────────────────────────────────────────────────────────────
-- 5. Row Level Security (RLS)
-- ────────────────────────────────────────────────────────────

-- kyc_submissions
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "livreur voit son propre dossier" ON kyc_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "livreur soumet son dossier" ON kyc_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "livreur met à jour son dossier en attente" ON kyc_submissions
  FOR UPDATE USING (auth.uid() = user_id AND statut = 'pending');

CREATE POLICY "admin lit tous les dossiers" ON kyc_submissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin approuve/rejette" ON kyc_submissions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lire ses messages" ON messages
  FOR SELECT USING (
    auth.uid() = expediteur_id OR auth.uid() = destinataire_id
  );

CREATE POLICY "envoyer un message" ON messages
  FOR INSERT WITH CHECK (auth.uid() = expediteur_id);

CREATE POLICY "marquer lu" ON messages
  FOR UPDATE USING (auth.uid() = destinataire_id);

-- reviews
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voir les avis publics" ON reviews
  FOR SELECT USING (TRUE);

CREATE POLICY "expéditeur laisse un avis" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = expediteur_id);

-- ────────────────────────────────────────────────────────────
-- 6. Realtime — activer pour messagerie
-- ────────────────────────────────────────────────────────────
-- Dans Supabase Dashboard → Database → Replication → Tables
-- Activer "messages" pour INSERT, UPDATE

-- ────────────────────────────────────────────────────────────
-- 7. Storage bucket kyc-documents
-- ────────────────────────────────────────────────────────────
-- Exécuter via Supabase Dashboard → Storage → New bucket
-- Nom: kyc-documents  |  Private: OUI (pas public)
--
-- Puis ajouter ces policies Storage :

INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', FALSE)
  ON CONFLICT (id) DO NOTHING;

-- Livreur peut uploader ses propres docs
CREATE POLICY "livreur upload ses docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'kyc-documents'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

-- Livreur peut lire ses propres docs
CREATE POLICY "livreur lit ses docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

-- Admin peut lire tous les docs
CREATE POLICY "admin lit tous les docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
