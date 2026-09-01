


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."livraisons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" DEFAULT ('PP-'::"text" || "upper"("substr"("md5"(("random"())::"text"), 1, 8))) NOT NULL,
    "expediteur_id" "uuid" NOT NULL,
    "livreur_id" "uuid",
    "destinataire_nom" "text" DEFAULT ''::"text" NOT NULL,
    "destinataire_tel" "text" DEFAULT ''::"text",
    "ville_depart" "text" DEFAULT ''::"text" NOT NULL,
    "ville_arrivee" "text" DEFAULT ''::"text" NOT NULL,
    "adresse_depart" "text" DEFAULT ''::"text",
    "adresse_arrivee" "text" DEFAULT ''::"text",
    "type_colis" "text" DEFAULT 'colis'::"text" NOT NULL,
    "poids_kg" numeric DEFAULT 0,
    "valeur_declaree" numeric DEFAULT 0 NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "prix_base" numeric DEFAULT 0 NOT NULL,
    "commission_pp" numeric DEFAULT 0 NOT NULL,
    "assurance_plan" "text" DEFAULT 'basique'::"text" NOT NULL,
    "assurance_prix" numeric DEFAULT 0 NOT NULL,
    "tps" numeric DEFAULT 0 NOT NULL,
    "tvq" numeric DEFAULT 0 NOT NULL,
    "prix_total" numeric DEFAULT 0 NOT NULL,
    "pourboire" numeric DEFAULT 0 NOT NULL,
    "statut" "text" DEFAULT 'publie'::"text" NOT NULL,
    "mode_prix" "text" DEFAULT 'fixe'::"text" NOT NULL,
    "stripe_payment_intent" "text" DEFAULT ''::"text",
    "paiement_statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "photo_ramassage" "text" DEFAULT ''::"text",
    "photo_livraison" "text" DEFAULT ''::"text",
    "signature" "text" DEFAULT ''::"text",
    "gps_lat_depart" numeric,
    "gps_lng_depart" numeric,
    "gps_lat_arrivee" numeric,
    "gps_lng_arrivee" numeric,
    "date_souhaitee" "date",
    "heure_souhaitee" "text" DEFAULT ''::"text",
    "ramasse_le" timestamp with time zone,
    "livre_le" timestamp with time zone,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mis_a_jour_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_confirmation_hash" "text",
    "recipient_confirmation_created_at" timestamp with time zone,
    "recipient_confirmed_at" timestamp with time zone,
    "recipient_confirmation_method" "text",
    "delivery_confirmation_mode" "text",
    "delivery_proof_required_admin_review" boolean DEFAULT false,
    "admin_note" "text",
    "updated_at" timestamp with time zone,
    "destinataire_email" "text",
    "taille_colis" "text",
    "destinataire_dispo_jours" "text"[],
    "destinataire_dispo_debut" time without time zone,
    "destinataire_dispo_fin" time without time zone,
    "reception_mode" "text",
    "reception_heure_debut" time without time zone,
    "reception_heure_fin" time without time zone,
    "reception_photo_obligatoire" boolean DEFAULT false,
    "reception_lieu_repli" "text",
    "reception_note_livreur" "text",
    "reception_preferences_set_at" timestamp with time zone,
    "imprevu_raison" "text",
    "imprevu_demande_le" timestamp with time zone,
    "relivraison_date" "date",
    "relivraison_heure_debut" time without time zone,
    "relivraison_heure_fin" time without time zone,
    "pickup_code_hash" "text",
    "pickup_confirmed_at" timestamp with time zone,
    "xl_confirmation_demande_at" timestamp with time zone,
    "xl_confirmation_recue_at" timestamp with time zone,
    "destinataire_user_id" "uuid",
    "pickup_selfie_url" "text",
    "pickup_gps_lat" numeric,
    "pickup_gps_lng" numeric,
    "pickup_face_match_score" numeric,
    "pickup_face_match_distance" numeric,
    "pickup_face_match_status" "text",
    "rescue_mode" boolean DEFAULT false,
    "rescue_demande_at" timestamp with time zone,
    "rescue_livreur_original" "uuid",
    "rescue_bonus_pct" numeric DEFAULT 20,
    "rescue_pickup_address" "text",
    "rescue_pickup_gps_lat" numeric,
    "rescue_pickup_gps_lng" numeric,
    "refus_count" integer DEFAULT 0,
    "refus_history" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_intent_id" "text",
    "pickup_window_start" time without time zone,
    "pickup_window_end" time without time zone,
    "quantite_colis" integer DEFAULT 1,
    CONSTRAINT "livraisons_assurance_plan_check" CHECK (("assurance_plan" = ANY (ARRAY['basique'::"text", 'standard'::"text", 'premium'::"text", 'vehicule'::"text"]))),
    CONSTRAINT "livraisons_mode_prix_check" CHECK (("mode_prix" = ANY (ARRAY['fixe'::"text", 'appel_offres'::"text"]))),
    CONSTRAINT "livraisons_paiement_statut_check" CHECK (("paiement_statut" = ANY (ARRAY['en_attente'::"text", 'escrow'::"text", 'libere'::"text", 'rembourse'::"text", 'echec'::"text"]))),
    CONSTRAINT "livraisons_prix_base_check" CHECK (("prix_base" >= (0)::numeric)),
    CONSTRAINT "livraisons_reception_mode_check" CHECK ((("reception_mode" IS NULL) OR ("reception_mode" = ANY (ARRAY['signature'::"text", 'depot_porte'::"text", 'concierge'::"text", 'voisin'::"text", 'boite_securisee'::"text"])))),
    CONSTRAINT "livraisons_statut_check" CHECK (("statut" = ANY (ARRAY['en_attente'::"text", 'publie'::"text", 'paiement_autorise'::"text", 'offre_recue'::"text", 'confirme'::"text", 'en_route'::"text", 'ramasse'::"text", 'livre'::"text", 'livree'::"text", 'delivered'::"text", 'payee'::"text", 'paid'::"text", 'depot_securise'::"text", 'relivraison_demandee'::"text", 'retour_expediteur'::"text", 'annule'::"text", 'litige'::"text", 'rembourse'::"text"]))),
    CONSTRAINT "livraisons_taille_colis_check" CHECK ((("taille_colis" IS NULL) OR ("taille_colis" = ANY (ARRAY['petit'::"text", 'moyen'::"text", 'gros'::"text", 'xl'::"text"])))),
    CONSTRAINT "livraisons_valeur_declaree_check" CHECK (("valeur_declaree" >= (0)::numeric))
);


ALTER TABLE "public"."livraisons" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accepter_livraison"("p_livraison_id" "uuid") RETURNS "public"."livraisons"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_livraison public.livraisons;
begin
  if not public.is_verified_driver(auth.uid()) then
    raise exception 'Livreur verifie requis';
  end if;

  update public.livraisons
  set livreur_id = auth.uid(),
      statut = 'confirme'
  where id = p_livraison_id
    and livreur_id is null
    and statut = 'paiement_autorise'
  returning * into v_livraison;

  if v_livraison.id is null then
    raise exception 'Livraison non disponible ou escrow absent';
  end if;

  return v_livraison;
end;
$$;


ALTER FUNCTION "public"."accepter_livraison"("p_livraison_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("p_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  r record;
begin
  -- Efface toutes les lignes liées à ce compte (toutes tables pointant vers profiles ou auth.users)
  for r in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.column_name = 'id'
      and (
        (ccu.table_schema = 'public' and ccu.table_name = 'profiles') or
        (ccu.table_schema = 'auth'   and ccu.table_name = 'users')
      )
  loop
    execute format('delete from %I.%I where %I = $1', r.table_schema, r.table_name, r.column_name) using p_uid;
  end loop;

  delete from public.profiles where id = p_uid;
  delete from auth.users where id = p_uid;
end;
$_$;


ALTER FUNCTION "public"."admin_delete_user"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ajouter_coins"("p_user_id" "uuid", "p_montant" integer, "p_type" "text", "p_description" "text", "p_livraison_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  solde_actuel INTEGER;
  nouveau_solde INTEGER;
BEGIN
  -- Vérifier que le montant est valide
  IF p_montant = 0 THEN
    RAISE EXCEPTION 'Montant de coins invalide';
  END IF;

  -- Récupérer le solde actuel avec verrou
  SELECT coins INTO solde_actuel
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Calculer le nouveau solde
  nouveau_solde := solde_actuel + p_montant;

  -- Vérifier qu'on ne tombe pas en négatif
  IF nouveau_solde < 0 THEN
    RAISE EXCEPTION 'Solde insuffisant (actuel: %, requis: %)', solde_actuel, ABS(p_montant);
  END IF;

  -- Mettre à jour le solde
  UPDATE public.profiles
  SET coins = nouveau_solde, mis_a_jour_le = NOW()
  WHERE id = p_user_id;

  -- Enregistrer la transaction
  INSERT INTO public.transactions (user_id, type, montant_coins, description, solde_avant, solde_apres, livraison_id)
  VALUES (p_user_id, p_type, p_montant, p_description, solde_actuel, nouveau_solde, p_livraison_id);

  RETURN nouveau_solde;
END;
$$;


ALTER FUNCTION "public"."ajouter_coins"("p_user_id" "uuid", "p_montant" integer, "p_type" "text", "p_description" "text", "p_livraison_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_claim_free_milestone"("p_driver_id" "uuid", "p_milestone_key" "text", "p_points" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_milestones TEXT[];
BEGIN
  SELECT claim_free_milestones INTO v_milestones
  FROM profiles WHERE id = p_driver_id;

  IF v_milestones @> ARRAY[p_milestone_key] THEN
    RETURN FALSE;
  END IF;

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


ALTER FUNCTION "public"."award_claim_free_milestone"("p_driver_id" "uuid", "p_milestone_key" "text", "p_points" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO rate_limits (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN NOW() - rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
      THEN 1
      ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN NOW() - rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
      THEN NOW()
      ELSE rate_limits.window_start
    END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_rate_limits"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$;


ALTER FUNCTION "public"."cleanup_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_claim_free_days"("p_driver_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_last_litige    TIMESTAMPTZ;
  v_created_at     TIMESTAMPTZ;
  v_since          TIMESTAMPTZ;
  v_days           INTEGER;
  v_milestones     TEXT[];
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

  v_since := GREATEST(COALESCE(v_last_litige, v_created_at), v_created_at);
  v_days  := EXTRACT(EPOCH FROM (NOW() - v_since)) / 86400;
  v_days  := GREATEST(v_days, 0);

  RETURN json_build_object(
    'claim_free_days',    v_days,
    'last_litige_date',   v_last_litige,
    'since',              v_since,
    'milestones_def',     v_milestones_def,
    'milestones_reached', COALESCE(v_milestones, '{}')
  );
END;
$$;


ALTER FUNCTION "public"."get_claim_free_days"("p_driver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_badge"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text" DEFAULT 'system'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_badge_id uuid;
  v_points   integer;
  v_xp       integer;
  v_already  boolean;
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


ALTER FUNCTION "public"."grant_badge"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_badge_v2"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text" DEFAULT 'system'::"text", "p_force" boolean DEFAULT false) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
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
    IF v_badge.active_from  IS NOT NULL AND v_now < v_badge.active_from  THEN RETURN 'outside_window'; END IF;
    IF v_badge.active_until IS NOT NULL AND v_now > v_badge.active_until THEN RETURN 'outside_window'; END IF;
    IF v_badge.max_recipients IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM user_badges WHERE badge_id = v_badge.id;
      IF v_count >= v_badge.max_recipients THEN RETURN 'max_reached'; END IF;
    END IF;
    IF v_badge.role_filter IS NOT NULL THEN
      SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;
      IF v_user_role IS DISTINCT FROM v_badge.role_filter THEN RETURN 'role_mismatch'; END IF;
    END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_id = v_badge.id) INTO v_already;
  IF v_already THEN RETURN 'already_owned'; END IF;
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


ALTER FUNCTION "public"."grant_badge_v2"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text", "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_points_impact"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text" DEFAULT NULL::"text", "p_ref_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO porte_coins_transactions(user_id, amount, reason, metadata)
  VALUES (p_user_id, p_amount, p_reason,
    jsonb_build_object('ref_type', p_ref_type, 'ref_id', p_ref_id));

  INSERT INTO reward_audit_logs(user_id, action, points_delta, ref_type, ref_id)
  VALUES (p_user_id, 'points_grant', p_amount, p_ref_type, p_ref_id);
END;
$$;


ALTER FUNCTION "public"."grant_points_impact"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text", "p_ref_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_xp"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text" DEFAULT NULL::"text", "p_ref_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."grant_xp"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text", "p_ref_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, prenom, nom, email, role, ville, coins, xp)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'prenom', ''),
    COALESCE(NEW.raw_user_meta_data->>'nom', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'expediteur'),
    COALESCE(NEW.raw_user_meta_data->>'ville', ''),
    50,
    50
  )
  ON CONFLICT (id) DO NOTHING;

  -- Enregistrer le bonus de bienvenue
  INSERT INTO public.transactions (user_id, type, montant_coins, description, solde_avant, solde_apres)
  VALUES (NEW.id, 'gain_bienvenue', 50, 'Bonus bienvenue — compte créé', 0, 50);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_promo_uses"("p_promo_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = p_promo_id;
END;
$$;


ALTER FUNCTION "public"."increment_promo_uses"("p_promo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role = 'admin'
      and coalesce(p.suspendu, false) = false
  );
$$;


ALTER FUNCTION "public"."is_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_verified_driver"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and coalesce(p.email_verified, false) = true
      and coalesce(p.suspendu, false) = false
      and p.role in ('livreur', 'les deux', 'admin')
      and (p.driver_status = 'verified' or p.role = 'admin')
  );
$$;


ALTER FUNCTION "public"."is_verified_driver"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."livraisons_disponibles_masquees"() RETURNS TABLE("id" "uuid", "code" "text", "ville_depart" "text", "ville_arrivee" "text", "type_colis" "text", "poids_kg" numeric, "prix_total" numeric, "statut" "text", "cree_le" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    l.id,
    l.code,
    l.ville_depart,
    l.ville_arrivee,
    l.type_colis,
    l.poids_kg,
    l.prix_total,
    l.statut,
    l.cree_le
  from public.livraisons l
  where l.statut = 'paiement_autorise'
    and l.livreur_id is null
    and public.is_verified_driver(auth.uid());
$$;


ALTER FUNCTION "public"."livraisons_disponibles_masquees"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pap_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.suspendu, false) = false
  );
$$;


ALTER FUNCTION "public"."pap_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pap_prevent_profile_self_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.pap_is_admin() and new.id = auth.uid() then
    if tg_op = 'UPDATE' then
      new.role := old.role;
      new.suspendu := old.suspendu;
      new.driver_status := old.driver_status;
      new.verification_status := old.verification_status;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."pap_prevent_profile_self_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."platform_claim_free_days"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_last_litige TIMESTAMPTZ;
  v_days        INTEGER;
BEGIN
  SELECT MAX(cree_le) INTO v_last_litige
  FROM livraisons
  WHERE statut IN ('litige', 'rembourse');

  IF v_last_litige IS NULL THEN
    SELECT MIN(cree_le) INTO v_last_litige FROM livraisons;
  END IF;

  IF v_last_litige IS NULL THEN
    RETURN 0;
  END IF;

  v_days := EXTRACT(EPOCH FROM (NOW() - v_last_litige)) / 86400;
  RETURN GREATEST(v_days, 0);
END;
$$;


ALTER FUNCTION "public"."platform_claim_free_days"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_self_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin(auth.uid()) then
    if tg_op = 'INSERT' then
      if new.role = 'admin' then new.role := 'expediteur'; end if;
      if new.driver_status = 'verified' then new.driver_status := 'not_started'; end if;
      if new.verification_status = 'verified' then new.verification_status := 'pending'; end if;
      new.suspendu := false;
      new.email_verified := coalesce(new.email_verified, false);
    elsif tg_op = 'UPDATE' and new.id = auth.uid() then
      new.role := old.role;
      new.driver_status := old.driver_status;
      new.verification_status := old.verification_status;
      new.suspendu := old.suspendu;
      new.email_verified := old.email_verified;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_profile_self_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_privileged_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- service_role (API/webhook) et admins : tout permis
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- driver_status : seule l'auto-demande de vérification est permise
  IF NEW.driver_status IS DISTINCT FROM OLD.driver_status THEN
    IF NEW.driver_status <> 'pending_review' THEN
      RAISE EXCEPTION 'Modification du statut livreur interdite';
    END IF;
  END IF;

  -- verification_status : jamais modifiable par l'utilisateur
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Modification du statut de vérification interdite';
  END IF;

  -- role : jamais
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Modification du rôle interdite';
  END IF;

  -- suspendu : jamais
  IF NEW.suspendu IS DISTINCT FROM OLD.suspendu THEN
    RAISE EXCEPTION 'Modification de la suspension interdite';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_profile_privileged_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_privileged_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
begin
  if auth.role() = 'service_role' or public.pap_is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.coins is distinct from old.coins
     or new.xp is distinct from old.xp
     or new.niveau is distinct from old.niveau
     or new.livraisons is distinct from old.livraisons
     or new.score is distinct from old.score
     or new.actif is distinct from old.actif
     or new.suspendu is distinct from old.suspendu
     or new.raison_suspension is distinct from old.raison_suspension
     or new.email_verified is distinct from old.email_verified
     or new.verification_status is distinct from old.verification_status
     or new.driver_status is distinct from old.driver_status
     or new.eco_bonus is distinct from old.eco_bonus
     or new.score_confiance is distinct from old.score_confiance
     or new.score_ponctualite is distinct from old.score_ponctualite
     or new.score_fiabilite is distinct from old.score_fiabilite
     or new.score_comportement is distinct from old.score_comportement
     or new.taux_annulation is distinct from old.taux_annulation
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.subscription_plan is distinct from old.subscription_plan
     or new.subscription_status is distinct from old.subscription_status
     or new.subscription_end_at is distinct from old.subscription_end_at
     or new.stripe_identity_session_id is distinct from old.stripe_identity_session_id
     or new.stripe_identity_status is distinct from old.stripe_identity_status
     or new.loyalty_bonus_pct is distinct from old.loyalty_bonus_pct
     or new.loyalty_bonus_manual is distinct from old.loyalty_bonus_manual
     or new.photo_status is distinct from old.photo_status
     or new.photo_moderated_at is distinct from old.photo_moderated_at
     or new.photo_moderation_reason is distinct from old.photo_moderation_reason
     or new.pet_photo_status is distinct from old.pet_photo_status
  then
    raise exception 'Modification de champs protégés interdite'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_privileged_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_driver_litige"("p_driver_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE profiles
  SET last_litige_date = NOW()
  WHERE id = p_driver_id;
END;
$$;


ALTER FUNCTION "public"."record_driver_litige"("p_driver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_meeting_point_report_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.safe_meeting_points
  set report_count = (
    select count(*)::integer
    from public.safe_meeting_point_reports r
    where r.point_id = coalesce(new.point_id, old.point_id)
      and r.status = 'open'
  )
  where id = coalesce(new.point_id, old.point_id);
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."safe_meeting_point_report_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_safe_meeting_points_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_safe_meeting_points_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_mis_a_jour_le"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.mis_a_jour_le = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_mis_a_jour_le"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verifier_transfert_coins"("p_expediteur_id" "uuid", "p_montant" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  transferts_du_jour INTEGER;
  solde_actuel       INTEGER;
BEGIN
  -- Vérifier le solde
  SELECT coins INTO solde_actuel
  FROM public.profiles WHERE id = p_expediteur_id;

  IF solde_actuel < p_montant THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  -- Max 3 transferts par jour par utilisateur
  SELECT COUNT(*) INTO transferts_du_jour
  FROM public.transactions
  WHERE user_id = p_expediteur_id
    AND type = 'transfert_envoye'
    AND cree_le > NOW() - INTERVAL '24 hours';

  IF transferts_du_jour >= 3 THEN
    RAISE EXCEPTION 'Limite de transferts atteinte (3/jour)';
  END IF;

  -- Max 1000 coins par transfert
  IF p_montant > 1000 THEN
    RAISE EXCEPTION 'Maximum 1000 PorteCoins par transfert';
  END IF;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."verifier_transfert_coins"("p_expediteur_id" "uuid", "p_montant" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_intelligence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "address_normalized" "text" NOT NULL,
    "address_original" "text",
    "ville" "text",
    "category" "text" NOT NULL,
    "note" "text" NOT NULL,
    "severity" integer DEFAULT 1,
    "reported_by" "uuid",
    "validated_count" integer DEFAULT 1,
    "contested_count" integer DEFAULT 0,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '1 year'::interval),
    "admin_validated" boolean DEFAULT false,
    "admin_blocked" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "address_intelligence_category_check" CHECK (("category" = ANY (ARRAY['animal'::"text", 'acces'::"text", 'code_sonnette'::"text", 'stationnement'::"text", 'securite'::"text", 'comportement'::"text", 'do_not_deliver'::"text", 'horaires'::"text", 'reception'::"text", 'pourboire'::"text", 'autre'::"text"]))),
    CONSTRAINT "address_intelligence_severity_check" CHECK ((("severity" >= 1) AND ("severity" <= 5)))
);


ALTER TABLE "public"."address_intelligence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_intelligence_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intel_id" "uuid",
    "user_id" "uuid",
    "vote" "text",
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "address_intelligence_votes_vote_check" CHECK (("vote" = ANY (ARRAY['confirm'::"text", 'contest'::"text"])))
);


ALTER TABLE "public"."address_intelligence_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text" DEFAULT '🏅'::"text",
    "category" "text" DEFAULT 'general'::"text",
    "points_reward" integer DEFAULT 0,
    "xp_reward" integer DEFAULT 0,
    "condition_type" "text",
    "condition_value" numeric DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "active_from" timestamp with time zone,
    "active_until" timestamp with time zone,
    "benefit_from" timestamp with time zone,
    "benefit_until" timestamp with time zone,
    "max_recipients" integer,
    "seasonal_months" integer[],
    "campaign_name" "text",
    "role_filter" "text",
    "auto_trigger" "text",
    "paused" boolean DEFAULT false,
    "rarity" "text" DEFAULT 'common'::"text"
);


ALTER TABLE "public"."badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "badge_id" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "text" DEFAULT 'system'::"text"
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."badge_campaign_status" WITH ("security_invoker"='true') AS
 SELECT "b"."id",
    "b"."slug",
    "b"."name",
    "b"."icon",
    "b"."category",
    "b"."active",
    "b"."paused",
    "b"."campaign_name",
    "b"."role_filter",
    "b"."auto_trigger",
    "b"."active_from",
    "b"."active_until",
    "b"."benefit_from",
    "b"."benefit_until",
    "b"."max_recipients",
    "b"."seasonal_months",
    "b"."points_reward",
    "b"."xp_reward",
    COALESCE("ub"."recipients_count", (0)::bigint) AS "recipients_count",
        CASE
            WHEN COALESCE("b"."paused", false) THEN 'pause'::"text"
            WHEN (NOT COALESCE("b"."active", true)) THEN 'inactif'::"text"
            WHEN (("b"."active_until" IS NOT NULL) AND ("b"."active_until" < "now"())) THEN 'termine'::"text"
            WHEN (("b"."active_from" IS NOT NULL) AND ("b"."active_from" > "now"())) THEN 'planifie'::"text"
            ELSE 'actif'::"text"
        END AS "campaign_status",
    (COALESCE("b"."active", true) AND (NOT COALESCE("b"."paused", false)) AND (("b"."benefit_from" IS NULL) OR ("b"."benefit_from" <= "now"())) AND (("b"."benefit_until" IS NULL) OR ("b"."benefit_until" >= "now"()))) AS "benefit_active_now",
    "b"."created_at"
   FROM ("public"."badges" "b"
     LEFT JOIN ( SELECT "user_badges"."badge_id",
            "count"(*) AS "recipients_count"
           FROM "public"."user_badges"
          WHERE ("user_badges"."badge_id" IS NOT NULL)
          GROUP BY "user_badges"."badge_id") "ub" ON (("ub"."badge_id" = "b"."id")));


ALTER VIEW "public"."badge_campaign_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."codes_promo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" DEFAULT 'percent'::"text" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "max_uses" integer,
    "used_count" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "codes_promo_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "codes_promo_discount_value_check" CHECK (("discount_value" > (0)::numeric)),
    CONSTRAINT "codes_promo_percent_range" CHECK ((("discount_type" <> 'percent'::"text") OR ("discount_value" <= (100)::numeric)))
);


