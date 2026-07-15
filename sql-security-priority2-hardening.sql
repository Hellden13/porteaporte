-- PorteaPorte - Priorite 2: durcissement RLS donnees personnelles / argent
-- A executer manuellement dans Supabase SQL Editor.
-- Objectif: bloquer les lectures larges depuis la cle anon/authenticated et garder
-- les donnees sensibles accessibles uniquement au proprietaire, aux parties du trajet
-- ou a un admin non suspendu. Les APIs serveur avec service role continuent de fonctionner.

create or replace function public.pap_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.suspendu, false) = false
  );
$$;

create or replace function public.pap_prevent_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.pap_is_admin() and new.id = auth.uid() then
    if tg_op = 'UPDATE' then
      new.role := old.role;
      new.suspendu := old.suspendu;
      new.driver_status := old.driver_status;
      new.verification_status := old.verification_status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_self_escalation on public.profiles;
create trigger profiles_prevent_self_escalation
before update on public.profiles
for each row
execute function public.pap_prevent_profile_self_escalation();

-- profiles: retire les anciennes policies "read authenticated/public" si elles existent.
alter table if exists public.profiles enable row level security;
drop policy if exists "Profiles readable by all" on public.profiles;
drop policy if exists "profiles read authenticated" on public.profiles;
drop policy if exists profiles_select_public on public.profiles;
drop policy if exists "profiles_select_livreurs_public_authenticated" on public.profiles;
drop policy if exists "profiles_select_self_admin" on public.profiles;
drop policy if exists profiles_select_owner_admin on public.profiles;
create policy profiles_select_owner_admin on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.pap_is_admin());

drop policy if exists "profiles_update_own_limited_or_admin" on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update
  to authenticated
  using (public.pap_is_admin())
  with check (public.pap_is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles own insert" on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- ride_bookings: passager, chauffeur du trajet, admin seulement.
alter table if exists public.ride_bookings enable row level security;
drop policy if exists "bookings_passenger_read" on public.ride_bookings;
drop policy if exists "bookings_driver_read" on public.ride_bookings;
drop policy if exists "bookings_passenger_insert" on public.ride_bookings;
drop policy if exists "bookings_update_parties" on public.ride_bookings;
drop policy if exists "bookings_admin_all" on public.ride_bookings;

create policy bookings_parties_read on public.ride_bookings
  for select
  to authenticated
  using (
    passenger_id = auth.uid()
    or exists (select 1 from public.rides r where r.id = ride_id and r.driver_id = auth.uid())
    or public.pap_is_admin()
  );

create policy bookings_passenger_insert on public.ride_bookings
  for insert
  to authenticated
  with check (passenger_id = auth.uid());

create policy bookings_parties_update on public.ride_bookings
  for update
  to authenticated
  using (
    passenger_id = auth.uid()
    or exists (select 1 from public.rides r where r.id = ride_id and r.driver_id = auth.uid())
    or public.pap_is_admin()
  )
  with check (
    passenger_id = auth.uid()
    or exists (select 1 from public.rides r where r.id = ride_id and r.driver_id = auth.uid())
    or public.pap_is_admin()
  );

-- emergency_contacts: proprietaire ou admin seulement.
alter table if exists public.emergency_contacts enable row level security;
drop policy if exists "ec_own_all" on public.emergency_contacts;
drop policy if exists "ec_admin_all" on public.emergency_contacts;
create policy ec_own_all on public.emergency_contacts
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy ec_admin_all on public.emergency_contacts
  for all
  to authenticated
  using (public.pap_is_admin())
  with check (public.pap_is_admin());

-- ride_gps_trail: aucune lecture utilisateur directe, seulement admin.
alter table if exists public.ride_gps_trail enable row level security;
drop policy if exists "gps_trail_admin_all" on public.ride_gps_trail;
create policy gps_trail_admin_all on public.ride_gps_trail
  for all
  to authenticated
  using (public.pap_is_admin())
  with check (public.pap_is_admin());

-- stripe_connect_accounts: proprietaire peut lire, ecriture seulement admin/API service role.
alter table if exists public.stripe_connect_accounts enable row level security;
drop policy if exists "sca_own_read" on public.stripe_connect_accounts;
drop policy if exists "sca_admin_all" on public.stripe_connect_accounts;
create policy sca_own_read on public.stripe_connect_accounts
  for select
  to authenticated
  using (user_id = auth.uid() or public.pap_is_admin());
create policy sca_admin_all on public.stripe_connect_accounts
  for all
  to authenticated
  using (public.pap_is_admin())
  with check (public.pap_is_admin());
