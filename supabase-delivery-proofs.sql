-- PorteaPorte - depot avec preuve sans destinataire present
-- A executer dans Supabase SQL Editor.

alter table public.livraisons
  add column if not exists delivery_confirmation_mode text,
  add column if not exists delivery_proof_required_admin_review boolean default false;

create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  livraison_id uuid not null references public.livraisons(id) on delete cascade,
  livreur_id uuid not null references public.profiles(id) on delete cascade,
  proof_type text not null default 'dropoff_without_recipient',
  dropoff_type text,
  note text not null,
  photo_data_url text not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  status text not null default 'submitted',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.delivery_proofs enable row level security;

drop policy if exists delivery_proofs_participants_read on public.delivery_proofs;
drop policy if exists delivery_proofs_driver_insert on public.delivery_proofs;
drop policy if exists delivery_proofs_admin_update on public.delivery_proofs;

create policy delivery_proofs_participants_read
on public.delivery_proofs
for select
to authenticated
using (
  livreur_id = auth.uid()
  or exists (
    select 1
    from public.livraisons l
    where l.id = delivery_proofs.livraison_id
      and (l.expediteur_id = auth.uid() or l.livreur_id = auth.uid())
  )
  or public.is_admin(auth.uid())
);

create policy delivery_proofs_driver_insert
on public.delivery_proofs
for insert
to authenticated
with check (
  livreur_id = auth.uid()
  or public.is_admin(auth.uid())
);

create policy delivery_proofs_admin_update
on public.delivery_proofs
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update on public.delivery_proofs to authenticated;

create index if not exists idx_delivery_proofs_livraison
  on public.delivery_proofs (livraison_id, created_at desc);

create index if not exists idx_delivery_proofs_livreur
  on public.delivery_proofs (livreur_id, created_at desc);
