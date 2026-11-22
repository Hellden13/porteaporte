# Plan : déménager la production vers porteaporte-prod-v2

- Ancien projet Supabase (production actuelle) : `miqrircrfpzkmvvacgwt`. Denis n'a plus accès au tableau de bord depuis octobre (2FA perdue).
- Nouveau projet : `porteaporte-prod-v2`, ref `qmufvtzqvuzlmrolddck`. Denis y a accès.
- Document écrit le 22 novembre 2026, branche `admin-lot1`. **Rien n'a été fait** : c'est un plan, aucune base n'a été touchée.

---

## 0. Décision : voie C (clé de service)

Mis à jour le 22 novembre 2026.
- **Voie B impossible.** Le jeton du CLI Supabase voit seulement les organisations « Hellden13 » et « Pieds en L'air S.E.N.C. ». L'ancien projet n'y est pas : il est sur le compte dont la 2FA est perdue.
- **Voie C retenue par Denis.** La clé de service de l'ancien projet, trouvée dans les copies locales de `.env.production.local`, fonctionne en lecture.
- **Voie A, en parallèle (conseillé).** La demande de récupération du compte au support Supabase reste utile : c'est la seule façon de garder les mots de passe des membres et de faire un `pg_dump` complet.

### Sauvegarde faite le 22 novembre 2026 (lecture seulement)

