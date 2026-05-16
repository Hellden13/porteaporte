-- ═════════════════════════════════════════════════════════════════════════
-- SCRIPT SQL: Créditer 100 PorteCoins à denismorneaubtc@gmail.com
-- ═════════════════════════════════════════════════════════════════════════

-- 1. Trouver l'utilisateur avec cet email
SELECT id, email, coins, prenom, nom FROM profiles WHERE email = 'denismorneaubtc@gmail.com';

-- 2. Si l'utilisateur existe, ajouter 100 coins
UPDATE profiles 
SET coins = coins + 100,
    mis_a_jour_le = NOW()
WHERE email = 'denismorneaubtc@gmail.com';

-- 3. Vérifier le résultat
SELECT id, email, coins, prenom, nom FROM profiles WHERE email = 'denismorneaubtc@gmail.com';

-- 4. Créer une entrée de transaction (si la table existe)
INSERT INTO transactions (
  user_id,
  payment_intent_id,
  amount,
  currency,
  status,
  coins_received,
  package_name,
  email,
  created_at
) SELECT 
  id,
  'MANUAL_CREDIT_BUG_FIX_' || NOW()::text,
  0.00,
  'CAD',
  'succeeded',
  100,
  'manuel',
  email,
  NOW()
FROM profiles
WHERE email = 'denismorneaubtc@gmail.com';

-- ═════════════════════════════════════════════════════════════════════════
-- À exécuter dans Supabase SQL Editor:
-- 1. Va sur: https://supabase.com/dashboard/project/miqrircrfpzkmvvacgwt
-- 2. Clique "SQL Editor"
-- 3. Copie-colle ces commandes
-- 4. Clique "Run"
-- ═════════════════════════════════════════════════════════════════════════
