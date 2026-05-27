# Gel des fonctionnalites - Beta PorteaPorte

Objectif: empecher la plateforme de grossir pendant que de vrais utilisateurs testent les bases.

## Decision

Les nouvelles grosses fonctionnalites sont gelees jusqu'a la fin des tests live beta.

## Ce qui est permis

- corriger un bouton mort;
- corriger une redirection;
- corriger une erreur console;
- corriger un texte confus ou risqué;
- corriger un probleme mobile;
- corriger un probleme de securite;
- ameliorer un message d'erreur;
- ajouter un etat vide propre;
- rendre une action existante plus claire;
- corriger un paiement, email, dashboard ou statut.

## Ce qui est interdit pendant le gel

- ajouter un nouveau module complet;
- ajouter un nouveau systeme de recompense;
- changer le workflow principal sans test;
- remplacer un dashboard complet;
- modifier les policies RLS sans migration claire;
- changer la logique Stripe sans test de non-regression;
- ajouter une promesse marketing non verifiee;
- ajouter des donnees fake qui peuvent tromper les utilisateurs.

## Regle de validation avant chaque correction

Avant de modifier:

1. quel probleme reel est corrige?
2. quel utilisateur est protege?
3. quel risque est reduit?
4. comment tester rapidement?
5. est-ce reversible?

Si la reponse n'est pas claire, attendre.

## Exceptions permises

Une exception est permise seulement si:

- un utilisateur est bloque;
- un paiement est a risque;
- une donnee sensible est exposee;
- l'admin ne peut pas intervenir;
- une page importante affiche une erreur visible.

## Definition de stable pour la beta

La beta est stable si:

- les pages principales chargent;
- aucun bouton critique ne mene a une 404;
- les roles sont respectes;
- les paiements restent proteges;
- les emails critiques partent;
- l'admin peut suivre et intervenir;
- un testeur comprend quoi faire sans explication orale.
