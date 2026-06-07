-- PorteaPorte - Concours lancement "100 premiers membres"
-- Migration idempotente. A executer manuellement dans Supabase.
-- Choix technique: reutiliser le systeme existant referral_codes/referrals
-- et ajouter referred_id pour le vocabulaire concours, sans casser referee_id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  total_uses integer DEFAULT 0,
  total_rewarded integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  referee_id uuid REFERENCES profiles(id) ON DELETE SET NULL UNIQUE,
  code text NOT NULL,
  status text DEFAULT 'pending',
  action_type text,
  rewarded_at timestamptz,
  points_granted integer DEFAULT 0,
  xp_granted integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referred_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

UPDATE referrals
SET referred_id = referee_id
WHERE referred_id IS NULL
  AND referee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred_once
  ON referrals(referred_id)
  WHERE referred_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_codes_code
  ON referral_codes(code);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON referrals(code);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_own ON referral_codes;
CREATE POLICY referral_codes_own
  ON referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS referrals_referrer_read ON referrals;
CREATE POLICY referrals_referrer_read
  ON referrals
  FOR SELECT
  USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS referrals_referred_read ON referrals;
CREATE POLICY referrals_referred_read
  ON referrals
  FOR SELECT
  USING (auth.uid() = referred_id OR auth.uid() = referee_id);

-- Ecriture volontairement reservee au service_role via api/platform.js.