ALTER TABLE "public"."codes_promo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_vote_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vote_id" "uuid",
    "user_id" "uuid",
    "allocations" "jsonb" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."community_vote_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titre" "text" NOT NULL,
    "description" "text",
    "periode" "text",
    "montant_total_cad" numeric DEFAULT 0,
    "debut" timestamp with time zone DEFAULT "now"(),
    "fin" timestamp with time zone NOT NULL,
    "statut" "text" DEFAULT 'ouvert'::"text",
    "organismes_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "resultats" "jsonb",
    "cree_le" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "community_votes_statut_check" CHECK (("statut" = ANY (ARRAY['ouvert'::"text", 'ferme'::"text", 'verse'::"text"])))
);


ALTER TABLE "public"."community_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cov_badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT '🏅'::"text" NOT NULL,
    "description" "text",
    "condition" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cov_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cov_missions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text" DEFAULT '🎯'::"text",
    "target" integer DEFAULT 1 NOT NULL,
    "xp_reward" integer DEFAULT 50 NOT NULL,
    "badge_slug" "text",
    "role_filter" "text" DEFAULT 'all'::"text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cov_missions_role_filter_check" CHECK (("role_filter" = ANY (ARRAY['conducteur'::"text", 'passager'::"text", 'les_deux'::"text", 'all'::"text"])))
);


ALTER TABLE "public"."cov_missions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cov_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid",
    "booking_id" "uuid",
    "reviewer_id" "uuid" NOT NULL,
    "reviewed_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cov_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."cov_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cov_xp_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "reason" "text" NOT NULL,
    "ref_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cov_xp_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid",
    "title" "text",
    "description" "text",
    "pickup_address" "text",
    "delivery_address" "text",
    "package_type" "text",
    "size" "text",
    "weight" "text",
    "price" numeric(10,2),
    "status" "text" DEFAULT 'pending'::"text",
    "mode" "text" DEFAULT 'lite'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "livraison_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy_m" double precision,
    "heading" double precision,
    "speed_mps" double precision,
    "source" "text" DEFAULT 'browser'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "livreur_id" "uuid",
    "accuracy" double precision,
    "speed" double precision,
    "altitude" double precision,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_locations_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "delivery_locations_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))
);


ALTER TABLE "public"."delivery_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_proofs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "livraison_id" "uuid" NOT NULL,
    "livreur_id" "uuid" NOT NULL,
    "proof_type" "text" DEFAULT 'dropoff_without_recipient'::"text" NOT NULL,
    "dropoff_type" "text",
    "note" "text" NOT NULL,
    "photo_data_url" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy_m" double precision,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photo_storage_bucket" "text",
    "photo_storage_path" "text",
    "photo_mime_type" "text",
    "photo_size_bytes" integer
);


ALTER TABLE "public"."delivery_proofs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draw_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draw_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entries" integer DEFAULT 1 NOT NULL,
    "cost_coins" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."draw_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draw_winners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draw_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "prize_title" "text" NOT NULL,
    "published" boolean DEFAULT false NOT NULL,
    "entries_weight" integer DEFAULT 1 NOT NULL,
    "user_email" "text",
    "user_role" "text",
    "selected_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."draw_winners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "birth_date" "date",
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT ''::"text" NOT NULL,
    "id_document_url" "text",
    "selfie_url" "text",
    "consent_accepted" boolean DEFAULT false NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "driver_verifications_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'pending_review'::"text", 'verified'::"text", 'rejected'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."driver_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "priority" integer NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "is_porteaporte" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "emergency_contacts_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 3)))
);


ALTER TABLE "public"."emergency_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "livraison_id" "uuid" NOT NULL,
    "auteur_id" "uuid" NOT NULL,
    "evalue_id" "uuid" NOT NULL,
    "note" integer NOT NULL,
    "commentaire" "text" DEFAULT ''::"text",
    "pourboire" numeric DEFAULT 0,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "evaluations_note_check" CHECK ((("note" >= 1) AND ("note" <= 5)))
);


ALTER TABLE "public"."evaluations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."gps_positions" WITH ("security_invoker"='true') AS
 SELECT "id",
    "livraison_id",
    "livreur_id",
    "latitude",
    "longitude",
    "altitude",
    "accuracy",
    "speed",
    "heading",
    "source",
    "recorded_at",
    "created_at"
   FROM "public"."delivery_locations";


ALTER VIEW "public"."gps_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impact_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organisation_name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "website_url" "text",
    "mission" "text" NOT NULL,
    "requested_support" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "impact_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'contacted'::"text"])))
);


ALTER TABLE "public"."impact_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impact_mode_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "points" "text",
    "transparence" "text",
    "sans_impact" "text",
    "source" "text" DEFAULT 'mode_impact_popup'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."impact_mode_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impact_organisations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "website_url" "text",
    "logo_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "allocation_percent" numeric(6,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "impact_organisations_allocation_percent_check" CHECK ((("allocation_percent" >= (0)::numeric) AND ("allocation_percent" <= (100)::numeric)))
);


ALTER TABLE "public"."impact_organisations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impact_settings" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "donation_rate_percent" numeric(6,2) DEFAULT 5 NOT NULL,
    "platform_commission_percent" numeric(6,2) DEFAULT 12 NOT NULL,
    "public_note" "text" DEFAULT 'Montants estimes en direct, confirmes mensuellement.'::"text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pct_livreur" numeric DEFAULT 60,
    "pct_plateforme" numeric DEFAULT 12,
    "pct_don" numeric DEFAULT 5,
    "pct_tirage" numeric DEFAULT 3,
    "pct_developpeur" numeric DEFAULT 0,
    "pct_securite" numeric DEFAULT 0,
    "pct_assurance" numeric DEFAULT 0,
    "ride_redistribution" "jsonb",
    "ride_free_trips" integer DEFAULT 10 NOT NULL,
    "ride_platform_fee" numeric DEFAULT 1.50 NOT NULL,
    "ride_cancel_free_window_h" numeric DEFAULT 24 NOT NULL,
    "ride_cancel_late_window_h" numeric DEFAULT 2 NOT NULL,
    "ride_cancel_partial_refund_pct" numeric DEFAULT 85 NOT NULL,
    "ride_cancel_partial_driver_pct" numeric DEFAULT 10 NOT NULL,
    "ride_cancel_partial_fund_pct" numeric DEFAULT 5 NOT NULL,
    "ride_cancel_late_refund_pct" numeric DEFAULT 50 NOT NULL,
    "ride_cancel_late_driver_pct" numeric DEFAULT 40 NOT NULL,
    "ride_cancel_late_fund_pct" numeric DEFAULT 10 NOT NULL,
    "delivery_cancel_assigned_fund_pct" numeric DEFAULT 2 NOT NULL,
    "delivery_cancel_transit_fund_pct" numeric DEFAULT 5 NOT NULL,
    CONSTRAINT "impact_settings_donation_rate_percent_check" CHECK ((("donation_rate_percent" >= (0)::numeric) AND ("donation_rate_percent" <= (100)::numeric))),
    CONSTRAINT "impact_settings_platform_commission_percent_check" CHECK ((("platform_commission_percent" >= (0)::numeric) AND ("platform_commission_percent" <= (100)::numeric)))
);


ALTER TABLE "public"."impact_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kyc_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "dob" "date" NOT NULL,
    "phone" "text",
    "address" "text",
    "transport_mode" "text" NOT NULL,
    "eco_bonus" integer DEFAULT 0 NOT NULL,
    "doc_type" "text" NOT NULL,
    "doc1_path" "text",
    "doc2_path" "text",
    "selfie_path" "text",
    "statut" "text" DEFAULT 'pending'::"text" NOT NULL,
    "soumis_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewer_id" "uuid",
    "reject_reason" "text"
);


