-- Migration : badges « conducteur vert » (récompense graduée électrique / hybride)
-- À exécuter dans Supabase → SQL Editor. Sans danger : ajoute 2 badges si absents.
-- Le prix payé par le passager ne change JAMAIS — c'est de la gamification pure.

INSERT INTO cov_badges (slug, name, icon, description, condition) VALUES
  ('conducteur_vert_or',     'Conducteur vert — Or',     '🌳', 'Trajet complété en véhicule 100% électrique', 'Compléter un trajet en électrique'),
  ('conducteur_vert_argent', 'Conducteur vert — Argent', '🌿', 'Trajet complété en véhicule hybride',         'Compléter un trajet en hybride')
ON CONFLICT (slug) DO NOTHING;
