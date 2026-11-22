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

---

# Partie 2 : corrections et test avec un compte membre (22 novembre 2026)

## Failles corrigées (branche `audit-securite`, rien n'est déployé)

1. **Code destinataire d'une livraison** (`api/capture-livraison.js`) : 5 essais, puis blocage.
   - Le compte des codes faux est tenu dans le journal d'audit existant (`transaction_audit_events`, événement `recipient_code_failed`), **sans migration**.
   - Le blocage est vérifié **avant** la comparaison : même le bon code est refusé après 5 échecs (423).
   - Deux gardes en plus : une garde atomique par livraison, pour les essais envoyés en même temps, et une limite de 20 essais par heure et par adresse IP.
   - Échec fermé : si le journal est illisible, la réponse est 503.
   - Au 5e échec : l'événement `recipient_code_blocked` est écrit au journal et l'admin reçoit une alerte courriel.
   - L'admin peut encore valider la livraison sans code, avec une raison.
2. **Code de sécurité du covoiturage** (`ride-safety-code-verify`) : avant, une alerte partait à 3 essais, **mais rien ne bloquait**, et un bon code au 4e essai ou plus libérait encore le paiement. Maintenant :
   - blocage à 5 essais, vérifié avant la comparaison, avec une garde atomique ;
   - écriture au journal (`ride_safety_code_failed`, `ride_safety_code_blocked`) et alerte à l'admin ;
   - **seul l'admin** peut remettre un code et débloquer : le passager ne peut plus se débloquer lui-même.
3. **Promo et journal des recherches** : le correctif SQL est prêt dans `supabase/prod-v2-plus-tard/20261122120000_rls_promo_codes_search_logs.sql.NE-PAS-APPLIQUER` (pour prod-v2). Il n'est pas appliqué.
4. **Notifications** : `rideNotifierUrl()` visait toujours la production hors de Vercel. Il suit maintenant l'adresse configurée (`PUBLIC_SITE_ORIGIN`).

Tests : 14 nouveaux (`tests/code-essais.test.js`), 13 versions cassées sur 13 attrapées.

## Test avec le compte membre de test (production, autorisé par Denis)

- **Création :** le compte a été créé par l'API admin, courriel confirmé, donc aucun courriel envoyé. La base a créé d'elle-même le profil et une transaction « bonus de bienvenue ».
- **Connexion :** la connexion par mot de passe a été refusée (400), sûrement à cause du captcha. La connexion s'est faite par un lien magique généré par l'admin, sans envoi.
- **Lecture chez les autres :** **0 ligne** dans `profiles`, `ride_bookings`, `transactions`, `livraisons`, `messages`, `kyc_submissions`, `notifications`, `emergency_contacts` et `stripe_connect_accounts`. Le membre voit seulement les mêmes données publiques qu'un visiteur non connecté : points de rencontre, catalogue, trajets publiés, codes promo.
- **Écriture chez les autres :** insertion bloquée sur 84 tables, sauf `liste_attente` et `ride_search_logs` qui sont ouvertes. Modification d'une ligne d'un autre membre : bloquée sur les 34 tables testées.
- **Son propre profil :**
  - changer son rôle en admin, son statut de livreur ou ses PorteCoins est **refusé** ;
  - changer `profiles.email` est **permis**. Un membre peut y mettre l'adresse de quelqu'un d'autre, et les courriels qui lisent `profiles.email` partiraient vers cette adresse. **Nouveau constat, gravité moyenne**, à corriger sur prod-v2 avec un déclencheur.
  - pour `suspendu`, le test n'est pas concluant : la valeur envoyée était la même que l'actuelle.
- **Fonctions :** `cleanup_rate_limits` est refusée (403). Les 4 autres testées (`admin_delete_user`, `accepter_livraison`, `record_driver_litige`, `award_claim_free_milestone`) répondent « introuvable » quand on les appelle sans paramètres : **pas concluant**.
- **Stockage :**
  - lister les fichiers : refusé dans les 3 buckets ;
  - ouvrir les fichiers des autres : `kyc-documents` 0 sur 6, `delivery-proofs` 0 sur 1, `profile-photos` 9 sur 9 (bucket public) ;
  - envoyer un fichier dans le dossier d'un autre : refusé (400) dans les 3 buckets, sans vérification du message exact.
- **Nettoyage :** compte Auth, profil et transaction de bienvenue supprimés. Une vérification de chaque table, sur chaque colonne `id` ou `*_id` et sur le courriel, ne trouve **plus rien**. Le mot de passe était aléatoire, gardé en mémoire seulement, et n'a jamais été affiché.

