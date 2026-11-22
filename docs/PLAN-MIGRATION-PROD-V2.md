# Plan : déménager la production vers porteaporte-prod-v2

- Ancien projet Supabase (production actuelle) : `miqrircrfpzkmvvacgwt`. Denis n'a plus accès au tableau de bord depuis octobre (2FA perdue).
- Nouveau projet : `porteaporte-prod-v2`, ref `qmufvtzqvuzlmrolddck`. Denis y a accès.
- Document écrit le 22 novembre 2026, branche `admin-lot1`. **Rien n'a été fait** : c'est un plan, aucune base n'a été touchée.

---

## 0. Le vrai blocage : sortir les données de l'ancien projet

Une recherche faite le 22 novembre 2026 sur le Mac n'a trouvé **aucun mot de passe de la base** et **aucune chaîne `postgresql://` complète** :
- `supabase/.temp/pooler-url` (dans plusieurs copies) : l'adresse seulement, sans mot de passe ;
- `.env.production.local` (copies et sauvegardes) : seulement `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_KEY`, sans mot de passe de base ;
- le CLI Vercel est déconnecté sur ce Mac ;
- `~/.openclaw/workspace/porteaporte/.env.production.local` n'a pas pu être lu (permission refusée), et je n'ai pas forcé.

Trois façons de sortir les données, de la meilleure à la moins bonne. **Denis choisit.**

| Voie | Ce qu'elle donne | Ce qu'il manque |
|---|---|---|
| **A. Récupérer le compte** : demande à support@supabase.com de désactiver la 2FA (preuve de propriété : courriel du compte, facturation, ref `miqrircrfpzkmvvacgwt`) | Tout : `pg_dump` complet, y compris les comptes et leurs mots de passe chiffrés, le stockage et les réglages Auth | Le délai de réponse du support |
| **B. Jeton du CLI Supabase** : un jeton est présent dans le trousseau du Mac | Si ce jeton appartient au compte qui possède l'ancien projet, l'API de gestion Supabase peut exécuter du SQL, ou réinitialiser le mot de passe de la base, sans passer par le tableau de bord | Pas vérifié. Je ne l'ai pas utilisé : c'est à Denis de décider s'il veut s'en servir. |
| **C. Clé de service** (celle que le site utilise déjà, dans Vercel) | Toutes les tables `public` par l'API REST, la liste des comptes par l'API admin Auth, et tous les fichiers du stockage | Les **mots de passe** (chaque membre devra en refaire un), et le schéma exact : fonctions, RLS et déclencheurs ne sont pas lisibles par la clé de service |

Avec la voie C, le schéma vient de la sauvegarde du 2 septembre 2026, complétée par les migrations du dépôt (voir la section 1). Il faut donc vérifier table par table qu'aucune colonne ajoutée depuis n'a été oubliée.

---

## 1. Inventaire : ce qu'il faut copier

### Schéma (tables, vues, fonctions, RLS)

La seule copie du schéma complet sur le Mac est `~/.openclaw/backups/Porte-a-Porte_DB_2026-09-02_0830/schema.sql`, du 2 septembre 2026. Elle contient :
- 81 tables ;
- 9 vues ;
- 28 fonctions ;
- 12 déclencheurs ;
- 172 règles RLS.

Le dossier `supabase/migrations/` du dépôt ne contient **pas** le schéma complet : trois des fichiers sont des « placeholders » vides. Il faut ajouter à la sauvegarde ce qui a changé depuis le 2 septembre :
- `20260901114500_lock_privileged_rpc_functions.sql` et `20260901133000_repair_recursive_views.sql`, à vérifier : ils sont peut-être déjà dans la sauvegarde ;
- `supabase/rate_limits.sql` (la fonction `check_rate_limit` et sa table) et `supabase/claim_free_streak.sql` ;
- `20261121120000_rides_suppression_logique.sql`, **pas encore appliquée** sur l'ancienne base ;
- tout ce qui a été collé à la main dans le SQL Editor depuis septembre. Avec la voie A ou B, un `pg_dump --schema-only` frais règle ce point.

