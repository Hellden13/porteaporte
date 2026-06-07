-- Migration : type d'énergie du véhicule (tarif/km juste selon électrique/hybride/essence/diesel)
-- À exécuter dans Supabase → SQL Editor. Sans danger : ajoute une colonne si absente.

alter table public.rides
  add column if not exists energy_type text not null default 'essence';

-- Les trajets existants restent en 'essence' par défaut (tarif inchangé pour eux).
