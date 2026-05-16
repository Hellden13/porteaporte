create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text,
  nom text,
  email text unique,
  role text not null default 'expediteur' check (role in ('admin', 'expediteur', 'livreur', 'les deux')),
  coins integer not null default 50,
  xp integer not null default 0,
  livraisons integer not null default 0,
  envois integer not null default 0,
  score integer not null default 0,
  score_confiance integer not null default 75,
  niveau text not null default 'bronze',
  suspendu boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.livraisons (
  id uuid primary key default gen_random_uuid(),
  expediteur_id uuid references public.profiles(id) on delete set null,
  livreur_id uuid references public.profiles(id) on delete set null,
  type text not null default 'colis',
  titre text,
  description text,
  adresse_depart text,
  adresse_arrivee text,
  ville_depart text,
  ville_arrivee text,
  poids numeric,
  prix numeric,
  prix_total numeric,
  statut text not null default 'en_attente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  type text not null default 'transaction',
  montant numeric,
  montant_coins integer,
  statut text not null default 'complete',
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  titre text not null,
  message text not null,
  type text not null default 'admin',
  lu boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.codes_promo (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null default 'montant',
  valeur numeric not null,
  limite_utilisations integer,
  utilisations integer not null default 0,
  date_expiration date,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.livraisons enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.codes_promo enable row level security;

drop policy if exists "profiles read authenticated" on public.profiles;
create policy "profiles read authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "livraisons read authenticated" on public.livraisons;
create policy "livraisons read authenticated" on public.livraisons
  for select to authenticated using (true);

drop policy if exists "livraisons expediteur insert" on public.livraisons;
create policy "livraisons expediteur insert" on public.livraisons
  for insert to authenticated with check (auth.uid() = expediteur_id);

drop policy if exists "livraisons owner update" on public.livraisons;
create policy "livraisons owner update" on public.livraisons
  for update to authenticated using (auth.uid() in (expediteur_id, livreur_id) or livreur_id is null);

drop policy if exists "transactions read authenticated" on public.transactions;
create policy "transactions read authenticated" on public.transactions
  for select to authenticated using (true);

drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read" on public.notifications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "codes promo read authenticated" on public.codes_promo;
create policy "codes promo read authenticated" on public.codes_promo
  for select to authenticated using (actif = true);