Elle est dans `/Volumes/Projets-Sauvegardes/porteaporte-sauvegarde-2026-11-22/`, sur le disque externe, hors de tout dépôt Git :
- `tables/` : 91 tables et vues du schéma `public`, en JSON, lues par pages et vérifiées contre le compte du serveur, soit 993 lignes ;
- `auth/users.json` : 25 comptes, **sans mots de passe** (l'API ne les donne pas) ;
- `storage/` : 3 buckets, `kyc-documents` (6 fichiers, privé), `delivery-proofs` (1 fichier, **privé** et non public comme je le croyais), et `profile-photos` (9 fichiers, public), avec un index SHA-256 par bucket ;
- `schema/openapi-postgrest.json` : la liste des colonnes de chaque table, telle que le serveur la voit aujourd'hui ;
- `RAPPORT.json` : les comptes de lignes et la liste des erreurs, qui est vide.

Ce que cette sauvegarde **ne contient pas** : les fonctions, les règles RLS, les déclencheurs, les mots de passe et les réglages Auth. Ils viennent du dépôt (section 1) et des réglages à refaire à la main.

## 1. Inventaire : ce qu'il faut copier

### Schéma (tables, vues, fonctions, RLS)

Le dépôt contient un schéma complet de l'ancienne production : `supabase/migrations/20260901090000_production_schema_baseline.sql`, du 1er septembre 2026, avec 81 tables. Ma version précédente de ce plan disait le contraire : c'était une erreur. Une copie équivalente existe aussi dans `~/.openclaw/backups/Porte-a-Porte_DB_2026-09-02_0830/schema.sql` (81 tables, 9 vues, 28 fonctions, 12 déclencheurs, 172 règles RLS).

Il faut appliquer ensuite, dans l'ordre :
- les autres fichiers de `supabase/migrations/` : `20260901101200_harden_service_policies_and_profiles.sql`, `20260901114500_lock_privileged_rpc_functions.sql` et `20260901133000_repair_recursive_views.sql` ;
- `supabase/rate_limits.sql` (la fonction `check_rate_limit` et sa table) et `supabase/claim_free_streak.sql`.

Ensuite, on compare chaque table avec `schema/openapi-postgrest.json` de la sauvegarde : une colonne ajoutée à la main depuis septembre y apparaîtra.

Le fichier `supabase/prod-v2-plus-tard/20261121120000_rides_suppression_logique.sql.NE-PAS-APPLIQUER` n'est **plus nécessaire**. « Supprimer » marche maintenant sans migration : le trajet passe à `annule` et reçoit une marque `ride_deleted` dans `transaction_audit_events`. Ce fichier ne sera appliqué que si Denis le décide, et il faudra alors adapter `rideDelete`.

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

- **Comptes** (voie C) : on recrée chaque compte par l'API admin du nouveau projet **avec le même `id`** et le même courriel, sinon tous les liens vers `profiles` sont cassés. On le marque « courriel confirmé » s'il l'était, et sans mot de passe utilisable. Ensuite, chaque membre reçoit un courriel pour choisir un nouveau mot de passe (texte en section 6).
  - La sauvegarde contient 25 comptes. Denis parle de 19 membres, et 7 adresses ressemblent à des comptes de test (« test », « + », etc.). **Denis doit dresser la liste** des comptes à recréer et de ceux qui recevront le courriel.
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
| `delivery-proofs` | Photos de preuve de livraison | **Privé** dans l'ancien projet (le code a aussi un lien `/object/public/…` à vérifier) |
| `profile-photos` | Photos de profil | Public |
| `kyc-documents` | Pièces d'identité des livreurs | **Privé** (liens signés) : doit rester privé |

1. Il y a 3 buckets dans l'ancien projet (liste vérifiée le 22 novembre 2026), tous dans la sauvegarde.
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
1. **Réactiver porteaporte-prod-v2.** Il est en pause (« INACTIVE ») depuis la vérification du 22 novembre 2026. Dans le tableau de bord Supabase, ouvre le projet puis clique sur « Restore project ». C'est Denis qui le fait, avec sa 2FA. Note ses codes de secours hors du Mac.
2. Dans prod-v2, créer le schéma : le fichier de base puis les migrations de la section 1. Créer ensuite les 3 buckets avec leurs règles et la publication Realtime, puis refaire les réglages Auth. Comparer avec la sauvegarde : mêmes tables et mêmes colonnes.
3. Répétition générale : importer une première fois la sauvegarde, en recréant les comptes avant les tables, parce que `profiles.id` pointe vers `auth.users`. Tester ensuite un aperçu Vercel branché sur prod-v2 : connexion après réinitialisation, recherche, réservation en mode test, photo de preuve, admin.
**Bascule (dans un creux, à annoncer d'avance) :**
4. Figer le site, en mode maintenance ou en refusant les écritures, pour que plus rien n'entre dans l'ancienne base.
5. Faire une nouvelle sauvegarde par la clé de service, avec le même script, pour avoir les données du jour. Puis faire la copie finale : comptes, tables, fichiers.
6. Vérifier : compter les lignes de chaque table des deux côtés (elles doivent être égales) et comparer les sommes d'argent (transactions, gains, PorteCoins).
7. Changer les variables Vercel et les clés dans le code, puis déployer en production. C'est le seul déploiement, et **Denis l'approuve**.
8. Rouvrir le site, renvoyer les événements Stripe de la fenêtre de bascule et tester en vrai (connexion, une réservation, l'admin).
9. Envoyer le courriel de réinitialisation (section 6), **seulement après l'accord de Denis sur le texte et sur la liste**.

**Après :**
10. Garder l'ancien projet **intact, en lecture**, au moins 30 jours. Ne rien y supprimer.
11. Rien à faire pour « Supprimer » : il marche sans migration.

---

## 4. Retour en arrière

Tant que l'ancien projet n'est pas touché, revenir en arrière veut dire : remettre les trois anciennes variables Vercel et l'ancien code, puis redéployer.

Attention : tout ce qui a été écrit dans la nouvelle base après la bascule (inscriptions, réservations, paiements) ne sera pas dans l'ancienne. Il faut donc décider vite : en pratique, dans l'heure qui suit la réouverture.

## 5. Avant de commencer, à vérifier

- [x] Voie C choisie par Denis (22 novembre 2026).
- [ ] prod-v2 réactivé.
- [ ] Liste des comptes à recréer et à prévenir, validée par Denis.
- [ ] Texte du courriel (section 6) relu et approuvé par Denis.
- [x] Export complet par la clé de service sur le disque externe (22 novembre 2026). À refaire le jour de la bascule.
- [ ] Le nouveau projet est sur un plan payant si la taille de la base ou du stockage le demande, avec ses sauvegardes automatiques activées.
- [ ] La 2FA de Denis sur le **nouveau** compte a ses codes de secours notés hors du Mac, pour éviter que ça se reproduise.
- [ ] La date de bascule est annoncée aux membres.

## 6. Courriel aux membres : nouveau mot de passe (brouillon, rien n'est envoyé)

**Denis lit et approuve ce texte avant tout envoi.** L'envoi se fait après la bascule, avec le lien de réinitialisation de Supabase (modèle « Reset password » du projet prod-v2) ou par Resend.

> **Objet :** PorteàPorte : choisis ton nouveau mot de passe
>
> Bonjour {prénom},
>
> On a déménagé PorteàPorte sur des serveurs neufs pour rendre le site plus solide et plus sûr. Ton compte, ton historique, tes trajets et tes PorteCoins ont suivi : rien n'est perdu.
>
> Par sécurité, les mots de passe n'ont pas été déménagés. Il faut donc en choisir un nouveau, une seule fois :
>
> 👉 **[Choisir mon nouveau mot de passe]({lien})**
>
> Le lien est valide pendant 24 heures. S'il a expiré, va sur porteaporte.site, clique sur « Mot de passe oublié » et entre cette adresse courriel.
>
> Tu n'as rien demandé ? C'est normal : ce courriel est envoyé à tous les membres. On ne te demandera jamais ton mot de passe par courriel ou par téléphone.
>
> Une question ? Réponds simplement à ce courriel.
>
> Merci d'être là depuis le début,
> Denis, PorteàPorte

### Destinataires : les 19 comptes actifs

Ce sont les profils non archivés (`suspendu` faux) de la sauvegarde du 22 novembre 2026, c'est-à-dire la même règle que la liste « Utilisateurs actifs » de l'admin. Les 6 autres comptes sont archivés (tests) et ne reçoivent rien. Les adresses courriel ne sont pas copiées dans le dépôt : elles sont dans la sauvegarde.

| # | Prénom | Nom | Rôle |
|---|---|---|---|
| 1 | Ahmed | Chebbi | les deux |
| 2 | Akram | Bendella | livreur |
| 3 | Alexis | Watelle | les deux |
| 4 | Caroline | hoffmann | expéditeur |
| 5 | Claudine | Leblanc | expéditeur |
| 6 | Dan | Bouchard Edmunds | les deux |
| 7 | Denis | Morneau | admin (c'est toi : reçoit-il le courriel ?) |
| 8 | Diane | Boisvert | les deux |
| 9 | Elodie | Philippot | expéditeur |
| 10 | Gabrielle | Dastous | les deux |
| 11 | Iverson | Aĺlen | les deux |
| 12 | Jacques | Matte | les deux |
| 13 | Jean | Begue | expéditeur |
| 14 | Joanie | Côté | les deux |
| 15 | Manon | Castilloux | les deux |
| 16 | Marie-Philippe | Boutet | expéditeur |
| 17 | Stéphan | Fofack | les deux |
| 18 | Valdes | NZALLI TCHOUONHUI | livreur |

**Adresse qui ressemble à un test, à confirmer par Denis** (contient « + », « test », « example », « fictif » ou « demo ») :

| # | Prénom | Nom | Rôle |
|---|---|---|---|
| 19 | Kim | Robi | les deux |

Les noms sont recopiés tels qu'ils sont dans la base, y compris « hoffmann » en minuscule et le « ĺ » de « Aĺlen ».

À décider par Denis : l'adresse d'envoi, la date, et s'il faut un rappel après 7 jours pour les membres qui n'ont pas encore choisi leur mot de passe.