ALTER TABLE "public"."kyc_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."liste_attente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prenom" "text" DEFAULT ''::"text" NOT NULL,
    "nom" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" NOT NULL,
    "telephone" "text" DEFAULT ''::"text",
    "ville" "text" DEFAULT ''::"text",
    "province" "text" DEFAULT 'Québec'::"text",
    "role" "text" DEFAULT 'expediteur'::"text",
    "parrain" "text" DEFAULT ''::"text",
    "source" "text" DEFAULT ''::"text",
    "message" "text" DEFAULT ''::"text",
    "code_perso" "text" DEFAULT ('PP-REF-'::"text" || "upper"("substr"("md5"(("random"())::"text"), 1, 6))),
    "notifie" boolean DEFAULT false NOT NULL,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."liste_attente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."litiges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "livraison_id" "uuid" NOT NULL,
    "plaignant_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "photos" "text"[] DEFAULT '{}'::"text"[],
    "montant_reclame" numeric DEFAULT 0,
    "statut" "text" DEFAULT 'ouvert'::"text" NOT NULL,
    "resolution" "text" DEFAULT ''::"text",
    "montant_rembourse" numeric DEFAULT 0,
    "traite_par" "uuid",
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolu_le" timestamp with time zone,
    CONSTRAINT "litiges_statut_check" CHECK (("statut" = ANY (ARRAY['ouvert'::"text", 'en_analyse'::"text", 'resolu'::"text", 'rejete'::"text", 'rembourse'::"text"]))),
    CONSTRAINT "litiges_type_check" CHECK (("type" = ANY (ARRAY['colis_endommage'::"text", 'colis_perdu'::"text", 'vol'::"text", 'retard'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."litiges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."livreur_earnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "livraison_id" "uuid",
    "gross_amount" numeric(10,2) NOT NULL,
    "platform_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'cad'::"text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "available_after" timestamp with time zone DEFAULT "now"(),
    "stripe_payment_intent" "text",
    "stripe_transfer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text" DEFAULT 'livraison'::"text",
    "notes" "text",
    CONSTRAINT "livreur_earnings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'available'::"text", 'transferred'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."livreur_earnings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manquements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "livraison_id" "uuid",
    "signaleur_id" "uuid",
    "signaleur_role" "text",
    "accuse_id" "uuid",
    "accuse_role" "text",
    "categorie" "text" NOT NULL,
    "description" "text",
    "preuves_urls" "text"[] DEFAULT '{}'::"text"[],
    "statut" "text" DEFAULT 'signale'::"text",
    "contestation" "text",
    "contestation_preuves" "text"[] DEFAULT '{}'::"text"[],
    "conteste_avant" timestamp with time zone DEFAULT ("now"() + '48:00:00'::interval),
    "decision_admin" "text",
    "decision_at" timestamp with time zone,
    "signale_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "manquements_accuse_role_check" CHECK (("accuse_role" = ANY (ARRAY['expediteur'::"text", 'livreur'::"text", 'destinataire'::"text"]))),
    CONSTRAINT "manquements_signaleur_role_check" CHECK (("signaleur_role" = ANY (ARRAY['expediteur'::"text", 'livreur'::"text", 'destinataire'::"text", 'admin'::"text"]))),
    CONSTRAINT "manquements_statut_check" CHECK (("statut" = ANY (ARRAY['signale'::"text", 'conteste'::"text", 'valide'::"text", 'rejete'::"text", 'partage'::"text"])))
);


ALTER TABLE "public"."manquements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid",
    "trip_id" "uuid",
    "driver_id" "uuid",
    "match_score" integer DEFAULT 0,
    "status" "text" DEFAULT 'proposed'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expediteur_id" "uuid" NOT NULL,
    "destinataire_id" "uuid",
    "livraison_id" "uuid",
    "contenu" "text" NOT NULL,
    "lu" boolean DEFAULT false NOT NULL,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conv_id" "uuid",
    "sender_id" "uuid",
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expediteur_role" "text",
    "lu_par" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."missions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titre" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "icone" "text" DEFAULT '❤️'::"text",
    "type" "text" DEFAULT 'solidaire'::"text" NOT NULL,
    "coins_reward" integer DEFAULT 100 NOT NULL,
    "xp_reward" integer DEFAULT 200 NOT NULL,
    "badge_reward" "text" DEFAULT ''::"text",
    "places_max" integer DEFAULT 5 NOT NULL,
    "places_prises" integer DEFAULT 0 NOT NULL,
    "date_mission" "date",
    "actif" boolean DEFAULT true NOT NULL,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "missions_type_check" CHECK (("type" = ANY (ARRAY['solidaire'::"text", 'eco'::"text", 'communautaire'::"text", 'urgence'::"text"])))
);


ALTER TABLE "public"."missions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."missions_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mission_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "complete" boolean DEFAULT false NOT NULL,
    "complete_le" timestamp with time zone,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."missions_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "status" "text" DEFAULT 'offline'::"text",
    "visibility" "text" DEFAULT 'admin_only'::"text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_draws" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "prize" "text",
    "draw_date" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "winner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "eligibility_badge_slug" "text"
);


ALTER TABLE "public"."monthly_draws" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text",
    "notif_type" "text",
    "action_url" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "livraison_id" "uuid" NOT NULL,
    "livreur_id" "uuid" NOT NULL,
    "prix_propose" numeric NOT NULL,
    "message" "text" DEFAULT ''::"text",
    "statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "offres_prix_propose_check" CHECK (("prix_propose" > (0)::numeric)),
    CONSTRAINT "offres_statut_check" CHECK (("statut" = ANY (ARRAY['en_attente'::"text", 'acceptee'::"text", 'refusee'::"text", 'annulee'::"text"])))
);


ALTER TABLE "public"."offres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organismes_partenaires" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom" "text" NOT NULL,
    "slug" "text",
    "description" "text",
    "mission" "text",
    "logo_url" "text",
    "site_web" "text",
    "numero_obnl" "text",
    "region" "text",
    "cause" "text",
    "actif" boolean DEFAULT true,
    "est_principal" boolean DEFAULT false,
    "total_recu_cad" numeric DEFAULT 0,
    "dernier_versement_at" timestamp with time zone,
    "ordre" integer DEFAULT 0,
    "cree_le" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organismes_partenaires" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "delivery_id" "uuid",
    "driver_id" "uuid",
    "stripe_payment_intent_id" "text",
    "total_amount" numeric(10,2),
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid",
    "sender_id" "uuid",
    "driver_id" "uuid",
    "amount" numeric(10,2),
    "platform_fee" numeric(10,2),
    "driver_payout" numeric(10,2),
    "stripe_payment_id" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'cad'::"text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "stripe_transfer_id" "text",
    "failure_reason" "text",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    CONSTRAINT "payout_requests_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'paid'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payout_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "pct_livreur" numeric DEFAULT 60,
    "pct_communaute" numeric DEFAULT 5,
    "pct_protection" numeric DEFAULT 3,
    "pct_urgence" numeric DEFAULT 2,
    "pct_developpement" numeric DEFAULT 4,
    "pct_marketing" numeric DEFAULT 4.6,
    "pct_operations" numeric DEFAULT 13,
    "pct_profit" numeric DEFAULT 5,
    "pct_stripe" numeric DEFAULT 3.4,
    "ticket_moyen_cad" numeric DEFAULT 15,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "max_colis_value_cents" integer DEFAULT 25000,
    "insurance_pct" numeric(5,4) DEFAULT 0.02,
    "insurance_fund_topup_cents" integer DEFAULT 0,
    "founder_revenue_pct" numeric(5,4) DEFAULT 0.05,
    "profit_to_insurance" boolean DEFAULT true,
    "payout_min_cad" numeric(8,2) DEFAULT 5,
    "beta_cities" "jsonb" DEFAULT '["Québec", "Lévis"]'::"jsonb",
    "beta_cities_active" boolean DEFAULT true
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."porte_coins_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "reason" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."porte_coins_transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."points_impact_transactions" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "amount",
    "reason",
    "metadata",
    "created_at"
   FROM "public"."porte_coins_transactions";


