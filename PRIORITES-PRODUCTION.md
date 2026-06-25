# PorteàPorte — Plan complet production
Généré le 2026-06-25

---

## ✅ DÉJÀ FAIT (ce commit)
- Bug bottom nav mobile réglé → `brand-uniform.css` cible maintenant `nav.mobile-tabs` directement, fond opaque #0a0c10, `top: auto !important` pour ne jamais interférer avec le sticky nav du haut

---

## 🔴 PRIORITÉ 1 — STRIPE (toi, 20 min)

### 1.1 Finaliser le compte Stripe
1. dashboard.stripe.com → "Finaliser votre configuration"
2. Remplir : infos entreprise (nom légal, adresse, NAS ou numéro d'entreprise)
3. Ajouter un compte bancaire canadien (numéro institution + transit + compte)
4. Activer le compte

### 1.2 Configurer le webhook
1. Stripe Dashboard → Developers → Webhooks → "Add endpoint"
2. URL : `https://porteaporte.site/api/stripe-webhook`
3. Events à cocher :
   - `payment_intent.amount_capturable_updated`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
   - `transfer.created`
   - `transfer.reversed`
   - `payout.paid`
   - `payout.failed`
   - `account.updated`
   - `identity.verification_session.verified`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copier le "Signing secret" (whsec_...) → Vercel

### 1.3 Variables Vercel (vercel.com → ton projet → Settings → Environment Variables)
Ajouter / vérifier ces variables en PRODUCTION :
```
STRIPE_SECRET_KEY          = sk_live_...
STRIPE_WEBHOOK_SECRET      = whsec_...
SUPABASE_URL               = https://xxx.supabase.co
SUPABASE_SERVICE_KEY       = eyJ... (service role, pas anon)
INTERNAL_API_SECRET        = (une string random longue)
WEBAUTHN_ORIGIN            = https://porteaporte.site
WEBAUTHN_RP_ID             = porteaporte.site
ALLOWED_ORIGIN             = https://porteaporte.site
CRON_SECRET                = (une string random pour sécuriser le cron)
```
Après ajout → Redeploy depuis Vercel.

---

## 🔴 PRIORITÉ 2 — SUPABASE SQL (toi, 15 min)

Va dans Supabase → SQL Editor → colle et exécute dans cet ordre :

### 2.1 Schema principal covoiturage
→ Fichier : `supabase-covoiturage.sql` (racine du repo)

### 2.2 Schema gamification badges/missions
→ Fichier : `supabase-covoiturage-gamification.sql`

### 2.3 Profil conducteur
→ Fichier : `supabase-covoiturage-profil.sql`

### 2.4 Migration Stripe
→ Fichier : `sql-migration-ride-stripe.sql`

### 2.5 Sécurité
→ Fichier : `supabase-security-hardening.sql`

### 2.6 Activer Realtime GPS
Supabase → Database → Replication → activer la table `gps_positions` et `delivery_locations`

### 2.7 Security Advisor
Supabase → Advisors → Security → corriger toutes les critiques/warnings

---

## 🟡 PRIORITÉ 3 — TESTS E2E (toi, 30 min)

### Test covoiturage complet :
1. Connecte-toi comme passager → réserver un trajet → payer
2. Aller sur `porteaporte.site/admin/ride-payments.html`
3. Voir la réservation en "⏳ En attente capture"
4. Cliquer "⚡ Lancer cron maintenant"
5. Voir passer en "✅ Payé" + transfer_id Stripe rempli

### Test livraison complet :
1. Expéditeur crée une livraison → paie en escrow
2. Livreur accepte → GPS actif
3. Livreur livre → capture paiement
4. Vérifier transaction Supabase + email confirmation

---

## 🟢 PRIORITÉ 4 — COSMÉTIQUE (optionnel)

- Activer Vercel Analytics : vercel.com → ton projet → Analytics → Enable
- Nettoyer fichiers legacy `*.backup`, `*.corrupted`

---

## RÉSUMÉ DES ACTIONS MANUELLES REQUISES

| # | Action | Où | Temps |
|---|--------|-----|-------|
| 1 | Finaliser compte Stripe + banque | dashboard.stripe.com | 10 min |
| 2 | Créer webhook Stripe | dashboard.stripe.com | 5 min |
| 3 | Variables Vercel | vercel.com | 5 min |
| 4 | SQL Supabase (5 fichiers) | supabase.com/dashboard | 10 min |
| 5 | Activer Realtime Supabase | supabase.com/dashboard | 2 min |
| 6 | Security Advisor Supabase | supabase.com/dashboard | 5 min |
| 7 | Test E2E covoiturage | porteaporte.site | 10 min |
| 8 | Test E2E livraison | porteaporte.site | 10 min |

**Total : ~60 min de configuration manuelle.**
