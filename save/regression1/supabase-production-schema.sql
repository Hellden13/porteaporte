-- PorteaPorte - schema Supabase production
-- A executer dans Supabase SQL Editor avec le role owner.
-- Le frontend utilise seulement la anon key. Les operations sensibles passent par RLS ou RPC.

begin;

create extension if not exists "pgcrypto";

-- ============================================================
-- Helpers securite
-- ============================================================

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'admin'
      and coalesce(p.suspendu, false) = false
  );
$$;

create or replace function public.is_self_or_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = p_user_id or public.is_admin(auth.uid());
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Profiles
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text,
  nom text,
  email text unique,
  telephone text,
  ville text,
  role text not null default 'expediteur',
  coins integer not null default 50,
  xp integer not null default 0,
  livraisons integer not null default 0,
  envois integer not null default 0,
  score integer not null default 0,
  score_confiance integer not null default 75,
  niveau text not null default 'bronze',
  niveau_expediteur text not null default 'Voisin',
  niveau_livreur text not null default 'Bronze',
  code_pp text unique,
  parrain_id uuid references public.profiles(id) on delete set null,
  certifie boolean not null default false,
  suspendu boolean not null default false,
  raison_suspension text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mis_a_jour_le timestamptz,
  cree_le timestamptz generated always as (created_at) stored,
  mis_a_jour timestamptz generated always as (updated_at) stored,
  constraint profiles_role_check check (role in ('admin', 'expediteur', 'livreur', 'les deux')),
  constraint profiles_coins_check check (coins >= 0),
  constraint profiles_xp_check check (xp >= 0),
  constraint profiles_score_check check (score between 0 and 100),
  constraint profiles_score_confiance_check check (score_confiance between 0 and 100)
);

alter table public.profiles add column if not exists telephone text;
alter table public.profiles add column if not exists ville text;
alter table public.profiles add column if not exists niveau_expediteur text not null default 'Voisin';
alter table public.profiles add column if not exists niveau_livreur text not null default 'Bronze';
alter table public.profiles add column if not exists code_pp text unique;
alter table public.profiles add column if not exists parrain_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists certifie boolean not null default false;
alter table public.profiles add column if not exists raison_suspension text;
alter table public.profiles add column if not exists mis_a_jour_le timestamptz;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_email_idx on public.profiles(email);
create index if not exists profiles_code_pp_idx on public.profiles(code_pp);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Creation automatique du profil apres signup Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    prenom,
    nom,
    role,
    coins,
    xp,
    code_pp
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'expediteur'),
    50,
    0,
    'PP-' || upper(substr(replace(new.id::text, '-', ''), 1, 8))
  )
  on conflict (id) do update set
    email = excluded.email,
    prenom = coalesce(nullif(public.profiles.prenom, ''), excluded.prenom),
    nom = coalesce(nullif(public.profiles.nom, ''), excluded.nom),
    role = coalesce(public.profiles.role, excluded.role);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- Livraisons
-- ============================================================

