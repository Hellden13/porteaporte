-- ============================================================
--  PorteÀPorte — Gamification Campaigns v1
--  Contrôle admin des badges saisonniers, limites, bénéfices
--  À exécuter dans Supabase SQL Editor
-- ============================================================

-- ── 1. NOUVELLES COLONNES SUR BADGES ────────────────────────────
ALTER TABLE badges ADD COLUMN IF NOT EXISTS active_from       timestamptz;   -- début fenêtre d'octroi
ALTER TABLE badges ADD COLUMN IF NOT EXISTS active_until      timestamptz;   -- fin fenêtre d'octroi
ALTER TABLE badges ADD COLUMN IF NOT EXISTS benefit_from      timestamptz;   -- début bénéfice actif
ALTER TABLE badges ADD COLUMN IF NOT EXISTS benefit_until     timestamptz;   -- fin bénéfice actif
ALTER TABLE badges ADD COLUMN IF NOT EXISTS max_recipients    integer;        -- limite destinataires (null = illimité)
ALTER TABLE badges ADD COLUMN IF NOT EXISTS seasonal_months   integer[];      -- ex: ARRAY[12] = décembre, ARRAY[10,11] = oct-nov
ALTER TABLE badges ADD COLUMN IF NOT EXISTS campaign_name     text;           -- nom affiché: 'Lancement', 'Noël 2026', etc.
ALTER TABLE badges ADD COLUMN IF NOT EXISTS role_filter       text;           -- 'expediteur','livreur',null=tous
ALTER TABLE badges ADD COLUMN IF NOT EXISTS auto_trigger      text;           -- 'signup','first_delivery','first_ride','manual','batch'
ALTER TABLE badges ADD COLUMN IF NOT EXISTS paused            boolean DEFAULT false; -- pause manuelle admin

-- ── 2. VUE : STATUT TEMPS RÉEL DES CAMPAGNES ────────────────────
CREATE OR REPLACE VIEW badge_campaign_status AS
SELECT
  b.id,
  b.slug,
  b.name,
  b.icon,
  b.category,
  b.active,
  b.paused,
  b.campaign_name,
  b.role_filter,
  b.auto_trigger,
  b.active_from,
  b.active_until,
  b.benefit_from,
  b.benefit_until,
  b.max_recipients,
  b.seasonal_months,
  b.points_reward,
  b.xp_reward,
  COALESCE(ub_count.cnt, 0) AS recipients_count,
  CASE
    WHEN b.active = false OR b.paused = true THEN 'paused'
    WHEN b.active_from IS NOT NULL AND now() < b.active_from THEN 'scheduled'
    WHEN b.active_until IS NOT NULL AND now() > b.active_until THEN 'expired'
    WHEN b.max_recipients IS NOT NULL AND COALESCE(ub_count.cnt, 0) >= b.max_recipients THEN 'full'
    ELSE 'active'
  END AS campaign_status,
  CASE
    WHEN b.seasonal_months IS NOT NULL AND (EXTRACT(MONTH FROM now()))::integer = ANY(b.seasonal_months) THEN true
    WHEN b.benefit_from IS NOT NULL AND now() BETWEEN b.benefit_from AND COALESCE(b.benefit_until, 'infinity') THEN true
    WHEN b.seasonal_months IS NULL AND b.benefit_from IS NULL THEN true
    ELSE false
  END AS benefit_active_now,
  b.created_at
FROM badges b
LEFT JOIN (
  SELECT badge_id, COUNT(*) AS cnt FROM user_badges GROUP BY badge_id
) ub_count ON ub_count.badge_id = b.id;

