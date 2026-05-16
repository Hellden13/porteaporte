-- ============================================================
-- MIGRATION : Colonnes manquantes pour la vérification livreur
-- À exécuter dans : Supabase > SQL Editor
-- ============================================================

alter table public.profiles
  add column if not exists vehicule        text,
  add column if not exists trajet_principal text,
  add column if not exists province        text default 'QC',
  add column if not exists transport_mode  text,
  add column if not exists mode_livraison  text;

-- Contrainte sur le mode de transport (optionnelle)
alter table public.profiles
  drop constraint if exists profiles_transport_mode_check;

alter table public.profiles
  add constraint profiles_transport_mode_check
  check (transport_mode in ('walking','bike','car','van') or transport_mode is null) not valid;

-- Index pour les recherches par vehicule
create index if not exists idx_profiles_vehicule on public.profiles(vehicule);

-- Vérification : affiche les colonnes ajoutées
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('vehicule','trajet_principal','province','transport_mode','mode_livraison')
order by column_name;
