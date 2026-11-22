-- Lot 1 admin : suppression logique des trajets de covoiturage.
-- À APPLIQUER PAR DENIS (éditeur SQL Supabase). Relançable sans risque (idempotente).
--  1. Nouveau statut « supprime » permis sur rides.status.
--  2. Colonnes supprime_le (date) et supprime_par (auteur) : les données restent pour l'audit.
--  3. Garde en base (déclencheur) : même si quelqu'un passe par l'API Supabase directement
--     (la règle RLS rides_driver_update permet au conducteur de modifier ses trajets),
--       - un trajet avec une réservation payée ou en cours ne peut pas passer à « supprime » ;
--       - un trajet supprimé ne peut pas être « ressuscité » par un client (seul le serveur peut) ;
--       - la date de suppression est toujours remplie.
-- Aucune ligne n'est supprimée ni modifiée par cette migration.

alter table public.rides add column if not exists supprime_le timestamptz;
alter table public.rides add column if not exists supprime_par uuid references public.profiles(id) on delete set null;

alter table public.rides drop constraint if exists rides_status_check;
alter table public.rides add constraint rides_status_check
  check (status = any (array['publie'::text, 'complet'::text, 'annule'::text, 'termine'::text, 'supprime'::text]));

create or replace function public.rides_garde_suppression() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'supprime' and old.status is distinct from 'supprime' then
    if exists (
      select 1 from public.ride_bookings b
       where b.ride_id = new.id
         and coalesce(b.status, '') not in ('annule_passager', 'annule_chauffeur', 'cancelled', 'refunded', 'rembourse')
    ) then
      raise exception 'Trajet avec une réservation payée ou en cours : annule-le plutôt' using errcode = 'P0001';
    end if;
    new.supprime_le := coalesce(new.supprime_le, now());
    if auth.uid() is not null then
      new.supprime_par := auth.uid();
    end if;
  elsif old.status = 'supprime' and new.status is distinct from 'supprime' and auth.uid() is not null then
    raise exception 'Un trajet supprimé ne peut pas être republié' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.rides_garde_suppression() from public, anon, authenticated;

drop trigger if exists rides_garde_suppression on public.rides;
create trigger rides_garde_suppression
  before update of status on public.rides
  for each row execute function public.rides_garde_suppression();

create index if not exists idx_rides_supprime_le on public.rides (supprime_le) where supprime_le is not null;
