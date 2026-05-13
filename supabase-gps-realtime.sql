-- PorteaPorte - GPS live + Supabase Realtime
-- A executer apres supabase-production-schema.sql.

begin;

create extension if not exists "pgcrypto";

create table if not exists public.delivery_locations (
  id uuid primary key default gen_random_uuid(),
  livraison_id uuid not null references public.livraisons(id) on delete cascade,
  livreur_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  altitude double precision,
  accuracy double precision,
  speed double precision,
  heading double precision,
  source text not null default 'browser',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint delivery_locations_lat_check check (latitude between -90 and 90),
  constraint delivery_locations_lng_check check (longitude between -180 and 180),
  constraint delivery_locations_accuracy_check check (accuracy is null or accuracy >= 0),
  constraint delivery_locations_speed_check check (speed is null or speed >= 0)
);

create index if not exists delivery_locations_livraison_time_idx
  on public.delivery_locations(livraison_id, recorded_at desc);

create index if not exists delivery_locations_livreur_time_idx
  on public.delivery_locations(livreur_id, recorded_at desc);

-- Compatibilite avec la nomenclature backend demandee.
-- Le produit utilise delivery_locations comme table canonique; gps_positions expose les memes donnees.
create or replace view public.gps_positions as
select
  id,
  livraison_id,
  livreur_id,
  latitude,
  longitude,
  altitude,
  accuracy,
  speed,
  heading,
  source,
  recorded_at,
  created_at
from public.delivery_locations;

alter table public.delivery_locations enable row level security;

drop policy if exists "delivery_locations_select_participants_admin" on public.delivery_locations;
create policy "delivery_locations_select_participants_admin" on public.delivery_locations
for select to authenticated
using (
  public.is_admin(auth.uid())
  or livreur_id = auth.uid()
  or exists (
    select 1
    from public.livraisons l
    where l.id = delivery_locations.livraison_id
      and (l.expediteur_id = auth.uid() or l.livreur_id = auth.uid())
  )
);

drop policy if exists "delivery_locations_insert_current_livreur" on public.delivery_locations;
create policy "delivery_locations_insert_current_livreur" on public.delivery_locations
for insert to authenticated
with check (
  livreur_id = auth.uid()
  and exists (
    select 1
    from public.livraisons l
    where l.id = livraison_id
      and l.livreur_id = auth.uid()
      and l.statut in ('en_route', 'ramasse', 'confirme')
  )
);

drop policy if exists "delivery_locations_update_current_livreur" on public.delivery_locations;
create policy "delivery_locations_update_current_livreur" on public.delivery_locations
for update to authenticated
using (livreur_id = auth.uid())
with check (livreur_id = auth.uid());

grant select, insert, update on public.delivery_locations to authenticated;
grant select on public.gps_positions to authenticated;

-- Active Realtime pour la table. Ignore l'erreur si deja ajoutee.
do $$
begin
  alter publication supabase_realtime add table public.delivery_locations;
exception
  when duplicate_object then null;
end $$;

commit;