ALTER VIEW "public"."points_impact_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "prenom" "text" DEFAULT ''::"text" NOT NULL,
    "nom" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "telephone" "text" DEFAULT ''::"text",
    "ville" "text" DEFAULT ''::"text",
    "province" "text" DEFAULT 'Québec'::"text",
    "role" "text" DEFAULT 'expediteur'::"text" NOT NULL,
    "coins" integer DEFAULT 50 NOT NULL,
    "xp" integer DEFAULT 50 NOT NULL,
    "niveau" "text" DEFAULT 'bronze'::"text" NOT NULL,
    "livraisons" integer DEFAULT 0 NOT NULL,
    "score" numeric DEFAULT 100 NOT NULL,
    "code_parrain" "text" DEFAULT ('PP-REF-'::"text" || "upper"("substr"("md5"(("random"())::"text"), 1, 6))),
    "parrain_id" "uuid",
    "streak_semaines" integer DEFAULT 0 NOT NULL,
    "badges" "text"[] DEFAULT '{}'::"text"[],
    "avatar" "text" DEFAULT '😊'::"text",
    "actif" boolean DEFAULT true NOT NULL,
    "suspendu" boolean DEFAULT false NOT NULL,
    "raison_suspension" "text" DEFAULT ''::"text",
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mis_a_jour_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_verified" boolean DEFAULT false NOT NULL,
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "driver_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vehicule" "text",
    "trajet_principal" "text",
    "transport_mode" "text",
    "mode_livraison" "text",
    "eco_bonus" integer DEFAULT 0,
    "disponible" boolean DEFAULT false,
    "streak_jours" integer DEFAULT 0,
    "cov_role" "text",
    "cov_vehicule_type" "text",
    "cov_places" integer DEFAULT 2,
    "cov_coffre" "text",
    "cov_animaux" boolean DEFAULT false,
    "cov_bagages" boolean DEFAULT false,
    "cov_arrets" boolean DEFAULT false,
    "cov_nonsmoker" boolean DEFAULT true,
    "cov_femmes" boolean DEFAULT false,
    "cov_enfant" boolean DEFAULT false,
    "cov_accessible" boolean DEFAULT false,
    "cov_regles_perso" "text",
    "cov_pax_bagage" boolean DEFAULT false,
    "cov_pax_animal" boolean DEFAULT false,
    "cov_pax_arret" boolean DEFAULT false,
    "cov_pax_accessible" boolean DEFAULT false,
    "cov_pax_notes" "text",
    "cov_xp" integer DEFAULT 0,
    "cov_level" integer DEFAULT 1,
    "cov_total_rides" integer DEFAULT 0,
    "cov_rating_avg" numeric(3,2),
    "cov_rating_count" integer DEFAULT 0,
    "last_activity" "date",
    "referral_code" "text",
    "referred_by" "text",
    "score_confiance" smallint DEFAULT 0,
    "score_ponctualite" smallint DEFAULT 0,
    "score_fiabilite" smallint DEFAULT 0,
    "score_comportement" smallint DEFAULT 0,
    "taux_annulation" numeric(5,2) DEFAULT 0,
    "nb_trajets_chauffeur" integer DEFAULT 0,
    "nb_trajets_passager" integer DEFAULT 0,
    "stripe_customer_id" "text",
    "subscription_plan" "text",
    "subscription_status" "text",
    "subscription_end_at" timestamp with time zone,
    "last_litige_date" timestamp with time zone,
    "claim_free_milestones" "text"[] DEFAULT '{}'::"text"[],
    "route_origine" "text",
    "route_destination" "text",
    "route_deviation_km" integer DEFAULT 0,
    "route_date" "date",
    "route_heure_debut" time without time zone,
    "route_heure_fin" time without time zone,
    "route_updated_at" timestamp with time zone,
    "stripe_identity_session_id" "text",
    "stripe_identity_status" "text",
    "transport_modes_disponibles" "text"[] DEFAULT '{}'::"text"[],
    "transport_mode_actif" "text",
    "loyalty_bonus_pct" numeric DEFAULT 0,
    "loyalty_bonus_manual" numeric DEFAULT 0,
    "loyalty_updated_at" timestamp with time zone,
    "photo_url" "text",
    "photo_status" "text" DEFAULT 'none'::"text",
    "photo_visible_to_others" boolean DEFAULT true,
    "photo_submitted_at" timestamp with time zone,
    "photo_moderated_at" timestamp with time zone,
    "photo_moderation_reason" "text",
    "layer_mode" "text" DEFAULT 'simple'::"text",
    "pet_name" "text",
    "pet_species" "text",
    "pet_breed" "text",
    "pet_size" "text",
    "pet_weight_kg" numeric,
    "pet_photo_url" "text",
    "pet_photo_status" "text" DEFAULT 'none'::"text",
    "pet_vaccinated" boolean DEFAULT false,
    "pet_carrier" boolean DEFAULT false,
    "pet_notes" "text",
    "est_livreur" boolean DEFAULT false NOT NULL,
    "est_expediteur" boolean DEFAULT false NOT NULL,
    "est_passager" boolean DEFAULT false NOT NULL,
    "est_conducteur" boolean DEFAULT false NOT NULL,
    "rejection_reason" "text",
    "ride_safety_code_hash" "text",
    "ride_safety_code_set_at" timestamp with time zone,
    "safety_secret_question" "text",
    "safety_secret_answer_hash" "text",
    "availability_schedule" "jsonb" DEFAULT '{"asap": true}'::"jsonb",
    CONSTRAINT "profiles_coins_check" CHECK (("coins" >= 0)),
    CONSTRAINT "profiles_cov_coffre_check" CHECK (("cov_coffre" = ANY (ARRAY['petit'::"text", 'moyen'::"text", 'grand'::"text"]))),
    CONSTRAINT "profiles_cov_role_check" CHECK (("cov_role" = ANY (ARRAY['conducteur'::"text", 'passager'::"text", 'les_deux'::"text"]))),
    CONSTRAINT "profiles_livraisons_check" CHECK (("livraisons" >= 0)),
    CONSTRAINT "profiles_niveau_check" CHECK (("niveau" = ANY (ARRAY['bronze'::"text", 'argent'::"text", 'or'::"text", 'elite'::"text"]))),
    CONSTRAINT "profiles_pet_photo_status_check" CHECK (("pet_photo_status" = ANY (ARRAY['none'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "profiles_pet_size_check" CHECK (("pet_size" = ANY (ARRAY['petit'::"text", 'moyen'::"text", 'grand'::"text"]))),
    CONSTRAINT "profiles_pet_species_check" CHECK (("pet_species" = ANY (ARRAY['chien'::"text", 'chat'::"text", 'oiseau'::"text", 'rongeur'::"text", 'autre'::"text"]))),
    CONSTRAINT "profiles_photo_status_check" CHECK (("photo_status" = ANY (ARRAY['none'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['expediteur'::"text", 'livreur'::"text", 'les deux'::"text", 'admin'::"text"]))),
    CONSTRAINT "profiles_score_check" CHECK ((("score" >= (0)::numeric) AND ("score" <= (100)::numeric))),
    CONSTRAINT "profiles_score_comportement_check" CHECK ((("score_comportement" >= 0) AND ("score_comportement" <= 100))),
    CONSTRAINT "profiles_score_fiabilite_check" CHECK ((("score_fiabilite" >= 0) AND ("score_fiabilite" <= 100))),
    CONSTRAINT "profiles_score_ponctualite_check" CHECK ((("score_ponctualite" >= 0) AND ("score_ponctualite" <= 100))),
    CONSTRAINT "profiles_xp_check" CHECK (("xp" >= 0))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."est_livreur" IS 'Capacite livraison: peut livrer des colis.';



COMMENT ON COLUMN "public"."profiles"."est_expediteur" IS 'Capacite livraison: peut envoyer des colis.';



COMMENT ON COLUMN "public"."profiles"."est_passager" IS 'Capacite covoiturage: peut chercher/reserver des trajets.';



COMMENT ON COLUMN "public"."profiles"."est_conducteur" IS 'Capacite covoiturage: peut publier/offrir des trajets.';



CREATE OR REPLACE VIEW "public"."profils_livreurs_publics" WITH ("security_invoker"='true') AS
 SELECT "id",
    "prenom",
    ("left"("nom", 1) || '.'::"text") AS "nom_initial",
    "ville",
    "province",
    "score",
    "livraisons",
    "niveau",
    "badges",
    "avatar",
    "role"
   FROM "public"."profiles"
  WHERE (("role" = ANY (ARRAY['livreur'::"text", 'les deux'::"text"])) AND ("actif" = true) AND ("suspendu" = false));


ALTER VIEW "public"."profils_livreurs_publics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promo_code_uses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promo_code_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "livraison_id" "uuid",
    "discount_applied" numeric(10,2),
    "used_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."promo_code_uses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "type" "text" NOT NULL,
    "value" numeric(10,2) DEFAULT 0 NOT NULL,
    "description" "text",
    "conditions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "partner_name" "text",
    "max_uses" integer,
    "uses_count" integer DEFAULT 0 NOT NULL,
    "per_user_limit" integer DEFAULT 1 NOT NULL,
    "valid_from" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "promo_codes_type_check" CHECK (("type" = ANY (ARRAY['fixed_price'::"text", 'discount_pct'::"text", 'discount_cad'::"text", 'insurance_upgrade'::"text", 'free_delivery'::"text"])))
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."protection_fund_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_type" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "livraison_id" "uuid",
    "booking_id" "uuid",
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "protection_fund_ledger_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['contribution'::"text", 'payout'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."protection_fund_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."protection_fund_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "amount_cents" integer NOT NULL,
    "livraison_id" "uuid",
    "booking_id" "uuid",
    "beneficiaire" "text",
    "motif" "text",
    "stripe_refund_id" "text",
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "protection_fund_payouts_amount_cents_check" CHECK (("amount_cents" > 0))
);


ALTER TABLE "public"."protection_fund_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "key" "text" NOT NULL,
    "count" integer DEFAULT 1 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "total_uses" integer DEFAULT 0,
    "total_rewarded" integer DEFAULT 0
);


ALTER TABLE "public"."referral_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_id" "uuid",
    "referee_id" "uuid",
    "code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "action_type" "text",
    "rewarded_at" timestamp with time zone,
    "points_granted" integer DEFAULT 0,
    "xp_granted" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "referred_id" "uuid"
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid",
    "reviewer_id" "uuid",
    "reviewed_id" "uuid",
    "rating" integer,
    "comment" "text",
    "kindness_score" integer DEFAULT 0,
    "reliability_score" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ride_id" "uuid",
    "note_ponctualite" smallint,
    "note_fiabilite" smallint,
    "note_comportement" smallint,
    "reviewer_role" "text" DEFAULT 'expediteur'::"text",
    "reviewed_role" "text" DEFAULT 'livreur'::"text",
    "is_anonymous" boolean DEFAULT false,
    CONSTRAINT "reviews_note_comportement_check" CHECK ((("note_comportement" >= 1) AND ("note_comportement" <= 5))),
    CONSTRAINT "reviews_note_fiabilite_check" CHECK ((("note_fiabilite" >= 1) AND ("note_fiabilite" <= 5))),
    CONSTRAINT "reviews_note_ponctualite_check" CHECK ((("note_ponctualite" >= 1) AND ("note_ponctualite" <= 5))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_reviewed_role_check" CHECK (("reviewed_role" = ANY (ARRAY['expediteur'::"text", 'livreur'::"text", 'destinataire'::"text", 'passager'::"text", 'chauffeur'::"text"]))),
    CONSTRAINT "reviews_reviewer_role_check" CHECK (("reviewer_role" = ANY (ARRAY['expediteur'::"text", 'livreur'::"text", 'destinataire'::"text", 'passager'::"text", 'chauffeur'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reward_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "points_delta" integer DEFAULT 0,
    "xp_delta" integer DEFAULT 0,
    "ref_type" "text",
    "ref_id" "uuid",
    "admin_id" "uuid",
    "cancelled" boolean DEFAULT false,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reward_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid" NOT NULL,
    "passenger_id" "uuid" NOT NULL,
    "pickup_city" "text" NOT NULL,
    "pickup_sector" "text",
    "pickup_lat" numeric(10,7),
    "pickup_lng" numeric(10,7),
    "dropoff_city" "text" NOT NULL,
    "dropoff_sector" "text",
    "dropoff_lat" numeric(10,7),
    "dropoff_lng" numeric(10,7),
    "seats_reserved" integer DEFAULT 1,
    "has_large_luggage" boolean DEFAULT false,
    "has_pet" boolean DEFAULT false,
    "extra_stops_count" integer DEFAULT 0,
    "requested_detour_km" numeric(6,2) DEFAULT 0,
    "special_requests" "text",
    "passenger_distance_km" numeric(8,2),
    "base_share" numeric(8,2),
    "luggage_fee" numeric(6,2) DEFAULT 0,
    "pet_fee" numeric(6,2) DEFAULT 0,
    "stop_fee" numeric(6,2) DEFAULT 0,
    "detour_fee" numeric(6,2) DEFAULT 0,
    "platform_fee" numeric(6,2) DEFAULT 0,
    "driver_amount" numeric(8,2),
    "total_passenger" numeric(8,2),
    "status" "text" DEFAULT 'en_attente'::"text",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "stripe_payment_intent" "text",
    "payment_status" "text",
    "payment_currency" "text" DEFAULT 'cad'::"text",
    "payment_authorized_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "safety_code_hash" "text",
    "safety_code_custom" boolean DEFAULT false,
    "safety_code_set_at" timestamp with time zone,
    "safety_code_verified_at" timestamp with time zone,
    "safety_alert_triggered" boolean DEFAULT false,
    "driver_completed_at" timestamp with time zone,
    "passenger_confirmed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "completion_actor" "text",
    "alert_sent_at" timestamp with time zone,
    "last_gps_lat" numeric(10,7),
    "last_gps_lng" numeric(10,7),
    "last_gps_at" timestamp with time zone,
    "safety_code_failed_attempts" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "ride_bookings_seats_reserved_check" CHECK (("seats_reserved" >= 1)),
    CONSTRAINT "ride_bookings_status_check" CHECK (("status" = ANY (ARRAY['en_attente'::"text", 'confirme'::"text", 'driver_completed'::"text", 'paye'::"text", 'annule_passager'::"text", 'annule_chauffeur'::"text", 'complete'::"text", 'completed'::"text", 'termine'::"text", 'cancelled'::"text", 'refunded'::"text", 'rembourse'::"text"])))
);


ALTER TABLE "public"."ride_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_driver_profiles" (
    "user_id" "uuid" NOT NULL,
    "vehicle_make" "text",
    "vehicle_model" "text",
    "vehicle_year" smallint,
    "vehicle_color" "text",
    "vehicle_photos" "jsonb" DEFAULT '[]'::"jsonb",
    "smoking_policy" "text" DEFAULT 'non_fumeur'::"text",
    "music_policy" "text" DEFAULT 'selon_humeur'::"text",
    "chat_policy" "text" DEFAULT 'selon_humeur'::"text",
    "ac_available" boolean DEFAULT false,
    "perfume_free" boolean DEFAULT false,
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ride_driver_profiles_bio_check" CHECK (("char_length"("bio") <= 400)),
    CONSTRAINT "ride_driver_profiles_chat_policy_check" CHECK (("chat_policy" = ANY (ARRAY['silencieux'::"text", 'selon_humeur'::"text", 'bavard'::"text"]))),
    CONSTRAINT "ride_driver_profiles_music_policy_check" CHECK (("music_policy" = ANY (ARRAY['silence'::"text", 'selon_humeur'::"text", 'musique'::"text"]))),
    CONSTRAINT "ride_driver_profiles_smoking_policy_check" CHECK (("smoking_policy" = ANY (ARRAY['non_fumeur'::"text", 'fumeur'::"text", 'exterieur'::"text"])))
);


ALTER TABLE "public"."ride_driver_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_gps_trail" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "ride_id" "uuid" NOT NULL,
    "lat" numeric(10,7) NOT NULL,
    "lng" numeric(10,7) NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '48:00:00'::interval)
);


ALTER TABLE "public"."ride_gps_trail" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "ride_messages_body_check" CHECK ((("length"(TRIM(BOTH FROM "body")) > 0) AND ("length"("body") <= 2000)))
);


ALTER TABLE "public"."ride_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_price_breakdowns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cost_per_km" numeric(5,2),
    "total_distance" numeric(8,2),
    "total_cost_base" numeric(8,2),
    "pax_distance" numeric(8,2),
    "pax_share_pct" numeric(5,2),
    "pax_base" numeric(8,2),
    "extras_detail" "jsonb" DEFAULT '{}'::"jsonb",
    "platform_pct" numeric(5,2) DEFAULT 10,
    "driver_receives" numeric(8,2),
    "passenger_pays" numeric(8,2),
    "calculated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ride_price_breakdowns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid",
    "booking_id" "uuid",
    "reporter_id" "uuid" NOT NULL,
    "reported_id" "uuid",
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'ouvert'::"text",
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ride_reports_status_check" CHECK (("status" = ANY (ARRAY['ouvert'::"text", 'en_traitement'::"text", 'resolu'::"text", 'ferme'::"text"])))
);


ALTER TABLE "public"."ride_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ride_search_logs" (
    "id" bigint NOT NULL,
    "from_city" "text",
    "to_city" "text",
    "from_norm" "text",
    "to_norm" "text",
    "results_count" integer DEFAULT 0 NOT NULL,
    "user_id" "uuid",
    "ip_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ride_search_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ride_search_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ride_search_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ride_search_logs_id_seq" OWNED BY "public"."ride_search_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."ride_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ride_id" "uuid" NOT NULL,
    "stop_order" integer NOT NULL,
    "city" "text" NOT NULL,
    "sector" "text",
    "lat" numeric(10,7),
    "lng" numeric(10,7),
    "eta" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ride_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "start_city" "text" NOT NULL,
    "start_sector" "text",
    "start_lat" numeric(10,7),
    "start_lng" numeric(10,7),
    "end_city" "text" NOT NULL,
    "end_sector" "text",
    "end_lat" numeric(10,7),
    "end_lng" numeric(10,7),
    "departure_time" timestamp with time zone NOT NULL,
    "flexibility_minutes" integer DEFAULT 0,
    "is_return_trip" boolean DEFAULT false,
    "return_departure_time" timestamp with time zone,
    "is_recurring" boolean DEFAULT false,
    "recurrence_days" "text"[],
    "vehicle_type" "text" DEFAULT 'berline'::"text",
    "trunk_size" "text" DEFAULT 'moyen'::"text",
    "available_seats" integer DEFAULT 1 NOT NULL,
    "accepts_pets" boolean DEFAULT false,
    "accepts_large_luggage" boolean DEFAULT false,
    "accepts_extra_stops" boolean DEFAULT false,
    "non_smoker" boolean DEFAULT true,
    "women_only" boolean DEFAULT false,
    "child_seat_available" boolean DEFAULT false,
    "accessible" boolean DEFAULT false,
    "personal_rules" "text",
    "cost_per_km" numeric(5,2) DEFAULT 0.35,
    "total_distance_km" numeric(8,2),
    "status" "text" DEFAULT 'publie'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "smoking_policy" "text" DEFAULT 'non_fumeur'::"text",
    "music_policy" "text" DEFAULT 'selon_humeur'::"text",
    "chat_policy" "text" DEFAULT 'selon_humeur'::"text",
    "ac_available" boolean DEFAULT false,
    "stop_points" "jsonb" DEFAULT '[]'::"jsonb",
    "accepts_packages" boolean DEFAULT false,
    "package_max_kg" numeric DEFAULT 10,
    "package_max_dim_cm" numeric DEFAULT 60,
    "recurrence_frequency" "text" DEFAULT 'weekly'::"text",
    "pickup_safe_label" "text",
    "dropoff_safe_label" "text",
    "commission_free" boolean DEFAULT false NOT NULL,
    "total_seats" integer,
    "energy_type" "text" DEFAULT 'essence'::"text" NOT NULL,
    CONSTRAINT "rides_available_seats_check" CHECK ((("available_seats" >= 1) AND ("available_seats" <= 8))),
    CONSTRAINT "rides_status_check" CHECK (("status" = ANY (ARRAY['publie'::"text", 'complet'::"text", 'annule'::"text", 'termine'::"text"]))),
    CONSTRAINT "rides_trunk_size_check" CHECK (("trunk_size" = ANY (ARRAY['petit'::"text", 'moyen'::"text", 'grand'::"text"])))
);


ALTER TABLE "public"."rides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."safe_meeting_point_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "point_id" "uuid",
    "reporter_id" "uuid",
    "reason" "text" DEFAULT 'problem'::"text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid"
);


ALTER TABLE "public"."safe_meeting_point_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."safe_meeting_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "city" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "type" "text" DEFAULT 'autre'::"text" NOT NULL,
    "verified" boolean DEFAULT true,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sector" "text",
    "hours" "text",
    "notes" "text",
    "photo_url" "text",
    "has_cameras" boolean DEFAULT false,
    "well_lit" boolean DEFAULT true,
    "parking_free" boolean DEFAULT true,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "region" "text",
    "usage_type" "text" DEFAULT 'both'::"text",
    "place_category" "text" DEFAULT 'public_place'::"text",
    "safety_score" integer DEFAULT 65,
    "verification_source" "text" DEFAULT 'community'::"text",
    "status" "text" DEFAULT 'suggested'::"text",
    "partnership_status" "text" DEFAULT 'suggested_public_place'::"text",
    "winter_accessible" boolean DEFAULT false,
    "camera_possible" boolean DEFAULT false,
    "public_transit_nearby" boolean DEFAULT false,
    "open_evening" boolean DEFAULT false,
    "easy_parking" boolean DEFAULT true,
    "notes_public" "text",
    "notes_admin" "text",
    "report_count" integer DEFAULT 0,
    "usage_count" integer DEFAULT 0,
    "source_url" "text",
    "last_reviewed_at" timestamp with time zone,
    "suggested_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "removed_reason" "text"
);


ALTER TABLE "public"."safe_meeting_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solidarity_missions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "title" "text",
    "description" "text",
    "pickup_address" "text",
    "delivery_address" "text",
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."solidarity_missions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sos_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "user_prenom" "text",
    "user_phone" "text",
    "ride_id" "text",
    "booking_id" "text",
    "latitude" double precision,
    "longitude" double precision,
    "accuracy" double precision,
    "context" "text",
    "page" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sos_alerts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stats_plateforme" WITH ("security_invoker"='true') AS
 SELECT ( SELECT "count"(*) AS "count"
           FROM "public"."profiles"
          WHERE ("profiles"."actif" = true)) AS "total_utilisateurs",
    ( SELECT "count"(*) AS "count"
           FROM "public"."profiles"
          WHERE (("profiles"."role" = ANY (ARRAY['livreur'::"text", 'les deux'::"text"])) AND ("profiles"."actif" = true))) AS "total_livreurs",
    ( SELECT "count"(*) AS "count"
           FROM "public"."livraisons"
          WHERE ("livraisons"."statut" = 'livre'::"text")) AS "total_livraisons",
    ( SELECT COALESCE("sum"("livraisons"."prix_base"), (0)::numeric) AS "coalesce"
           FROM "public"."livraisons"
          WHERE ("livraisons"."statut" = 'livre'::"text")) AS "volume_total_cad";


ALTER VIEW "public"."stats_plateforme" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_connect_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_account_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "country" "text" DEFAULT 'CA'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stripe_connect_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracking_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid",
    "event_type" "text",
    "message" "text",
    "lat" numeric,
    "lng" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tracking_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid",
    "livraison_id" "uuid",
    "user_id" "uuid",
    "actor_id" "uuid",
    "event_type" "text" NOT NULL,
    "amount_cents" integer,
    "currency" "text" DEFAULT 'cad'::"text",
    "stripe_payment_intent" "text",
    "stripe_refund_id" "text",
    "status" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "retention_until" timestamp with time zone DEFAULT ("now"() + '7 years'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaction_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "montant_coins" integer DEFAULT 0 NOT NULL,
    "montant_cad" numeric DEFAULT 0,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "livraison_id" "uuid",
    "stripe_id" "text" DEFAULT ''::"text",
    "solde_avant" integer DEFAULT 0 NOT NULL,
    "solde_apres" integer DEFAULT 0 NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['achat_coins'::"text", 'gain_livraison'::"text", 'gain_parrainage'::"text", 'gain_badge'::"text", 'gain_streak'::"text", 'gain_mission'::"text", 'gain_bienvenue'::"text", 'echange_recompense'::"text", 'transfert_envoye'::"text", 'transfert_recu'::"text", 'deduction_admin'::"text", 'bonus_eco'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid",
    "start_address" "text",
    "end_address" "text",
    "departure_time" timestamp with time zone,
    "available_space" "text",
    "vehicle_type" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_cov_badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "badge_id" "uuid" NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_cov_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_cov_missions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "mission_id" "uuid" NOT NULL,
    "progress" integer DEFAULT 0,
    "done" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_cov_missions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_missions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "mission_id" "uuid" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_missions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_driver_scores" WITH ("security_invoker"='true') AS
 SELECT "p"."id" AS "user_id",
    "p"."prenom",
    "p"."score_confiance" AS "score_global",
    "p"."score_ponctualite",
    "p"."score_fiabilite",
    "p"."score_comportement",
    "p"."taux_annulation",
    "p"."nb_trajets_chauffeur",
    "p"."nb_trajets_passager",
    COALESCE("round"("avg"("r"."rating"), 2), (0)::numeric) AS "note_moyenne",
    "count"("r"."id") AS "nb_avis",
    COALESCE("round"("avg"("r"."note_ponctualite"), 2), (0)::numeric) AS "note_moy_ponctualite",
    COALESCE("round"("avg"("r"."note_fiabilite"), 2), (0)::numeric) AS "note_moy_fiabilite",
    COALESCE("round"("avg"("r"."note_comportement"), 2), (0)::numeric) AS "note_moy_comportement"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."reviews" "r" ON (("r"."reviewed_id" = "p"."id")))
  GROUP BY "p"."id", "p"."prenom", "p"."score_confiance", "p"."score_ponctualite", "p"."score_fiabilite", "p"."score_comportement", "p"."taux_annulation", "p"."nb_trajets_chauffeur", "p"."nb_trajets_passager";


ALTER VIEW "public"."v_driver_scores" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_livreur_balance" WITH ("security_invoker"='true') AS
 SELECT "user_id",
    COALESCE("sum"("net_amount") FILTER (WHERE (("status" = 'available'::"text") AND ("available_after" <= "now"()))), (0)::numeric) AS "balance_available",
    COALESCE("sum"("net_amount") FILTER (WHERE ("status" = 'pending'::"text")), (0)::numeric) AS "balance_pending",
    COALESCE("sum"("net_amount"), (0)::numeric) AS "total_earned",
    COALESCE("sum"("net_amount") FILTER (WHERE ("status" = 'transferred'::"text")), (0)::numeric) AS "total_transferred"
   FROM "public"."livreur_earnings"
  GROUP BY "user_id";


ALTER VIEW "public"."v_livreur_balance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_protection_fund_balance" WITH ("security_invoker"='true') AS
 SELECT COALESCE("sum"("amount_cents") FILTER (WHERE ("entry_type" = 'contribution'::"text")), (0)::bigint) AS "total_contributions_cents",
    COALESCE("sum"("amount_cents") FILTER (WHERE ("entry_type" = 'payout'::"text")), (0)::bigint) AS "total_payouts_cents",
    COALESCE("sum"("amount_cents") FILTER (WHERE ("entry_type" = 'adjustment'::"text")), (0)::bigint) AS "total_adjustments_cents",
    COALESCE("sum"(
        CASE
            WHEN ("entry_type" = 'contribution'::"text") THEN "amount_cents"
            WHEN ("entry_type" = 'payout'::"text") THEN (- "amount_cents")
            WHEN ("entry_type" = 'adjustment'::"text") THEN "amount_cents"
            ELSE 0
        END), (0)::bigint) AS "balance_cents",
    "count"(*) AS "nb_entries"
   FROM "public"."protection_fund_ledger";


ALTER VIEW "public"."v_protection_fund_balance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_user_fiabilite" WITH ("security_invoker"='true') AS
 SELECT "p"."id",
    "p"."email",
    "p"."score",
    "count"("m"."id") FILTER (WHERE ("m"."statut" = 'valide'::"text")) AS "manquements_valides",
    "count"("m"."id") FILTER (WHERE ("m"."statut" = 'partage'::"text")) AS "manquements_partages",
    "count"("m"."id") FILTER (WHERE ("m"."statut" = ANY (ARRAY['signale'::"text", 'conteste'::"text"]))) AS "manquements_en_attente"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."manquements" "m" ON (("m"."accuse_id" = "p"."id")))
  GROUP BY "p"."id", "p"."email", "p"."score";


ALTER VIEW "public"."v_user_fiabilite" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "ville" "text" NOT NULL,
    "role" "text" DEFAULT 'expediteur'::"text",
    "message" "text",
    "contacted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "amount" numeric(10,2) DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."wallet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webauthn_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "challenge" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webauthn_challenges_purpose_check" CHECK (("purpose" = ANY (ARRAY['registration'::"text", 'authentication'::"text"])))
);


