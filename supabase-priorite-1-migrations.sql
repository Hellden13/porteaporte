-- PorteaPorte - Priorite 1 Supabase
-- A executer dans Supabase Dashboard > SQL Editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS transport_mode  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS eco_bonus       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disponible      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS driver_status   TEXT    DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS streak_jours    INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name     TEXT        NOT NULL,
  last_name      TEXT        NOT NULL,
  dob            DATE        NOT NULL,
  phone          TEXT,
  address        TEXT,
  transport_mode TEXT        NOT NULL,
  eco_bonus      INTEGER     NOT NULL DEFAULT 0,
  doc_type       TEXT        NOT NULL,
  doc1_path      TEXT,
  doc2_path      TEXT,
  selfie_path    TEXT,
  statut         TEXT        NOT NULL DEFAULT 'pending',
  soumis_le      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,
  reviewer_id    UUID        REFERENCES auth.users(id),
  reject_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_submissions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_user_id_unique ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_statut  ON kyc_submissions(statut);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expediteur_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinataire_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  livraison_id    UUID,
  contenu         TEXT        NOT NULL,
  lu              BOOLEAN     NOT NULL DEFAULT FALSE,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_expediteur   ON messages(expediteur_id);
CREATE INDEX IF NOT EXISTS idx_msg_destinataire ON messages(destinataire_id);
CREATE INDEX IF NOT EXISTS idx_msg_livraison    ON messages(livraison_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint  TEXT        NOT NULL UNIQUE,
  p256dh    TEXT        NOT NULL,
  auth      TEXT        NOT NULL,
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_id UUID       REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id UUID       REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_id UUID,
  rating      INTEGER    CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS reviewed_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS delivery_id UUID,
  ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_delivery_reviewer ON reviews(delivery_id, reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_id ON reviews(reviewed_id);

CREATE TABLE IF NOT EXISTS notifications (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type     TEXT        NOT NULL,
  titre    TEXT        NOT NULL,
  corps    TEXT,
  lu       BOOLEAN     NOT NULL DEFAULT FALSE,
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, lu);

ALTER TABLE kyc_submissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "livreur voit son dossier" ON kyc_submissions;
DROP POLICY IF EXISTS "livreur soumet son dossier" ON kyc_submissions;
DROP POLICY IF EXISTS "livreur met a jour son dossier" ON kyc_submissions;
DROP POLICY IF EXISTS "admin lit dossiers kyc" ON kyc_submissions;
DROP POLICY IF EXISTS "admin modifie dossiers kyc" ON kyc_submissions;

CREATE POLICY "livreur voit son dossier" ON kyc_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "livreur soumet son dossier" ON kyc_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "livreur met a jour son dossier" ON kyc_submissions
  FOR UPDATE USING (auth.uid() = user_id AND statut IN ('pending_review', 'rejected'))
  WITH CHECK (auth.uid() = user_id AND statut IN ('pending_review', 'rejected'));

CREATE POLICY "admin lit dossiers kyc" ON kyc_submissions
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin modifie dossiers kyc" ON kyc_submissions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "lire ses messages" ON messages;
DROP POLICY IF EXISTS "envoyer un message" ON messages;
DROP POLICY IF EXISTS "marquer lu" ON messages;

CREATE POLICY "lire ses messages" ON messages
  FOR SELECT USING (auth.uid() = expediteur_id OR auth.uid() = destinataire_id);

CREATE POLICY "envoyer un message" ON messages
  FOR INSERT WITH CHECK (auth.uid() = expediteur_id);

CREATE POLICY "marquer lu" ON messages
  FOR UPDATE USING (auth.uid() = destinataire_id);

DROP POLICY IF EXISTS "livreur gere ses push" ON push_subscriptions;

CREATE POLICY "livreur gere ses push" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "avis visibles" ON reviews;
DROP POLICY IF EXISTS "expediteur laisse avis" ON reviews;

CREATE POLICY "avis visibles" ON reviews
  FOR SELECT USING (TRUE);

CREATE POLICY "expediteur laisse avis" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "user voit ses notifs" ON notifications;

CREATE POLICY "user voit ses notifs" ON notifications
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "livreur upload docs" ON storage.objects;
DROP POLICY IF EXISTS "livreur lit ses docs" ON storage.objects;
DROP POLICY IF EXISTS "livreur remplace ses docs" ON storage.objects;
DROP POLICY IF EXISTS "admin lit docs kyc" ON storage.objects;

CREATE POLICY "livreur upload docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'kyc-documents' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "livreur lit ses docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'kyc-documents' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "livreur remplace ses docs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'kyc-documents' AND auth.uid()::TEXT = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'kyc-documents' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "admin lit docs kyc" ON storage.objects
  FOR SELECT USING (bucket_id = 'kyc-documents' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Apres execution: Supabase Dashboard > Database > Replication > activer Realtime sur messages.
