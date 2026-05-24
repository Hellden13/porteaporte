-- PorteaPorte - Stabilisation Supabase priorite 1
-- Objectif: aligner les tables/colonnes utilisees par le code sans supprimer les donnees.
-- A executer dans Supabase SQL Editor, puis cliquer "Run".

begin;

create extension if not exists "pgcrypto";

-- ============================================================
-- BADGES / XP / POINTS IMPACT
-- ============================================================

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  icon text default 'badge',
  category text default 'general',
  rarity text default 'common',
  points_reward integer default 0,
  xp_reward integer default 0,
  condition_type text default 'manual',
  condition_value numeric default 0,
  campaign_name text,
  role_filter text,
  auto_trigger text default 'manual',
  active boolean default true,
  paused boolean default false,
  active_from timestamptz,
  active_until timestamptz,
  benefit_from timestamptz,
  benefit_until timestamptz,
  seasonal_months integer[],
  max_recipients integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.badges
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists icon text default 'badge',
  add column if not exists category text default 'general',
  add column if not exists rarity text default 'common',
  add column if not exists points_reward integer default 0,
  add column if not exists xp_reward integer default 0,
  add column if not exists condition_type text default 'manual',
  add column if not exists condition_value numeric default 0,
  add column if not exists campaign_name text,
  add column if not exists role_filter text,
  add column if not exists auto_trigger text default 'manual',
  add column if not exists active boolean default true,
  add column if not exists paused boolean default false,
  add column if not exists active_from timestamptz,
  add column if not exists active_until timestamptz,
  add column if not exists benefit_from timestamptz,
  add column if not exists benefit_until timestamptz,
  add column if not exists seasonal_months integer[],
  add column if not exists max_recipients integer,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists badges_slug_key on public.badges(slug);
create index if not exists badges_active_idx on public.badges(active);
create index if not exists badges_category_idx on public.badges(category);

create table if not exists public.porte_coins_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.porte_coins_transactions
  add column if not exists user_id uuid,
  add column if not exists amount integer default 0,
  add column if not exists reason text default 'manual',
  add column if not exists reference_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

create index if not exists porte_coins_tx_user_idx on public.porte_coins_transactions(user_id);
create index if not exists porte_coins_tx_created_idx on public.porte_coins_transactions(created_at desc);

drop view if exists public.points_impact_transactions;
create view public.points_impact_transactions
with (security_invoker = true)
as
select
  id,
  user_id,
  amount,
  reason,
  metadata,
  created_at
from public.porte_coins_transactions;

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  badge_id uuid references public.badges(id) on delete cascade,
  badge_key text,
  title text,
  description text,
  granted_at timestamptz default now(),
  earned_at timestamptz default now(),
  granted_by text default 'system'
);

alter table public.user_badges
  add column if not exists user_id uuid,
  add column if not exists badge_id uuid references public.badges(id) on delete cascade,
  add column if not exists badge_key text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists granted_at timestamptz default now(),
  add column if not exists earned_at timestamptz default now(),
  add column if not exists granted_by text default 'system';

create index if not exists user_badges_user_idx on public.user_badges(user_id);
create index if not exists user_badges_badge_idx on public.user_badges(badge_id);
create unique index if not exists user_badges_user_badge_unique
  on public.user_badges(user_id, badge_id)
  where badge_id is not null;

update public.user_badges ub
set badge_id = b.id
from public.badges b
where ub.badge_id is null
  and (
    (ub.badge_key is not null and ub.badge_key = b.slug)
    or (ub.title is not null and ub.title = b.name)
  );

drop view if exists public.badge_campaign_status;
create view public.badge_campaign_status
with (security_invoker = true)
as
select
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
  coalesce(ub.total, 0) as recipients_count,
  case
    when coalesce(b.paused, false) then 'pause'
    when coalesce(b.active, true) = false then 'inactif'
    when b.active_until is not null and b.active_until < now() then 'termine'
    when b.active_from is not null and b.active_from > now() then 'planifie'
    else 'actif'
  end as statut
from public.badges b
left join (
  select badge_id, count(*) as total
  from public.user_badges
  where badge_id is not null
  group by badge_id
) ub on ub.badge_id = b.id;