ALTER TABLE "public"."webauthn_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webauthn_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "credential_id" "text" NOT NULL,
    "public_key" "text",
    "counter" bigint DEFAULT 0 NOT NULL,
    "transports" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "device_name" "text",
    "backed_up" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "public_key_jwk" "jsonb"
);


ALTER TABLE "public"."webauthn_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."xp_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "amount" integer NOT NULL,
    "reason" "text" NOT NULL,
    "ref_type" "text",
    "ref_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."xp_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "region" "text",
    "status" "text" DEFAULT 'coming_soon'::"text",
    "lat" numeric,
    "lng" numeric,
    "radius_km" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."zones" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ride_search_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ride_search_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."address_intelligence"
    ADD CONSTRAINT "address_intelligence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address_intelligence_votes"
    ADD CONSTRAINT "address_intelligence_votes_intel_id_user_id_key" UNIQUE ("intel_id", "user_id");



ALTER TABLE ONLY "public"."address_intelligence_votes"
    ADD CONSTRAINT "address_intelligence_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."codes_promo"
    ADD CONSTRAINT "codes_promo_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."codes_promo"
    ADD CONSTRAINT "codes_promo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_vote_responses"
    ADD CONSTRAINT "community_vote_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_vote_responses"
    ADD CONSTRAINT "community_vote_responses_vote_id_user_id_key" UNIQUE ("vote_id", "user_id");



ALTER TABLE ONLY "public"."community_votes"
    ADD CONSTRAINT "community_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cov_badges"
    ADD CONSTRAINT "cov_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cov_badges"
    ADD CONSTRAINT "cov_badges_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."cov_missions"
    ADD CONSTRAINT "cov_missions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cov_missions"
    ADD CONSTRAINT "cov_missions_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."cov_reviews"
    ADD CONSTRAINT "cov_reviews_booking_id_reviewer_id_key" UNIQUE ("booking_id", "reviewer_id");



ALTER TABLE ONLY "public"."cov_reviews"
    ADD CONSTRAINT "cov_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cov_xp_log"
    ADD CONSTRAINT "cov_xp_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_locations"
    ADD CONSTRAINT "delivery_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draw_entries"
    ADD CONSTRAINT "draw_entries_draw_id_user_id_key" UNIQUE ("draw_id", "user_id");



ALTER TABLE ONLY "public"."draw_entries"
    ADD CONSTRAINT "draw_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draw_winners"
    ADD CONSTRAINT "draw_winners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_verifications"
    ADD CONSTRAINT "driver_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_user_id_priority_key" UNIQUE ("user_id", "priority");



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_livraison_id_auteur_id_key" UNIQUE ("livraison_id", "auteur_id");



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impact_applications"
    ADD CONSTRAINT "impact_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impact_mode_feedback"
    ADD CONSTRAINT "impact_mode_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impact_organisations"
    ADD CONSTRAINT "impact_organisations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impact_settings"
    ADD CONSTRAINT "impact_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kyc_submissions"
    ADD CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."liste_attente"
    ADD CONSTRAINT "liste_attente_code_perso_key" UNIQUE ("code_perso");



ALTER TABLE ONLY "public"."liste_attente"
    ADD CONSTRAINT "liste_attente_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."liste_attente"
    ADD CONSTRAINT "liste_attente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."litiges"
    ADD CONSTRAINT "litiges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."livreur_earnings"
    ADD CONSTRAINT "livreur_earnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manquements"
    ADD CONSTRAINT "manquements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."missions_participants"
    ADD CONSTRAINT "missions_participants_mission_id_user_id_key" UNIQUE ("mission_id", "user_id");



ALTER TABLE ONLY "public"."missions_participants"
    ADD CONSTRAINT "missions_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."missions"
    ADD CONSTRAINT "missions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."monthly_draws"
    ADD CONSTRAINT "monthly_draws_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offres"
    ADD CONSTRAINT "offres_livraison_id_livreur_id_key" UNIQUE ("livraison_id", "livreur_id");