## Bugs corrigés

1. **`/trajets`** redirige vers `/covoiturage.html` (dans `vercel.json`).
2. **Frais : une seule source de vérité.** `ridePricingConfig()` (dans `lib/_rides.js`) est utilisée par le calcul réel. Elle est publiée par `ride-settings` (champ `pricing`) et lue par le formulaire de publication et par la carte admin « Seuils tarifaires ».
   - La carte admin affichait 0,35 $/km et 10 % écrits en dur et périmés.
   - Ce que le serveur fait vraiment : tarif suggéré par énergie (essence 0,25 $/km, maximum 0,35 $/km), maximum absolu 0,50 $/km, et frais **fixes par place** de 1,50 $ sous 15 $, sinon 3,00 $.
3. **Aller-retour :**
   - à la publication, le retour est créé comme un vrai trajet réservable (villes inversées, heure du retour, ses propres places) ;
   - pour les **4** allers-retours déjà publiés, un bouton admin « ↩️ Créer le retour » fait la même chose, une seule fois. Il ne fait rien si le retour existe déjà, et **c'est Denis qui le lance**.
4. **Admin :** le bouton Supprimer est caché quand le trajet a une réservation payée ou en cours. Il est aussi caché si les réservations n'ont pas pu être lues.
5. **Recherche par date (bug trouvé par les tests de bout en bout) :** le jour était comparé dans le fuseau du serveur. Sur Vercel (UTC), **un trajet après 19 h (heure de l'Est) apparaissait le lendemain**. La comparaison se fait maintenant en heure du Québec.

Tests : 12 nouveaux (`tests/audit-bugs.test.js`), 11 versions cassées sur 11 attrapées.

## Tests de bout en bout (sur le Mac, sans toucher la production)

`npm run test:e2e`, soit 10 étapes :
- pages (recherche, fiche, publication, connexion, tableaux de bord, admin) et `/trajets` ;
- inscription et connexion sur la base Supabase **locale** ;
- publication d'un aller-retour, recherche de l'aller et du retour, fiche du trajet ;
- réservation du retour puis paiement par un **faux Stripe** (capture manuelle autorisée) ;
- tableaux de bord conducteur, passager et admin ;
- refus de supprimer un trajet réservé, refus des routes admin à un membre simple.

Un garde-fou bloque tout appel hors du Mac. Il a d'ailleurs attrapé deux chemins de notification qui visaient la production, corrigés.

**Limite :** ce sont des tests par l'API et le chargement des pages, pas des clics dans un navigateur. Aucune clé Stripe de test n'existe sur le Mac.

**Erreur de ma part :** en nettoyant la base locale, j'ai supprimé 2 comptes `e2e-…` créés le 1er septembre 2026, que j'ai pris pour les miens. C'étaient les 2 seuls comptes de la base **locale** du Mac, une base de test, pas la production.

## Décision à prendre : « 10 premiers trajets sans frais »

Ce que fait le code aujourd'hui :
- **Qui paie :** les frais de plateforme (1,50 $ ou 3,00 $ par place) sont payés par le **passager**, en plus du partage des frais. Le conducteur ne paie jamais de frais.
- **Qui en profite :** « sans frais » veut dire que les passagers des 10 premiers trajets *publiés* par un conducteur ne paient pas ces frais. C'est décidé à la publication, en comptant **tous** ses trajets déjà publiés, y compris les annulés, les supprimés et les tests.
- **Dans la base :** le conducteur qui a 13 trajets avait les trajets 1 à 3 avec frais (publiés avant la franchise), les trajets 4 à 10 sans frais, et les trajets 11 à 13 avec frais. 2 réservations ont payé 1,50 $ : l'une sur son 1er trajet, l'autre sur son 11e.
- **Pourquoi 1,50 $ apparaît :** l'aperçu du formulaire de publication affiche **toujours** 1,50 $ de frais, même quand le trajet sera gratuit. C'est sûrement ce que Denis a vu.
- **Effet de l'aller-retour :** désormais, un aller-retour compte pour 2 trajets dans la franchise.

Options :
- **A.** Garder la règle et corriger seulement l'aperçu : afficher « 0 $ (trajet n° X sur 10 sans frais) ».
- **B.** Ne compter que les trajets réellement faits (terminés avec au moins une réservation payée). Les annulés, supprimés et tests ne consomment plus la franchise.
- **C.** Compter l'aller-retour comme un seul trajet.

**Recommandation : A + B + C.**
