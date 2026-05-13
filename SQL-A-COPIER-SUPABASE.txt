-- PorteAPorte security hardening: drivers must be verified before seeing real deliveries.
-- Run in Supabase SQL Editor for project miqrircrfpzkmvvacgwt.

begin;

alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists driver_status text not null default 'not_started',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles add constraint profiles_verification_status_check
  check (verification_status in ('pending','verified','rejected','suspended')) not valid;

alter table public.profiles drop constraint if exists profiles_driver_status_check;
alter table public.profiles add constraint profiles_driver_status_check
  check (driver_status in ('not_started','pending_review','verified','rejected','suspended')) not valid;

create table if not exists public.driver_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('not_started','pending_review','verified','rejected','suspended')),
  full_name text not null default '',
  birth_date date,
  phone text not null default '',
  city text not null default '',
  id_document_url text,
  selfie_url text,
  consent_accepted boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.driver_verifications enable row level security;

create index if not exists idx_driver_verifications_user_created on public.driver_verifications(user_id, created_at desc);
create index if not exists idx_profiles_driver_security on public.profiles(role, driver_status, suspendu, email_verified);
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


drop policy if exists livraisons_select_publiees on public.livraisons;
drop policy if exists "livraisons_select_visible" on public.livraisons;
drop policy if exists "livraisons read authenticated" on public.livraisons;
drop policy if exists "livraisons_update_participants" on public.livraisons;
drop policy if exists "livraisons owner update" on public.livraisons;
drop policy if exists "Profiles readable by all" on public.profiles;
drop policy if exists profiles_select_public on public.profiles;


drop policy if exists livraisons_select_participants_admin on public.livraisons;
create policy livraisons_select_participants_admin on public.livraisons
for select to authenticated
using (
  public.is_admin()
  or expediteur_id = auth.uid()
  or livreur_id = auth.uid()
);

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

drop policy if exists profiles_select_owner_admin on public.profiles;
create policy profiles_select_owner_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid() and suspendu = false)
with check (
  id = auth.uid()
  and suspendu = false
  and coalesce(role, '') <> 'admin'
);

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
      and p.email_verified = true
      and p.suspendu = false
      and p.role in ('livreur','les deux','admin')
      and (p.driver_status = 'verified' or p.role = 'admin')
  );
$$;

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
grant execute on function public.livraisons_disponibles_masquees() to authenticated;
revoke execute on function public.is_verified_driver(uuid) from public, anon;
grant execute on function public.is_verified_driver(uuid) to authenticated, service_role;

commit;





