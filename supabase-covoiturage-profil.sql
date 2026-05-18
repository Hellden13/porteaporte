-- ============================================================
-- PorteàPorte — Profil chauffeur covoiturage
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- ── Table profil chauffeur ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_driver_profiles (
  user_id         UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_make    TEXT,
  vehicle_model   TEXT,
  vehicle_year    SMALLINT,
  vehicle_color   TEXT,
  vehicle_photos  JSONB    DEFAULT '[]',
  smoking_policy  TEXT     DEFAULT 'non_fumeur'
                  CHECK (smoking_policy IN ('non_fumeur','fumeur','exterieur')),
  music_policy    TEXT     DEFAULT 'selon_humeur'
                  CHECK (music_policy IN ('silence','selon_humeur','musique')),
  chat_policy     TEXT     DEFAULT 'selon_humeur'
                  CHECK (chat_policy IN ('silencieux','selon_humeur','bavard')),
  ac_available    BOOLEAN  DEFAULT false,
  perfume_free    BOOLEAN  DEFAULT false,
  bio             TEXT     CHECK (char_length(bio) <= 400),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── RLS profil chauffeur ──────────────────────────────────────
ALTER TABLE ride_driver_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rdp_public_read" ON ride_driver_profiles;
DROP POLICY IF EXISTS "rdp_own_upsert"  ON ride_driver_profiles;
DROP POLICY IF EXISTS "rdp_admin_all"   ON ride_driver_profiles;

-- Tout le monde peut lire (pour afficher dans les résultats de recherche)
CREATE POLICY "rdp_public_read" ON ride_driver_profiles
  FOR SELECT USING (true);

-- Le chauffeur peut créer/modifier son propre profil
CREATE POLICY "rdp_own_upsert" ON ride_driver_profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin
CREATE POLICY "rdp_admin_all" ON ride_driver_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Nouvelles colonnes sur la table rides ────────────────────
ALTER TABLE rides ADD COLUMN IF NOT EXISTS smoking_policy TEXT DEFAULT 'non_fumeur';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS music_policy   TEXT DEFAULT 'selon_humeur';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS chat_policy    TEXT DEFAULT 'selon_humeur';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS ac_available   BOOLEAN DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS stop_points    JSONB DEFAULT '[]';

-- Migrer les données existantes : non_smoker → smoking_policy
UPDATE rides
SET smoking_policy = CASE WHEN non_smoker THEN 'non_fumeur' ELSE 'fumeur' END
WHERE smoking_policy = 'non_fumeur';

-- ── Index pour les filtres de recherche ───────────────────────
CREATE INDEX IF NOT EXISTS idx_rides_smoking ON rides(smoking_policy);
CREATE INDEX IF NOT EXISTS idx_rides_trunk   ON rides(trunk_size);

-- ── Fonction updated_at automatique ──────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ride_driver_profiles_updated_at ON ride_driver_profiles;
CREATE TRIGGER ride_driver_profiles_updated_at
  BEFORE UPDATE ON ride_driver_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Vérification ─────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'rides'
  AND column_name IN ('smoking_policy','music_policy','chat_policy','ac_available','stop_points')
ORDER BY column_name;

SELECT COUNT(*) AS profils_chauffeurs FROM ride_driver_profiles;