create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  ref_type text,
  ref_id uuid,
  created_at timestamptz default now()
);

alter table public.xp_transactions
  add column if not exists user_id uuid,
  add column if not exists amount integer default 0,
  add column if not exists reason text default 'manual',
  add column if not exists ref_type text,
  add column if not exists ref_id uuid,
  add column if not exists created_at timestamptz default now();

create index if not exists xp_transactions_user_idx on public.xp_transactions(user_id);

create table if not exists public.reward_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  points_delta integer default 0,
  xp_delta integer default 0,
  ref_type text,
  ref_id uuid,
  admin_id uuid references auth.users(id) on delete set null,
  cancelled boolean default false,
  note text,
  created_at timestamptz default now()
);

alter table public.reward_audit_logs
  add column if not exists user_id uuid,
  add column if not exists action text default 'manual',
  add column if not exists points_delta integer default 0,
  add column if not exists xp_delta integer default 0,
  add column if not exists ref_type text,
  add column if not exists ref_id uuid,
  add column if not exists admin_id uuid,
  add column if not exists cancelled boolean default false,
  add column if not exists note text,
  add column if not exists created_at timestamptz default now();

-- ============================================================
-- MISSIONS / TIRAGES
-- ============================================================

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  objective_type text not null default 'custom',
  objective_target integer not null default 1,
  reward_coins integer not null default 0,
  deadline timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.missions
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists objective_type text default 'custom',
  add column if not exists objective_target integer default 1,
  add column if not exists reward_coins integer default 0,
  add column if not exists deadline timestamptz,
  add column if not exists status text default 'active',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.user_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  progress integer not null default 0,
  status text not null default 'active',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_missions
  add column if not exists user_id uuid,
  add column if not exists mission_id uuid,
  add column if not exists progress integer default 0,
  add column if not exists status text default 'active',
  add column if not exists completed_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists user_missions_user_mission_unique
  on public.user_missions(user_id, mission_id)
  where user_id is not null and mission_id is not null;

