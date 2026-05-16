-- PorteaPorte - Audit transactions + tirages admin avances
-- A executer dans Supabase SQL Editor.

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
create index if not exists transaction_audit_retention_idx on public.transaction_audit_events(retention_until);
create index if not exists transaction_audit_pi_idx on public.transaction_audit_events(stripe_payment_intent);

alter table public.transaction_audit_events enable row level security;

drop policy if exists transaction_audit_admin_all on public.transaction_audit_events;
create policy transaction_audit_admin_all on public.transaction_audit_events
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists transaction_audit_user_own_read on public.transaction_audit_events;
create policy transaction_audit_user_own_read on public.transaction_audit_events
  for select using (auth.uid() = user_id);

grant select on public.transaction_audit_events to authenticated;

alter table public.transactions
  add column if not exists retention_until timestamptz default (now() + interval '7 years'),
  add column if not exists audit_locked boolean not null default true;

alter table public.monthly_draws
  add column if not exists auto_include_all_users boolean not null default true,
  add column if not exists winner_selected_at timestamptz,
  add column if not exists winner_count integer not null default 1,
  add column if not exists admin_note text;

alter table public.draw_winners
  add column if not exists entries_weight integer not null default 1,
  add column if not exists user_email text,
  add column if not exists user_role text,
  add column if not exists selected_by uuid references auth.users(id) on delete set null;

drop policy if exists draws_public_read on public.monthly_draws;
create policy draws_public_read on public.monthly_draws
  for select using (status in ('active','closed','completed'));

-- Statuts utilises:
-- draft     = prepare par admin, invisible aux utilisateurs
-- active    = ouvert aux participations
-- closed    = ferme aux participations, pret au tirage
-- completed = gagnant choisi
-- cancelled = pas de tirage ce mois-ci
