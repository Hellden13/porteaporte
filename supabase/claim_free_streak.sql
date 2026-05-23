-- ═══════════════════════════════════════════════════════════════════════════
-- Système "Jours sans réclamation" — PorteàPorte
-- Exécuter dans Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonnes dans profiles ────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_litige_date      TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS claim_free_milestones TEXT[]      DEFAULT '{}';

-- ─── 2. RPC : enregistrer un litige sur un livreur ────────────────────────────
-- Appelée par adminDisputeAction quand statut → 'litige'
CREATE OR REPLACE FUNCTION record_driver_litige(p_driver_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET last_litige_date = NOW()
  WHERE id = p_driver_id;
END;
$$;

-- ─── 3. RPC : obtenir les jours sans réclamation + milestones ─────────────────
CREATE OR REPLACE FUNCTION get_claim_free_days(p_driver_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_litige  TIMESTAMPTZ;
  v_created_at   TIMESTAMPTZ;
  v_since        TIMESTAMPTZ;
  v_days         INTEGER;
  v_milestones   TEXT[];
  v_milestones_def JSONB := '[
    {"key":"7j",   "days":7,   "label":"Semaine propre",       "emoji":"🌱", "points":25},
    {"key":"30j",  "days":30,  "label":"Mois irréprochable",   "emoji":"⭐", "points":100},
    {"key":"90j",  "days":90,  "label":"Livreur fiable",       "emoji":"🏆", "points":250},
    {"key":"180j", "days":180, "label":"Livreur de confiance", "emoji":"💎", "points":500},
    {"key":"365j", "days":365, "label":"Livreur élite",        "emoji":"🚀", "points":1000}
  ]'::JSONB;
BEGIN
  SELECT last_litige_date, created_at, claim_free_milestones
  INTO   v_last_litige, v_created_at, v_milestones
  FROM   profiles
  WHERE  id = p_driver_id;

  -- Calcul depuis la date la plus récente : litige OU création de compte
  v_since := GREATEST(COALESCE(v_last_litige, v_created_at), v_created_at);
  v_days  := EXTRACT(EPOCH FROM (NOW() - v_since)) / 86400;
  v_days  := GREATEST(v_days, 0);

  RETURN json_build_object(
    'claim_free_days',   v_days,
    'last_litige_date',  v_last_litige,
    'since',             v_since,
    'milestones_def',    v_milestones_def,
    'milestones_reached', COALESCE(v_milestones, '{}')
  );
END;
$$;

-- ─── 4. RPC : attribuer les Points Impact pour jalons atteints ────────────────
CREATE OR REPLACE FUNCTION award_claim_free_milestone(
  p_driver_id UUID,
  p_milestone_key TEXT,
  p_points INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_milestones TEXT[];
BEGIN
  SELECT claim_free_milestones INTO v_milestones
  FROM profiles WHERE id = p_driver_id;

  -- Déjà attribué ?
  IF v_milestones @> ARRAY[p_milestone_key] THEN
    RETURN FALSE;
  END IF;

  -- Marquer comme atteint + ajouter les points
  UPDATE profiles
  SET claim_free_milestones = array_append(COALESCE(claim_free_milestones, '{}'), p_milestone_key)
  WHERE id = p_driver_id;

  INSERT INTO porte_coins_transactions (user_id, amount, reason, metadata)
  VALUES (
    p_driver_id,
    p_points,
    'claim_free_milestone',
    json_build_object('milestone', p_milestone_key, 'points', p_points)
  );

  RETURN TRUE;
END;
$$;

-- ─── 5. RPC : compteur plateforme (tous les livreurs) ─────────────────────────
CREATE OR REPLACE FUNCTION platform_claim_free_days()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_litige TIMESTAMPTZ;
  v_days        INTEGER;
BEGIN
  -- Date du dernier litige ouvert sur TOUTE la plateforme
  SELECT MAX(cree_le) INTO v_last_litige
  FROM livraisons
  WHERE statut IN ('litige', 'rembourse');

  IF v_last_litige IS NULL THEN
    -- Aucun litige depuis le début → depuis la première livraison
    SELECT MIN(cree_le) INTO v_last_litige FROM livraisons;
  END IF;

  IF v_last_litige IS NULL THEN
    RETURN 0;
  END IF;

  v_days := EXTRACT(EPOCH FROM (NOW() - v_last_litige)) / 86400;
  RETURN GREATEST(v_days, 0);
END;
$$;

-- ─── Vérification ─────────────────────────────────────────────────────────────
-- SELECT get_claim_free_days('<uuid-livreur>');
-- SELECT platform_claim_free_days();