create table if not exists public.livraisons (
  id uuid primary key default gen_random_uuid(),
  expediteur_id uuid not null references public.profiles(id) on delete restrict,
  livreur_id uuid references public.profiles(id) on delete set null,
  type text not null default 'colis',
  code text unique not null default ('PP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  titre text,
  description text,
  type_colis text,
  adresse_depart text,
  adresse_arrivee text,
  ville_depart text,
  ville_arrivee text,
  poids numeric(10,2),
  valeur_declaree numeric(12,2),
  prix numeric(12,2),
  prix_total numeric(12,2),
  prix_final numeric(12,2),
  assurance_plan text,
  statut text not null default 'en_attente',
  notes text,
  ramasse_le timestamptz,
  livre_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mis_a_jour_le timestamptz,
  cree_le timestamptz generated always as (created_at) stored,
  constraint livraisons_type_check check (type in ('colis', 'covoiturage', 'mission_solidaire')),
  constraint livraisons_statut_check check (statut in ('en_attente', 'publie', 'offre_recue', 'confirme', 'en_route', 'ramasse', 'livre', 'annule', 'litige', 'rembourse')),
  constraint livraisons_prix_check check (coalesce(prix, 0) >= 0 and coalesce(prix_total, 0) >= 0 and coalesce(prix_final, 0) >= 0),
  constraint livraisons_poids_check check (poids is null or poids >= 0)
);

alter table public.livraisons add column if not exists code text unique;
alter table public.livraisons add column if not exists type_colis text;
alter table public.livraisons add column if not exists valeur_declaree numeric(12,2);
alter table public.livraisons add column if not exists prix_final numeric(12,2);
alter table public.livraisons add column if not exists assurance_plan text;
alter table public.livraisons add column if not exists notes text;
alter table public.livraisons add column if not exists ramasse_le timestamptz;
alter table public.livraisons add column if not exists livre_le timestamptz;
alter table public.livraisons add column if not exists mis_a_jour_le timestamptz;

create index if not exists livraisons_expediteur_idx on public.livraisons(expediteur_id);
create index if not exists livraisons_livreur_idx on public.livraisons(livreur_id);
create index if not exists livraisons_statut_idx on public.livraisons(statut);
create index if not exists livraisons_created_at_idx on public.livraisons(created_at desc);
create index if not exists livraisons_code_idx on public.livraisons(code);

do $$
begin
  alter table public.livraisons drop constraint if exists livraisons_statut_check;
  alter table public.livraisons add constraint livraisons_statut_check check (
    statut in (
      'en_attente', 'publie', 'offre_recue', 'paiement_autorise',
      'confirme', 'en_route', 'ramasse', 'livre', 'payee',
      'annule', 'annulee', 'litige', 'rembourse'
    )
  );
end $$;

drop trigger if exists livraisons_set_updated_at on public.livraisons;
create trigger livraisons_set_updated_at
before update on public.livraisons
for each row execute function public.set_updated_at();

-- ============================================================
-- Transactions / ledger PorteCoins et paiements
-- ============================================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  livraison_id uuid references public.livraisons(id) on delete set null,
  type text not null default 'transaction',
  montant numeric(12,2),
  montant_coins integer,
  statut text not null default 'complete',
  description text,
  stripe_payment_intent text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  cree_le timestamptz generated always as (created_at) stored,
  constraint transactions_statut_check check (statut in ('en_attente', 'complete', 'echec', 'annule', 'rembourse')),
  constraint transactions_montant_present_check check (montant is not null or montant_coins is not null)
);

alter table public.transactions add column if not exists livraison_id uuid references public.livraisons(id) on delete set null;
alter table public.transactions add column if not exists stripe_payment_intent text unique;
alter table public.transactions add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists transactions_user_idx on public.transactions(user_id);
create index if not exists transactions_livraison_idx on public.transactions(livraison_id);
create index if not exists transactions_created_at_idx on public.transactions(created_at desc);
create index if not exists transactions_type_idx on public.transactions(type);

do $$
begin
  alter table public.transactions drop constraint if exists transactions_statut_check;
  alter table public.transactions add constraint transactions_statut_check check (
    statut in (
      'en_attente', 'complete', 'echec', 'annule', 'annulee', 'rembourse',
      'requires_payment_method', 'requires_confirmation', 'requires_action',
      'processing', 'requires_capture', 'canceled', 'succeeded'
    )
  );
end $$;

-- ============================================================
-- Notifications
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titre text not null,
  message text not null,
  type text not null default 'admin',
  lien text,
  lu boolean not null default false,
  created_at timestamptz not null default now(),
  lu_le timestamptz
);

alter table public.notifications add column if not exists lien text;
alter table public.notifications add column if not exists lu_le timestamptz;
alter table public.notifications add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists notifications_user_lu_idx on public.notifications(user_id, lu);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);

-- ============================================================
-- Evaluations / support / litiges
-- ============================================================

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  livraison_id uuid references public.livraisons(id) on delete cascade,
  auteur_id uuid not null references public.profiles(id) on delete cascade,
  cible_id uuid not null references public.profiles(id) on delete cascade,
  note integer not null check (note between 1 and 5),
  commentaire text,
  created_at timestamptz not null default now(),
  unique(livraison_id, auteur_id, cible_id)
);

