# Plan beta 50 personnes - Quebec / Levis

Objectif: accueillir 50 vrais testeurs sans ouvrir la plateforme trop large.

Statut recommande: beta fermee controlee.

## Regle principale

Pendant la beta, chaque correction doit augmenter au moins une de ces choses:

- confiance;
- simplicite;
- securite;
- protection utilisateur;
- clarte du parcours.

Aucune nouvelle grosse fonctionnalite avant la fin des tests live.

## Objectif des 50 testeurs

Recruter un petit groupe local, humain et observable:

- 20 expediteurs;
- 20 livreurs;
- 5 personnes qui testent les deux roles;
- 5 destinataires seulement, pour confirmer reception et signaler la clarte du parcours.

## Zones de test

Zones recommandees pour commencer:

- Quebec;
- Levis;
- Sainte-Foy;
- Charlesbourg;
- Beauport;
- Limoilou;
- Charny / Saint-Romuald;
- trajets courts entre Quebec et Levis seulement si le mode de transport est logique.

Limiter les tests au depart evite les livraisons trop loin, les livreurs mal assignes et les attentes impossibles.

## Ce qui est autorise pendant la beta

- petites livraisons;
- lettres;
- petits colis;
- objets non fragiles;
- trajets locaux;
- paiements de faible montant;
- tests GPS;
- confirmation destinataire;
- depot preuve si boite aux lettres ou lieu sans humain.

## Ce qui doit rester bloque

- gros objets;
- objets de valeur elevee;
- alcool, tabac, produits dangereux;
- argent comptant, bijoux, cartes-cadeaux;
- livraisons longues distances non controlees;
- livreur non verifie qui voit de vrais colis;
- paiement libere sans confirmation, preuve ou decision admin justifiee.

## Deroulement recommande

### Jour 1 - Preparation

- verifier Vercel, Supabase, Stripe et SendGrid;
- tester un compte expediteur;
- tester un compte livreur verifie;
- tester une livraison a faible montant;
- noter tous les blocages avant invitation publique.

### Jour 2 - Petit groupe interne

- 3 a 5 personnes;
- tester inscription, connexion, creation livraison, paiement, acceptation, confirmation;
- corriger seulement les bugs bloquants.

### Jour 3 - Beta 10 personnes

- inviter 5 expediteurs et 5 livreurs;
- limiter les livraisons a Quebec / Levis;
- garder admin ouvert pendant les tests.

### Jour 4 a 7 - Beta 50 personnes

- inviter progressivement;
- ne pas tout ouvrir d'un coup;
- noter les bugs dans un tableau simple;
- classer: critique, important, mineur;
- corriger chaque jour en petits lots.

## Go / no-go quotidien

Go si:

- les paiements Stripe fonctionnent;
- les emails importants partent;
- le dashboard admin voit les livraisons;
- les livreurs non verifies restent bloques;
- les expediteurs voient leurs livraisons;
- le destinataire peut confirmer ou une preuve peut etre deposee.

No-go si:

- un paiement est capture trop tot;
- une livraison disparait des dashboards;
- un non-verifie voit des donnees sensibles;
- un admin ne peut pas voir/intervenir;
- les emails critiques ne partent pas;
- les routes de confirmation sont cassees.

## Indicateurs a suivre

- nombre d'inscriptions;
- nombre d'emails confirmes;
- nombre de livreurs en verification;
- nombre de livreurs verifies;
- nombre de livraisons creees;
- nombre de paiements autorises;
- nombre de livraisons acceptees;
- nombre de livraisons terminees;
- nombre de captures Stripe;
- nombre de remboursements;
- nombre de litiges;
- erreurs Vercel;
- erreurs Supabase;
- emails SendGrid bloques ou en spam.

## Documents lies

- `GEL-FONCTIONNALITES-BETA.md`
- `PARCOURS-TESTS-BETA.md`
- `PROMESSES-LEGALES-A-VERIFIER.md`
- `ROUTINE-QUOTIDIENNE-BETA.md`
- `GUIDE-TESTEURS-BETA.md`
