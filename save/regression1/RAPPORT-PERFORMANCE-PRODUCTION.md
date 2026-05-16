# Rapport performance production - PorteaPorte

Date: 2026-05-08
Site: https://porteaporte.site

## Synthese

Etat performance: acceptable pour MVP statique, pas encore optimise mobile/lighthouse production.

Le site est compose de pages HTML statiques relativement legeres, mais plusieurs pages depassent 45-60 KB HTML, avec beaucoup de CSS/JS inline. Vercel sert automatiquement gzip/brotli, mais la structure actuelle limite le cache long et la reutilisation entre pages.

## Optimisations appliquees

- Cache `/js/*`: `public, max-age=86400, stale-while-revalidate=604800`.
- Cache `/assets/*`: `public, max-age=31536000, immutable`.
- Cache `*.css`: `public, max-age=86400, stale-while-revalidate=604800`.
- Ajout `robots.txt`.
- Ajout `sitemap.xml`.
- Verification syntaxe JS/HTML: OK.

## Plus gros fichiers detectes

- `admin/admin-legacy.html`: 63 KB.
- `notre-histoire.html`: 57 KB.
- `presentation.html`: 57 KB.
- `xp-badges.html`: 55 KB.
- `engagement.html`: 55 KB.
- `unique.html`: 52 KB.
- `contact.html`: 48 KB.
- `livreur.html`: 47 KB.
- `dashboard-livreur.html`: 28 KB.
- `dashboard-expediteur.html`: 25 KB.

## Risques performance

1. CSS/JS inline duplique
Impact: moins bon cache navigateur, parsing repete sur chaque page.
Action: extraire le CSS commun vers `design-system.css` et les scripts communs vers `js/`.

2. Pages legacy/de doublon deployees
Exemples: `admin-dashboard-CORRIGE.html`, `payment-CORRIGE.html`, `dashboard-*-premium.html`, `expediteur-FIXED.html`.
Impact: surface d'audit plus grande, SEO dilue, erreurs possibles si utilisateurs tombent dessus.
Action: confirmer les pages canoniques, puis exclure les doublons via `.vercelignore` ou rediriger.

3. Google Maps charge avec API externe
Fichier: `gps-tracker.html`.
Impact: cout reseau/mobile et risque quota.
Action: charger Maps uniquement sur interaction ou uniquement sur pages tracking necessaires.

4. Beaucoup de `innerHTML`
Impact: cout DOM et risque XSS si donnees non echappees.
Action: echapper les donnees utilisateur ou utiliser `textContent`/creation DOM pour données Supabase.

5. Supabase performance advisors
Constats:
- FKs non indexees sur `evaluations`, `litiges`, `profiles`, tables legacy.
- Policies RLS multiples/permissives.
- Policies avec `auth.uid()` non optimise (`select auth.uid()` recommande).
Action: executer les index dans `supabase-security-hardening.sql`, puis nettoyer les policies legacy.

## Mobile performance

Etat:
- Les pages critiques ont `viewport` correct.
- Le design est majoritairement responsive.
- Risques restants: gros HTML inline, scripts tiers, cartes/GPS.

Actions recommandees:
- Lazy-load Google Maps.
- Reduire les pages marketing longues.
- Ajouter dimensions fixes aux images/assets si ajout d'images futures.
- Tester Lighthouse mobile sur `/`, `/login.html`, `/dashboard-livreur.html`, `/paiement.html`.

## Validation API/performance Vercel

- Nombre de fonctions deployables: 12, dans la limite Hobby.
- `.vercelignore` exclut SQL/MD/tests/fichiers legacy dangereux.
- `api/admin-crud.js` et `api/installer.js` exclus/desactives.
- `/api/stripe-webhook`: fail-closed sans signature.

## Priorites performance

1. Nettoyer/exclure les pages legacy non canoniques.
2. Extraire CSS/JS commun.
3. Optimiser RLS/index Supabase.
4. Lazy-load Maps et scripts tiers.
5. Ajouter monitoring Web Vitals ou Vercel Analytics.
