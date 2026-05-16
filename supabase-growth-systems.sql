-- ============================================================
--  PorteÀPorte — Systèmes de Croissance v2
--  Points Impact · Badges · Parrainage · Audit Logs
--  À exécuter dans Supabase SQL Editor
-- ============================================================

-- ── 1. BADGES (système universel livraison + covoiturage) ──────
CREATE TABLE IF NOT EXISTS badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  icon        text DEFAULT '🏅',
  category    text DEFAULT 'general', -- 'livraison','covoiturage','communaute','fidelite'
  points_reward integer DEFAULT 0,
  xp_reward   integer DEFAULT 0,
  condition_type  text,  -- 'deliveries_count','rating_avg','referrals_count','manual','rides_count'
  condition_value numeric DEFAULT 0,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id    uuid REFERENCES badges(id) ON DELETE CASCADE,
  granted_at  timestamptz DEFAULT now(),
  granted_by  text DEFAULT 'system',  -- 'system' | 'admin' | uuid admin
  UNIQUE(user_id, badge_id)
);

-- ── 2. PROGRAMME DE PARRAINAGE ─────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  code         text UNIQUE NOT NULL,
  created_at   timestamptz DEFAULT now(),
  total_uses   integer DEFAULT 0,
  total_rewarded integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referrals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  referee_id   uuid REFERENCES profiles(id) ON DELETE SET NULL UNIQUE,
  code         text NOT NULL,
  status       text DEFAULT 'pending', -- 'pending','rewarded','cancelled'
  action_type  text, -- 'first_delivery','first_ride'
  rewarded_at  timestamptz,
  points_granted integer DEFAULT 0,
  xp_granted   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ── 3. TRANSACTIONS XP (livraison + covoiturage fusionnés) ──────
CREATE TABLE IF NOT EXISTS xp_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  amount      integer NOT NULL,
  reason      text NOT NULL,
  ref_type    text, -- 'livraison','ride','badge','referral','mission','manual'
  ref_id      uuid,
  created_at  timestamptz DEFAULT now()
);

-- ── 4. TRANSACTIONS POINTS IMPACT (alias de porte_coins) ────────
-- On garde la table porte_coins_transactions existante.
-- On ajoute une vue pour lisibilité et compatibilité future.
CREATE OR REPLACE VIEW points_impact_transactions AS
  SELECT
    id,
    user_id,
    amount,
    reason,
    metadata,
    created_at
  FROM porte_coins_transactions;

-- ── 5. AUDIT LOG RÉCOMPENSES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      text NOT NULL,  -- 'points_grant','xp_grant','badge_grant','referral_reward','draw_entry','admin_cancel'
  points_delta integer DEFAULT 0,
  xp_delta    integer DEFAULT 0,
  ref_type    text,
  ref_id      uuid,
  admin_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cancelled   boolean DEFAULT false,
  note        text,
  created_at  timestamptz DEFAULT now()
);

-- ── 6. COLONNES PROFIL MANQUANTES ───────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp            integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_jours  integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_activity date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text;   -- code généré à l'inscription
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by   text;   -- code utilisé à l'inscription