ALTER TABLE ONLY "public"."offres"
    ADD CONSTRAINT "offres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organismes_partenaires"
    ADD CONSTRAINT "organismes_partenaires_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organismes_partenaires"
    ADD CONSTRAINT "organismes_partenaires_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."porte_coins_transactions"
    ADD CONSTRAINT "porte_coins_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_code_parrain_key" UNIQUE ("code_parrain");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_driver_status_check" CHECK (("driver_status" = ANY (ARRAY['not_started'::"text", 'pending_review'::"text", 'verified'::"text", 'rejected'::"text", 'suspended'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_transport_mode_check" CHECK ((("transport_mode" = ANY (ARRAY['walking'::"text", 'bike'::"text", 'car'::"text", 'van'::"text"])) OR ("transport_mode" IS NULL))) NOT VALID;



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text", 'suspended'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."promo_code_uses"
    ADD CONSTRAINT "promo_code_uses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."protection_fund_ledger"
    ADD CONSTRAINT "protection_fund_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."protection_fund_payouts"
    ADD CONSTRAINT "protection_fund_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referee_id_key" UNIQUE ("referee_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reward_audit_logs"
    ADD CONSTRAINT "reward_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_ride_id_passenger_id_key" UNIQUE ("ride_id", "passenger_id");



ALTER TABLE ONLY "public"."ride_driver_profiles"
    ADD CONSTRAINT "ride_driver_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."ride_gps_trail"
    ADD CONSTRAINT "ride_gps_trail_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_messages"
    ADD CONSTRAINT "ride_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_price_breakdowns"
    ADD CONSTRAINT "ride_price_breakdowns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_reports"
    ADD CONSTRAINT "ride_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_search_logs"
    ADD CONSTRAINT "ride_search_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ride_stops"
    ADD CONSTRAINT "ride_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."safe_meeting_point_reports"
    ADD CONSTRAINT "safe_meeting_point_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."safe_meeting_points"
    ADD CONSTRAINT "safe_meeting_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solidarity_missions"
    ADD CONSTRAINT "solidarity_missions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sos_alerts"
    ADD CONSTRAINT "sos_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_stripe_account_id_key" UNIQUE ("stripe_account_id");



ALTER TABLE ONLY "public"."tracking_events"
    ADD CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_audit_events"
    ADD CONSTRAINT "transaction_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_badge_id_key" UNIQUE ("user_id", "badge_id");



ALTER TABLE ONLY "public"."user_cov_badges"
    ADD CONSTRAINT "user_cov_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_cov_badges"
    ADD CONSTRAINT "user_cov_badges_user_id_badge_id_key" UNIQUE ("user_id", "badge_id");



ALTER TABLE ONLY "public"."user_cov_missions"
    ADD CONSTRAINT "user_cov_missions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_cov_missions"
    ADD CONSTRAINT "user_cov_missions_user_id_mission_id_key" UNIQUE ("user_id", "mission_id");



ALTER TABLE ONLY "public"."user_missions"
    ADD CONSTRAINT "user_missions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_missions"
    ADD CONSTRAINT "user_missions_user_id_mission_id_key" UNIQUE ("user_id", "mission_id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet"
    ADD CONSTRAINT "wallet_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet"
    ADD CONSTRAINT "wallet_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."webauthn_challenges"
    ADD CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webauthn_credentials"
    ADD CONSTRAINT "webauthn_credentials_credential_id_key" UNIQUE ("credential_id");



ALTER TABLE ONLY "public"."webauthn_credentials"
    ADD CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."xp_transactions"
    ADD CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");



CREATE INDEX "evaluations_auteur_id_idx" ON "public"."evaluations" USING "btree" ("auteur_id");



CREATE INDEX "idx_addr_intel_category" ON "public"."address_intelligence" USING "btree" ("category");



CREATE INDEX "idx_addr_intel_norm" ON "public"."address_intelligence" USING "btree" ("address_normalized");



CREATE INDEX "idx_badges_active_from" ON "public"."badges" USING "btree" ("active_from") WHERE ("active_from" IS NOT NULL);



CREATE INDEX "idx_badges_campaign" ON "public"."badges" USING "btree" ("campaign_name") WHERE ("campaign_name" IS NOT NULL);



CREATE INDEX "idx_badges_paused" ON "public"."badges" USING "btree" ("paused") WHERE ("paused" = true);



CREATE INDEX "idx_bookings_passenger" ON "public"."ride_bookings" USING "btree" ("passenger_id");



CREATE INDEX "idx_bookings_ride" ON "public"."ride_bookings" USING "btree" ("ride_id");



CREATE INDEX "idx_bookings_status" ON "public"."ride_bookings" USING "btree" ("status");



CREATE INDEX "idx_breakdown_booking" ON "public"."ride_price_breakdowns" USING "btree" ("booking_id");



CREATE INDEX "idx_codes_promo_code_active" ON "public"."codes_promo" USING "btree" ("code", "active");



CREATE INDEX "idx_coins_user" ON "public"."porte_coins_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_cov_reviews_reviewed" ON "public"."cov_reviews" USING "btree" ("reviewed_id");



CREATE INDEX "idx_cov_reviews_ride" ON "public"."cov_reviews" USING "btree" ("ride_id");



CREATE INDEX "idx_cov_xp_log_user" ON "public"."cov_xp_log" USING "btree" ("user_id");



CREATE INDEX "idx_deliveries_sender_id" ON "public"."deliveries" USING "btree" ("sender_id");



CREATE INDEX "idx_deliveries_status" ON "public"."deliveries" USING "btree" ("status");



CREATE INDEX "idx_delivery_locations_driver_created" ON "public"."delivery_locations" USING "btree" ("driver_id", "created_at" DESC);



CREATE INDEX "idx_delivery_locations_livraison" ON "public"."delivery_locations" USING "btree" ("livraison_id");



CREATE INDEX "idx_delivery_locations_livraison_created" ON "public"."delivery_locations" USING "btree" ("livraison_id", "created_at" DESC);



CREATE INDEX "idx_delivery_locations_recorded" ON "public"."delivery_locations" USING "btree" ("recorded_at" DESC);



CREATE INDEX "idx_delivery_proofs_storage_path" ON "public"."delivery_proofs" USING "btree" ("photo_storage_path") WHERE ("photo_storage_path" IS NOT NULL);



CREATE INDEX "idx_driver_verifications_user_created" ON "public"."driver_verifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_emergency_contacts_user" ON "public"."emergency_contacts" USING "btree" ("user_id");



CREATE INDEX "idx_evaluations_evalue" ON "public"."evaluations" USING "btree" ("evalue_id");



CREATE INDEX "idx_gps_trail_booking" ON "public"."ride_gps_trail" USING "btree" ("booking_id");



CREATE INDEX "idx_gps_trail_expires" ON "public"."ride_gps_trail" USING "btree" ("expires_at");



CREATE INDEX "idx_kyc_statut" ON "public"."kyc_submissions" USING "btree" ("statut");



CREATE INDEX "idx_kyc_user_id" ON "public"."kyc_submissions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_kyc_user_id_unique" ON "public"."kyc_submissions" USING "btree" ("user_id");



CREATE INDEX "idx_liste_attente_email" ON "public"."liste_attente" USING "btree" ("email");



CREATE INDEX "idx_litiges_livraison" ON "public"."litiges" USING "btree" ("livraison_id");



CREATE INDEX "idx_litiges_statut" ON "public"."litiges" USING "btree" ("statut");



CREATE INDEX "idx_livraisons_code" ON "public"."livraisons" USING "btree" ("code");



CREATE INDEX "idx_livraisons_cree_le" ON "public"."livraisons" USING "btree" ("cree_le" DESC);



CREATE INDEX "idx_livraisons_date_souhaitee" ON "public"."livraisons" USING "btree" ("date_souhaitee") WHERE ("date_souhaitee" IS NOT NULL);



CREATE INDEX "idx_livraisons_expediteur" ON "public"."livraisons" USING "btree" ("expediteur_id");



CREATE INDEX "idx_livraisons_litige_review" ON "public"."livraisons" USING "btree" ("statut", "delivery_proof_required_admin_review");



CREATE INDEX "idx_livraisons_livreur" ON "public"."livraisons" USING "btree" ("livreur_id");



CREATE INDEX "idx_livraisons_recipient_confirmation" ON "public"."livraisons" USING "btree" ("recipient_confirmation_hash") WHERE ("recipient_confirmation_hash" IS NOT NULL);



CREATE INDEX "idx_livraisons_statut" ON "public"."livraisons" USING "btree" ("statut");



CREATE INDEX "idx_livreur_earnings_status" ON "public"."livreur_earnings" USING "btree" ("user_id", "status");



CREATE INDEX "idx_livreur_earnings_user" ON "public"."livreur_earnings" USING "btree" ("user_id");



CREATE INDEX "idx_manquements_accuse" ON "public"."manquements" USING "btree" ("accuse_id");



CREATE INDEX "idx_manquements_livraison" ON "public"."manquements" USING "btree" ("livraison_id");



CREATE INDEX "idx_manquements_signaleur" ON "public"."manquements" USING "btree" ("signaleur_id");



CREATE INDEX "idx_matches_delivery_id" ON "public"."matches" USING "btree" ("delivery_id");



CREATE INDEX "idx_matches_driver_id" ON "public"."matches" USING "btree" ("driver_id");



CREATE INDEX "idx_messages_conv_id" ON "public"."messages" USING "btree" ("conv_id");



CREATE INDEX "idx_messages_destinataire_id" ON "public"."messages" USING "btree" ("destinataire_id");



CREATE INDEX "idx_messages_expediteur_id" ON "public"."messages" USING "btree" ("expediteur_id");



CREATE INDEX "idx_messages_livraison_id" ON "public"."messages" USING "btree" ("livraison_id");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_modules_slug" ON "public"."modules" USING "btree" ("slug");



CREATE INDEX "idx_msg_destinataire" ON "public"."messages" USING "btree" ("destinataire_id");



CREATE INDEX "idx_msg_expediteur" ON "public"."messages" USING "btree" ("expediteur_id");



CREATE INDEX "idx_msg_livraison" ON "public"."messages" USING "btree" ("livraison_id");



CREATE INDEX "idx_offres_livraison" ON "public"."offres" USING "btree" ("livraison_id");



CREATE INDEX "idx_offres_livreur" ON "public"."offres" USING "btree" ("livreur_id");



CREATE INDEX "idx_pfl_created" ON "public"."protection_fund_ledger" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pfl_type" ON "public"."protection_fund_ledger" USING "btree" ("entry_type");



CREATE INDEX "idx_pfp_created" ON "public"."protection_fund_payouts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_profiles_code_parrain" ON "public"."profiles" USING "btree" ("code_parrain");



CREATE INDEX "idx_profiles_driver_security" ON "public"."profiles" USING "btree" ("role", "driver_status", "suspendu", "email_verified");



CREATE INDEX "idx_profiles_pet_pending" ON "public"."profiles" USING "btree" ("updated_at" DESC) WHERE ("pet_photo_status" = 'pending'::"text");



CREATE INDEX "idx_profiles_photo_pending" ON "public"."profiles" USING "btree" ("photo_submitted_at" DESC) WHERE ("photo_status" = 'pending'::"text");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_subscription" ON "public"."profiles" USING "btree" ("subscription_status", "subscription_plan") WHERE ("subscription_status" = 'active'::"text");



CREATE INDEX "idx_profiles_suspendu" ON "public"."profiles" USING "btree" ("suspendu");



CREATE INDEX "idx_profiles_vehicule" ON "public"."profiles" USING "btree" ("vehicule");



CREATE INDEX "idx_profiles_ville" ON "public"."profiles" USING "btree" ("ville");



CREATE INDEX "idx_promo_code_uses_promo" ON "public"."promo_code_uses" USING "btree" ("promo_code_id");



CREATE INDEX "idx_promo_code_uses_user" ON "public"."promo_code_uses" USING "btree" ("user_id", "promo_code_id");



CREATE UNIQUE INDEX "idx_promo_codes_code_upper" ON "public"."promo_codes" USING "btree" ("upper"("code"));



CREATE INDEX "idx_push_user" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_referral_codes_code" ON "public"."referral_codes" USING "btree" ("code");



CREATE INDEX "idx_referral_codes_user_id" ON "public"."referral_codes" USING "btree" ("user_id");



CREATE INDEX "idx_referrals_code" ON "public"."referrals" USING "btree" ("code");



CREATE INDEX "idx_referrals_referee" ON "public"."referrals" USING "btree" ("referee_id");



CREATE UNIQUE INDEX "idx_referrals_referred_once" ON "public"."referrals" USING "btree" ("referred_id") WHERE ("referred_id" IS NOT NULL);



CREATE INDEX "idx_referrals_referrer" ON "public"."referrals" USING "btree" ("referrer_id");



CREATE INDEX "idx_reports_ride" ON "public"."ride_reports" USING "btree" ("ride_id");



CREATE INDEX "idx_reports_status" ON "public"."ride_reports" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_reviews_anon_destinataire" ON "public"."reviews" USING "btree" ("delivery_id", "reviewer_role") WHERE (("is_anonymous" = true) AND ("reviewer_role" = 'destinataire'::"text"));



CREATE UNIQUE INDEX "idx_reviews_delivery_reviewer" ON "public"."reviews" USING "btree" ("delivery_id", "reviewer_id");



CREATE UNIQUE INDEX "idx_reviews_direction_unique" ON "public"."reviews" USING "btree" ("delivery_id", "reviewer_role") WHERE ("reviewer_id" IS NOT NULL);



CREATE INDEX "idx_reviews_reviewed" ON "public"."reviews" USING "btree" ("reviewed_id");



CREATE INDEX "idx_reviews_reviewed_id" ON "public"."reviews" USING "btree" ("reviewed_id");



CREATE INDEX "idx_reviews_ride_id" ON "public"."reviews" USING "btree" ("ride_id") WHERE ("ride_id" IS NOT NULL);



CREATE INDEX "idx_reward_audit_action" ON "public"."reward_audit_logs" USING "btree" ("action");



CREATE INDEX "idx_reward_audit_user" ON "public"."reward_audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_ride_bookings_driver_completed_timeout" ON "public"."ride_bookings" USING "btree" ("updated_at") WHERE (("status" = 'driver_completed'::"text") AND ("safety_alert_triggered" = false));



CREATE INDEX "idx_ride_bookings_payment_status" ON "public"."ride_bookings" USING "btree" ("payment_status");



CREATE INDEX "idx_ride_bookings_safety_alert" ON "public"."ride_bookings" USING "btree" ("safety_alert_triggered") WHERE ("safety_alert_triggered" = true);



CREATE INDEX "idx_ride_bookings_status_paid" ON "public"."ride_bookings" USING "btree" ("status", "paid_at") WHERE ("paid_at" IS NULL);



CREATE UNIQUE INDEX "idx_ride_bookings_stripe_payment_intent" ON "public"."ride_bookings" USING "btree" ("stripe_payment_intent") WHERE ("stripe_payment_intent" IS NOT NULL);



CREATE INDEX "idx_ride_stops_ride" ON "public"."ride_stops" USING "btree" ("ride_id", "stop_order");



CREATE INDEX "idx_ridemsg_recipient" ON "public"."ride_messages" USING "btree" ("recipient_id", "read_at") WHERE ("read_at" IS NULL);



CREATE INDEX "idx_ridemsg_ride" ON "public"."ride_messages" USING "btree" ("ride_id");



CREATE INDEX "idx_ridemsg_thread" ON "public"."ride_messages" USING "btree" ("ride_id", "sender_id", "recipient_id", "created_at");



CREATE INDEX "idx_rides_departure" ON "public"."rides" USING "btree" ("departure_time");



CREATE INDEX "idx_rides_driver" ON "public"."rides" USING "btree" ("driver_id");



CREATE INDEX "idx_rides_end_city" ON "public"."rides" USING "btree" ("end_city");



CREATE INDEX "idx_rides_smoking" ON "public"."rides" USING "btree" ("smoking_policy");



CREATE INDEX "idx_rides_start_city" ON "public"."rides" USING "btree" ("start_city");



CREATE INDEX "idx_rides_status" ON "public"."rides" USING "btree" ("status");



CREATE INDEX "idx_rides_trunk" ON "public"."rides" USING "btree" ("trunk_size");



CREATE INDEX "idx_safe_meeting_point_reports_point" ON "public"."safe_meeting_point_reports" USING "btree" ("point_id", "status");



CREATE INDEX "idx_safe_meeting_points_city" ON "public"."safe_meeting_points" USING "btree" ("city") WHERE ("active" = true);



CREATE INDEX "idx_safe_meeting_points_city_status" ON "public"."safe_meeting_points" USING "btree" ("city", "status", "active");



CREATE INDEX "idx_safe_meeting_points_sector" ON "public"."safe_meeting_points" USING "btree" ("city", "sector") WHERE ("active" = true);



CREATE INDEX "idx_safe_meeting_points_usage" ON "public"."safe_meeting_points" USING "btree" ("usage_type", "safety_score" DESC);



CREATE INDEX "idx_searchlogs_date" ON "public"."ride_search_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_searchlogs_from" ON "public"."ride_search_logs" USING "btree" ("from_norm", "created_at" DESC);



CREATE INDEX "idx_searchlogs_to" ON "public"."ride_search_logs" USING "btree" ("to_norm", "created_at" DESC);



CREATE INDEX "idx_searchlogs_zero" ON "public"."ride_search_logs" USING "btree" ("from_norm", "to_norm") WHERE ("results_count" = 0);



CREATE INDEX "idx_tracking_delivery_id" ON "public"."tracking_events" USING "btree" ("delivery_id");



CREATE INDEX "idx_transactions_cree_le" ON "public"."transactions" USING "btree" ("cree_le" DESC);



CREATE INDEX "idx_transactions_livraison" ON "public"."transactions" USING "btree" ("livraison_id");



CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");



CREATE INDEX "idx_transactions_user" ON "public"."transactions" USING "btree" ("user_id");



CREATE INDEX "idx_trips_driver_id" ON "public"."trips" USING "btree" ("driver_id");



CREATE INDEX "idx_trips_status" ON "public"."trips" USING "btree" ("status");



CREATE INDEX "idx_user_badges_badge" ON "public"."user_badges" USING "btree" ("badge_id");



CREATE INDEX "idx_user_badges_user" ON "public"."user_badges" USING "btree" ("user_id");



CREATE INDEX "idx_user_cov_badges_badge" ON "public"."user_cov_badges" USING "btree" ("badge_id");



CREATE INDEX "idx_user_cov_badges_user" ON "public"."user_cov_badges" USING "btree" ("user_id");



CREATE INDEX "idx_user_cov_missions_user" ON "public"."user_cov_missions" USING "btree" ("user_id");



CREATE INDEX "idx_votes_active" ON "public"."community_votes" USING "btree" ("statut", "fin");



CREATE INDEX "idx_webauthn_challenges_expiry" ON "public"."webauthn_challenges" USING "btree" ("expires_at");



CREATE INDEX "idx_webauthn_challenges_user_purpose_created" ON "public"."webauthn_challenges" USING "btree" ("user_id", "purpose", "created_at" DESC);



CREATE INDEX "idx_webauthn_credentials_user" ON "public"."webauthn_credentials" USING "btree" ("user_id");



CREATE INDEX "idx_xp_tx_user" ON "public"."xp_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_zones_status" ON "public"."zones" USING "btree" ("status");



CREATE INDEX "messages_cree_le_idx" ON "public"."messages" USING "btree" ("cree_le" DESC);



CREATE INDEX "messages_destinataire_idx" ON "public"."messages" USING "btree" ("destinataire_id");



CREATE INDEX "messages_expediteur_idx" ON "public"."messages" USING "btree" ("expediteur_id");



CREATE INDEX "messages_livraison_idx" ON "public"."messages" USING "btree" ("livraison_id");



CREATE INDEX "profiles_parrain_id_idx" ON "public"."profiles" USING "btree" ("parrain_id");



CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "rate_limits_window_idx" ON "public"."rate_limits" USING "btree" ("window_start");



CREATE INDEX "stripe_connect_accounts_user_id_idx" ON "public"."stripe_connect_accounts" USING "btree" ("user_id");



CREATE INDEX "transaction_audit_livraison_idx" ON "public"."transaction_audit_events" USING "btree" ("livraison_id");



CREATE INDEX "transaction_audit_pi_idx" ON "public"."transaction_audit_events" USING "btree" ("stripe_payment_intent");



CREATE INDEX "transaction_audit_user_idx" ON "public"."transaction_audit_events" USING "btree" ("user_id");



CREATE UNIQUE INDEX "uniq_reviews_ride_pair" ON "public"."reviews" USING "btree" ("ride_id", "reviewer_id", "reviewed_id") WHERE ("ride_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "codes_promo_updated_at" BEFORE UPDATE ON "public"."codes_promo" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_prevent_self_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."pap_prevent_profile_self_escalation"();



CREATE OR REPLACE TRIGGER "protect_profile_privileged_fields" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_privileged_fields"();



CREATE OR REPLACE TRIGGER "ride_bookings_updated_at" BEFORE UPDATE ON "public"."ride_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ride_driver_profiles_updated_at" BEFORE UPDATE ON "public"."ride_driver_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "rides_updated_at" BEFORE UPDATE ON "public"."rides" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "safe_meeting_point_report_count_insert" AFTER INSERT OR DELETE OR UPDATE ON "public"."safe_meeting_point_reports" FOR EACH ROW EXECUTE FUNCTION "public"."safe_meeting_point_report_count"();



CREATE OR REPLACE TRIGGER "trg_protect_profile_privileged" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_privileged_columns"();



CREATE OR REPLACE TRIGGER "trg_safe_meeting_points_updated" BEFORE UPDATE ON "public"."safe_meeting_points" FOR EACH ROW EXECUTE FUNCTION "public"."touch_safe_meeting_points_updated"();



CREATE OR REPLACE TRIGGER "trigger_livraisons_updated" BEFORE UPDATE ON "public"."livraisons" FOR EACH ROW EXECUTE FUNCTION "public"."update_mis_a_jour_le"();



CREATE OR REPLACE TRIGGER "trigger_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_mis_a_jour_le"();



CREATE OR REPLACE TRIGGER "user_cov_missions_updated_at" BEFORE UPDATE ON "public"."user_cov_missions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."address_intelligence"
    ADD CONSTRAINT "address_intelligence_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."address_intelligence_votes"
    ADD CONSTRAINT "address_intelligence_votes_intel_id_fkey" FOREIGN KEY ("intel_id") REFERENCES "public"."address_intelligence"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."address_intelligence_votes"
    ADD CONSTRAINT "address_intelligence_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."codes_promo"
    ADD CONSTRAINT "codes_promo_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_vote_responses"
    ADD CONSTRAINT "community_vote_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_vote_responses"
    ADD CONSTRAINT "community_vote_responses_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "public"."community_votes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cov_missions"
    ADD CONSTRAINT "cov_missions_badge_slug_fkey" FOREIGN KEY ("badge_slug") REFERENCES "public"."cov_badges"("slug") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cov_reviews"
    ADD CONSTRAINT "cov_reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."ride_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cov_reviews"
    ADD CONSTRAINT "cov_reviews_reviewed_id_fkey" FOREIGN KEY ("reviewed_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cov_reviews"
    ADD CONSTRAINT "cov_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cov_reviews"
    ADD CONSTRAINT "cov_reviews_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cov_xp_log"
    ADD CONSTRAINT "cov_xp_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_locations"
    ADD CONSTRAINT "delivery_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_locations"
    ADD CONSTRAINT "delivery_locations_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_locations"
    ADD CONSTRAINT "delivery_locations_livreur_id_fkey" FOREIGN KEY ("livreur_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_livreur_id_fkey" FOREIGN KEY ("livreur_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."draw_entries"
    ADD CONSTRAINT "draw_entries_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "public"."monthly_draws"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draw_entries"
    ADD CONSTRAINT "draw_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draw_winners"
    ADD CONSTRAINT "draw_winners_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "public"."monthly_draws"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draw_winners"
    ADD CONSTRAINT "draw_winners_selected_by_fkey" FOREIGN KEY ("selected_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."draw_winners"
    ADD CONSTRAINT "draw_winners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_verifications"
    ADD CONSTRAINT "driver_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_verifications"
    ADD CONSTRAINT "driver_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_evalue_id_fkey" FOREIGN KEY ("evalue_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."impact_applications"
    ADD CONSTRAINT "impact_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."impact_settings"
    ADD CONSTRAINT "impact_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kyc_submissions"
    ADD CONSTRAINT "kyc_submissions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."kyc_submissions"
    ADD CONSTRAINT "kyc_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."litiges"
    ADD CONSTRAINT "litiges_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."litiges"
    ADD CONSTRAINT "litiges_plaignant_id_fkey" FOREIGN KEY ("plaignant_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."litiges"
    ADD CONSTRAINT "litiges_traite_par_fkey" FOREIGN KEY ("traite_par") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_destinataire_user_id_fkey" FOREIGN KEY ("destinataire_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_expediteur_id_fkey" FOREIGN KEY ("expediteur_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_livreur_id_fkey" FOREIGN KEY ("livreur_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_rescue_livreur_original_fkey" FOREIGN KEY ("rescue_livreur_original") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."livreur_earnings"
    ADD CONSTRAINT "livreur_earnings_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id");



ALTER TABLE ONLY "public"."livreur_earnings"
    ADD CONSTRAINT "livreur_earnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."manquements"
    ADD CONSTRAINT "manquements_accuse_id_fkey" FOREIGN KEY ("accuse_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."manquements"
    ADD CONSTRAINT "manquements_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manquements"
    ADD CONSTRAINT "manquements_signaleur_id_fkey" FOREIGN KEY ("signaleur_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_destinataire_id_fkey" FOREIGN KEY ("destinataire_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_expediteur_id_fkey" FOREIGN KEY ("expediteur_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."missions_participants"
    ADD CONSTRAINT "missions_participants_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."missions_participants"
    ADD CONSTRAINT "missions_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_draws"
    ADD CONSTRAINT "monthly_draws_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."offres"
    ADD CONSTRAINT "offres_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offres"
    ADD CONSTRAINT "offres_livreur_id_fkey" FOREIGN KEY ("livreur_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."missions"("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."porte_coins_transactions"
    ADD CONSTRAINT "porte_coins_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_parrain_id_fkey" FOREIGN KEY ("parrain_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promo_code_uses"
    ADD CONSTRAINT "promo_code_uses_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."protection_fund_ledger"
    ADD CONSTRAINT "protection_fund_ledger_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."protection_fund_payouts"
    ADD CONSTRAINT "protection_fund_payouts_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."livraisons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewed_id_fkey" FOREIGN KEY ("reviewed_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reward_audit_logs"
    ADD CONSTRAINT "reward_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reward_audit_logs"
    ADD CONSTRAINT "reward_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_bookings"
    ADD CONSTRAINT "ride_bookings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_driver_profiles"
    ADD CONSTRAINT "ride_driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_gps_trail"
    ADD CONSTRAINT "ride_gps_trail_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."ride_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_gps_trail"
    ADD CONSTRAINT "ride_gps_trail_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_messages"
    ADD CONSTRAINT "ride_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_messages"
    ADD CONSTRAINT "ride_messages_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_messages"
    ADD CONSTRAINT "ride_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_price_breakdowns"
    ADD CONSTRAINT "ride_price_breakdowns_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."ride_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_reports"
    ADD CONSTRAINT "ride_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."ride_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ride_reports"
    ADD CONSTRAINT "ride_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ride_reports"
    ADD CONSTRAINT "ride_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ride_reports"
    ADD CONSTRAINT "ride_reports_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ride_stops"
    ADD CONSTRAINT "ride_stops_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rides"
    ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."safe_meeting_point_reports"
    ADD CONSTRAINT "safe_meeting_point_reports_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "public"."safe_meeting_points"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."safe_meeting_point_reports"
    ADD CONSTRAINT "safe_meeting_point_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."safe_meeting_point_reports"
    ADD CONSTRAINT "safe_meeting_point_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."solidarity_missions"
    ADD CONSTRAINT "solidarity_missions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracking_events"
    ADD CONSTRAINT "tracking_events_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_audit_events"
    ADD CONSTRAINT "transaction_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_audit_events"
    ADD CONSTRAINT "transaction_audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_livraison_id_fkey" FOREIGN KEY ("livraison_id") REFERENCES "public"."livraisons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cov_badges"
    ADD CONSTRAINT "user_cov_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."cov_badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cov_badges"
    ADD CONSTRAINT "user_cov_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cov_missions"
    ADD CONSTRAINT "user_cov_missions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "public"."cov_missions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cov_missions"
    ADD CONSTRAINT "user_cov_missions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_missions"
    ADD CONSTRAINT "user_missions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_missions"
    ADD CONSTRAINT "user_missions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet"
    ADD CONSTRAINT "wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."webauthn_challenges"
    ADD CONSTRAINT "webauthn_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webauthn_credentials"
    ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."xp_transactions"
    ADD CONSTRAINT "xp_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Drivers can create trips" ON "public"."trips" FOR INSERT WITH CHECK (("auth"."uid"() = "driver_id"));



CREATE POLICY "Drivers can update their own matches" ON "public"."matches" FOR UPDATE USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "Drivers can update their own trips" ON "public"."trips" FOR UPDATE USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "Drivers can view their own matches" ON "public"."matches" FOR SELECT USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "Drivers can view their own trips" ON "public"."trips" FOR SELECT USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "Everyone can view active solidarity missions" ON "public"."solidarity_missions" FOR SELECT USING (("status" = ANY (ARRAY['pending'::"text", 'active'::"text"])));



CREATE POLICY "Everyone can view public modules" ON "public"."modules" FOR SELECT USING (("visibility" = ANY (ARRAY['public'::"text", 'beta'::"text"])));



CREATE POLICY "Everyone can view zones" ON "public"."zones" FOR SELECT USING (true);



CREATE POLICY "Insertion propre" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Lecture propre" ON "public"."push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Lecture propre" ON "public"."stripe_connect_accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Missions readable by all" ON "public"."missions" FOR SELECT USING (true);



CREATE POLICY "Service role full access" ON "public"."push_subscriptions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access" ON "public"."stripe_connect_accounts" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Suppression propre" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create deliveries" ON "public"."deliveries" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can create reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own deliveries" ON "public"."deliveries" FOR UPDATE USING (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view reviews about them" ON "public"."reviews" FOR SELECT USING ((("auth"."uid"() = "reviewer_id") OR ("auth"."uid"() = "reviewed_id")));



CREATE POLICY "Users can view their own deliveries" ON "public"."deliveries" FOR SELECT USING (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can view their own payments" ON "public"."payments" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "driver_id")));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view tracking for their own deliveries" ON "public"."tracking_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."deliveries"
  WHERE (("deliveries"."id" = "tracking_events"."delivery_id") AND ("deliveries"."sender_id" = "auth"."uid"())))));



CREATE POLICY "Wallet readable by owner" ON "public"."wallet" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."address_intelligence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."address_intelligence_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin avis all" ON "public"."reviews" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "admin lit dossiers kyc" ON "public"."kyc_submissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "admin modifie dossiers kyc" ON "public"."kyc_submissions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "admin_only" ON "public"."impact_mode_feedback" USING (false);



CREATE POLICY "admins manage meeting point reports" ON "public"."safe_meeting_point_reports" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'administrator'::"text", 'administrateur'::"text"])) AND (COALESCE("p"."suspendu", false) = false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'administrator'::"text", 'administrateur'::"text"])) AND (COALESCE("p"."suspendu", false) = false)))));



CREATE POLICY "admins manage meeting points" ON "public"."safe_meeting_points" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'administrator'::"text", 'administrateur'::"text"])) AND (COALESCE("p"."suspendu", false) = false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'administrator'::"text", 'administrateur'::"text"])) AND (COALESCE("p"."suspendu", false) = false)))));



