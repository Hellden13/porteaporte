-- PorteaPorte - Missions, PorteCoins, Tirages mensuels
-- A executer dans Supabase SQL Editor.

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  objective_type text not null default 'custom',
  objective_target integer not null default 1 check (objective_target > 0),
  reward_coins integer not null default 0 check (reward_coins >= 0),
  deadline timestamptz,
  status text not null default 'active' check (status in ('active','completed','expired','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  status text not null default 'active' check (status in ('active','completed','expired')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, mission_id)
);

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

create table if not exists public.monthly_draws (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  draw_date date not null,
  status text not null default 'active' check (status in ('draft','active','closed','completed','cancelled')),
  rules_url text default '/reglements-tirage.html',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.draw_prizes (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.monthly_draws(id) on delete cascade,
  title text not null,
  description text,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.draw_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.monthly_draws(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entries integer not null default 1 check (entries > 0),
  cost_coins integer not null default 10 check (cost_coins >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.draw_winners (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.monthly_draws(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  prize_title text not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null,
  title text not null,
  description text,
  earned_at timestamptz not null default now(),
  unique(user_id, badge_key)
);

alter table public.missions enable row level security;
alter table public.user_missions enable row level security;
alter table public.porte_coins_transactions enable row level security;
alter table public.monthly_draws enable row level security;
alter table public.draw_prizes enable row level security;
alter table public.draw_entries enable row level security;
alter table public.draw_winners enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists missions_read_active on public.missions;
drop policy if exists missions_admin_all on public.missions;
create policy missions_read_active on public.missions for select using (status = 'active');
create policy missions_admin_all on public.missions
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists user_missions_own_read on public.user_missions;
drop policy if exists user_missions_admin_all on public.user_missions;
create policy user_missions_own_read on public.user_missions for select using (auth.uid() = user_id);
create policy user_missions_admin_all on public.user_missions
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists porte_coins_own_read on public.porte_coins_transactions;
drop policy if exists porte_coins_admin_all on public.porte_coins_transactions;
create policy porte_coins_own_read on public.porte_coins_transactions for select using (auth.uid() = user_id);
create policy porte_coins_admin_all on public.porte_coins_transactions
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists draws_public_read on public.monthly_draws;
drop policy if exists draws_admin_all on public.monthly_draws;
create policy draws_public_read on public.monthly_draws for select using (status in ('active','closed','completed'));
create policy draws_admin_all on public.monthly_draws
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists draw_prizes_public_read on public.draw_prizes;
drop policy if exists draw_prizes_admin_all on public.draw_prizes;
create policy draw_prizes_public_read on public.draw_prizes for select using (true);
create policy draw_prizes_admin_all on public.draw_prizes
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists draw_entries_own_read on public.draw_entries;
drop policy if exists draw_entries_admin_all on public.draw_entries;
create policy draw_entries_own_read on public.draw_entries for select using (auth.uid() = user_id);
create policy draw_entries_admin_all on public.draw_entries
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists draw_winners_public_read on public.draw_winners;
drop policy if exists draw_winners_admin_all on public.draw_winners;
create policy draw_winners_public_read on public.draw_winners for select using (published = true);
create policy draw_winners_admin_all on public.draw_winners
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists badges_own_read on public.user_badges;
drop policy if exists badges_admin_all on public.user_badges;
create policy badges_own_read on public.user_badges for select using (auth.uid() = user_id);
create policy badges_admin_all on public.user_badges
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

grant select on public.missions to authenticated;
grant select on public.user_missions to authenticated;
grant select on public.porte_coins_transactions to authenticated;
grant select on public.monthly_draws to authenticated;
grant select on public.draw_prizes to authenticated;
grant select on public.draw_entries to authenticated;
grant select on public.draw_winners to authenticated;
grant select on public.user_badges to authenticated;

insert into public.missions (title, description, objective_type, objective_target, reward_coins, deadline, status)
values
  ('5 livraisons cette semaine', 'Complete 5 livraisons cette semaine pour recevoir un bonus de regularite.', 'deliveries_week', 5, 50, date_trunc('week', now()) + interval '7 days', 'active'),
  ('Zero retard pendant 30 jours', 'Maintiens un dossier sans retard pendant 30 jours.', 'no_late_30d', 30, 100, now() + interval '30 days', 'active'),
  ('Aider un aine', 'Complete une livraison solidaire approuvee pour une personne ainee.', 'community_senior', 1, 50, now() + interval '60 days', 'active'),
  ('Livraison verte', 'Complete une livraison a pied, a velo ou en vehicule electrique.', 'green_delivery', 1, 20, now() + interval '30 days', 'active')
on conflict do nothing;

insert into public.monthly_draws (title, description, draw_date, status, rules_url)
values ('Tirage mensuel PorteaPorte', 'Cartes essence, epicerie et bonus livraison pour remercier les utilisateurs actifs.', (date_trunc('month', now()) + interval '1 month - 1 day')::date, 'active', '/reglements-tirage.html')
on conflict do nothing;
