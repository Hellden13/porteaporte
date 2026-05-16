# Rapport securite production - PorteaPorte

Date: 2026-05-08
Site: https://porteaporte.site
Stack: HTML/CSS/JS vanilla, Vercel Functions Node, Supabase, Stripe

## Synthese

Etat securite: partiellement pret production.

Le frontend ne contient plus les anciennes fausses cles Supabase sur les pages critiques corrigees. Les endpoints sensibles Vercel sont en fail-closed quand `SUPABASE_SERVICE_KEY` manque. Le webhook Stripe refuse les requetes non signees.

Blocants avant vrai lancement:
- Ajouter `SUPABASE_SERVICE_KEY` dans Vercel Production.
- Ajouter/verifier `STRIPE_WEBHOOK_SECRET` dans Vercel Production.
- Executer `supabase-security-hardening.sql`.
- Corriger les advisors Supabase critiques: vues security definer, fonctions security definer executables, policies permissives.
- Restreindre ou proxyfier la cle Google Maps exposee dans `gps-tracker.html`.

## Verification effectuee

- `node --check` sur tous les fichiers `api/*.js`: OK.
- `node --check` sur tous les fichiers `js/*.js`: OK.
- Parsing des scripts inline HTML: 0 erreur.
- Verification IDs `getElementById()`: 0 ID manquant detecte.
- Production:
  - `/`: 200.
  - HSTS actif.
  - `X-Frame-Options: DENY` actif.
  - `/api/stripe-webhook` sans signature: 400, correct.
  - `/robots.txt`: 200.
  - `/sitemap.xml`: 200.

## Risques critiques

1. `SUPABASE_SERVICE_KEY` manquant dans Vercel
Impact: APIs backend securisees inutilisables (`503`) pour livraison, GPS API, WebAuthn, capture/refund.
Action: ajouter la variable en Production uniquement.

2. Advisors Supabase security
Constats MCP Supabase:
- `public.profils_livreurs_publics` et `public.stats_plateforme`: vues `SECURITY DEFINER`.
- `public.ajouter_coins`, `public.handle_new_user`, `public.verifier_transfert_coins`: fonctions `SECURITY DEFINER` executables par `anon` et/ou `authenticated`.
- `public.payment_transactions`: RLS active sans policy.
- `public.liste_attente`: policy insert publique `WITH CHECK true`.
- Protection mots de passe compromis Supabase Auth desactivee.

Action: executer/reviser `supabase-security-hardening.sql`, puis relancer les advisors.

3. Google Maps API key exposee
Fichier: `gps-tracker.html`.
Impact: abus quota/couts si restrictions Google Cloud absentes.
Action: restreindre la cle par domaine `porteaporte.site` et API autorisees, ou proxyfier.

4. CSP non activee
Raison: le projet utilise beaucoup de scripts inline. Une CSP stricte casserait le site.
Action production: migrer les scripts inline critiques vers fichiers `.js`, puis activer CSP nonce/hash.

## Protection admin

Etat:
- `admin-dashboard.html` utilise les helpers auth/admin existants.
- `/api/admin-crud.js` est desactive et exclu de Vercel.
- `js/admin-crud.js` expose une fonction `createUser(profile)`, mais elle insere un profil et n'appelle pas `supabase.auth.admin.createUser()`.

Risque restant:
- L'admin frontend depend de RLS et du role `profiles.role = admin`.
- Verifier en base que les policies ne permettent pas a un utilisateur de s'auto-promouvoir admin.

## Stripe

Etat:
- `/api/stripe-webhook` verifie la signature Stripe et refuse sans signature.
- `/api/paiement-livraison` cree un PaymentIntent en `capture_method=manual`.
- `/api/capture-payment` route vers `/api/capture-livraison`.
- `/api/refund-payment` existe via `/api/platform`.
- `/api/stripe` ne credite plus les coins depuis le frontend; confirmation reservee au webhook interne.

Actions:
- Ajouter `STRIPE_WEBHOOK_SECRET`.
- Configurer le webhook Stripe vers `https://porteaporte.site/api/stripe-webhook`.
- Tester `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`.

## Sessions et auth

Etat:
- Pages critiques centralisees sur `js/supabase-config.js`.
- Anciennes fausses cles retirees des pages actives corrigees.
- Session Supabase utilisee pour proteger les dashboards.

Actions:
- Ajouter expiration/refresh UX propre.
- Eviter de stocker `auth_token` manuellement dans `localStorage` sur `login.html`; Supabase persiste deja la session. A garder seulement si compat legacy necessaire.

## Fichiers crees/corriges pour securite

- `vercel.json`: HSTS, frame deny, cache assets.
- `robots.txt`
- `sitemap.xml`
- `supabase-security-hardening.sql`
- `api/stripe.js`: erreur 400 propre si `payment_intent_id` absent.
