-- Migration : table pour les abonnements push WebPush
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz default now()
);

-- Index pour retrouver rapidement les abonnements d'un user
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- RLS : chaque user ne voit que ses propres abonnements
alter table public.push_subscriptions enable row level security;

create policy "Lecture propre" on public.push_subscriptions
  for select using (auth.uid() = user_id);

create policy "Insertion propre" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "Suppression propre" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Le service role (API) peut tout faire (pour l'envoi des notifs depuis le backend)
create policy "Service role full access" on public.push_subscriptions
  for all using (auth.role() = 'service_role');