-- ── 7. SEEDER BADGES ────────────────────────────────────────────
INSERT INTO badges (slug, name, description, icon, category, points_reward, xp_reward, condition_type, condition_value)
VALUES
  -- LIVRAISON
  ('profil_verifie',    'Profil vérifié',         'Identité confirmée — tu es digne de confiance.',          '✅', 'livraison', 25, 50,  'manual',           1),
  ('premiere_livraison','Premier trajet utile',    'Tu as complété ta première livraison.',                   '📦', 'livraison', 20, 30,  'deliveries_count', 1),
  ('livreur_fiable',    'Livreur fiable',          '10 livraisons complétées avec bonne note.',               '⭐', 'livraison', 50, 100, 'deliveries_count', 10),
  ('zero_retard',       'Zéro retard',             '5 livraisons consécutives sans retard signalé.',          '⏱️', 'livraison', 40, 80,  'manual',           5),
  ('cinq_etoiles',      'Service 5 étoiles',       'Note moyenne ≥ 4.8 sur 10 livraisons.',                   '🌟', 'livraison', 60, 120, 'rating_avg',       4.8),
  ('gros_colis',        'Transporteur de confiance','50 livraisons complétées.',                              '🚛', 'livraison', 100,200, 'deliveries_count', 50),

  -- COVOITURAGE
  ('nouveau_covoit',    'Nouveau covoitureur',     'Tu as créé ton profil covoiturage.',                      '🌱', 'covoiturage', 0, 50,   'manual',           1),
  ('premier_trajet_cov','Premier trajet partagé',  'Tu as effectué ton premier covoiturage.',                 '🚗', 'covoiturage', 20, 50,  'rides_count',      1),
  ('auto_pleine',       'Auto pleine',             'Tu as fait un trajet avec tous les sièges occupés.',      '🎯', 'covoiturage', 30, 100, 'manual',           1),
  ('eco_route',         'Éco-route',               'Trajet de 50km+ avec 2 passagers ou plus.',               '🌿', 'covoiturage', 40, 150, 'manual',           1),
  ('ambassadeur_cov',   'Ambassadeur covoiturage', '10 trajets, note 4.8+.',                                  '⭐', 'covoiturage', 75, 300, 'manual',           1),

  -- COMMUNAUTÉ
  ('trajet_solidaire',  'Trajet solidaire',        'Tu as aidé un aîné ou une personne vulnérable.',          '❤️', 'communaute', 50, 180, 'manual',           1),
  ('parrain_actif',     'Parrain actif',           'Tu as parrainé 1 ami qui a complété une action réelle.',  '🤝', 'communaute', 75, 150, 'referrals_count',  1),
  ('communaute_active', 'Communauté active',       'Tu as participé à 3 initiatives communautaires.',         '🏘️', 'communaute', 60, 200, 'manual',           3),

  -- FIDÉLITÉ
  ('pionnier',          'Pionnier',                'Tu fais partie des premiers membres de PorteÀPorte.',     '🎖️', 'fidelite', 100,100, 'manual',           1),
  ('ambassadeur_local', 'Ambassadeur local',       'Reconnnu par la communauté de ta région.',                '🗺️', 'fidelite', 80, 250, 'manual',           1),
  ('partenaire_confiance','Partenaire confiance',  'Niveau Ambassadeur ou plus, score ≥ 4.8.',                '🏆', 'fidelite', 150,400, 'manual',           1)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      points_reward = EXCLUDED.points_reward,
      xp_reward = EXCLUDED.xp_reward,
      condition_value = EXCLUDED.condition_value;

-- ── 8. RLS ──────────────────────────────────────────────────────
ALTER TABLE badges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_audit_logs ENABLE ROW LEVEL SECURITY;

-- BADGES : lecture publique des badges disponibles
DROP POLICY IF EXISTS "badges_public_read" ON badges;
CREATE POLICY "badges_public_read" ON badges FOR SELECT USING (active = true);

-- USER_BADGES : utilisateur voit ses propres badges
DROP POLICY IF EXISTS "user_badges_own_read" ON user_badges;
CREATE POLICY "user_badges_own_read" ON user_badges FOR SELECT USING (auth.uid() = user_id);

-- USER_BADGES : seul le système (service_role) peut insérer
DROP POLICY IF EXISTS "user_badges_system_insert" ON user_badges;
CREATE POLICY "user_badges_system_insert" ON user_badges FOR INSERT WITH CHECK (false);
-- Note : les badges sont accordés uniquement via service_role (API serverless)

-- REFERRAL_CODES : utilisateur voit son propre code
DROP POLICY IF EXISTS "referral_codes_own" ON referral_codes;
CREATE POLICY "referral_codes_own" ON referral_codes FOR SELECT USING (auth.uid() = user_id);

-- REFERRALS : parrain voit ses filleuls
DROP POLICY IF EXISTS "referrals_referrer_read" ON referrals;
CREATE POLICY "referrals_referrer_read" ON referrals FOR SELECT USING (auth.uid() = referrer_id);

-- XP_TRANSACTIONS : utilisateur voit ses propres XP
DROP POLICY IF EXISTS "xp_tx_own_read" ON xp_transactions;
CREATE POLICY "xp_tx_own_read" ON xp_transactions FOR SELECT USING (auth.uid() = user_id);