CREATE POLICY "authenticated can report meeting points" ON "public"."safe_meeting_point_reports" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "authenticated can suggest meeting points" ON "public"."safe_meeting_points" FOR INSERT TO "authenticated" WITH CHECK (((COALESCE("status", 'suggested'::"text") = 'suggested'::"text") AND (COALESCE("verified", false) = false)));



CREATE POLICY "avis visibles" ON "public"."reviews" FOR SELECT USING (true);



ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "badges_admin_all" ON "public"."badges" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND (COALESCE("p"."suspendu", false) = false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND (COALESCE("p"."suspendu", false) = false)))));



CREATE POLICY "badges_public_read" ON "public"."badges" FOR SELECT USING (("active" = true));



CREATE POLICY "bookings_parties_read" ON "public"."ride_bookings" FOR SELECT TO "authenticated" USING ((("passenger_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."rides" "r"
  WHERE (("r"."id" = "ride_bookings"."ride_id") AND ("r"."driver_id" = "auth"."uid"())))) OR "public"."pap_is_admin"()));



CREATE POLICY "bookings_parties_update" ON "public"."ride_bookings" FOR UPDATE TO "authenticated" USING ((("passenger_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."rides" "r"
  WHERE (("r"."id" = "ride_bookings"."ride_id") AND ("r"."driver_id" = "auth"."uid"())))) OR "public"."pap_is_admin"())) WITH CHECK ((("passenger_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."rides" "r"
  WHERE (("r"."id" = "ride_bookings"."ride_id") AND ("r"."driver_id" = "auth"."uid"())))) OR "public"."pap_is_admin"()));



CREATE POLICY "bookings_passenger_insert" ON "public"."ride_bookings" FOR INSERT TO "authenticated" WITH CHECK (("passenger_id" = "auth"."uid"()));



CREATE POLICY "breakdown_admin_all" ON "public"."ride_price_breakdowns" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "breakdown_own_read" ON "public"."ride_price_breakdowns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ride_bookings" "rb"
     JOIN "public"."rides" "r" ON (("r"."id" = "rb"."ride_id")))
  WHERE (("rb"."id" = "ride_price_breakdowns"."booking_id") AND (("rb"."passenger_id" = "auth"."uid"()) OR ("r"."driver_id" = "auth"."uid"()))))));



ALTER TABLE "public"."codes_promo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "codes_promo_admin_all" ON "public"."codes_promo" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "codes_promo_public_active_read" ON "public"."codes_promo" FOR SELECT TO "authenticated" USING ((("active" = true) AND ("starts_at" <= "now"()) AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))));



ALTER TABLE "public"."community_vote_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cov_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cov_badges_admin_all" ON "public"."cov_badges" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "cov_badges_public_read" ON "public"."cov_badges" FOR SELECT USING (true);



ALTER TABLE "public"."cov_missions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cov_missions_admin_all" ON "public"."cov_missions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "cov_missions_public_read" ON "public"."cov_missions" FOR SELECT USING (("active" = true));



ALTER TABLE "public"."cov_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cov_reviews_admin_all" ON "public"."cov_reviews" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "cov_reviews_own_insert" ON "public"."cov_reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "cov_reviews_public_read" ON "public"."cov_reviews" FOR SELECT USING (true);



ALTER TABLE "public"."cov_xp_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cov_xp_log_admin_all" ON "public"."cov_xp_log" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "cov_xp_log_own_read" ON "public"."cov_xp_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_locations_driver_insert" ON "public"."delivery_locations" FOR INSERT TO "authenticated" WITH CHECK (("driver_id" = "auth"."uid"()));



CREATE POLICY "delivery_locations_insert_current_livreur" ON "public"."delivery_locations" FOR INSERT TO "authenticated" WITH CHECK ((("livreur_id" = "auth"."uid"()) AND "public"."is_verified_driver"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."livraisons" "l"
  WHERE (("l"."id" = "delivery_locations"."livraison_id") AND ("l"."livreur_id" = "auth"."uid"()) AND ("l"."statut" = ANY (ARRAY['confirme'::"text", 'en_route'::"text", 'ramasse'::"text"])))))));



CREATE POLICY "delivery_locations_select_participants_admin" ON "public"."delivery_locations" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("livreur_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."livraisons" "l"
  WHERE (("l"."id" = "delivery_locations"."livraison_id") AND (("l"."expediteur_id" = "auth"."uid"()) OR ("l"."livreur_id" = "auth"."uid"())))))));



CREATE POLICY "delivery_locations_visible_to_participants" ON "public"."delivery_locations" FOR SELECT TO "authenticated" USING ((("driver_id" = "auth"."uid"()) OR "public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."livraisons" "l"
  WHERE (("l"."id" = "delivery_locations"."livraison_id") AND (("l"."expediteur_id" = "auth"."uid"()) OR ("l"."livreur_id" = "auth"."uid"())))))));



ALTER TABLE "public"."delivery_proofs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_all" ON "public"."rate_limits" USING (false);



ALTER TABLE "public"."draw_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draw_winners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "draw_winners_admin_all" ON "public"."draw_winners" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "draw_winners_public_read" ON "public"."draw_winners" FOR SELECT USING (("published" = true));



ALTER TABLE "public"."driver_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_verifications_owner_insert" ON "public"."driver_verifications" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("consent_accepted" = true)));



CREATE POLICY "driver_verifications_owner_read" ON "public"."driver_verifications" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "driver_verifications_owner_update_pending" ON "public"."driver_verifications" FOR UPDATE TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['not_started'::"text", 'pending_review'::"text", 'rejected'::"text"]))) OR "public"."is_admin"())) WITH CHECK (((("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending_review'::"text", 'rejected'::"text"]))) OR "public"."is_admin"()));



CREATE POLICY "ec_admin_all" ON "public"."emergency_contacts" TO "authenticated" USING ("public"."pap_is_admin"()) WITH CHECK ("public"."pap_is_admin"());



CREATE POLICY "ec_own_all" ON "public"."emergency_contacts" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."emergency_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "envoyer un message" ON "public"."messages" FOR INSERT WITH CHECK (("auth"."uid"() = "expediteur_id"));



ALTER TABLE "public"."evaluations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evaluations_insert_post_livraison" ON "public"."evaluations" FOR INSERT WITH CHECK ((("auth"."uid"() = "auteur_id") AND (EXISTS ( SELECT 1
   FROM "public"."livraisons"
  WHERE (("livraisons"."id" = "evaluations"."livraison_id") AND ("livraisons"."statut" = 'livre'::"text") AND (("livraisons"."expediteur_id" = "auth"."uid"()) OR ("livraisons"."livreur_id" = "auth"."uid"())))))));



CREATE POLICY "evaluations_select_public" ON "public"."evaluations" FOR SELECT USING (true);



CREATE POLICY "gps_trail_admin_all" ON "public"."ride_gps_trail" TO "authenticated" USING ("public"."pap_is_admin"()) WITH CHECK ("public"."pap_is_admin"());



ALTER TABLE "public"."impact_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "impact_applications_admin_all" ON "public"."impact_applications" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "impact_applications_public_insert" ON "public"."impact_applications" FOR INSERT WITH CHECK (("status" = 'pending'::"text"));



ALTER TABLE "public"."impact_mode_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."impact_organisations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."impact_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kyc_own" ON "public"."kyc_submissions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."kyc_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lire ses messages" ON "public"."messages" FOR SELECT USING ((("auth"."uid"() = "expediteur_id") OR ("auth"."uid"() = "destinataire_id")));



ALTER TABLE "public"."liste_attente" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "liste_attente_insert_public" ON "public"."liste_attente" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "liste_attente_select_own" ON "public"."liste_attente" FOR SELECT USING (("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



ALTER TABLE "public"."litiges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "litiges_insert_implique" ON "public"."litiges" FOR INSERT WITH CHECK ((("auth"."uid"() = "plaignant_id") AND (EXISTS ( SELECT 1
   FROM "public"."livraisons"
  WHERE (("livraisons"."id" = "litiges"."livraison_id") AND (("livraisons"."expediteur_id" = "auth"."uid"()) OR ("livraisons"."livreur_id" = "auth"."uid"())) AND ("livraisons"."statut" <> ALL (ARRAY['annule'::"text", 'rembourse'::"text"])))))));



CREATE POLICY "litiges_select_implique" ON "public"."litiges" FOR SELECT USING ((("auth"."uid"() = "plaignant_id") OR (EXISTS ( SELECT 1
   FROM "public"."livraisons"
  WHERE (("livraisons"."id" = "litiges"."livraison_id") AND (("livraisons"."expediteur_id" = "auth"."uid"()) OR ("livraisons"."livreur_id" = "auth"."uid"())))))));



ALTER TABLE "public"."livraisons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "livraisons_insert_expediteur" ON "public"."livraisons" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR ("expediteur_id" = "auth"."uid"())));



CREATE POLICY "livraisons_insert_expediteur_own" ON "public"."livraisons" FOR INSERT TO "authenticated" WITH CHECK ((("expediteur_id" = "auth"."uid"()) AND ("statut" = 'pending'::"text") AND ("livreur_id" IS NULL)));



CREATE POLICY "livraisons_select_expediteur" ON "public"."livraisons" FOR SELECT USING (("auth"."uid"() = "expediteur_id"));



CREATE POLICY "livraisons_select_expediteur_own" ON "public"."livraisons" FOR SELECT TO "authenticated" USING (("expediteur_id" = "auth"."uid"()));



CREATE POLICY "livraisons_select_livreur" ON "public"."livraisons" FOR SELECT USING (("auth"."uid"() = "livreur_id"));



CREATE POLICY "livraisons_select_livreur_verified_pending_or_assigned" ON "public"."livraisons" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'livreur'::"text") AND ("p"."verification_status" = 'verified'::"text")))) AND (("statut" = 'pending'::"text") OR ("livreur_id" = "auth"."uid"()))));



CREATE POLICY "livraisons_select_participants_admin" ON "public"."livraisons" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("expediteur_id" = "auth"."uid"()) OR ("livreur_id" = "auth"."uid"())));



CREATE POLICY "livraisons_update_expediteur" ON "public"."livraisons" FOR UPDATE USING ((("auth"."uid"() = "expediteur_id") AND ("statut" = ANY (ARRAY['publie'::"text", 'offre_recue'::"text"]))));



CREATE POLICY "livraisons_update_expediteur_cancel_own" ON "public"."livraisons" FOR UPDATE TO "authenticated" USING (("expediteur_id" = "auth"."uid"())) WITH CHECK ((("expediteur_id" = "auth"."uid"()) AND ("statut" = 'cancelled'::"text")));



CREATE POLICY "livraisons_update_livreur" ON "public"."livraisons" FOR UPDATE USING ((("auth"."uid"() = "livreur_id") AND ("statut" = ANY (ARRAY['confirme'::"text", 'ramasse'::"text", 'en_route'::"text"]))));



CREATE POLICY "livraisons_update_livreur_accept_verified" ON "public"."livraisons" FOR UPDATE TO "authenticated" USING ((("statut" = 'pending'::"text") AND ("livreur_id" IS NULL))) WITH CHECK ((("livreur_id" = "auth"."uid"()) AND ("statut" = 'accepted'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'livreur'::"text") AND ("p"."verification_status" = 'verified'::"text"))))));



CREATE POLICY "livraisons_update_livreur_assigned_status" ON "public"."livraisons" FOR UPDATE TO "authenticated" USING ((("livreur_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'livreur'::"text") AND ("p"."verification_status" = 'verified'::"text")))))) WITH CHECK ((("livreur_id" = "auth"."uid"()) AND ("statut" = ANY (ARRAY['accepted'::"text", 'in_transit'::"text", 'completed'::"text"]))));



CREATE POLICY "livraisons_update_participants_admin" ON "public"."livraisons" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR ("expediteur_id" = "auth"."uid"()) OR ("livreur_id" = "auth"."uid"()))) WITH CHECK (("public"."is_admin"() OR ("expediteur_id" = "auth"."uid"()) OR ("livreur_id" = "auth"."uid"())));



CREATE POLICY "livreur gere ses push" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "livreur met a jour son dossier" ON "public"."kyc_submissions" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("statut" = ANY (ARRAY['pending_review'::"text", 'rejected'::"text"])))) WITH CHECK ((("auth"."uid"() = "user_id") AND ("statut" = ANY (ARRAY['pending_review'::"text", 'rejected'::"text"]))));



CREATE POLICY "livreur soumet son dossier" ON "public"."kyc_submissions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "livreur voit son dossier" ON "public"."kyc_submissions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."livreur_earnings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manquements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marquer lu" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "destinataire_id"));



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_service" ON "public"."messages" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."missions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."missions_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "missions_participants_insert" ON "public"."missions_participants" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."missions"
  WHERE (("missions"."id" = "missions_participants"."mission_id") AND ("missions"."actif" = true) AND ("missions"."places_prises" < "missions"."places_max"))))));



CREATE POLICY "missions_participants_select" ON "public"."missions_participants" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "missions_select_connected" ON "public"."missions" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("actif" = true)));



ALTER TABLE "public"."modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_draws" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offres" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offres_insert_livreur" ON "public"."offres" FOR INSERT WITH CHECK ((("auth"."uid"() = "livreur_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['livreur'::"text", 'les deux'::"text"])) AND ("profiles"."actif" = true) AND ("profiles"."suspendu" = false))))));



CREATE POLICY "offres_select_expediteur" ON "public"."offres" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."livraisons"
  WHERE (("livraisons"."id" = "offres"."livraison_id") AND ("livraisons"."expediteur_id" = "auth"."uid"())))));



CREATE POLICY "offres_select_livreur" ON "public"."offres" FOR SELECT USING (("auth"."uid"() = "livreur_id"));



CREATE POLICY "offres_update_livreur" ON "public"."offres" FOR UPDATE USING ((("auth"."uid"() = "livreur_id") AND ("statut" = 'en_attente'::"text")));



ALTER TABLE "public"."organismes_partenaires" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own_read" ON "public"."kyc_submissions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own_rows" ON "public"."notifications" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_write" ON "public"."kyc_submissions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "participants_only" ON "public"."messages" USING ((("auth"."uid"() = "expediteur_id") OR ("auth"."uid"() = "destinataire_id"))) WITH CHECK (("auth"."uid"() = "expediteur_id"));



ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_transactions_service_all" ON "public"."payment_transactions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."porte_coins_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_insert_trigger_only" ON "public"."profiles" FOR INSERT WITH CHECK (false);



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_owner_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."pap_is_admin"()));



CREATE POLICY "profiles_update_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."pap_is_admin"()) WITH CHECK ("public"."pap_is_admin"());



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."promo_code_uses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promo_code_uses_select" ON "public"."promo_code_uses" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"()));



ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promo_codes_admin" ON "public"."promo_codes" USING ("public"."is_admin"());



CREATE POLICY "promo_codes_select" ON "public"."promo_codes" FOR SELECT USING (true);



ALTER TABLE "public"."protection_fund_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."protection_fund_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public can read active meeting points" ON "public"."safe_meeting_points" FOR SELECT USING ((("active" = true) AND (COALESCE("status", 'suggested'::"text") = ANY (ARRAY['suggested'::"text", 'verified'::"text", 'official_partner'::"text"]))));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rdp_admin_all" ON "public"."ride_driver_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "rdp_own_upsert" ON "public"."ride_driver_profiles" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rdp_public_read" ON "public"."ride_driver_profiles" FOR SELECT USING (true);



CREATE POLICY "refcode_own" ON "public"."referral_codes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "refcode_service" ON "public"."referral_codes" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."referral_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_codes_own" ON "public"."referral_codes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "referral_own" ON "public"."referrals" FOR SELECT USING ((("auth"."uid"() = "referrer_id") OR ("auth"."uid"() = "referee_id")));



CREATE POLICY "referral_service" ON "public"."referrals" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referrals_referred_read" ON "public"."referrals" FOR SELECT USING ((("auth"."uid"() = "referred_id") OR ("auth"."uid"() = "referee_id")));



CREATE POLICY "referrals_referrer_read" ON "public"."referrals" FOR SELECT USING (("auth"."uid"() = "referrer_id"));



CREATE POLICY "reports_admin_all" ON "public"."ride_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "reports_reporter_insert" ON "public"."ride_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "reports_reporter_read" ON "public"."ride_reports" FOR SELECT USING (("auth"."uid"() = "reporter_id"));



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reward_audit_admin" ON "public"."reward_audit_logs" FOR SELECT USING (false);



