# Audit backend PorteaPorte

Date: 2026-05-07

## Resume executif

Le backend existe, mais il est encore hybride: une partie fonctionne comme prototype Vercel, une partie est fake/demo, et les flux sensibles Stripe/Supabase ne sont pas encore assez securises pour production.

Le webhook Stripe existe deja: `api/stripe-webhook.js`.

Les risques majeurs sont:

- endpoints publics qui utilisent `SUPABASE_SERVICE_KEY` sans verifier l'utilisateur;
- endpoint de paiement livraison qui accepte le montant envoye par le client;
- escrow incomplet: PaymentIntent manuel cree, mais pas de flow capture/release/refund fiable;
- webhook Stripe qui accepte les evenements non signes si `STRIPE_WEBHOOK_SECRET` manque;
- mix CommonJS / ESM dans `api/`, risque de deploiement casse selon la config Vercel;
- tables anciennes `colis` / `livreurs` encore referencees alors que le schema cible utilise `livraisons` / `profiles`.

## Inventaire api/

| Fichier | Etat | Notes |
| --- | --- | --- |
| `api/paiement-livraison.js` | Partiel | Cree un PaymentIntent Stripe avec `capture_method=manual`, mais sans auth, sans verification du prix cote serveur, sans insertion Supabase. |
| `api/stripe.js` | Partiel / dangereux | Multi-actions Stripe. Cree PaymentIntent, achat coins, remboursement, statut. Manque auth admin/user. `confirmer_coins` est callable publiquement. |
| `api/stripe-webhook.js` | Present / incomplet | Verifie la signature seulement si secret present. Ne met pas Supabase a jour directement. Ne capture pas les paiements escrow. |
| `api/stripe-verify.js` | Fake en absence de cle | Retourne un paiement simule `succeeded` si `STRIPE_SECRET_KEY` manque. A retirer du chemin production. |
| `api/supabase-sync.js` | Dangereux | Utilise service key ou anon fallback. Actions coins/profils/transferts sans verification JWT/user. |
| `api/matching.js` | Demo/partiel | Prix calcule localement OK pour estimation. Matching utilise `livreurs` et `colis`, puis fallback demo avec faux livreurs. |
| `api/notifier.js` | Fonctionnel mais public | Envoie SendGrid, mais n'authentifie pas l'appelant. Peut etre abuse pour spam si expose. |
| `api/turnstile-verify.js` | Fonctionnel | Verification Cloudflare Turnstile basique. CORS strict site prod. |
| `api/admin-crud.js` | Mauvais emplacement | Script frontend dans `api/`, pas un endpoint backend fiable. Ne devrait pas etre deploye comme API. |
| `api/installer.js` | Outil dev dangereux | Script generateur qui peut ecraser `matching.js` et `supabase-sync.js`. Ne pas deployer comme endpoint. |
| `api/files.zip` | Inutile | Fichier zip vide/minimal dans `api/`. Ne doit pas etre une route API. |

## APIs fonctionnelles

- `turnstile-verify.js`: verification serveur Turnstile, si `TURNSTILE_SECRET` est configure.
- `notifier.js`: envoi SendGrid, si `SENDGRID_API_KEY` est configure. Fonctionnel techniquement, mais non securise.
- `paiement-livraison.js`: creation PaymentIntent manuel Stripe, si `STRIPE_SECRET_KEY` est configure. Fonctionnel techniquement, mais incomplet cote metier.
- `stripe.js` action `achat_coins`: creation PaymentIntent coins. Fonctionnelle techniquement.
- `stripe.js` action `statut`: verification Stripe par `payment_intent_id`. Fonctionnelle techniquement.

## APIs cassees ou fragiles

- `api/admin-crud.js`: reference `window`, DOM et Supabase frontend. Ce n'est pas une API serveur.
- `api/installer.js`: contient du code qui ecrit des fichiers; ne doit jamais etre expose comme endpoint.
- `api/matching.js`: reference `livreurs` et `colis`, tables non presentes dans le schema production cible.
- `api/supabase-sync.js`: tente d'ecrire `cree_le` / `mis_a_jour`; selon le schema, ces champs peuvent etre generes ou remplaces par `created_at` / `updated_at`.
- `api/stripe-webhook.js`: depend de `crypto.subtle`; selon runtime Node/Vercel, il faut verifier la disponibilite ou utiliser `node:crypto`.

## APIs fake/demo

- `api/stripe-verify.js`: simule `succeeded` quand `STRIPE_SECRET_KEY` manque.
- `api/matching.js`: retourne de faux livreurs si Supabase echoue ou manque.
- `api/stripe.js`: log "mode simulation", mais retourne ensuite une erreur si la cle manque. Le comportement est ambigu.
- `api/supabase-sync.js`: fallback `SUPABASE_ANON_KEY`, mauvais signal de securite pour des actions serveur.

