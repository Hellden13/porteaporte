-- ============================================================
-- MIGRATION GAMIFICATION COVOITURAGE — PorteàPorte
-- Tables : badges, missions, XP, profil covoiturage étendu
-- Ordre  : CREATE TABLES → ENABLE RLS → DROP POLICIES →
--          CREATE POLICIES → SEED DATA → INDEXES
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. EXTENSION PROFIL — colonnes covoiturage
-- ────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_role           TEXT CHECK (cov_role IN ('conducteur','passager','les_deux'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_vehicule_type  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_places         INTEGER DEFAULT 2;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_coffre         TEXT CHECK (cov_coffre IN ('petit','moyen','grand'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_animaux        BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_bagages        BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_arrets         BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_nonsmoker      BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_femmes         BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_enfant         BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_accessible     BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_regles_perso   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_pax_bagage     BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_pax_animal     BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_pax_arret      BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_pax_accessible BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_pax_notes      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_xp             INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_level          INTEGER DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_total_rides    INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_rating_avg     NUMERIC(3,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cov_rating_count   INTEGER DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- 2. TABLES
-- ────────────────────────────────────────────────────────────

-- Catalogue de badges covoiturage
CREATE TABLE IF NOT EXISTS cov_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '🏅',
  description TEXT,
  condition   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Badges gagnés par utilisateur
CREATE TABLE IF NOT EXISTS user_cov_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES cov_badges(id) ON DELETE CASCADE,
  earned_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

-- Catalogue de missions covoiturage
CREATE TABLE IF NOT EXISTS cov_missions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  icon         TEXT DEFAULT '🎯',
  target       INTEGER NOT NULL DEFAULT 1,
  xp_reward    INTEGER NOT NULL DEFAULT 50,
  badge_slug   TEXT REFERENCES cov_badges(slug) ON DELETE SET NULL,
  role_filter  TEXT CHECK (role_filter IN ('conducteur','passager','les_deux','all')) DEFAULT 'all',
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Progression des missions par utilisateur
CREATE TABLE IF NOT EXISTS user_cov_missions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mission_id   UUID NOT NULL REFERENCES cov_missions(id) ON DELETE CASCADE,
  progress     INTEGER DEFAULT 0,
  done         BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, mission_id)
);

-- Log XP covoiturage
CREATE TABLE IF NOT EXISTS cov_xp_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref_id     UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Avis covoiturage
CREATE TABLE IF NOT EXISTS cov_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     UUID REFERENCES rides(id) ON DELETE SET NULL,
  booking_id  UUID REFERENCES ride_bookings(id) ON DELETE SET NULL,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewed_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (booking_id, reviewer_id)
);

-- ────────────────────────────────────────────────────────────
-- 3. ENABLE RLS
-- ────────────────────────────────────────────────────────────

ALTER TABLE cov_badges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cov_badges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cov_missions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cov_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cov_xp_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cov_reviews       ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 4. DROP POLICIES
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cov_badges_public_read"         ON cov_badges;
DROP POLICY IF EXISTS "cov_badges_admin_all"           ON cov_badges;
DROP POLICY IF EXISTS "user_cov_badges_own_read"       ON user_cov_badges;
DROP POLICY IF EXISTS "user_cov_badges_admin_all"      ON user_cov_badges;
DROP POLICY IF EXISTS "cov_missions_public_read"       ON cov_missions;
DROP POLICY IF EXISTS "cov_missions_admin_all"         ON cov_missions;
DROP POLICY IF EXISTS "user_cov_missions_own_read"     ON user_cov_missions;
DROP POLICY IF EXISTS "user_cov_missions_admin_all"    ON user_cov_missions;
DROP POLICY IF EXISTS "cov_xp_log_own_read"            ON cov_xp_log;
DROP POLICY IF EXISTS "cov_xp_log_admin_all"           ON cov_xp_log;
DROP POLICY IF EXISTS "cov_reviews_public_read"        ON cov_reviews;
DROP POLICY IF EXISTS "cov_reviews_own_insert"         ON cov_reviews;
DROP POLICY IF EXISTS "cov_reviews_admin_all"          ON cov_reviews;

-- ────────────────────────────────────────────────────────────
-- 5. CREATE POLICIES
-- ────────────────────────────────────────────────────────────

CREATE POLICY "cov_badges_public_read"    ON cov_badges FOR SELECT USING (true);
CREATE POLICY "cov_badges_admin_all"      ON cov_badges FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "user_cov_badges_own_read"  ON user_cov_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_cov_badges_admin_all" ON user_cov_badges FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "cov_missions_public_read"  ON cov_missions FOR SELECT USING (active = true);
CREATE POLICY "cov_missions_admin_all"    ON cov_missions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "user_cov_missions_own_read" ON user_cov_missions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_cov_missions_admin_all" ON user_cov_missions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "cov_xp_log_own_read"      ON cov_xp_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cov_xp_log_admin_all"     ON cov_xp_log FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "cov_reviews_public_read"  ON cov_reviews FOR SELECT USING (true);
CREATE POLICY "cov_reviews_own_insert"   ON cov_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "cov_reviews_admin_all"    ON cov_reviews FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ────────────────────────────────────────────────────────────
-- 6. SEED — Badges
-- ────────────────────────────────────────────────────────────

INSERT INTO cov_badges (slug, name, icon, description, condition) VALUES
  ('nouveau_covoitureur',   'Nouveau covoitureur',      '🌱', 'Premier compte covoiturage créé',            'Créer un profil covoiturage'),
  ('conducteur_verifie',    'Conducteur vérifié',       '✅', 'Profil et véhicule validés',                 'Profil conducteur complété'),
  ('passager_fiable',       'Passager fiable',          '🧑‍🤝‍🧑','Jamais annulé à moins de 24h',               '5 réservations sans annulation tardive'),
  ('premier_trajet_utile',  'Premier trajet utile',     '🚗', 'Premier covoiturage complété',               'Compléter son premier trajet'),
  ('auto_pleine',           'Auto pleine',              '🎯', 'Véhicule complet au départ',                 'Publier un trajet qui se remplit à 100%'),
  ('eco_route',             'Éco-route',                '🌿', '50 km+ avec au moins 2 passagers',           'Trajet 50km+ avec 2 passagers min.'),
  ('fiable_sur_route',      'Fiable sur la route',      '⏱️', '5 trajets sans retard',                     '5 trajets sans retard signalé'),
  ('coup_de_main_local',    'Coup de main local',       '🤝', 'Aide communautaire proactive',               'Mission aide communautaire complétée'),
  ('ambassadeur',           'Ambassadeur PorteÀPorte',  '⭐', '10 trajets complétés, note 4,8+',            '10 trajets + note ≥ 4.8'),
  ('connecteur_regional',   'Connecteur régional',      '🗺️', 'Trajets interrégionaux Québec',              'Trajet interrégional complété'),
  ('trajet_solidaire',      'Trajet solidaire',         '❤️', 'Aide proactive à la communauté',             'Mission solidarité complétée'),
  ('groupe_optimise',       'Groupe optimisé',          '🏆', 'Auto pleine 3 fois consécutives',            '3 trajets complets de suite'),
  ('grand_trajet',          'Grand explorateur',        '🏔️', '3 trajets de plus de 200 km',               '3 trajets 200km+ complétés'),
  ('capitaine_regional',    'Capitaine régional',       '🎖️', 'Niveau maximum atteint — 2000+ XP',         'Atteindre 2000 XP covoiturage')
ON CONFLICT (slug) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 7. SEED — Missions
-- ────────────────────────────────────────────────────────────

INSERT INTO cov_missions (slug, name, description, icon, target, xp_reward, badge_slug, role_filter) VALUES
  ('premier_trajet',      'Premier trajet partagé',       'Complétez votre tout premier trajet en covoiturage.',                          '🚗', 1,  50,  'premier_trajet_utile', 'all'),
  ('trajet_complet',      'Trajet complet',               'Publiez un trajet qui se remplit à 100%.',                                     '🎯', 1,  100, 'auto_pleine',          'conducteur'),
  ('eco_route',           'Éco-route',                    'Complétez un trajet de 50 km+ avec au moins 2 passagers.',                     '🌿', 1,  150, 'eco_route',            'conducteur'),
  ('ponctualite',         'Ponctualité',                  '5 trajets consécutifs sans retard signalé.',                                   '⏱️', 5,  200, 'fiable_sur_route',     'all'),
  ('aide_communautaire',  'Aide communautaire',           'Aidez une personne âgée, un étudiant ou quelqu'un sans véhicule.',             '🤝', 1,  180, 'coup_de_main_local',   'conducteur'),
  ('route_regionale',     'Route régionale',              'Complétez un trajet interrégional au Québec (Qc–Lévis, Qc–Mtl, région éloignée).', '🗺️', 1, 120, 'connecteur_regional', 'all'),
  ('ambassadeur',         'Ambassadeur local',            '10 trajets complétés avec une note de 4,8 et plus.',                          '⭐', 10, 300, 'ambassadeur',          'all'),
  ('grand_explorateur',   'Grand explorateur',            '3 trajets de plus de 200 km complétés.',                                      '🏔️', 3,  250, 'grand_trajet',         'all'),
  ('groupe_optimise',     'Groupe optimisé',              'Auto pleine 3 fois consécutives.',                                            '🏆', 3,  220, 'groupe_optimise',      'conducteur'),
  ('cinq_trajets',        '5 trajets complétés',          'Complétez 5 trajets en covoiturage.',                                         '🔢', 5,  100, NULL,                   'all'),
  ('dix_trajets',         '10 trajets complétés',         'Complétez 10 trajets en covoiturage.',                                        '🔟', 10, 200, NULL,                   'all'),
  ('premier_avis',        'Premier avis laissé',          'Laissez votre premier avis après un trajet.',                                  '💬', 1,  30,  NULL,                   'all')
ON CONFLICT (slug) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 8. INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_cov_badges_user   ON user_cov_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cov_badges_badge  ON user_cov_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_cov_missions_user ON user_cov_missions(user_id);
CREATE INDEX IF NOT EXISTS idx_cov_xp_log_user        ON cov_xp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_cov_reviews_reviewed   ON cov_reviews(reviewed_id);
CREATE INDEX IF NOT EXISTS idx_cov_reviews_ride       ON cov_reviews(ride_id);

-- ────────────────────────────────────────────────────────────
-- 9. TRIGGER updated_at sur user_cov_missions
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS user_cov_missions_updated_at ON user_cov_missions;
CREATE TRIGGER user_cov_missions_updated_at
  BEFORE UPDATE ON user_cov_missions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
