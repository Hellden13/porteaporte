-- ============================================================
-- PorteàPorte — Gamification : campagnes de badges
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- 1. Ajouter les colonnes de campagne à la table badges si elles n'existent pas
ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS campaign_name    text,
  ADD COLUMN IF NOT EXISTS role_filter      text,
  ADD COLUMN IF NOT EXISTS auto_trigger     text    DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS active_from      timestamptz,
  ADD COLUMN IF NOT EXISTS active_until     timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_from     timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_until    timestamptz,
  ADD COLUMN IF NOT EXISTS seasonal_months  integer[],
  ADD COLUMN IF NOT EXISTS max_recipients   integer,
  ADD COLUMN IF NOT EXISTS paused           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition_type   text    DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS condition_value  integer DEFAULT 1;

-- 2. Vue badge_campaign_status (utilisée par l'admin pour lister les campagnes)
CREATE OR REPLACE VIEW badge_campaign_status AS
SELECT
  b.id,
  b.slug,
  b.name,
  b.description,
  b.icon,
  b.category,
  b.points_reward,
  b.xp_reward,
  b.campaign_name,
  b.role_filter,
  b.auto_trigger,
  b.active,
  b.paused,
  b.active_from,
  b.active_until,
  b.benefit_from,
  b.benefit_until,
  b.seasonal_months,
  b.max_recipients,
  b.condition_type,
  b.condition_value,
  b.created_at,
  COALESCE(ub.total, 0) AS recipients_count,
  CASE
    WHEN b.paused THEN 'pause'
    WHEN NOT b.active THEN 'inactif'
    WHEN b.active_until IS NOT NULL AND b.active_until < now() THEN 'termine'
    WHEN b.active_from  IS NOT NULL AND b.active_from  > now() THEN 'planifie'
    ELSE 'actif'
  END AS statut
FROM badges b
LEFT JOIN (
  SELECT badge_id, COUNT(*) AS total
  FROM user_badges
  GROUP BY badge_id
) ub ON ub.badge_id = b.id;

-- 3. Badges de démarrage
INSERT INTO badges (slug, name, description, icon, category, points_reward, xp_reward, campaign_name, auto_trigger, active, paused, condition_type, condition_value)
VALUES
  ('nouveau_membre',     'Nouveau membre',         'Bienvenue dans la communauté PorteàPorte !',          '🌱', 'accueil',    50,  50,  'Onboarding',         'inscription',  true, false, 'manual', 1),
  ('profil_complet',     'Profil complet',          'Tu as rempli toutes les informations de ton profil.',  '✅', 'accueil',    75,  75,  'Onboarding',         'profil_100',   true, false, 'manual', 1),
  ('premier_envoi',      'Premier envoi',           'Tu as publié ta première demande de livraison.',      '📦', 'livraison',  100, 100, 'Premiers pas',       'livraison_1',  true, false, 'count',  1),
  ('premier_livreur',    'Premier livreur',         'Tu as effectué ta première livraison.',               '🚚', 'livraison',  100, 100, 'Premiers pas',       'livraison_1',  true, false, 'count',  1),
  ('5_livraisons',       '5 livraisons',            'Tu as réalisé 5 livraisons.',                         '🎯', 'livraison',  150, 150, 'Fidélité livreur',   'livraison_5',  true, false, 'count',  5),
  ('20_livraisons',      '20 livraisons',           'Tu as réalisé 20 livraisons.',                        '🏆', 'livraison',  300, 300, 'Fidélité livreur',   'livraison_20', true, false, 'count',  20),
  ('livreur_verifie',    'Livreur vérifié',         'Ton dossier KYC a été approuvé.',                     '🔒', 'confiance',  200, 200, 'Vérification',       'kyc_approuve', true, false, 'manual', 1),
  ('top_note',           'Top noté',                'Tu as maintenu une note de 4.8 ou plus.',             '⭐', 'excellence', 250, 250, 'Excellence',         'note_4.8',     true, false, 'manual', 1),
  ('cov_premier_trajet', 'Premier trajet cov',      'Tu as partagé ton premier trajet covoiturage.',       '🚗', 'covoiturage',100, 100, 'Covoiturage départ', 'cov_trajet_1', true, false, 'count',  1),
  ('cov_auto_pleine',    'Auto pleine',             'Tu as rempli tous les sièges disponibles.',           '🎉', 'covoiturage',200, 200, 'Covoiturage',        'cov_plein',    true, false, 'manual', 1),
  ('cov_eco_route',      'Éco-route',               'Trajet de 50 km+ avec 2 passagers ou plus.',         '🌿', 'covoiturage',300, 300, 'Covoiturage vert',   'cov_eco',      true, false, 'manual', 1),
  ('cov_ambassadeur',    'Ambassadeur covoiturage', '10 trajets avec une note de 4.8+.',                   '🎖️','covoiturage',500, 500, 'Excellence cov',     'cov_ambass',   true, false, 'manual', 1),
  ('pionnier',           'Pionnier',                'Tu fais partie des 100 premiers membres PorteàPorte.','🏅', 'communaute',500, 500, 'Lancement',          'manual',       true, false, 'manual', 1),
  ('parrain',            'Parrain actif',           'Tu as parrainé au moins 3 nouveaux membres.',         '🤝', 'communaute',300, 300, 'Parrainage',         'parrain_3',    true, false, 'count',  3),
  ('don_organisme',      'Cœur généreux',           'Tu as contribué à un organisme via PorteàPorte.',    '❤️',  'communaute',150, 150, 'Impact',             'don_1',        true, false, 'count',  1)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  description   = EXCLUDED.description,
  icon          = EXCLUDED.icon,
  campaign_name = EXCLUDED.campaign_name,
  auto_trigger  = EXCLUDED.auto_trigger;

-- 4. S'assurer que la table user_badges existe
CREATE TABLE IF NOT EXISTS user_badges (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   uuid        REFERENCES badges(id)     ON DELETE CASCADE,
  granted_at timestamptz DEFAULT now(),
  granted_by text        DEFAULT 'system',
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id  ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Fin du script
SELECT 'OK — ' || COUNT(*) || ' badges en base' AS resultat FROM badges;