-- REWARD_AUDIT_LOGS : lecture admin uniquement (via service_role)
DROP POLICY IF EXISTS "reward_audit_admin" ON reward_audit_logs;
CREATE POLICY "reward_audit_admin" ON reward_audit_logs FOR SELECT USING (false);
-- Accessible seulement via service_role (API serverless)

-- ── 9. INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_badges_user    ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge   ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer  ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee   ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code      ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_xp_tx_user          ON xp_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_audit_user   ON reward_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_audit_action ON reward_audit_logs(action);

-- ── 10. FONCTION : ACCORDER DES POINTS IMPACT (service_role) ───
CREATE OR REPLACE FUNCTION grant_points_impact(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text,
  p_ref_type text DEFAULT NULL,
  p_ref_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO porte_coins_transactions(user_id, amount, reason, metadata)
  VALUES (p_user_id, p_amount, p_reason,
    jsonb_build_object('ref_type', p_ref_type, 'ref_id', p_ref_id));

  INSERT INTO reward_audit_logs(user_id, action, points_delta, ref_type, ref_id)
  VALUES (p_user_id, 'points_grant', p_amount, p_ref_type, p_ref_id);
END;
$$;

-- ── 11. FONCTION : ACCORDER XP ──────────────────────────────────
CREATE OR REPLACE FUNCTION grant_xp(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text,
  p_ref_type text DEFAULT NULL,
  p_ref_id   uuid DEFAULT NULL
)
RETURNS integer  -- retourne le nouvel XP total
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_xp integer;
  v_new_xp     integer;
BEGIN
  SELECT COALESCE(xp, 0) INTO v_current_xp FROM profiles WHERE id = p_user_id;
  v_new_xp := v_current_xp + p_amount;

  UPDATE profiles SET xp = v_new_xp WHERE id = p_user_id;

  INSERT INTO xp_transactions(user_id, amount, reason, ref_type, ref_id)
  VALUES (p_user_id, p_amount, p_reason, p_ref_type, p_ref_id);

  INSERT INTO reward_audit_logs(user_id, action, xp_delta, ref_type, ref_id)
  VALUES (p_user_id, 'xp_grant', p_amount, p_ref_type, p_ref_id);

  RETURN v_new_xp;
END;
$$;

-- ── 12. FONCTION : ACCORDER UN BADGE ────────────────────────────
CREATE OR REPLACE FUNCTION grant_badge(
  p_user_id  uuid,
  p_badge_slug text,
  p_granted_by text DEFAULT 'system'
)
RETURNS boolean  -- true = nouveau badge, false = déjà possédé
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_badge_id   uuid;
  v_points     integer;
  v_xp         integer;
  v_already    boolean;
BEGIN
  SELECT id, points_reward, xp_reward
    INTO v_badge_id, v_points, v_xp
    FROM badges WHERE slug = p_badge_slug AND active = true;

  IF v_badge_id IS NULL THEN RETURN false; END IF;

  SELECT EXISTS(SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_id = v_badge_id)
    INTO v_already;

  IF v_already THEN RETURN false; END IF;

  INSERT INTO user_badges(user_id, badge_id, granted_by)
  VALUES (p_user_id, v_badge_id, p_granted_by);

  -- Récompenses associées au badge
  IF v_points > 0 THEN
    PERFORM grant_points_impact(p_user_id, v_points, 'badge_unlock:' || p_badge_slug, 'badge', v_badge_id);
  END IF;
  IF v_xp > 0 THEN
    PERFORM grant_xp(p_user_id, v_xp, 'badge_unlock:' || p_badge_slug, 'badge', v_badge_id);
  END IF;

  INSERT INTO reward_audit_logs(user_id, action, ref_type, ref_id, note)
  VALUES (p_user_id, 'badge_grant', 'badge', v_badge_id, p_badge_slug);

  RETURN true;
END;
$$;

-- ── FIN ──────────────────────────────────────────────────────────
-- Résumé :
--   Tables créées : badges, user_badges, referral_codes, referrals, xp_transactions, reward_audit_logs
--   Vue créée : points_impact_transactions
--   Fonctions créées : grant_points_impact(), grant_xp(), grant_badge()
--   17 badges seedés (livraison + covoiturage + communauté + fidélité)
--   RLS activé sur toutes les tables — écriture UNIQUEMENT via service_role (API)
