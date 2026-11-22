# Audit sécurité : partie 1 (22 novembre 2026)

- Branche : `audit-securite`, partie de `main` au commit `7deba35`.
- Production : **lecture seulement**. Aucune ligne créée, modifiée ou supprimée ; aucun courriel, aucun paiement.
- Ce rapport ne contient ni clé, ni secret, ni nom, ni courriel : seulement des nombres.

## Résumé

| # | Gravité | Constat | Vérifié comment |
|---|---|---|---|
| 1 | **Haute** | `api/capture-livraison.js` : le code destinataire (6 chiffres) libère le paiement Stripe **sans limite d'essais**. Ce fichier est hors du routeur `platform.js`, donc sans son limiteur global. | Lecture du code |
| 2 | Moyenne | `promo_codes` : les 2 codes promo sont **lisibles par n'importe qui** avec la clé publique, y compris la valeur du code. | Test réel en lecture |
| 3 | Moyenne | Pas testé : ce qu'un **membre connecté** peut lire des autres membres (`profiles`, `ride_bookings`, etc.). Il faut un compte de test. | — |
| 4 | Faible | `ride_search_logs` : n'importe qui peut **insérer** directement par l'API Supabase. C'est sans danger pour les données, mais ça permet de remplir la table de faux journaux en contournant la limite de `ride-search`. | Test réel (insertion qui échoue) |
| 5 | Faible | `impact-feedback` écrit sans connexion. Seule la limite globale (120 requêtes par minute et par adresse IP) le freine. | Exécution locale |
| 6 | Faible | Lisibles sans connexion, sûrement voulu, à confirmer : `safe_meeting_points` (356, adresses publiques), `ride_driver_profiles` (4, avec photos et modèle des véhicules), `v_protection_fund_balance` (totaux du fonds), `reviews` (1). | Test réel en lecture |
| 7 | Info | Bucket `profile-photos` : public. Un fichier s'ouvre si on connaît son chemin (9 sur 9), mais **la liste des fichiers est refusée**. | Test réel |
| 8 | Info | `api/cron-cleanup.js` compare le secret avec `!==` et non en temps constant. Le risque est très faible : le secret fait au moins 32 caractères. | Lecture du code |
| 9 | Info | `maps-config` renvoie la clé Google Maps du navigateur : c'est normal, mais elle doit être **limitée au domaine** dans Google Cloud. Non vérifié. | Exécution locale |
| 10 | Info | `api/files.zip` : une archive vide oubliée dans `api/`. Elle est à retirer. | `unzip -l` |

**Bon :**
- la RLS est active sur `profiles` : l'affirmation des notes est **infirmée**, au moins pour les visiteurs non connectés ;
- `kyc-documents` et `delivery-proofs` sont fermés ;
- les routes admin refusent un membre simple ;
- le webhook Stripe vérifie bien la signature ;
- aucun secret n'est dans le dépôt ni dans l'historique.

---

## 1. Base de données avec la clé publique (anon)

La clé testée est celle que le site charge (`js/supabase-config.js`). Elle donne le rôle `anon` sur le projet `miqrircrfpzkmvvacgwt`.

### Lecture : 91 tables et vues

- **11** donnent des lignes ; **61** répondent 200 avec 0 ligne (la RLS filtre) ; **19** refusent (pas de droit).
- **Les tables prioritaires** :

| Table | Lignes lues sans connexion / total | Insertion | Modification |
|---|---|---|---|
| `profiles` | **0 / 25** | bloquée (RLS) | bloquée |
| `transactions` | 0 / 24 | bloquée (droits) | bloquée (droits) |
| `livraisons` | refusé (droits) | bloquée (droits) | bloquée (droits) |
| `ride_bookings` | 0 / 8 | bloquée (RLS) | bloquée |
| `kyc_submissions` | 0 / 4 | bloquée (RLS) | bloquée |
| `safe_meeting_points` | **356 / 356** (adresse, coordonnées, source) | bloquée (RLS) | bloquée |
| `rides` | 6 / 18 (les trajets publiés seulement, comme prévu) | bloquée (RLS) | bloquée |
| `promo_codes` | **2 / 2, code compris** | bloquée (droits) | bloquée (droits) |
| `stripe_connect_accounts` | 0 / 1 | — | — |
| `v_user_fiabilite`, `v_driver_scores`, `v_livreur_balance` | refusé (droits) | — | — |

- **Les autres tables lisibles** : `badges` 19/21, `cov_badges` 16, `cov_missions` 12, `zones` 6, `modules` 4/6, `ride_driver_profiles` 4/4, `reviews` 1, `v_protection_fund_balance` 1. Ce sont surtout des données de catalogue.

### Écriture : 82 tables

Méthode : une insertion, et une modification d'une ligne existante, avec `id = null` et toutes les colonnes obligatoires à `null`. Une telle requête ne peut **jamais** réussir, et la base répond :
- « row-level security » ou « permission denied » si l'écriture est **bloquée** ;
- « not null » si la RLS l'aurait **laissée passer**.

Aucun déclencheur ne s'exécute avant une insertion ; ceux qui s'exécutent avant une modification sont annulés avec la requête.

