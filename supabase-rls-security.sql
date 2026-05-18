-- ============================================================
-- PorteàPorte — Politiques RLS pour les tables v2
-- À exécuter dans Supabase > SQL Editor
-- Couvre : push_subscriptions, referral_codes, referrals,
--          badges, user_badges, notifications
-- ============================================================

-- ── push_subscriptions ──────────────────────────────────────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub_own_select"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_sub_own_insert"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_sub_own_delete"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_sub_admin_select" ON push_subscriptions;

CREATE POLICY "push_sub_own_select" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "push_sub_own_insert" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_sub_own_delete" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Admin peut tout voir (pour broadcast)
CREATE POLICY "push_sub_admin_select" ON push_subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service key (server-side) : accès total via bypass RLS
-- (La service_key bypasse RLS automatiquement dans Supabase)

-- ── referral_codes ──────────────────────────────────────────
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_codes_own_select" ON referral_codes;
DROP POLICY IF EXISTS "ref_codes_lookup"     ON referral_codes;
DROP POLICY IF EXISTS "ref_codes_own_insert" ON referral_codes;
DROP POLICY IF EXISTS "ref_codes_admin"      ON referral_codes;

-- Chaque utilisateur voit son propre code
CREATE POLICY "ref_codes_own_select" ON referral_codes
  FOR SELECT USING (auth.uid() = user_id);

-- Lookup par code (pour utiliser un code d'un ami) — lecture du code seulement
CREATE POLICY "ref_codes_lookup" ON referral_codes
  FOR SELECT USING (true);  -- Le code est public (pas de données sensibles)

CREATE POLICY "ref_codes_own_insert" ON referral_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ref_codes_admin" ON referral_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── referrals ───────────────────────────────────────────────
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_own_select"  ON referrals;
DROP POLICY IF EXISTS "referrals_own_insert"  ON referrals;
DROP POLICY IF EXISTS "referrals_admin"       ON referrals;

-- Parrain voit ses filleuls, filleul voit son parrain
CREATE POLICY "referrals_own_select" ON referrals
  FOR SELECT USING (
    auth.uid() = referrer_id OR auth.uid() = referee_id
  );

CREATE POLICY "referrals_own_insert" ON referrals
  FOR INSERT WITH CHECK (auth.uid() = referee_id);

CREATE POLICY "referrals_admin" ON referrals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── badges ──────────────────────────────────────────────────
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges_public_read" ON badges;
DROP POLICY IF EXISTS "badges_admin_write" ON badges;

-- Les badges sont publics en lecture
CREATE POLICY "badges_public_read" ON badges
  FOR SELECT USING (true);

-- Seul l'admin peut créer/modifier des badges
CREATE POLICY "badges_admin_write" ON badges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── user_badges ─────────────────────────────────────────────
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_badges_own_select"   ON user_badges;
DROP POLICY IF EXISTS "user_badges_public_select" ON user_badges;
DROP POLICY IF EXISTS "user_badges_admin_all"     ON user_badges;

-- Un utilisateur voit ses propres badges
CREATE POLICY "user_badges_own_select" ON user_badges
  FOR SELECT USING (auth.uid() = user_id);

-- Admin peut tout gérer
CREATE POLICY "user_badges_admin_all" ON user_badges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── notifications ────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_own_select" ON notifications;
DROP POLICY IF EXISTS "notif_own_update" ON notifications;
DROP POLICY IF EXISTS "notif_admin_all"  ON notifications;

CREATE POLICY "notif_own_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Marquer comme lu
CREATE POLICY "notif_own_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notif_admin_all" ON notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── kyc_submissions ─────────────────────────────────────────
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_own_select"  ON kyc_submissions;
DROP POLICY IF EXISTS "kyc_own_insert"  ON kyc_submissions;
DROP POLICY IF EXISTS "kyc_own_update"  ON kyc_submissions;
DROP POLICY IF EXISTS "kyc_admin_all"   ON kyc_submissions;

CREATE POLICY "kyc_own_select" ON kyc_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "kyc_own_insert" ON kyc_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Mise à jour par l'utilisateur (soumission initiale seulement)
CREATE POLICY "kyc_own_update" ON kyc_submissions
  FOR UPDATE USING (auth.uid() = user_id AND statut = 'draft')
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "kyc_admin_all" ON kyc_submissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Vérification finale ──────────────────────────────────────
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'push_subscriptions','referral_codes','referrals',
    'badges','user_badges','notifications','kyc_submissions'
  )
ORDER BY tablename;
