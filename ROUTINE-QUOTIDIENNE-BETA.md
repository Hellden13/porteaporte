# Routine quotidienne beta

Objectif: savoir chaque jour si PorteaPorte est assez stable pour continuer les tests.

Frequence: matin, midi si test actif, soir.

## 1. Vercel

Verifier:

- dernier deploy production reussi;
- erreurs Functions;
- endpoints `/api/platform`, `/api/paiement-livraison`, `/api/capture-livraison`, `/api/stripe-webhook`;
- pics de 4xx/5xx;
- pages importantes qui repondent 200.

Pages minimales:

- `/`
- `/login.html`
- `/create-mission.html`
- `/paiement.html`
- `/dashboard-expediteur.html`
- `/dashboard-livreur.html`
- `/confirmation-destinataire.html`
- `/admin/login.html`

## 2. Supabase

Verifier:

- nouvelles inscriptions;
- emails confirmes;
- profiles sans role;
- livreurs `pending_review`;
- livreurs `verified`;
- livraisons creees aujourd'hui;
- livraisons sans statut coherent;
- transactions creees;
- litiges ouverts;
- erreurs dans logs API/Auth;
- Security Advisor si changements SQL.

Signaux rouges:

- livraison payee absente du dashboard;
- transaction sans livraison;
- profil sans role;
- livreur non verifie avec acces colis;
- policy RLS trop permissive.

## 3. Stripe

Verifier:

- PaymentIntents crees;
- PaymentIntents en `requires_capture`;
- captures effectuees;
- refunds;
- disputes;
- webhook failures;
- mode test/live coherent.

Signaux rouges:

- capture avant confirmation;
- PaymentIntent sans livraison;
- paiement echoue sans message utilisateur clair;
- webhook non livre;
- argent bloque sans statut admin clair.

## 4. SendGrid / emails

Verifier:

- email confirmation compte;
- email code destinataire;
- email preuve depot;
- email admin si probleme;
- bounces;
- spam reports;
- domaine expediteur valide.

Signaux rouges:

- codes destinataires non recus;
- emails en pourriel massivement;
- FROM_EMAIL non valide;
- SendGrid bloque ou quota atteint.

## 5. Journal quotidien

Chaque jour, noter:

- nombre de testeurs actifs;
- nombre de livraisons creees;
- nombre de livraisons payees;
- nombre de livraisons acceptees;
- nombre de livraisons confirmees;
- bugs critiques;
- bugs corriges;
- paiements a surveiller;
- utilisateurs a contacter;
- decision: continuer, ralentir ou pause.

## 6. Decision de fin de jour

Continuer demain si:

- aucun bug critique ouvert;
- aucune fuite de donnees;
- aucun paiement incoherent;
- admin capable de suivre;
- testeurs comprennent quoi faire.

Pause beta si:

- paiement perdu ou capture incorrecte;
- livreur non verifie voit colis reels;
- admin ne voit pas les livraisons;
- emails critiques ne partent plus;
- plusieurs utilisateurs restent bloques au meme endroit.