create table if not exists public.messages_support (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  sujet text not null,
  message text not null,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'en_cours', 'resolu', 'ferme')),
  priorite text not null default 'normale' check (priorite in ('basse', 'normale', 'haute', 'urgente')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.litiges (
  id uuid primary key default gen_random_uuid(),
  livraison_id uuid references public.livraisons(id) on delete set null,
  plaignant_id uuid not null references public.profiles(id) on delete cascade,
  cible_id uuid references public.profiles(id) on delete set null,
  type text not null default 'livraison',
  statut text not null default 'ouvert' check (statut in ('ouvert', 'en_revision', 'resolu', 'rejete')),
  description text not null,
  montant_conteste numeric(12,2),
  stripe_dispute_id text,
  resolution text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists evaluations_livraison_idx on public.evaluations(livraison_id);
create index if not exists messages_support_user_idx on public.messages_support(user_id);
create index if not exists litiges_livraison_idx on public.litiges(livraison_id);
create index if not exists litiges_statut_idx on public.litiges(statut);

drop trigger if exists messages_support_set_updated_at on public.messages_support;
create trigger messages_support_set_updated_at
before update on public.messages_support
for each row execute function public.set_updated_at();

drop trigger if exists litiges_set_updated_at on public.litiges;
create trigger litiges_set_updated_at
before update on public.litiges
for each row execute function public.set_updated_at();

-- ============================================================
-- Codes promo
-- ============================================================

create table if not exists public.codes_promo (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null default 'montant',
  valeur numeric(12,2) not null,
  limite_utilisations integer,
  utilisations integer not null default 0,
  date_expiration date,
  actif boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint codes_promo_type_check check (type in ('montant', 'pourcentage', 'porte_coins')),
  constraint codes_promo_valeur_check check (valeur > 0),
  constraint codes_promo_utilisations_check check (utilisations >= 0 and (limite_utilisations is null or limite_utilisations >= utilisations))
);

alter table public.codes_promo add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.codes_promo add column if not exists updated_at timestamptz not null default now();

create index if not exists codes_promo_code_idx on public.codes_promo(code);
create index if not exists codes_promo_actif_idx on public.codes_promo(actif);

drop trigger if exists codes_promo_set_updated_at on public.codes_promo;
create trigger codes_promo_set_updated_at
before update on public.codes_promo
for each row execute function public.set_updated_at();

-- ============================================================
-- RPC securisees
-- ============================================================

create or replace function public.ajouter_coins(
  p_user_id uuid,
  p_montant integer,
  p_type text default 'ajustement',
  p_description text default null,
  p_livraison_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  if p_montant = 0 then
    raise exception 'Le montant ne peut pas etre zero';
  end if;

  if not (auth.uid() = p_user_id or public.is_admin(auth.uid())) then
    raise exception 'Non autorise';
  end if;

  update public.profiles
  set coins = greatest(0, coins + p_montant)
  where id = p_user_id
  returning coins into v_new_balance;

  if v_new_balance is null then
    raise exception 'Profil introuvable';
  end if;

  insert into public.transactions(user_id, livraison_id, type, montant_coins, statut, description)
  values (p_user_id, p_livraison_id, p_type, p_montant, 'complete', p_description);

  return v_new_balance;
end;
$$;

create or replace function public.accepter_livraison(p_livraison_id uuid)
returns public.livraisons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_livraison public.livraisons;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('livreur', 'les deux', 'admin')
      and suspendu = false
  ) then
    raise exception 'Profil livreur requis';
  end if;

  update public.livraisons
  set livreur_id = auth.uid(),
      statut = 'en_route'
  where id = p_livraison_id
    and livreur_id is null
    and statut in ('en_attente', 'publie')
  returning * into v_livraison;

  if v_livraison.id is null then
    raise exception 'Livraison non disponible';
  end if;

  return v_livraison;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.livraisons enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.codes_promo enable row level security;
alter table public.evaluations enable row level security;
alter table public.messages_support enable row level security;
alter table public.litiges enable row level security;

-- Profiles
drop policy if exists "profiles_select_self_admin" on public.profiles;
create policy "profiles_select_self_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_select_livreurs_public_authenticated" on public.profiles;
create policy "profiles_select_livreurs_public_authenticated" on public.profiles
for select to authenticated
using (role in ('livreur', 'les deux') and suspendu = false);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own_limited_or_admin" on public.profiles;
create policy "profiles_update_own_limited_or_admin" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

-- Livraisons
drop policy if exists "livraisons_select_visible" on public.livraisons;
create policy "livraisons_select_visible" on public.livraisons
for select to authenticated
using (
  public.is_admin(auth.uid())
  or expediteur_id = auth.uid()
  or livreur_id = auth.uid()
  or (livreur_id is null and statut in ('en_attente', 'publie'))
);

drop policy if exists "livraisons_insert_expediteur" on public.livraisons;
create policy "livraisons_insert_expediteur" on public.livraisons
for insert to authenticated
with check (expediteur_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "livraisons_update_participants" on public.livraisons;
create policy "livraisons_update_participants" on public.livraisons
for update to authenticated
using (
  public.is_admin(auth.uid())
  or expediteur_id = auth.uid()
  or livreur_id = auth.uid()
  or (livreur_id is null and statut in ('en_attente', 'publie'))
)
with check (
  public.is_admin(auth.uid())
  or expediteur_id = auth.uid()
  or livreur_id = auth.uid()
);

-- Transactions
drop policy if exists "transactions_select_self_admin" on public.transactions;
create policy "transactions_select_self_admin" on public.transactions
for select to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "transactions_insert_admin_only" on public.transactions;
create policy "transactions_insert_admin_only" on public.transactions
for insert to authenticated
with check (public.is_admin(auth.uid()));

-- Notifications
drop policy if exists "notifications_select_self_admin" on public.notifications;
create policy "notifications_select_self_admin" on public.notifications
for select to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "notifications_update_self_read_admin" on public.notifications;
create policy "notifications_update_self_read_admin" on public.notifications
for update to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin" on public.notifications
for insert to authenticated
with check (public.is_admin(auth.uid()));

-- Codes promo
drop policy if exists "codes_promo_select_active" on public.codes_promo;
create policy "codes_promo_select_active" on public.codes_promo
for select to authenticated
using (actif = true or public.is_admin(auth.uid()));

drop policy if exists "codes_promo_write_admin" on public.codes_promo;
create policy "codes_promo_write_admin" on public.codes_promo
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Evaluations
drop policy if exists "evaluations_select_participants_admin" on public.evaluations;
create policy "evaluations_select_participants_admin" on public.evaluations
for select to authenticated
using (auteur_id = auth.uid() or cible_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "evaluations_insert_author" on public.evaluations;
create policy "evaluations_insert_author" on public.evaluations
for insert to authenticated
with check (auteur_id = auth.uid() or public.is_admin(auth.uid()));

-- Support
drop policy if exists "messages_support_select_self_admin" on public.messages_support;
create policy "messages_support_select_self_admin" on public.messages_support
for select to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "messages_support_insert_self" on public.messages_support;
create policy "messages_support_insert_self" on public.messages_support
for insert to authenticated
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "messages_support_update_admin" on public.messages_support;
create policy "messages_support_update_admin" on public.messages_support
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Litiges
drop policy if exists "litiges_select_participants_admin" on public.litiges;
create policy "litiges_select_participants_admin" on public.litiges
for select to authenticated
using (plaignant_id = auth.uid() or cible_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "litiges_insert_plaignant" on public.litiges;
create policy "litiges_insert_plaignant" on public.litiges
for insert to authenticated
with check (plaignant_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "litiges_update_admin" on public.litiges;
create policy "litiges_update_admin" on public.litiges
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Grants explicites
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.livraisons to authenticated;
grant select, insert on public.transactions to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.codes_promo to authenticated;
grant select, insert on public.evaluations to authenticated;
grant select, insert on public.messages_support to authenticated;
grant select, insert on public.litiges to authenticated;
grant execute on function public.ajouter_coins(uuid, integer, text, text, uuid) to authenticated;
grant execute on function public.accepter_livraison(uuid) to authenticated;

commit;
