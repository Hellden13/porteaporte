# Protocole test live E2E - Livraison PorteaPorte

Objectif: valider le parcours complet avec de vrais comptes et un petit montant.

Parcours teste:

`expediteur cree livraison -> paiement Stripe escrow -> livreur verifie accepte -> livraison -> destinataire confirme -> capture Stripe -> transaction Supabase`

## Comptes requis

- 1 compte expediteur avec email confirme.
- 1 compte livreur avec email confirme et `driver_status = verified`.
- 1 destinataire test avec acces au courriel ou au code.
- 1 compte admin.

## Avant de commencer

Verifier:

- Vercel production actif.
- Stripe webhook configure.
- SendGrid fonctionnel.
- Supabase accessible.
- Dashboard admin ouvert.
- Montant faible recommande: 5 $ a 10 $.
- Colis simple: lettre ou petit objet sans valeur importante.

Ne pas tester avec objet fragile, grosse valeur ou livraison longue distance.

## Etape 1 - Expediteur cree une livraison

Page:

- `https://porteaporte.site/create-mission.html`

Action:

- remplir une livraison simple;
- entrer ville depart et arrivee dans la zone beta;
- entrer nom/courriel destinataire si possible;
- choisir protection selon le test;
- cliquer `Creer la livraison`.

Resultat attendu:

- livraison creee;
- code destinataire affiche proprement;
- redirection vers `paiement.html`;
- les infos ne doivent pas etre a remplir une deuxieme fois;
- le montant doit rester coherent.

Verifier dans admin/Supabase:

- table `livraisons`;
- statut initial attendu: creation / en attente paiement / paiement selon le cas;
- `expediteur_id` present;
- `recipient_confirmation_hash` ou mecanisme de code present si disponible;
- `email_destinataire` present si fourni.

## Etape 2 - Paiement Stripe escrow

Page:

- `https://porteaporte.site/paiement.html?livraison_id=...`

Action:

- payer avec Stripe;
- attendre confirmation;
- ne pas recharger dix fois si le paiement bloque.

Resultat attendu:

- PaymentIntent cree;
- capture manuelle active;
- statut Stripe attendu: `requires_capture`;
- livraison visible aux livreurs seulement apres autorisation paiement;
- transaction Supabase creee ou reconstructible.

Verifier dans Stripe:

- PaymentIntent existe;
- montant exact;
- currency `cad`;
- metadata `livraison_id`;
- status `requires_capture`.

Verifier dans Supabase:

- `livraisons.stripe_payment_intent` ou `payment_intent_id`;
- `transactions` avec `livraison_id`;
- statut transaction: `requires_capture` ou equivalent.

## Etape 3 - Livreur verifie accepte

Page:

- `https://porteaporte.site/dashboard-livreur.html`

Action:

- se connecter avec le compte livreur verifie;
- verifier que la mission apparait;
- accepter la livraison.

Resultat attendu:

- livreur non verifie bloque;
- livreur verifie voit seulement les missions logiques;
- apres acceptation, `livreur_id` est assigne;
- details complets visibles seulement au livreur assigne.

Verifier dans admin/Supabase:

- `livraisons.livreur_id` = ID du livreur;
- statut attendu: accepte / assigne / en cours selon le workflow;
- aucune mission dupliquee.

## Etape 4 - Livraison et preuve

Page:

- dashboard livreur;
- page GPS ou preuve si utilisee.

Action:

- livreur effectue la livraison;
- si humain present: remettre le colis;
- si boite aux lettres/aucun humain: deposer preuve GPS/photo/note si disponible;
- marquer la livraison comme livree.

Resultat attendu:

- statut livraison devient `livre` / `livree`;
- preuve stockee si depot sans humain;
- paiement non capture avant confirmation destinataire ou validation admin.

Verifier dans admin/Supabase:

- statut `livre`;
- `delivery_proofs` si preuve deposee;
- `livre_le` ou date equivalente;
- bouton admin de validation visible seulement si logique.

## Etape 5 - Destinataire confirme

Page:

- `https://porteaporte.site/confirmation-destinataire.html?livraison_id=...`

Action:

- entrer le code destinataire;
- confirmer reception.

Tests de securite:

- mauvais code: doit etre refuse;
- livraison non livree: doit etre refusee;
- bon code + livraison livree: doit confirmer.

Resultat attendu:

- `recipient_confirmed_at` rempli;
- `recipient_confirmation_method = recipient_code`;
- appel capture autorise.

## Etape 6 - Capture Stripe et transaction Supabase

Action:

- apres confirmation destinataire, verifier si la capture s'est faite;
- sinon admin peut valider seulement avec preuve claire et raison.

Resultat attendu:

- Stripe PaymentIntent passe a `succeeded`;
- transaction Supabase passe a `succeeded`;
- audit event cree;
- livraison passe a `payee` / `paid` / statut final equivalent;
- gain livreur cree dans `livreur_earnings` si livreur assigne.

Verifier dans Supabase:

- `transactions.statut = succeeded`;
- `transaction_audit_events.event_type = payment_captured_after_delivery_confirmation`;
- `livreur_earnings` cree si applicable;
- livraison finale visible dans admin.

## Si quelque chose bloque

Noter exactement:

- compte utilise;
- page;
- bouton clique;
- message d'erreur;
- livraison_id;
- payment_intent_id;
- heure;
- statut livraison;
- statut transaction;
- capture d'ecran.

Ne jamais continuer a cliquer plusieurs fois sur paiement/capture avant d'avoir compris le premier blocage.

## Decision apres le test

Test reussi si:

- livraison creee;
- paiement autorise en escrow;
- livreur verifie accepte;
- livraison marquee livree;
- destinataire confirme;
- Stripe capture seulement apres condition valide;
- transaction et audit Supabase existent.

Test echoue si:

- paiement capture trop tot;
- non-verifie voit la mission;
- livraison disparait du dashboard;
- destinataire ne peut pas confirmer;
- admin ne voit pas la livraison;
- transaction absente apres capture.
