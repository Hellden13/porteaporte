-- PorteaPorte - confirmation destinataire avant capture Stripe
-- A executer dans Supabase SQL Editor.

alter table public.livraisons
  add column if not exists recipient_confirmation_hash text,
  add column if not exists recipient_confirmation_created_at timestamptz,
  add column if not exists recipient_confirmed_at timestamptz,
  add column if not exists recipient_confirmation_method text;

create index if not exists idx_livraisons_recipient_confirmation
  on public.livraisons (recipient_confirmation_hash)
  where recipient_confirmation_hash is not null;
