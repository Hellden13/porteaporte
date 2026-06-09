-- PorteaPorte - Capacites cumulables utilisateur
-- Migration idempotente. A executer manuellement dans Supabase.
-- Le champ profiles.role est conserve pour compatibilite descendante.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS est_livreur boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS est_expediteur boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS est_passager boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS est_conducteur boolean NOT NULL DEFAULT false;

UPDATE profiles
SET
  est_livreur = true
WHERE lower(coalesce(role, '')) IN ('livreur', 'les deux', 'both');

UPDATE profiles
SET
  est_expediteur = true
WHERE lower(coalesce(role, '')) IN ('expediteur', 'expéditeur', 'les deux', 'both');

COMMENT ON COLUMN profiles.est_livreur IS 'Capacite livraison: peut livrer des colis.';
COMMENT ON COLUMN profiles.est_expediteur IS 'Capacite livraison: peut envoyer des colis.';
COMMENT ON COLUMN profiles.est_passager IS 'Capacite covoiturage: peut chercher/reserver des trajets.';
COMMENT ON COLUMN profiles.est_conducteur IS 'Capacite covoiturage: peut publier/offrir des trajets.';

-- RLS: aucune nouvelle table. Les colonnes restent protegees par les politiques
-- existantes de profiles; les mises a jour applicatives passent par api/platform.js
-- avec service_role et session utilisateur verifiee.
