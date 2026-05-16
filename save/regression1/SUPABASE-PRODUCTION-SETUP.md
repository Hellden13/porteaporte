# Supabase production

## 1. Executer le schema

Dans Supabase Dashboard > SQL Editor, executer:

```sql
-- contenu de supabase-production-schema.sql
```

Ce fichier cree:

- `profiles`
- `livraisons`
- `transactions`
- `notifications`
- `codes_promo`
- relations entre tables
- indexes
- triggers `updated_at`
- trigger de creation automatique de profil apres signup
- RLS sur toutes les tables
- RPC `ajouter_coins`
- RPC `accepter_livraison`

## 1.1 Activer GPS live

Executer ensuite:

```sql
-- contenu de supabase-gps-realtime.sql
```

Ce fichier cree:

- `delivery_locations`
- relations vers `livraisons` et `profiles`
- policies RLS pour expediteur, livreur et admin
- activation Realtime sur `delivery_locations`

Le suivi GPS live exige une session Supabase authentifiee. Le livreur doit ouvrir:

```text
gps-tracker.html?livraison_id=UUID_DE_LA_LIVRAISON
```

Le client/expediteur peut ouvrir:

```text
suivi-livraison.html?code=PP-XXXXXX
```

ou chercher le code dans la page. Si la session n'a pas acces a la livraison selon RLS, la page conserve le mode demo.

## 2. Creer le premier admin

Apres avoir cree/connecte un compte depuis le site, promouvoir ce compte:

```sql
update public.profiles
set role = 'admin'
where email = 'TON_EMAIL_ADMIN@example.com';
```

Sans ce role, le dashboard admin ne verra que les donnees autorisees par les policies utilisateur.

## 3. Tests rapides

Connecte-toi comme expediteur:

- creation automatique du profil dans `profiles`
- lecture de son propre profil
- creation d'une livraison avec `expediteur_id = auth.uid()`

Connecte-toi comme livreur:

- lecture des livraisons `en_attente` / `publie`
- acceptation via `rpc('accepter_livraison')`
- lecture de ses livraisons `en_route`

Connecte-toi comme admin:

- lecture de tous les profils
- lecture de toutes les livraisons
- lecture des transactions
- creation/edition de codes promo

## 4. Regle de securite

Ne jamais mettre de `service_role` key dans le frontend.

Les actions sensibles doivent rester:

- dans des RPC Supabase `security definer`
- dans des Edge Functions
- dans des routes backend serveur