**Tables utilisées par le code aujourd'hui (60) :**
- *Livraisons* : `livraisons`, `delivery_proofs`, `delivery_locations`, `gps_updates`, `livreur_earnings`, `payout_requests`, `manquements`, `evaluations`, `reviews`.
- *Covoiturage* : `rides`, `ride_bookings`, `ride_stops`, `ride_driver_profiles`, `ride_gps_trail`, `ride_messages`, `ride_price_breakdowns`, `ride_reports`, `ride_search_logs`, `safe_meeting_points`.
- *Membres et sécurité* : `profiles`, `kyc_submissions`, `emergency_contacts`, `sos_alerts`, `webauthn_credentials`, `webauthn_challenges`, `push_subscriptions`, `notifications`, `messages`.
- *Argent* : `transactions`, `transaction_audit_events`, `stripe_connect_accounts`, `protection_fund_payouts`, `porte_coins_transactions`, `promo_codes`, `promo_code_uses`, `referral_codes`, `referrals`.
- *Jeu et récompenses* : `badges`, `user_badges`, `badge_campaign_status`, `cov_badges`, `user_cov_badges`, `cov_missions`, `user_cov_missions`, `missions`, `user_missions`, `cov_reviews`, `cov_xp_log`, `xp_transactions`, `reward_audit_logs`, `monthly_draws`, `draw_entries`, `draw_winners`.
- *Impact et communauté* : `impact_applications`, `impact_organisations`, `impact_settings`, `impact_mode_feedback`, `organismes_partenaires`, `community_votes`, `community_vote_responses`, `address_intelligence`, `address_intelligence_votes`.
- *Divers* : `platform_settings`, `waitlist`.

**Vues :** `v_livreur_balance` et `v_user_fiabilite`.

**Fonctions appelées par le code (RPC) :** `check_rate_limit`, `cleanup_rate_limits`, `accepter_livraison`, `admin_delete_user`, `record_driver_litige`, `award_claim_free_milestone`, `get_claim_free_days` et `platform_claim_free_days`. Les déclencheurs et les autres fonctions du schéma sont à copier aussi.

**Realtime :** `messagerie.html`, `dashboard-expediteur.html` et `js/live-gps.js` s'abonnent à des changements en direct. Dans le nouveau projet, il faut remettre les mêmes tables dans la publication `supabase_realtime`.

### Auth (comptes)

- **Comptes** (`auth.users` et `auth.identities`) :
  - avec les voies A ou B, on copie le schéma `auth` par `pg_dump`. Les mots de passe chiffrés suivent, et les membres n'ont rien à refaire ;
  - avec la voie C, on recrée les comptes par l'API admin **avec le même `id`**, sinon tous les liens vers `profiles` sont cassés. Ensuite, on envoie à chaque membre un courriel pour choisir un nouveau mot de passe.
- **Clés d'accès (passkeys)** : elles sont stockées dans `public.webauthn_credentials` et liées au domaine (`WEBAUTHN_RP_ID`). Elles restent valides tant que le domaine `porteaporte.site` ne change pas.
- **Réglages à refaire à la main** dans le nouveau projet :
  - Site URL et URL de redirection autorisées : porteaporte.site, ainsi que les aperçus Vercel s'ils servent ;
  - modèles de courriel (le dossier `supabase/email-templates/` est dans le dépôt) ;
  - SMTP, si un serveur d'envoi de courriels était configuré ;
  - fournisseurs de connexion activés ;
  - durée des sessions.

### Stockage (photos et documents)

| Bucket | Contenu | Accès |
|---|---|---|
| `delivery-proofs` | Photos de preuve de livraison | Public (lien `/object/public/…`) |
| `kyc-documents` | Pièces d'identité des livreurs | **Privé** (liens signés) : doit rester privé |