-- ── 3. GRANT_BADGE V2 — AVEC VÉRIFICATIONS CAMPAGNE ─────────────
-- Retourne: 'granted' | 'already_owned' | 'inactive' | 'paused' |
--           'outside_window' | 'max_reached' | 'role_mismatch'
CREATE OR REPLACE FUNCTION grant_badge_v2(
  p_user_id    uuid,
  p_badge_slug text,
  p_granted_by text DEFAULT 'system',
  p_force      boolean DEFAULT false   -- ignorer les contraintes (admin force)
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_badge      badges%ROWTYPE;
  v_count      bigint;
  v_already    boolean;
  v_now        timestamptz := now();
  v_user_role  text;
BEGIN
  SELECT * INTO v_badge FROM badges WHERE slug = p_badge_slug;
  IF v_badge.id IS NULL THEN RETURN 'inactive'; END IF;
  IF NOT p_force THEN
    IF v_badge.active = false OR v_badge.paused = true THEN RETURN 'paused'; END IF;
    -- Fenêtre d'octroi
    IF v_badge.active_from  IS NOT NULL AND v_now < v_badge.active_from  THEN RETURN 'outside_window'; END IF;
    IF v_badge.active_until IS NOT NULL AND v_now > v_badge.active_until THEN RETURN 'outside_window'; END IF;
    -- Limite destinataires
    IF v_badge.max_recipients IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM user_badges WHERE badge_id = v_badge.id;
      IF v_count >= v_badge.max_recipients THEN RETURN 'max_reached'; END IF;
    END IF;
    -- Filtre rôle
    IF v_badge.role_filter IS NOT NULL THEN
      SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;
      IF v_user_role IS DISTINCT FROM v_badge.role_filter THEN RETURN 'role_mismatch'; END IF;
    END IF;
  END IF;

  -- Doublon
  SELECT EXISTS(SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_id = v_badge.id) INTO v_already;
  IF v_already THEN RETURN 'already_owned'; END IF;

  -- Attribution
  INSERT INTO user_badges(user_id, badge_id, granted_by) VALUES (p_user_id, v_badge.id, p_granted_by);
  IF v_badge.points_reward > 0 THEN
    PERFORM grant_points_impact(p_user_id, v_badge.points_reward, 'badge_unlock:'||p_badge_slug, 'badge', v_badge.id);
  END IF;
  IF v_badge.xp_reward > 0 THEN
    PERFORM grant_xp(p_user_id, v_badge.xp_reward, 'badge_unlock:'||p_badge_slug, 'badge', v_badge.id);
  END IF;
  INSERT INTO reward_audit_logs(user_id, action, ref_type, ref_id, note)
  VALUES (p_user_id, 'badge_grant', 'badge', v_badge.id, p_badge_slug||' by '||p_granted_by);

  RETURN 'granted';
END;
$$;

-- ── 4. SEEDER BADGES DE CAMPAGNE (templates) ────────────────────
INSERT INTO badges (
  slug, name, description, icon, category,
  points_reward, xp_reward, condition_type, condition_value,
  campaign_name, role_filter, auto_trigger, max_recipients, active
) VALUES
  -- LANCEMENT — 100 premiers expéditeurs
  ('fondateur_expediteur', 'Fondateur expéditeur',
   'Parmi les 100 premiers expéditeurs à utiliser la plateforme au lancement.',
   '🚀', 'fidelite', 200, 500, 'manual', 1,
   'Lancement', 'expediteur', 'first_delivery', 100, true),

  -- LANCEMENT — 50 premiers livreurs
  ('fondateur_livreur', 'Fondateur livreur',
   'Parmi les 50 premiers livreurs à compléter une livraison.',
   '⭐', 'fidelite', 200, 500, 'manual', 1,
   'Lancement', 'livreur', 'first_delivery', 50, true),

  -- NOËL — badge saisonnier (bénéfice actif chaque décembre)
  ('esprit_noel', 'Esprit de Noël',
   'Badge spécial accordé à Noël. Son bénéfice revient chaque décembre.',
   '🎄', 'communaute', 50, 150, 'manual', 1,
   'Noël', null, 'batch', null, false),

  -- HALLOWEEN — badge saisonnier (octobre)
  ('citrouille_solidaire', 'Citrouille solidaire',
   'Badge Halloween pour les membres actifs en octobre.',
   '🎃', 'communaute', 30, 100, 'manual', 1,
   'Halloween', null, 'batch', null, false)

ON CONFLICT (slug) DO UPDATE
  SET campaign_name = EXCLUDED.campaign_name,
      role_filter   = EXCLUDED.role_filter,
      auto_trigger  = EXCLUDED.auto_trigger,
      max_recipients = EXCLUDED.max_recipients;

-- ── 5. RLS SUR LA VUE ──────────────────────────────────────────
-- La vue hérite de la RLS de badges (lecture publique des badges actifs).
-- L'admin accède via service_role (API serverless).

-- ── 6. INDEX ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_badges_campaign   ON badges(campaign_name) WHERE campaign_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_badges_active_from ON badges(active_from)  WHERE active_from IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_badges_paused      ON badges(paused)       WHERE paused = true;

-- ── FIN ──────────────────────────────────────────────────────────
-- Résumé :
--   10 nouvelles colonnes sur badges (scheduling, seasonal, limits)
--   Vue badge_campaign_status (statut temps réel)
--   Fonction grant_badge_v2() avec vérifications complètes + p_force admin
--   4 badges de campagne seedés (fondateur x2, Noël, Halloween)