## Stripe escrow

Etat actuel:

- `api/paiement-livraison.js` cree un PaymentIntent avec `capture_method=manual`.
- Aucun endpoint production clair ne capture le paiement au moment de la livraison complete.
- Aucun endpoint clair n'annule une autorisation avant expiration.
- Aucun mapping fiable `livraison_id <-> payment_intent_id` n'est persiste au moment de la creation.
- `api/stripe.js` cree des PaymentIntents standard sans `capture_method=manual` pour `create_payment_intent`.

Ce qui manque:

- `POST /api/payments/livraisons/create-intent`
- `POST /api/payments/livraisons/capture`
- `POST /api/payments/livraisons/cancel`
- `POST /api/payments/livraisons/refund`
- table/colonnes pour `payment_intent_id`, `payment_status`, `capture_status`, `authorized_at`, `captured_at`, `refunded_at`
- webhook qui synchronise les statuts Stripe vers Supabase

## PaymentIntent

Probleme critique:

`api/paiement-livraison.js` accepte `montant`, `prix`, `amount` ou `montant_cents` du client. En production, le client ne doit jamais decider du montant final.

Le serveur doit:

1. recevoir `livraison_id`;
2. charger la livraison depuis Supabase;
3. verifier que `expediteur_id = auth.uid()`;
4. recalculer ou lire le prix final valide;
5. creer le PaymentIntent avec metadata verrouillee;
6. sauvegarder `payment_intent_id` dans `livraisons` ou `payments`.

## Capture manuelle

Actuellement:

- creation manuelle partielle presente;
- capture absente;
- annulation absente;
- expiration d'autorisation non geree;
- litiges/disputes seulement logues/notifies.

Pour un escrow viable:

- capturer uniquement apres confirmation livraison;
- annuler si livraison annulee avant capture;
- rembourser depuis backend admin uniquement;
- utiliser webhooks comme source de verite Stripe;
- ne jamais liberer coins/paiement uniquement depuis une action frontend.

## Securite critique

### 1. Service key utilisee par endpoints non authentifies

`api/supabase-sync.js`, `api/matching.js`, `api/stripe.js` utilisent la service key pour modifier Supabase. Les requetes entrantes ne valident pas systematiquement le JWT Supabase.

Impact:

- un utilisateur peut modifier coins/profils si l'endpoint est public;
- possibilite de transfert coins frauduleux;
- possibilite de publier/assigner des colis au nom d'autres utilisateurs.

### 2. `confirmer_coins` public

`api/stripe.js` action `confirmer_coins` accepte un `payment_intent_id`, verifie Stripe, puis credite des coins. Cela doit etre reserve au webhook Stripe signe ou a un job interne.

### 3. Webhook non strict

Dans `api/stripe-webhook.js`, si `STRIPE_WEBHOOK_SECRET` est absent, la signature n'est pas exigee. En production, absence de secret doit retourner `500`, pas accepter l'event.

### 4. CORS trop large

`api/paiement-livraison.js`, `api/supabase-sync.js`, `api/matching.js` autorisent `*`. Pour endpoints avec service key ou Stripe, CORS doit etre restreint, mais surtout l'auth serveur doit etre obligatoire.

### 5. Remboursement public

`api/stripe.js` action `remboursement` peut creer un remboursement si l'appelant connait `payment_intent_id`. Doit etre admin uniquement.

### 6. Notification public/spam

`api/notifier.js` peut envoyer des emails via SendGrid sans auth. Doit etre appele seulement par backend interne ou admin.

### 7. Donnees client non fiables

Montants, emails, roles, `user_id`, `livreur_id`, `colis_id` sont souvent acceptes depuis `req.body` sans verification contre `auth.uid()`.

## Variables environnement requises

Production:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SENDGRID_API_KEY`
- `ADMIN_EMAIL`
- `FROM_EMAIL`
- `TURNSTILE_SECRET`
- `APP_ORIGIN=https://porteaporte.site`

Recommande:

- `STRIPE_API_VERSION`
- `NODE_ENV=production`
- `INTERNAL_API_SECRET` pour appels serveur a serveur si necessaire

