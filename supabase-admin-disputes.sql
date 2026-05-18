-- PorteaPorte - arbitrage admin litiges et preuves
-- A executer dans Supabase SQL Editor.

alter table public.livraisons
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz;

create index if not exists idx_livraisons_litige_review
  on public.livraisons (statut, delivery_proof_required_admin_review);