ALTER TABLE "public"."reward_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_driver_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_gps_trail" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_price_breakdowns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_search_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ride_stops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ridemsg_insert" ON "public"."ride_messages" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "ridemsg_read" ON "public"."ride_messages" FOR SELECT USING ((("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "ridemsg_update_read" ON "public"."ride_messages" FOR UPDATE USING (("recipient_id" = "auth"."uid"()));



ALTER TABLE "public"."rides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rides_admin_all" ON "public"."rides" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "rides_driver_insert" ON "public"."rides" FOR INSERT WITH CHECK (("auth"."uid"() = "driver_id"));



CREATE POLICY "rides_driver_update" ON "public"."rides" FOR UPDATE USING (("auth"."uid"() = "driver_id"));



CREATE POLICY "rides_public_read" ON "public"."rides" FOR SELECT USING (("status" = 'publie'::"text"));



ALTER TABLE "public"."safe_meeting_point_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."safe_meeting_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "safe_meeting_points_admin_write" ON "public"."safe_meeting_points" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "safe_meeting_points_read_all" ON "public"."safe_meeting_points" FOR SELECT USING (("active" = true));



CREATE POLICY "sca_admin_all" ON "public"."stripe_connect_accounts" TO "authenticated" USING ("public"."pap_is_admin"()) WITH CHECK ("public"."pap_is_admin"());



CREATE POLICY "sca_own_read" ON "public"."stripe_connect_accounts" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."pap_is_admin"()));



CREATE POLICY "searchlogs_admin_read" ON "public"."ride_search_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "searchlogs_insert" ON "public"."ride_search_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "service_role insere coins" ON "public"."porte_coins_transactions" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "service_role_all" ON "public"."kyc_submissions" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."solidarity_missions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sos_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stops_admin_all" ON "public"."ride_stops" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "stops_driver_manage" ON "public"."ride_stops" USING ((EXISTS ( SELECT 1
   FROM "public"."rides"
  WHERE (("rides"."id" = "ride_stops"."ride_id") AND ("rides"."driver_id" = "auth"."uid"())))));



CREATE POLICY "stops_public_read" ON "public"."ride_stops" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rides"
  WHERE (("rides"."id" = "ride_stops"."ride_id") AND ("rides"."status" = 'publie'::"text")))));



ALTER TABLE "public"."stripe_connect_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracking_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_audit_admin_all" ON "public"."transaction_audit_events" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND (COALESCE("p"."suspendu", false) = false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND (COALESCE("p"."suspendu", false) = false)))));



ALTER TABLE "public"."transaction_audit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_audit_user_own_read" ON "public"."transaction_audit_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions_delete_deny" ON "public"."transactions" FOR DELETE USING (false);



CREATE POLICY "transactions_insert_deny" ON "public"."transactions" FOR INSERT WITH CHECK (false);



CREATE POLICY "transactions_select_own" ON "public"."transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "transactions_select_self_admin" ON "public"."transactions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "transactions_update_deny" ON "public"."transactions" FOR UPDATE USING (false);



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user voit ses coins" ON "public"."porte_coins_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user voit ses missions" ON "public"."user_missions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user voit ses participations" ON "public"."draw_entries" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_badges_own_read" ON "public"."user_badges" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_badges_system_insert" ON "public"."user_badges" FOR INSERT WITH CHECK (false);



ALTER TABLE "public"."user_cov_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_cov_badges_admin_all" ON "public"."user_cov_badges" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "user_cov_badges_own_read" ON "public"."user_cov_badges" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_cov_missions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_cov_missions_admin_all" ON "public"."user_cov_missions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "user_cov_missions_own_read" ON "public"."user_cov_missions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_missions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can read own meeting point reports" ON "public"."safe_meeting_point_reports" FOR SELECT TO "authenticated" USING (("reporter_id" = "auth"."uid"()));



CREATE POLICY "utilisateur laisse avis" ON "public"."reviews" FOR INSERT WITH CHECK ((("auth"."uid"() = "reviewer_id") OR (("is_anonymous" = true) AND ("reviewer_role" = 'destinataire'::"text"))));



ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webauthn_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webauthn_challenges_service_all" ON "public"."webauthn_challenges" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."webauthn_credentials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webauthn_credentials_own_read" ON "public"."webauthn_credentials" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "webauthn_credentials_service_all" ON "public"."webauthn_credentials" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."xp_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "xp_tx_own_read" ON "public"."xp_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."zones" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."livraisons" TO "authenticated";
GRANT ALL ON TABLE "public"."livraisons" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accepter_livraison"("p_livraison_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accepter_livraison"("p_livraison_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accepter_livraison"("p_livraison_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_user"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ajouter_coins"("p_user_id" "uuid", "p_montant" integer, "p_type" "text", "p_description" "text", "p_livraison_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ajouter_coins"("p_user_id" "uuid", "p_montant" integer, "p_type" "text", "p_description" "text", "p_livraison_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_claim_free_milestone"("p_driver_id" "uuid", "p_milestone_key" "text", "p_points" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_claim_free_milestone"("p_driver_id" "uuid", "p_milestone_key" "text", "p_points" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_rate_limits"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_rate_limits"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_claim_free_days"("p_driver_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_claim_free_days"("p_driver_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."grant_badge"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_badge"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."grant_badge_v2"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text", "p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_badge_v2"("p_user_id" "uuid", "p_badge_slug" "text", "p_granted_by" "text", "p_force" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."grant_points_impact"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text", "p_ref_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_points_impact"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text", "p_ref_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."grant_xp"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text", "p_ref_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_xp"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_ref_type" "text", "p_ref_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_promo_uses"("p_promo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_promo_uses"("p_promo_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_verified_driver"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_verified_driver"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_verified_driver"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."livraisons_disponibles_masquees"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."livraisons_disponibles_masquees"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."livraisons_disponibles_masquees"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pap_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pap_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pap_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pap_prevent_profile_self_escalation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pap_prevent_profile_self_escalation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."platform_claim_free_days"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."platform_claim_free_days"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_profile_self_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_profile_self_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_profile_self_escalation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_privileged_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_privileged_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_privileged_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_privileged_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_driver_litige"("p_driver_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_driver_litige"("p_driver_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_meeting_point_report_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_meeting_point_report_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_safe_meeting_points_updated"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_safe_meeting_points_updated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_safe_meeting_points_updated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_mis_a_jour_le"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_mis_a_jour_le"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_mis_a_jour_le"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verifier_transfert_coins"("p_expediteur_id" "uuid", "p_montant" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verifier_transfert_coins"("p_expediteur_id" "uuid", "p_montant" integer) TO "service_role";



GRANT ALL ON TABLE "public"."address_intelligence" TO "anon";
GRANT ALL ON TABLE "public"."address_intelligence" TO "authenticated";
GRANT ALL ON TABLE "public"."address_intelligence" TO "service_role";



GRANT ALL ON TABLE "public"."address_intelligence_votes" TO "anon";
GRANT ALL ON TABLE "public"."address_intelligence_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."address_intelligence_votes" TO "service_role";



GRANT ALL ON TABLE "public"."badges" TO "anon";
GRANT ALL ON TABLE "public"."badges" TO "authenticated";
GRANT ALL ON TABLE "public"."badges" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT ALL ON TABLE "public"."badge_campaign_status" TO "authenticated";
GRANT ALL ON TABLE "public"."badge_campaign_status" TO "service_role";



GRANT ALL ON TABLE "public"."codes_promo" TO "anon";
GRANT ALL ON TABLE "public"."codes_promo" TO "authenticated";
GRANT ALL ON TABLE "public"."codes_promo" TO "service_role";



GRANT ALL ON TABLE "public"."community_vote_responses" TO "anon";
GRANT ALL ON TABLE "public"."community_vote_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."community_vote_responses" TO "service_role";



GRANT ALL ON TABLE "public"."community_votes" TO "anon";
GRANT ALL ON TABLE "public"."community_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."community_votes" TO "service_role";



GRANT ALL ON TABLE "public"."cov_badges" TO "anon";
GRANT ALL ON TABLE "public"."cov_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."cov_badges" TO "service_role";



GRANT ALL ON TABLE "public"."cov_missions" TO "anon";
GRANT ALL ON TABLE "public"."cov_missions" TO "authenticated";
GRANT ALL ON TABLE "public"."cov_missions" TO "service_role";



GRANT ALL ON TABLE "public"."cov_reviews" TO "anon";
GRANT ALL ON TABLE "public"."cov_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."cov_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."cov_xp_log" TO "anon";
GRANT ALL ON TABLE "public"."cov_xp_log" TO "authenticated";
GRANT ALL ON TABLE "public"."cov_xp_log" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_locations" TO "anon";
GRANT ALL ON TABLE "public"."delivery_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_locations" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_proofs" TO "anon";
GRANT ALL ON TABLE "public"."delivery_proofs" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_proofs" TO "service_role";



GRANT ALL ON TABLE "public"."draw_entries" TO "anon";
GRANT ALL ON TABLE "public"."draw_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."draw_entries" TO "service_role";



GRANT ALL ON TABLE "public"."draw_winners" TO "anon";
GRANT ALL ON TABLE "public"."draw_winners" TO "authenticated";
GRANT ALL ON TABLE "public"."draw_winners" TO "service_role";



GRANT ALL ON TABLE "public"."driver_verifications" TO "anon";
GRANT ALL ON TABLE "public"."driver_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_contacts" TO "anon";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."evaluations" TO "anon";
GRANT ALL ON TABLE "public"."evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."gps_positions" TO "anon";
GRANT ALL ON TABLE "public"."gps_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."gps_positions" TO "service_role";



GRANT ALL ON TABLE "public"."impact_applications" TO "anon";
GRANT ALL ON TABLE "public"."impact_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."impact_applications" TO "service_role";



GRANT ALL ON TABLE "public"."impact_mode_feedback" TO "anon";
GRANT ALL ON TABLE "public"."impact_mode_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."impact_mode_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."impact_organisations" TO "anon";
GRANT ALL ON TABLE "public"."impact_organisations" TO "authenticated";
GRANT ALL ON TABLE "public"."impact_organisations" TO "service_role";



GRANT ALL ON TABLE "public"."impact_settings" TO "anon";
GRANT ALL ON TABLE "public"."impact_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."impact_settings" TO "service_role";



GRANT ALL ON TABLE "public"."kyc_submissions" TO "anon";
GRANT ALL ON TABLE "public"."kyc_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."kyc_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."liste_attente" TO "anon";
GRANT ALL ON TABLE "public"."liste_attente" TO "authenticated";
GRANT ALL ON TABLE "public"."liste_attente" TO "service_role";



GRANT ALL ON TABLE "public"."litiges" TO "anon";
GRANT ALL ON TABLE "public"."litiges" TO "authenticated";
GRANT ALL ON TABLE "public"."litiges" TO "service_role";



GRANT ALL ON TABLE "public"."livreur_earnings" TO "anon";
GRANT ALL ON TABLE "public"."livreur_earnings" TO "authenticated";
GRANT ALL ON TABLE "public"."livreur_earnings" TO "service_role";



GRANT ALL ON TABLE "public"."manquements" TO "anon";
GRANT ALL ON TABLE "public"."manquements" TO "authenticated";
GRANT ALL ON TABLE "public"."manquements" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."missions" TO "service_role";



GRANT ALL ON TABLE "public"."missions_participants" TO "anon";
GRANT ALL ON TABLE "public"."missions_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."missions_participants" TO "service_role";



GRANT ALL ON TABLE "public"."modules" TO "anon";
GRANT ALL ON TABLE "public"."modules" TO "authenticated";
GRANT ALL ON TABLE "public"."modules" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_draws" TO "anon";
GRANT ALL ON TABLE "public"."monthly_draws" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_draws" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."offres" TO "service_role";



GRANT ALL ON TABLE "public"."organismes_partenaires" TO "anon";
GRANT ALL ON TABLE "public"."organismes_partenaires" TO "authenticated";
GRANT ALL ON TABLE "public"."organismes_partenaires" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."payout_requests" TO "anon";
GRANT ALL ON TABLE "public"."payout_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_requests" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."porte_coins_transactions" TO "anon";
GRANT ALL ON TABLE "public"."porte_coins_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."porte_coins_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."points_impact_transactions" TO "anon";
GRANT ALL ON TABLE "public"."points_impact_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."points_impact_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profils_livreurs_publics" TO "anon";
GRANT ALL ON TABLE "public"."profils_livreurs_publics" TO "authenticated";
GRANT ALL ON TABLE "public"."profils_livreurs_publics" TO "service_role";



GRANT ALL ON TABLE "public"."promo_code_uses" TO "anon";
GRANT ALL ON TABLE "public"."promo_code_uses" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_code_uses" TO "service_role";



GRANT ALL ON TABLE "public"."promo_codes" TO "anon";
GRANT ALL ON TABLE "public"."promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";



GRANT ALL ON TABLE "public"."protection_fund_ledger" TO "anon";
GRANT ALL ON TABLE "public"."protection_fund_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."protection_fund_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."protection_fund_payouts" TO "anon";
GRANT ALL ON TABLE "public"."protection_fund_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."protection_fund_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."referral_codes" TO "anon";
GRANT ALL ON TABLE "public"."referral_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_codes" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."reward_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."reward_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."reward_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ride_bookings" TO "anon";
GRANT ALL ON TABLE "public"."ride_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."ride_driver_profiles" TO "anon";
GRANT ALL ON TABLE "public"."ride_driver_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_driver_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ride_gps_trail" TO "anon";
GRANT ALL ON TABLE "public"."ride_gps_trail" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_gps_trail" TO "service_role";



GRANT ALL ON TABLE "public"."ride_messages" TO "anon";
GRANT ALL ON TABLE "public"."ride_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ride_price_breakdowns" TO "anon";
GRANT ALL ON TABLE "public"."ride_price_breakdowns" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_price_breakdowns" TO "service_role";



GRANT ALL ON TABLE "public"."ride_reports" TO "anon";
GRANT ALL ON TABLE "public"."ride_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_reports" TO "service_role";



GRANT ALL ON TABLE "public"."ride_search_logs" TO "anon";
GRANT ALL ON TABLE "public"."ride_search_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_search_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ride_search_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ride_search_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ride_search_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ride_stops" TO "anon";
GRANT ALL ON TABLE "public"."ride_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."ride_stops" TO "service_role";



GRANT ALL ON TABLE "public"."rides" TO "anon";
GRANT ALL ON TABLE "public"."rides" TO "authenticated";
GRANT ALL ON TABLE "public"."rides" TO "service_role";



GRANT ALL ON TABLE "public"."safe_meeting_point_reports" TO "anon";
GRANT ALL ON TABLE "public"."safe_meeting_point_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."safe_meeting_point_reports" TO "service_role";



GRANT ALL ON TABLE "public"."safe_meeting_points" TO "anon";
GRANT ALL ON TABLE "public"."safe_meeting_points" TO "authenticated";
GRANT ALL ON TABLE "public"."safe_meeting_points" TO "service_role";



GRANT ALL ON TABLE "public"."solidarity_missions" TO "anon";
GRANT ALL ON TABLE "public"."solidarity_missions" TO "authenticated";
GRANT ALL ON TABLE "public"."solidarity_missions" TO "service_role";



GRANT ALL ON TABLE "public"."sos_alerts" TO "anon";
GRANT ALL ON TABLE "public"."sos_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."sos_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."stats_plateforme" TO "anon";
GRANT ALL ON TABLE "public"."stats_plateforme" TO "authenticated";
GRANT ALL ON TABLE "public"."stats_plateforme" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "anon";
GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."tracking_events" TO "anon";
GRANT ALL ON TABLE "public"."tracking_events" TO "authenticated";
GRANT ALL ON TABLE "public"."tracking_events" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."transaction_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_audit_events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."user_cov_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_cov_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cov_badges" TO "service_role";



GRANT ALL ON TABLE "public"."user_cov_missions" TO "anon";
GRANT ALL ON TABLE "public"."user_cov_missions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cov_missions" TO "service_role";



GRANT ALL ON TABLE "public"."user_missions" TO "anon";
GRANT ALL ON TABLE "public"."user_missions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_missions" TO "service_role";



GRANT ALL ON TABLE "public"."v_driver_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."v_driver_scores" TO "service_role";



GRANT ALL ON TABLE "public"."v_livreur_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."v_livreur_balance" TO "service_role";



GRANT ALL ON TABLE "public"."v_protection_fund_balance" TO "anon";
GRANT ALL ON TABLE "public"."v_protection_fund_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."v_protection_fund_balance" TO "service_role";



GRANT ALL ON TABLE "public"."v_user_fiabilite" TO "authenticated";
GRANT ALL ON TABLE "public"."v_user_fiabilite" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."wallet" TO "service_role";



GRANT ALL ON TABLE "public"."webauthn_challenges" TO "anon";
GRANT ALL ON TABLE "public"."webauthn_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."webauthn_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."webauthn_credentials" TO "anon";
GRANT ALL ON TABLE "public"."webauthn_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."webauthn_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."xp_transactions" TO "anon";
GRANT ALL ON TABLE "public"."xp_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."xp_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."zones" TO "anon";
GRANT ALL ON TABLE "public"."zones" TO "authenticated";
GRANT ALL ON TABLE "public"."zones" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







