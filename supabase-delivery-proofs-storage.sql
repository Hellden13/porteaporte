-- PorteaPorte - Supabase Storage pour les preuves photo de livraison
-- A executer dans Supabase SQL Editor.
-- Objectif: stocker les nouvelles photos de preuve dans un bucket prive au lieu de les garder en base64 dans la table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs',
  'delivery-proofs',
  false,
  1000000,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 1000000,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

alter table public.delivery_proofs
  add column if not exists photo_storage_bucket text,
  add column if not exists photo_storage_path text,
  add column if not exists photo_mime_type text,
  add column if not exists photo_size_bytes integer;

create index if not exists idx_delivery_proofs_storage_path
  on public.delivery_proofs (photo_storage_path)
  where photo_storage_path is not null;

-- Verification rapide apres execution:
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'delivery-proofs';