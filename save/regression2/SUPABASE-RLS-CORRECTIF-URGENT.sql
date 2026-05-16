-- PorteAPorte - Correctif RLS production urgent
-- Objectif: appliquer les regles "securite avant fonctionnalites".
-- A executer dans Supabase SQL Editor avec le role owner.
-- Ce script est idempotent et ne supprime aucune donnee.

begin;

create extension if not exists "pgcrypto";

-- ============================================================
-- Fonctions securite
-- ============================================================

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role = 'admin'
      and coalesce(p.suspendu, false) = false
  );
$$;

create or replace function public.is_verified_driver(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and coalesce(p.email_verified, false) = true
      and coalesce(p.suspendu, false) = false
      and p.role in ('livreur', 'les deux', 'admin')
      and (p.driver_status = 'verified' or p.role = 'admin')
  );
$$;

revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.is_verified_driver(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_verified_driver(uuid) to authenticated, service_role;

-- Empeche un utilisateur de s'auto-promouvoir en admin/livreur verifie.
create or replace function public.prevent_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin(auth.uid()) then
    if tg_op = 'INSERT' then
      if new.role = 'admin' then new.role := 'expediteur'; end if;
      if new.driver_status = 'verified' then new.driver_status := 'not_started'; end if;
      if new.verification_status = 'verified' then new.verification_status := 'pending'; end if;
      new.suspendu := false;
      new.email_verified := coalesce(new.email_verified, false);
    elsif tg_op = 'UPDATE' and new.id = auth.uid() then
      new.role := old.role;
      new.driver_status := old.driver_status;
      new.verification_status := old.verification_status;
      new.suspendu := old.suspendu;
      new.email_verified := old.email_verified;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_self_escalation on public.profiles;
create trigger profiles_prevent_self_escalation
before insert or update on public.profiles
for each row execute function public.prevent_profile_self_escalation();

-- ============================================================
-- Colonnes minimales attendues
-- ============================================================

alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists driver_status text not null default 'not_started',
  add column if not exists suspendu boolean not null default false;

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles add constraint profiles_verification_status_check
  check (verification_status in ('pending','verified','rejected','suspended')) not valid;

alter table public.profiles drop constraint if exists profiles_driver_status_check;
alter table public.profiles add constraint profiles_driver_status_check
  check (driver_status in ('not_started','pending_review','verified','rejected','suspended')) not valid;

alter table public.livraisons
  add column if not exists expediteur_id uuid references public.profiles(id) on delete restrict,
  add column if not exists livreur_id uuid references public.profiles(id) on delete set null,
  add column if not exists ville_depart text,
  add column if not exists ville_arrivee text,
  add column if not exists type_colis text,
  add column if not exists poids_kg numeric(10,2),
  add column if not exists prix_total numeric(12,2),
  add column if not exists statut text not null default 'en_attente',
  add column if not exists cree_le timestamptz not null default now(),
  add column if not exists assurance_plan text,
  add column if not exists valeur_declaree numeric(12,2);

alter table public.delivery_locations
  add column if not exists livraison_id uuid references public.livraisons(id) on delete cascade,
  add column if not exists livreur_id uuid references public.profiles(id) on delete cascade,
  add column if not exists accuracy double precision,
  add column if not exists speed double precision,
  add column if not exists heading double precision,
  add column if not exists altitude double precision,
  add column if not exists source text not null default 'api',
  add column if not exists recorded_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

-- ============================================================
-- RLS obligatoire
-- ============================================================

alter table public.profiles enable row level security;
alter table public.livraisons enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.litiges enable row level security;
alter table public.driver_verifications enable row level security;
alter table public.delivery_locations enable row level security;
alter table public.codes_promo enable row level security;

-- ============================================================
-- Profiles: seulement soi-meme ou admin
-- ============================================================

drop policy if exists "Profiles readable by all" on public.profiles;
drop policy if exists profiles_select_public on public.profiles;
drop policy if exists "profiles_select_livreurs_public_authenticated" on public.profiles;
drop policy if exists "profiles_select_self_admin" on public.profiles;
drop policy if exists profiles_select_owner_admin on public.profiles;
create policy profiles_select_owner_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_limited_or_admin" on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid() and coalesce(suspendu, false) = false)
with check (id = auth.uid() and coalesce(suspendu, false) = false);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update on public.profiles to authenticated;

-- ============================================================
-- Livraisons: aucune lecture de vrais colis avant participation
-- Les offres masquees passent par public.livraisons_disponibles_masquees().
-- ============================================================

drop policy if exists livraisons_select_publiees on public.livraisons;
drop policy if exists "livraisons read authenticated" on public.livraisons;
drop policy if exists "livraisons_select_visible" on public.livraisons;
drop policy if exists livraisons_select_participants_admin on public.livraisons;
create policy livraisons_select_participants_admin on public.livraisons
for select to authenticated
using (
  public.is_admin()
  or expediteur_id = auth.uid()
  or livreur_id = auth.uid()
);

drop policy if exists "livraisons_insert_expediteur" on public.livraisons;
create policy livraisons_insert_expediteur on public.livraisons
for insert to authenticated
with check (
  public.is_admin()
  or expediteur_id = auth.uid()
);

drop policy if exists "livraisons_update_participants" on public.livraisons;
drop policy if exists "livraisons owner update" on public.livraisons;
drop policy if exists livraisons_update_participants_admin on public.livraisons;
create policy livraisons_update_participants_admin on public.livraisons
for update to authenticated
using (
  public.is_admin()
  or expediteur_id = auth.uid()
  or livreur_id = auth.uid()
)
with check (
  public.is_admin()
  or expediteur_id = auth.uid()
  or livreur_id = auth.uid()
);

-- Les operations d'ecriture livraisons doivent passer par les APIs Vercel service_role.
revoke insert, update, delete on public.livraisons from anon, authenticated;
grant select on public.livraisons to authenticated;

drop function if exists public.livraisons_disponibles_masquees();
create function public.livraisons_disponibles_masquees()
returns table (
  id uuid,
  code text,
  ville_depart text,
  ville_arrivee text,
  type_colis text,
  poids_kg numeric,
  prix_total numeric,
  statut text,
  cree_le timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.code,
    l.ville_depart,
    l.ville_arrivee,
    l.type_colis,
    l.poids_kg,
    l.prix_total,
    l.statut,
    l.cree_le
  from public.livraisons l
  where l.statut = 'paiement_autorise'
    and l.livreur_id is null
    and public.is_verified_driver(auth.uid());
$$;

revoke execute on function public.livraisons_disponibles_masquees() from public, anon;
grant execute on function public.livraisons_disponibles_masquees() to authenticated, service_role;

drop function if exists public.accepter_livraison(uuid);
create function public.accepter_livraison(p_livraison_id uuid)
returns public.livraisons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_livraison public.livraisons;
begin
  if not public.is_verified_driver(auth.uid()) then
    raise exception 'Livreur verifie requis';
  end if;

  update public.livraisons
  set livreur_id = auth.uid(),
      statut = 'confirme'
  where id = p_livraison_id
    and livreur_id is null
    and statut = 'paiement_autorise'
  returning * into v_livraison;

  if v_livraison.id is null then
    raise exception 'Livraison non disponible ou escrow absent';
  end if;

  return v_livraison;
end;
$$;

revoke execute on function public.accepter_livraison(uuid) from public, anon;
grant execute on function public.accepter_livraison(uuid) to authenticated, service_role;

-- ============================================================
-- GPS: participants seulement, vue security_invoker
-- ============================================================

drop policy if exists "delivery_locations_select_participants_admin" on public.delivery_locations;
create policy "delivery_locations_select_participants_admin" on public.delivery_locations
for select to authenticated
using (
  public.is_admin()
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
  and public.is_verified_driver(auth.uid())
  and exists (
    select 1
    from public.livraisons l
    where l.id = livraison_id
      and l.livreur_id = auth.uid()
      and l.statut in ('confirme','en_route','ramasse')
  )
);

grant select, insert on public.delivery_locations to authenticated;

drop view if exists public.gps_positions;
create view public.gps_positions
with (security_invoker = true)
as
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

grant select on public.gps_positions to authenticated;

-- ============================================================
-- Verifications livreur
-- ============================================================

drop policy if exists driver_verifications_owner_read on public.driver_verifications;
create policy driver_verifications_owner_read on public.driver_verifications
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists driver_verifications_owner_insert on public.driver_verifications;
create policy driver_verifications_owner_insert on public.driver_verifications
for insert to authenticated
with check (user_id = auth.uid() and consent_accepted = true);

drop policy if exists driver_verifications_owner_update_pending on public.driver_verifications;
create policy driver_verifications_owner_update_pending on public.driver_verifications
for update to authenticated
using ((user_id = auth.uid() and status in ('not_started','pending_review','rejected')) or public.is_admin())
with check ((user_id = auth.uid() and status in ('pending_review','rejected')) or public.is_admin());

grant select, insert, update on public.driver_verifications to authenticated;

-- ============================================================
-- Donnees sensibles/legacy
-- ============================================================

drop policy if exists "transactions_select_self_admin" on public.transactions;
create policy "transactions_select_self_admin" on public.transactions
for select to authenticated
using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.transactions from anon, authenticated;
grant select on public.transactions to authenticated;

revoke all on public.payment_transactions from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.wallet from anon, authenticated;

-- Tables legacy qui peuvent exposer des missions/livraisons non protegees.
revoke all on public.deliveries from anon, authenticated;
revoke all on public.missions from anon, authenticated;
revoke all on public.matches from anon, authenticated;
revoke all on public.offres from anon, authenticated;
revoke all on public.trips from anon, authenticated;

commit;
