-- PorteàPorte — colonnes abonnements sur profiles
-- À exécuter dans Supabase SQL Editor

alter table public.profiles
  add column if not exists stripe_customer_id  text,
  add column if not exists subscription_plan   text,      -- 'conducteur_pro' | 'marchand_local'
  add column if not exists subscription_status text,      -- 'active' | 'canceled' | null
  add column if not exists subscription_end_at timestamptz;

-- Index pour vérifier rapidement les abonnements actifs
create index if not exists idx_profiles_subscription
  on public.profiles (subscription_status, subscription_plan)
  where subscription_status = 'active';