create table if not exists public.monthly_draws (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  draw_date date not null,
  status text not null default 'active',
  rules_url text default '/reglements-tirage.html',
  auto_include_all_users boolean not null default true,
  eligibility_badge_slug text,
  winner_selected_at timestamptz,
  winner_count integer not null default 1,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monthly_draws
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists draw_date date,
  add column if not exists status text default 'active',
  add column if not exists rules_url text default '/reglements-tirage.html',
  add column if not exists auto_include_all_users boolean not null default true,
  add column if not exists eligibility_badge_slug text,
  add column if not exists winner_selected_at timestamptz,
  add column if not exists winner_count integer not null default 1,
  add column if not exists admin_note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists monthly_draws_status_idx on public.monthly_draws(status);
create index if not exists monthly_draws_date_idx on public.monthly_draws(draw_date desc);

create table if not exists public.draw_prizes (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references public.monthly_draws(id) on delete cascade,
  title text not null,
  description text,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.draw_prizes
  add column if not exists draw_id uuid,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists quantity integer default 1,
  add column if not exists created_at timestamptz default now();

create table if not exists public.draw_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references public.monthly_draws(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  entries integer not null default 1,
  cost_coins integer not null default 10,
  created_at timestamptz not null default now()
);

alter table public.draw_entries
  add column if not exists draw_id uuid,
  add column if not exists user_id uuid,
  add column if not exists entries integer default 1,
  add column if not exists cost_coins integer default 10,
  add column if not exists created_at timestamptz default now();

create index if not exists draw_entries_draw_idx on public.draw_entries(draw_id);
create index if not exists draw_entries_user_idx on public.draw_entries(user_id);

create table if not exists public.draw_winners (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references public.monthly_draws(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  prize_title text not null default 'Prix PorteaPorte',
  published boolean not null default false,
  entries_weight integer not null default 1,
  user_email text,
  user_role text,
  selected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.draw_winners
  add column if not exists draw_id uuid,
  add column if not exists user_id uuid,
  add column if not exists prize_title text default 'Prix PorteaPorte',
  add column if not exists published boolean not null default false,
  add column if not exists entries_weight integer not null default 1,
  add column if not exists user_email text,
  add column if not exists user_role text,
  add column if not exists selected_by uuid,
  add column if not exists created_at timestamptz not null default now();

create index if not exists draw_winners_draw_idx on public.draw_winners(draw_id);
create index if not exists draw_winners_created_idx on public.draw_winners(created_at desc);

-- ============================================================
-- IMPACT / ORGANISMES
-- ============================================================

create table if not exists public.impact_settings (
  id text primary key default 'default',
  donation_rate_percent numeric(6,2) not null default 5,
  platform_commission_percent numeric(6,2) not null default 12,
  pct_livreur numeric(6,2) default 85,
  pct_plateforme numeric(6,2) default 15,
  pct_don numeric(6,2) default 0,
  pct_tirage numeric(6,2) default 0,
  pct_developpeur numeric(6,2) default 0,
  pct_securite numeric(6,2) default 0,
  pct_assurance numeric(6,2) default 0,
  public_note text default 'Montants estimes en direct, confirmes mensuellement.',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.impact_settings
  add column if not exists donation_rate_percent numeric(6,2) default 5,
  add column if not exists platform_commission_percent numeric(6,2) default 12,
  add column if not exists pct_livreur numeric(6,2) default 85,
  add column if not exists pct_plateforme numeric(6,2) default 15,
  add column if not exists pct_don numeric(6,2) default 0,
  add column if not exists pct_tirage numeric(6,2) default 0,
  add column if not exists pct_developpeur numeric(6,2) default 0,
  add column if not exists pct_securite numeric(6,2) default 0,
  add column if not exists pct_assurance numeric(6,2) default 0,
  add column if not exists public_note text,
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz default now();

insert into public.impact_settings (id, donation_rate_percent, platform_commission_percent, public_note)
values ('default', 5, 12, 'Montants estimes en direct, confirmes mensuellement.')
on conflict (id) do nothing;

create table if not exists public.impact_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  website_url text,
  logo_url text,
  active boolean not null default true,
  allocation_percent numeric(6,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.impact_organisations
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists website_url text,
  add column if not exists logo_url text,
  add column if not exists active boolean default true,
  add column if not exists allocation_percent numeric(6,2) default 0,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.impact_applications (
  id uuid primary key default gen_random_uuid(),
  organisation_name text not null,
  contact_name text,
  email text,
  phone text,
  website_url text,
  mission text,
  requested_support text,
  status text not null default 'pending',
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.impact_applications
  add column if not exists organisation_name text,
  add column if not exists contact_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists website_url text,
  add column if not exists mission text,
  add column if not exists requested_support text,
  add column if not exists status text default 'pending',
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz default now();

create table if not exists public.impact_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,
  revenue_cents integer not null default 0,
  commission_cents integer not null default 0,
  donation_pool_cents integer not null default 0,
  status text not null default 'estimated',
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.organismes_partenaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  slug text unique,
  description text,
  mission text,
  logo_url text,
  site_web text,
  numero_obnl text,
  region text,
  cause text,
  actif boolean default true,
  est_principal boolean default false,
  total_recu_cad numeric default 0,
  dernier_versement_at timestamptz,
  ordre integer default 0,
  statut text default 'approved',
  public_visible boolean default true,
  verifie boolean default false,
  verifie_par uuid,
  verifie_at timestamptz,
  raison_refus text,
  contact_nom text,
  contact_email text,
  contact_telephone text,
  pourcentage_allocation numeric default 0,
  cree_le timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.organismes_partenaires
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists mission text,
  add column if not exists logo_url text,
  add column if not exists site_web text,
  add column if not exists numero_obnl text,
  add column if not exists region text,
  add column if not exists cause text,
  add column if not exists actif boolean default true,
  add column if not exists est_principal boolean default false,
  add column if not exists total_recu_cad numeric default 0,
  add column if not exists dernier_versement_at timestamptz,
  add column if not exists ordre integer default 0,
  add column if not exists statut text default 'approved',
  add column if not exists public_visible boolean default true,
  add column if not exists verifie boolean default false,
  add column if not exists verifie_par uuid,
  add column if not exists verifie_at timestamptz,
  add column if not exists raison_refus text,
  add column if not exists contact_nom text,
  add column if not exists contact_email text,
  add column if not exists contact_telephone text,
  add column if not exists pourcentage_allocation numeric default 0,
  add column if not exists cree_le timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists organismes_partenaires_slug_key on public.organismes_partenaires(slug);
create index if not exists organismes_partenaires_actif_idx on public.organismes_partenaires(actif);

create table if not exists public.impact_versements (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid references public.organismes_partenaires(id) on delete set null,
  montant_cad numeric not null default 0,
  source_type text default 'livraison',
  livraison_id uuid,
  mois date,
  statut text default 'estimated',
  preuve_url text,
  note_admin text,
  cree_le timestamptz default now()
);

create index if not exists impact_versements_organisme_idx on public.impact_versements(organisme_id);
create index if not exists impact_versements_mois_idx on public.impact_versements(mois desc);

-- ============================================================
-- LIVRAISONS / TRANSACTIONS / AUDIT
-- ============================================================

alter table public.profiles
  add column if not exists xp integer default 0,
  add column if not exists porte_coins integer default 0,
  add column if not exists portecoins integer default 0,
  add column if not exists email_verified boolean default false,
  add column if not exists verification_status text default 'pending',
  add column if not exists driver_status text default 'not_started',
  add column if not exists suspendu boolean default false,
  add column if not exists raison_suspension text,
  add column if not exists referral_code text,
  add column if not exists referred_by text,
  add column if not exists streak_jours integer default 0,
  add column if not exists last_activity date;

alter table public.livraisons
  add column if not exists titre text,
  add column if not exists description text,
  add column if not exists poids numeric(10,2),
  add column if not exists poids_kg numeric(10,2),
  add column if not exists valeur_declaree numeric(12,2),
  add column if not exists prix numeric(12,2),
  add column if not exists prix_total numeric(12,2),
  add column if not exists prix_final numeric(12,2),
  add column if not exists assurance_plan text,
  add column if not exists protection_plan text,
  add column if not exists stripe_payment_intent text,
  add column if not exists payment_intent_id text,
  add column if not exists nom_destinataire text,
  add column if not exists email_destinataire text,
  add column if not exists telephone_destinataire text,
  add column if not exists destinataire_email text,
  add column if not exists destinataire_user_id uuid,
  add column if not exists recipient_confirmation_hash text,
  add column if not exists recipient_confirmation_created_at timestamptz,
  add column if not exists recipient_confirmed_at timestamptz,
  add column if not exists recipient_confirmation_method text,
  add column if not exists pickup_code_hash text,
  add column if not exists delivery_confirmation_mode text,
  add column if not exists delivery_proof_required_admin_review boolean default false,
  add column if not exists reception_mode text,
  add column if not exists reception_heure_debut text,
  add column if not exists reception_heure_fin text,
  add column if not exists reception_photo_obligatoire boolean default false,
  add column if not exists reception_lieu_repli text,
  add column if not exists reception_note_livreur text,
  add column if not exists reception_preferences_set_at timestamptz;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  livraison_id uuid,
  type text default 'payment',
  kind text,
  montant numeric default 0,
  amount numeric default 0,
  statut text default 'pending',
  status text default 'pending',
  stripe_payment_intent text,
  retention_until timestamptz default (now() + interval '7 years'),
  audit_locked boolean not null default true,
  created_at timestamptz default now()
);

alter table public.transactions
  add column if not exists user_id uuid,
  add column if not exists livraison_id uuid,
  add column if not exists type text default 'payment',
  add column if not exists kind text,
  add column if not exists montant numeric default 0,
  add column if not exists amount numeric default 0,
  add column if not exists statut text default 'pending',
  add column if not exists status text default 'pending',
  add column if not exists stripe_payment_intent text,
  add column if not exists retention_until timestamptz default (now() + interval '7 years'),
  add column if not exists audit_locked boolean not null default true,
  add column if not exists created_at timestamptz default now();

create table if not exists public.transaction_audit_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid,
  livraison_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  amount_cents integer,
  currency text default 'cad',
  stripe_payment_intent text,
  stripe_refund_id text,
  status text,
  evidence jsonb not null default '{}'::jsonb,
  retention_until timestamptz not null default (now() + interval '7 years'),
  created_at timestamptz not null default now()
);

create index if not exists transaction_audit_livraison_idx on public.transaction_audit_events(livraison_id);
create index if not exists transaction_audit_user_idx on public.transaction_audit_events(user_id);
create index if not exists transaction_audit_pi_idx on public.transaction_audit_events(stripe_payment_intent);

-- ============================================================
-- RLS + GRANTS
-- ============================================================

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.porte_coins_transactions enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.reward_audit_logs enable row level security;
alter table public.missions enable row level security;
alter table public.user_missions enable row level security;
alter table public.monthly_draws enable row level security;
alter table public.draw_prizes enable row level security;
alter table public.draw_entries enable row level security;
alter table public.draw_winners enable row level security;
alter table public.impact_settings enable row level security;
alter table public.impact_organisations enable row level security;
alter table public.impact_applications enable row level security;
alter table public.impact_monthly_reports enable row level security;
alter table public.organismes_partenaires enable row level security;
alter table public.impact_versements enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_audit_events enable row level security;

drop policy if exists badges_public_read on public.badges;
create policy badges_public_read on public.badges for select using (coalesce(active, true) = true);

drop policy if exists badges_admin_all on public.badges;
create policy badges_admin_all on public.badges
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists user_badges_own_read on public.user_badges;
create policy user_badges_own_read on public.user_badges for select using (auth.uid() = user_id);

drop policy if exists user_badges_admin_all on public.user_badges;
create policy user_badges_admin_all on public.user_badges
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists porte_coins_own_read on public.porte_coins_transactions;
create policy porte_coins_own_read on public.porte_coins_transactions for select using (auth.uid() = user_id);

drop policy if exists porte_coins_admin_all on public.porte_coins_transactions;
create policy porte_coins_admin_all on public.porte_coins_transactions
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists xp_transactions_own_read on public.xp_transactions;
create policy xp_transactions_own_read on public.xp_transactions for select using (auth.uid() = user_id);

drop policy if exists draws_public_read on public.monthly_draws;
create policy draws_public_read on public.monthly_draws for select using (status in ('active','closed','completed'));

drop policy if exists draws_admin_all on public.monthly_draws;
create policy draws_admin_all on public.monthly_draws
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists draw_prizes_public_read on public.draw_prizes;
create policy draw_prizes_public_read on public.draw_prizes for select using (true);

drop policy if exists draw_entries_own_read on public.draw_entries;
create policy draw_entries_own_read on public.draw_entries for select using (auth.uid() = user_id);

drop policy if exists draw_entries_admin_all on public.draw_entries;
create policy draw_entries_admin_all on public.draw_entries
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists draw_winners_public_read on public.draw_winners;
create policy draw_winners_public_read on public.draw_winners for select using (published = true);

drop policy if exists draw_winners_admin_all on public.draw_winners;
create policy draw_winners_admin_all on public.draw_winners
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists impact_settings_public_read on public.impact_settings;
create policy impact_settings_public_read on public.impact_settings for select using (true);

drop policy if exists impact_settings_admin_all on public.impact_settings;
create policy impact_settings_admin_all on public.impact_settings
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists impact_org_public_read on public.impact_organisations;
create policy impact_org_public_read on public.impact_organisations for select using (active = true);

drop policy if exists impact_org_admin_all on public.impact_organisations;
create policy impact_org_admin_all on public.impact_organisations
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists impact_applications_public_insert on public.impact_applications;
create policy impact_applications_public_insert on public.impact_applications for insert with check (status = 'pending');

drop policy if exists impact_applications_admin_all on public.impact_applications;
create policy impact_applications_admin_all on public.impact_applications
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists organismes_public_read on public.organismes_partenaires;
create policy organismes_public_read on public.organismes_partenaires
  for select using (coalesce(actif,true) = true and coalesce(public_visible,true) = true);

drop policy if exists organismes_admin_all on public.organismes_partenaires;
create policy organismes_admin_all on public.organismes_partenaires
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists impact_versements_public_read on public.impact_versements;
create policy impact_versements_public_read on public.impact_versements for select using (statut in ('estimated','confirmed','paid'));

drop policy if exists transactions_own_read on public.transactions;
create policy transactions_own_read on public.transactions for select using (auth.uid() = user_id);

drop policy if exists transactions_admin_all on public.transactions;
create policy transactions_admin_all on public.transactions
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

drop policy if exists transaction_audit_user_own_read on public.transaction_audit_events;
create policy transaction_audit_user_own_read on public.transaction_audit_events for select using (auth.uid() = user_id);

drop policy if exists transaction_audit_admin_all on public.transaction_audit_events;
create policy transaction_audit_admin_all on public.transaction_audit_events
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.suspendu,false) = false));

grant select on public.badges to anon, authenticated;
grant select on public.points_impact_transactions to authenticated;
grant select on public.badge_campaign_status to authenticated;
grant select on public.monthly_draws to anon, authenticated;
grant select on public.draw_prizes to anon, authenticated;
grant select on public.draw_winners to anon, authenticated;
grant select on public.impact_settings to anon, authenticated;
grant select on public.impact_organisations to anon, authenticated;
grant insert on public.impact_applications to anon, authenticated;
grant select on public.organismes_partenaires to anon, authenticated;
grant select on public.impact_versements to anon, authenticated;

grant select on public.user_badges to authenticated;
grant select on public.porte_coins_transactions to authenticated;
grant select on public.xp_transactions to authenticated;
grant select on public.missions to authenticated;
grant select on public.user_missions to authenticated;
grant select, insert on public.draw_entries to authenticated;
grant select on public.transactions to authenticated;
grant select on public.transaction_audit_events to authenticated;

-- ============================================================
-- SEEDS MINIMAUX
-- ============================================================

insert into public.badges (slug, name, description, icon, category, rarity, points_reward, xp_reward, active)
values
  ('profil_verifie', 'Profil verifie', 'Identite confirmee et profil pret a utiliser.', 'verified', 'confiance', 'common', 25, 50, true),
  ('premiere_livraison', 'Premiere livraison', 'Premiere livraison completee.', 'package', 'livraison', 'common', 20, 30, true),
  ('livreur_fiable', 'Livreur fiable', 'Dossier livreur regulier et fiable.', 'star', 'livraison', 'rare', 50, 100, true),
  ('parrain_actif', 'Parrain actif', 'Parrainage reussi apres une vraie action.', 'referral', 'communaute', 'rare', 75, 150, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  rarity = excluded.rarity,
  points_reward = excluded.points_reward,
  xp_reward = excluded.xp_reward,
  active = true;

insert into public.organismes_partenaires (
  nom, slug, description, mission, cause, region, est_principal, ordre, statut, public_visible, verifie
)
values (
  'Fonds PorteaPorte',
  'fonds-porteaporte',
  'Fonds interne qui redistribue une partie des revenus a des causes quebecoises selectionnees par la communaute.',
  'Soutenir les causes locales: banques alimentaires, aines isoles, etudiants demunis et environnement.',
  'Multi-causes communautaires',
  'Tout le Quebec',
  true,
  1,
  'approved',
  true,
  true
)
on conflict (slug) do update set
  description = excluded.description,
  mission = excluded.mission,
  actif = true,
  public_visible = true,
  verifie = true,
  updated_at = now();

insert into public.impact_organisations (name, description, active, allocation_percent, sort_order)
values ('Fonds PorteaPorte', 'Fonds interne pour causes locales selectionnees par la communaute.', true, 100, 1)
on conflict do nothing;

insert into public.monthly_draws (title, description, draw_date, status, rules_url)
select
  'Tirage mensuel PorteaPorte',
  'Tirage beta pour remercier les utilisateurs actifs.',
  (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  'draft',
  '/reglements-tirage.html'
where not exists (select 1 from public.monthly_draws);

notify pgrst, 'reload schema';

commit;

-- Verification rapide: ce resultat doit retourner des nombres, pas une erreur.
select
  (select count(*) from public.badges) as badges_count,
  (select count(*) from public.monthly_draws) as monthly_draws_count,
  (select count(*) from public.draw_winners) as draw_winners_count,
  (select count(*) from public.organismes_partenaires) as organismes_count,
  (select count(*) from public.impact_organisations) as impact_orgs_count;