Jamais dans le frontend:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_KEY`
- `SENDGRID_API_KEY`

## Structure Supabase

Le fichier cible cree precedemment est:

- `supabase-production-schema.sql`

Il couvre:

- `profiles`
- `livraisons`
- `transactions`
- `notifications`
- `codes_promo`
- RLS
- roles
- RPC `ajouter_coins`
- RPC `accepter_livraison`

Manques backend a ajouter au schema:

- table `payments` ou colonnes paiement detaillees dans `livraisons`;
- table `delivery_events` pour historique statut;
- table `litiges` pour disputes/reclamations;
- table `audit_logs`;
- table `driver_documents` / KYC si livreur certifie;
- table `messages` si chat livraison;
- table `webhook_events` pour idempotence Stripe.

## Endpoints manquants

Auth/session:

- `GET /api/me`
- `POST /api/admin/require-admin` ou middleware equivalent

Livraisons:

- `POST /api/livraisons`
- `GET /api/livraisons`
- `GET /api/livraisons/:id`
- `POST /api/livraisons/:id/accept`
- `POST /api/livraisons/:id/pickup`
- `POST /api/livraisons/:id/complete`
- `POST /api/livraisons/:id/cancel`

Paiements:

- `POST /api/payments/livraison/create-intent`
- `POST /api/payments/livraison/capture`
- `POST /api/payments/livraison/cancel`
- `POST /api/payments/livraison/refund`
- `GET /api/payments/:payment_intent_id`

Stripe:

- webhook strict et idempotent;
- handler `payment_intent.amount_capturable_updated`;
- handler `payment_intent.succeeded`;
- handler `payment_intent.canceled`;
- handler `charge.refunded`;
- handler `charge.dispute.created`;

Admin:

- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/suspend`
- `GET /api/admin/livraisons`
- `POST /api/admin/livraisons/:id/refund`
- `POST /api/admin/notifications`
- `POST /api/admin/codes-promo`

Coins:

- `POST /api/coins/purchase-intent`
- webhook credit coins apres paiement signe;
- `POST /api/coins/transfer`
- `GET /api/coins/history`

## Architecture backend ideale

```
Frontend statique
  -> Supabase Auth avec anon key
  -> lecture directe Supabase seulement quand RLS suffit
  -> actions sensibles via API backend

Vercel API
  -> verifySupabaseJwt(req)
  -> requireRole('admin'|'livreur'|'expediteur')
  -> Supabase service_role uniquement apres auth
  -> Stripe secret key uniquement cote serveur
  -> SendGrid uniquement cote serveur

Supabase
  -> RLS stricte
  -> RPC pour operations transactionnelles
  -> audit_logs
  -> webhook_events idempotents

Stripe
  -> PaymentIntent manual capture pour livraisons
  -> PaymentIntent automatic capture pour achat coins
  -> Webhook signe obligatoire
  -> capture/refund/cancel uniquement serveur
```

## Plan de migration production

### Phase 1 - Verrouiller

1. Desactiver ou proteger `api/supabase-sync.js`, `api/admin-crud.js`, `api/installer.js`.
2. Retirer tout fallback demo/fake du chemin production.
3. Exiger `STRIPE_WEBHOOK_SECRET` dans `stripe-webhook.js`.
4. Exiger JWT Supabase sur toutes les API non publiques.
5. Restreindre CORS via `APP_ORIGIN`.

### Phase 2 - Schema

1. Executer `supabase-production-schema.sql`.
2. Promouvoir le premier admin.
3. Ajouter `payments`, `webhook_events`, `audit_logs`, `litiges`.
4. Migrer references `colis` vers `livraisons`.
5. Migrer references `livreurs` vers `profiles where role in ('livreur','les deux')`.

### Phase 3 - Paiements

1. Remplacer `api/paiement-livraison.js` par create-intent authentifie.
2. Stocker chaque PaymentIntent en DB.
3. Ajouter capture/cancel/refund admin/flow livraison.
4. Rendre le webhook idempotent.
5. Crediter coins uniquement depuis webhook signe.

### Phase 4 - Admin

1. Creer endpoints admin separes.
2. Toutes les actions admin exigent `role = admin`.
3. Ajouter audit logs.
4. Ajouter pagination, filtres, rate limit.

### Phase 5 - Nettoyage

1. Retirer `installer.js` du deploiement.
2. Retirer `files.zip` de `api/`.
3. Deplacer `api/admin-crud.js` hors `api/`.
4. Standardiser tous les endpoints en ESM ou CommonJS, pas les deux.
5. Ajouter tests webhook Stripe avec payload signe.

## Priorite absolue

Avant live:

1. proteger `supabase-sync`;
2. proteger `stripe.js` actions `confirmer_coins` et `remboursement`;
3. rendre webhook signature obligatoire;
4. ne plus accepter les montants depuis le client;
5. stocker PaymentIntent en DB;
6. implementer capture manuelle.
