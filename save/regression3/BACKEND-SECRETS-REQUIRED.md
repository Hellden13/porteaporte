# Backend secrets requis

Ces variables doivent exister dans Vercel Production pour activer le backend securise.

## Supabase

- `SUPABASE_URL`
  - Deja configuree sur Vercel.
  - Valeur publique du projet Supabase.

- `SUPABASE_SERVICE_KEY`
  - Obligatoire pour les endpoints serveur securises.
  - A recuperer dans Supabase Dashboard > Project Settings > API > service_role key.
  - Ne jamais exposer dans `js/`, HTML ou frontend.

## Stripe

- `STRIPE_SECRET_KEY`
  - Deja detectee comme configuree.

- `STRIPE_WEBHOOK_SECRET`
  - Obligatoire pour `/api/stripe-webhook`.
  - A recuperer dans Stripe Dashboard > Developers > Webhooks.

## Notifications et securite optionnelles

- `INTERNAL_API_SECRET` (≥ 16 caractères, **recommandé production**)
  - Obligatoire pour `/api/notifier` sur les types **non publics** (litige, achat_coins, inscription, livraisons, etc.).
  - En-tête : `x-internal-notifier-secret` ou `x-internal-webhook-secret` (Stripe/legacy).
  - Les appels **publics** autorisés depuis le site : `partenaire`, `liste_attente`, `contact_support`, `contact_partenariat`, `contact_investisseur` (origine doit correspondre à `ALLOWED_ORIGIN`).
  - **Action** : après déploiement, définir la même valeur dans Vercel que celle déjà utilisée pour les webhooks internes si applicable.
- `PUBLIC_SITE_ORIGIN` (optionnel, défaut `https://porteaporte.site`)
  - URL de base pour `/api/stripe-webhook` → `/api/notifier` et `/api/stripe` → `/api/notifier`.
- `GOOGLE_MAPS_API_KEY`
  - Clé restreinte par référent HTTP (Google Cloud) ; chargée par `/api/maps-config` pour `gps-tracker.html`.
- `SENDGRID_API_KEY`
- `ADMIN_EMAIL`
- `FROM_EMAIL`
- `TURNSTILE_SECRET`
- `WEBAUTHN_ORIGIN`
  - Production : `https://porteaporte.site`
  - Local : `http://localhost:3000`
- `WEBAUTHN_RP_ID`
  - Production : `porteaporte.site`
  - Local : `localhost`
- `ALLOWED_ORIGIN`
  - Defaut actuel : `https://porteaporte.site`.

## Endpoints dependants de `SUPABASE_SERVICE_KEY`

- `/api/paiement-livraison`
- `/api/capture-livraison`
- `/api/cancel-livraison`
- `/api/supabase-sync`
- credit PorteCoins automatique via `/api/stripe-webhook`
- `/api/webauthn`

## SQL a executer dans Supabase

- `supabase-production-schema.sql`
- `supabase-gps-realtime.sql`
- `supabase-webauthn.sql`
- `supabase-stripe-webhook-idempotency.sql` (**idempotence webhooks / crédits PorteCoins — production**)