1. Avant de copier, lister tous les buckets de l'ancien projet : il peut y en avoir d'autres que le code n'utilise plus.
2. Copier chaque fichier en gardant **le même chemin**, parce que les tables gardent les chemins (et parfois l'adresse complète).
3. Remettre les règles RLS de `storage.objects`.
4. Les adresses complètes enregistrées en base (`https://miqrircrfpzkmvvacgwt.supabase.co/storage/...`) doivent être réécrites vers la nouvelle ref, par un `UPDATE` vérifié, après sauvegarde.

---

## 2. Ce qu'il faut changer

### Variables Vercel (production et aperçus)

- `SUPABASE_URL` : la nouvelle adresse.
- `SUPABASE_SERVICE_KEY` : la nouvelle clé de service.
- `SUPABASE_ANON_KEY` : la nouvelle clé publique.
- Les autres variables ne changent pas : `STRIPE_*`, `RESEND_API_KEY`, `SENDGRID_*`, `TURNSTILE_*`, `VAPID_*`, `WEBAUTHN_*`, `CRON_SECRET`, `INTERNAL_API_SECRET`, `BASE_URL`, `ADMIN_EMAIL`, `FROM_EMAIL`, `GOOGLE_MAPS_API_KEY`, `TWILIO_*`.

### Clés écrites dans le code

L'ancienne ref et l'ancienne clé publique (anon) sont écrites en dur dans :
- `js/supabase-config.js` ;
- `js/auth-api.js` ;
- `pickup-confirm.html`.

Il faut les remplacer par celles du nouveau projet, puis vérifier qu'aucune autre page active n'en contient : `git grep miqrircrfpzkmvvacgwt -- '*.js' '*.html'`, en excluant `save/`, `_archived/` et `_zip_audit/`. Les copies dans `save/` et `_archived/` ne sont pas servies au public, mais il faut les nettoyer ou les retirer du site.

La clé publique peut être dans le code. **La clé de service, jamais.**

### Stripe

- **Webhook** : le code le reçoit dans `api/stripe-webhook.js`. **Pas vérifié** : l'adresse configurée chez Stripe, qui devrait être `porteaporte.site/api/stripe-webhook`. Si le domaine reste le même, ni l'adresse ni le secret (`STRIPE_WEBHOOK_SECRET`) ne changent, donc rien à faire chez Stripe. À confirmer dans Stripe → Développeurs → Webhooks.
- **Le point à surveiller** : pendant la bascule, un paiement reçu par l'ancienne base serait perdu pour la nouvelle. C'est pourquoi on fige le site avant la copie (étape 4 de la section 3). Après la bascule, il faut aussi renvoyer depuis Stripe les événements de la fenêtre de bascule (Stripe → Développeurs → Webhooks → Événements → Renvoyer).
- **Les comptes Stripe Connect** des livreurs ne bougent pas. Seule la table `stripe_connect_accounts` est copiée.

### Le reste

- **Tâche planifiée Vercel :** `/api/cron-cleanup`, tous les jours à 3 h. Rien à changer.
- **Supabase CLI** : relier le dossier au nouveau projet avec `supabase link --project-ref qmufvtzqvuzlmrolddck`.

---

## 3. Ordre des étapes

**Préparation (le site reste ouvert) :**
1. Choisir la voie A, B ou C (section 0). Avec A ou B, faire tout de suite un `pg_dump` complet de l'ancienne base et le garder sur le disque externe.
2. Dans le nouveau projet, créer le schéma, les fonctions, les RLS, les buckets et la publication Realtime, et refaire les réglages Auth. Comparer avec l'ancien : même nombre de tables, de colonnes, de règles RLS et de fonctions.
3. Répétition générale : copier les données une première fois, puis tester un aperçu Vercel branché sur le nouveau projet (connexion, recherche de trajet, réservation en mode test, photo de preuve, panneau admin). Corriger ce qui manque.

**Bascule (dans un creux, à annoncer d'avance) :**
4. Figer le site, en mode maintenance ou en refusant les écritures, pour que plus rien n'entre dans l'ancienne base.
5. Faire la copie finale des données, des comptes et des fichiers.
6. Vérifier : compter les lignes de chaque table des deux côtés (elles doivent être égales) et comparer les sommes d'argent (transactions, gains, PorteCoins).
7. Changer les variables Vercel et les clés dans le code, puis déployer en production. C'est le seul déploiement, et **Denis l'approuve**.
8. Rouvrir le site, renvoyer les événements Stripe de la fenêtre de bascule et tester en vrai (connexion, une réservation, l'admin).

**Après :**
9. Garder l'ancien projet **intact, en lecture**, au moins 30 jours. Ne rien y supprimer.
10. Appliquer la migration `20261121120000_rides_suppression_logique.sql` sur le **nouveau** projet, par son SQL Editor, dans une transaction.

---

## 4. Retour en arrière

Tant que l'ancien projet n'est pas touché, revenir en arrière veut dire : remettre les trois anciennes variables Vercel et l'ancien code, puis redéployer.

Attention : tout ce qui a été écrit dans la nouvelle base après la bascule (inscriptions, réservations, paiements) ne sera pas dans l'ancienne. Il faut donc décider vite : en pratique, dans l'heure qui suit la réouverture.

## 5. Avant de commencer, à vérifier

- [ ] La voie choisie (A, B ou C) est confirmée par Denis.
- [ ] Un `pg_dump` frais, ou un export complet par la clé de service, est fait et copié sur le disque externe.
- [ ] Le nouveau projet est sur un plan payant si la taille de la base ou du stockage le demande, avec ses sauvegardes automatiques activées.
- [ ] La 2FA de Denis sur le **nouveau** compte a ses codes de secours notés hors du Mac, pour éviter que ça se reproduise.
- [ ] La date de bascule est annoncée aux membres.
