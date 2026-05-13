# Checklist deploiement production - PorteaPorte

Date: 2026-05-08

## 1. Vercel

- [x] Domaine production actif: `https://porteaporte.site`.
- [x] Headers securite de base actifs: HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- [x] Cache assets configure dans `vercel.json`.
- [x] `robots.txt` deploye.
- [x] `sitemap.xml` deploye.
- [x] Fonctions Vercel dans la limite actuelle: 12.
- [ ] Ajouter `SUPABASE_SERVICE_KEY` en Production.
- [ ] Verifier `STRIPE_WEBHOOK_SECRET` en Production.
- [ ] Verifier `INTERNAL_API_SECRET`.
- [ ] Verifier `WEBAUTHN_ORIGIN=https://porteaporte.site`.
- [ ] Verifier `WEBAUTHN_RP_ID=porteaporte.site`.
- [ ] Verifier `ALLOWED_ORIGIN=https://porteaporte.site`.

## 2. Supabase

- [x] RLS active sur les tables inspectees.
- [x] Tables principales presentes: `profiles`, `livraisons`, `transactions`, `litiges`, `evaluations`.
- [ ] Executer `supabase-production-schema.sql` si pas deja aligne.
- [ ] Executer `supabase-gps-realtime.sql`.
- [ ] Executer `supabase-webauthn.sql`.
- [ ] Executer/reviser `supabase-security-hardening.sql`.
- [ ] Relancer Security Advisors.
- [ ] Relancer Performance Advisors.
- [ ] Corriger vues security definer: `profils_livreurs_publics`, `stats_plateforme`.
- [ ] Activer leaked password protection dans Supabase Auth.
- [ ] Verifier que `profiles.role` ne peut pas etre auto-promu en `admin`.

## 3. Stripe

- [x] Webhook endpoint present: `/api/stripe-webhook`.
- [x] Webhook refuse une requete non signee.
- [x] PaymentIntent livraison manuel: `/api/paiement-livraison`.
- [x] Capture: `/api/capture-payment`.
- [x] Refund: `/api/refund-payment`.
- [ ] Configurer webhook Stripe vers `https://porteaporte.site/api/stripe-webhook`.
- [ ] Tester `payment_intent.succeeded`.
- [ ] Tester `payment_intent.payment_failed`.
- [ ] Tester `charge.refunded`.
- [ ] Tester `charge.dispute.created`.
- [ ] Valider mode live/test et cle publique Stripe dans `paiement.html`.

## 4. Auth et admin

- [x] `supabase.auth.admin.createUser()` absent du frontend.
- [x] Dashboards critiques centralises sur `js/supabase-config.js`.
- [x] `admin-crud` API publique desactivee/exclue.
- [ ] Tester login email/password en production.
- [ ] Tester signup livreur.
- [ ] Tester choix role `expediteur`, `livreur`, `les deux`.
- [ ] Tester acces admin avec compte non-admin: doit etre refuse.
- [ ] Tester acces admin avec compte admin: doit fonctionner.

## 5. Workflow livraison

- [ ] Creer une livraison depuis compte expediteur.
- [ ] Autoriser paiement escrow Stripe.
- [ ] Voir livraison disponible dans dashboard livreur.
- [ ] Enregistrer passkey livreur.
- [ ] Accepter livraison avec WebAuthn.
- [ ] Envoyer GPS live.
- [ ] Voir tracking expediteur.
- [ ] Capturer paiement apres livraison.
- [ ] Tester refund/cancel.
- [ ] Tester litige.

## 6. GPS realtime

- [x] Script `js/live-gps.js` present.
- [x] Table/vue SQL prevues: `delivery_locations`, `gps_positions`.
- [ ] Activer publication Realtime Supabase.
- [ ] Tester geolocalisation sur mobile HTTPS.
- [ ] Verifier restrictions permissions navigateur.
- [ ] Restreindre la cle Google Maps exposee.

## 7. Frontend / console

- [x] 0 erreur de parsing JS inline detectee.
- [x] 0 ID HTML manquant detecte pour `getElementById`.
- [x] Page `confirmation.html` creee pour eviter 404 post-paiement.
- [ ] Tester console Chrome mobile/desktop sur pages critiques.
- [ ] Nettoyer pages legacy: `*-CORRIGE`, `*-premium`, `*-FIXED`, tests.
- [ ] Remplacer progressivement les mocks par Supabase.

## 8. Monitoring

- [ ] Activer Vercel Analytics ou Web Vitals.
- [ ] Ajouter logs serveur structures JSON pour APIs.
- [ ] Ajouter alertes Stripe webhook failures.
- [ ] Ajouter alertes Supabase errors/Auth.
- [ ] Ajouter page statut/admin pour backend health checks.

## Decision de lancement

Statut actuel: pas encore production commerciale.

Go live public possible pour vitrine et inscriptions controlees.
Go live paiements/livraisons reelles seulement apres:
1. secrets Vercel configures;
2. SQL Supabase execute;
3. advisors Supabase critiques corriges;
4. test E2E Stripe + livraison + GPS + WebAuthn termine.
