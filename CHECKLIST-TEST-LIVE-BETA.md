# Checklist test live beta PorteaPorte

Pack beta complet:

- `BETA-50-QUEBEC-LEVIS.md`
- `GEL-FONCTIONNALITES-BETA.md`
- `PARCOURS-TESTS-BETA.md`
- `PROMESSES-LEGALES-A-VERIFIER.md`
- `ROUTINE-QUOTIDIENNE-BETA.md`
- `GUIDE-TESTEURS-BETA.md`

Objectif: valider le cycle complet avec de vrais comptes, sans ouvrir la plateforme largement.

## 1. Avant le test

- Executer `supabase-stabilisation-priorite-1.sql` dans Supabase SQL Editor.
- Verifier que le resultat retourne les compteurs `badges_count`, `monthly_draws_count`, `draw_winners_count`, `organismes_count`, `impact_orgs_count`.
- Utiliser deux comptes differents:
  - un expediteur avec email confirme;
  - un livreur avec email confirme et `driver_status = verified`.
- Garder le dashboard admin ouvert pendant tout le test.

## 2. Cycle livraison

- Expediteur cree une livraison simple.
- Expediteur paie avec Stripe.
- Verifier dans admin: statut attendu `paiement_autorise` ou equivalent escrow.
- Livreur verifie voit la mission.
- Livreur accepte la mission.
- Verifier dans admin: livreur assigne.
- Livreur active GPS ou depose une preuve si livraison sans humain.
- Livreur marque la livraison comme livree.
- Verifier dans admin: statut `livre` / preuve recue / paiement a capturer.
- Destinataire confirme avec le code recu.
- Stripe capture le paiement.
- Verifier dans admin: statut final paye/capture.
- Verifier Supabase: transaction + audit evenement cree.

## 3. Tests de securite minimum

- Compte livreur non verifie: ne doit pas voir les colis reels.
- Visiteur non connecte: ne doit pas acceder aux dashboards sensibles.
- Expediteur: ne doit voir que ses livraisons.
- Livreur: ne doit voir les details complets qu'apres assignation.
- Capture Stripe: impossible sans code destinataire ou override admin justifie.

## 4. En cas de blocage

Noter exactement:

- page;
- bouton clique;
- message d'erreur;
- statut livraison dans admin;
- email du compte teste;
- heure approximative;
- capture d'ecran si possible.

Ne pas retester dix fois le meme paiement. Corriger d'abord le premier blocage observe.