Résultats :
- **Insertion** : 80 tables bloquées. `ride_search_logs` est **ouverte** (constat 4). Pour `meta_inbound_events`, une seconde requête sans `id` est bloquée.
- **Modification** : 31 tables testées sur une ligne réelle, toutes bloquées (26 où la RLS ne laisse atteindre aucune ligne, 5 où le rôle n'a pas les droits).
- **Suppression** : **pas testée**. Il n'existe pas de requête de suppression sûre à 100 %.

## 2. Stockage

| Bucket | Type | Lister sans connexion | Ouvrir un fichier sans connexion |
|---|---|---|---|
| `kyc-documents` | privé | refusé (0) | **0 / 6** |
| `delivery-proofs` | privé | refusé (0) | **0 / 1** |
| `profile-photos` | public | refusé (0) | 9 / 9 (si on connaît le chemin) |

La liste des buckets est vide pour un visiteur non connecté.

## 3. Endpoints

**`api/platform.js`** : ses 184 routes ont été exécutées **sur le Mac**, avec une fausse base et sans aucun appel à la production, une fois sans connexion et une fois comme membre simple.
- **Répondent sans connexion (19)** : `active-drivers-count`, `impact-public`, `public-impact-stats`, `member-count`, `organismes-list`, `og-trajet`, `og-trajet-image`, `livreur-card-public`, `maps-config`, `platform-settings-get`, `price-estimate`, `ride-active-cities`, `ride-search`, `ride-settings`, `safe-meeting-points`, `stripe-public-config`, `turnstile-config`, `platform-claim-free` et `impact-feedback`.
  - `platform-claim-free` ne fait qu'une lecture : la fonction compte des jours, elle n'écrit rien.
  - `impact-feedback` est le seul à écrire sans connexion (constat 5).
- **Membre simple :** aucune route admin, de capture, de remboursement ou de changement de rôle ne répond. Seule `user-data-delete-request` répond, et c'est sa propre demande : c'est normal.

**Autres fichiers** (lecture du code) :
- **`stripe-webhook.js`** : la signature est vérifiée (HMAC-SHA256, comparaison en temps constant, 5 minutes de tolérance). Si elle est invalide, la réponse est 400 et rien n'est traité.
- **`cron-cleanup.js`** : il faut le secret (au moins 32 caractères), sinon la réponse est 401 ou 503 (constat 8).
- **`capture-livraison.js`** : il faut une session (expéditeur ou admin) **ou** le code destinataire. Ce code fait 6 chiffres, il est haché avec l'identifiant de la livraison, et **il n'y a aucune limite d'essais** (constat 1). La seule vérification est une longueur minimale de 6.
- **`paiement-livraison.js`, `cancel-livraison.js`, `matching.js`, `qr-livraison.js`, `webauthn.js`** : la session est exigée avant tout, puis le rôle ou la propriété est vérifié.
- **`stripe.js`** : ancien point d'entrée, il répond toujours 410 (bloqué).
- **`notifier.js`** : le secret interne est exigé pour les types sensibles.

## 4. Secrets : dépôt actuel et 623 commits de l'historique

- **Aucune** des clés suivantes n'a été trouvée :
  - clé de service Supabase (JWT `service_role`), `sk_live_`, `sk_test_`, `rk_live_`, `whsec_` ;
  - Resend, SendGrid, Twilio, jeton GitHub, jeton Supabase (`sbp_`, `sb_secret_`) ;
  - clé privée, URL `postgresql://` avec mot de passe.
- **Seule présente :** la clé publique `anon`, normale, dans 14 fichiers (dont des copies dans `save/` et `_archived/`).
- **Motif « mot de passe »** : 114 résultats, dont 108 sont du code (`password: input.value`, etc.). Les 6 autres sont des valeurs factices de test ou l'expression `!!whSecret`.
- **Fichiers** : aucun `.env`, aucune clé ni aucun dump n'a jamais été commité. Le `.gitignore` couvre `.env*`.

## Ce qui n'a pas été fait

- Pas de test avec un **compte membre connecté** (constat 3). C'est le test le plus important qui reste.
- Pas de test des **suppressions**.
- Les règles RLS n'ont pas été lues directement (`pg_policies`) : il faudrait un accès SQL, que Denis n'a plus sur l'ancien projet.
- Ton message s'arrêtait au point 4 (« les mots de passe et … »). La suite de l'audit (bugs, etc.) attend tes instructions.

## Corrections proposées (rien n'est fait)

1. **Capture par code** : limiter à 5 essais par livraison et 20 par adresse IP et par heure, avec le limiteur `checkRateLimit` existant. Après 5 échecs, bloquer et alerter l'admin.
2. **`promo_codes`** : retirer la lecture publique de la table, ou seulement de la colonne `code`, et vérifier les codes côté serveur. Cela demande une migration RLS, sur prod-v2.
3. **`ride_search_logs`** : retirer l'insertion pour `anon` (le serveur journalise déjà avec la clé de service). C'est aussi une migration RLS.
4. **Test avec un compte membre de test** : sur prod-v2 de préférence, ou avec l'accord de Denis sur un compte jetable.
5. Retirer `api/files.zip` ; vérifier la limite de domaine de la clé Google Maps (côté Denis).
