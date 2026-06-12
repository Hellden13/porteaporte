# 🔍 AUDIT — Répartition de la commission (cohérence des chiffres)

> But : comprendre **chaque chiffre affiché**, **sa source**, et pourquoi les pages
> ne racontent pas la même histoire. Préalable avant d'unifier en **une seule source de vérité**.

---

## 1. 💰 LA VÉRITÉ : ce qui paie vraiment (source de vérité)

### Livraison — `api/capture-livraison.js`
```js
const basePct = 60 + loyaltyBonus;            // 60 % de base
if (loyaltyBonus > 10) loyaltyBonus = 10;     // bonus fidélité plafonné +10 % → max 70 %
const rescuePct = livraison.rescue_livreur_original ? 20 : 0;  // bonus sauvetage +20 %
const netCents = baseNetCents + bonusCents;   // versé au livreur via Stripe Connect
const feeCents = grossCents - netCents;        // ce que la plateforme garde
```
- **Le livreur reçoit 60 %** (codé en dur), **jusqu'à 70 %** avec `loyalty_bonus_pct`, **+20 %** si sauvetage.
- ⚠️ **Le réglage admin `pct_livreur` n'est PAS lu ici** → le changer dans l'admin ne change pas le vrai paiement.
- ⚠️ Les **40 % restants ne sont PAS sous-répartis** dans le code. La plateforme garde 40 %, point.
  Le détail (« communauté / protection / urgence… ») est **indicatif/affichage**, pas une vraie transaction.

### Covoiturage — `lib/_rides.js`
- `driver_amount` = partage de frais légal (coût ÷ occupants). Mécanisme séparé, non concerné ici.

---

## 2. 📊 LES AFFICHAGES de la répartition des 40 % (le désordre)

| Page | Source des données | Défauts de secours (livreur/comm/protec/urg/dev/mkt/ops/profit) | Libellés |
|---|---|---|---|
| `api/capture-livraison.js` | **réel** | 60 % livreur seulement | — |
| `calculateur-prix.html` | codé en dur `* 0.60` | 60 % livreur seulement | « Livreur québécois (60%) » |
| `admin/dashboard-admin.html` (Tableau 1) | live (impact+platform fusionnés) | **60/5/8/5/5/3/4/10** | « Communauté (Fonds → organismes) », « Profit net » |
| `transparence.html` (Tableau 2) | live (`platform-settings-get`) | **60/5/8/5/5/3/4/10** | « Causes communautaires (Fonds PorteàPorte) », « Pérennité de la plateforme » |
| `admin/fondateur.html` | live (`platform-settings-get`) | 60/5/… (à confirmer) | — |
| `admin/parametres.html` (formulaire d'édition) | live (`platform-settings-get` + `impact-public`) | bornes min/max | « Communauté », « Pérennité de la plateforme » |
| `api/platform.js` → `platformSettingsPublic` | **défauts codés** | **60/5/3/2/4/4.6/13/8.4** ⚠️ | — |
| `api/platform.js` → `impactPublic` | défauts codés | protection 8, profit 10… | — |

### ❌ Incohérences confirmées
1. **Deux jeux de défauts différents** dans le code :
   - Set A (dashboard-admin + transparence) : `60 / 5 / 8 / 5 / 5 / 3 / 4 / 10`
   - Set B (platformSettingsPublic) : `60 / 5 / 3 / 2 / 4 / 4.6 / 13 / 8.4`
2. **Valeurs live observées** (Tableau 1 chez Denis) : `60 / 2 / 8 / 15 / 3 / 2 / 5 / 5`
   → différentes des deux jeux de défauts → la ligne en base a encore d'autres chiffres.
3. **Libellés différents** pour le même poste :
   - « Communauté (Fonds → organismes) » vs « Causes communautaires (Fonds PorteàPorte) »
   - « Profit net » vs « Pérennité de la plateforme »
4. **`pct_livreur` admin ignoré** par le vrai paiement (60 % codé en dur).
5. Le détail des 40 % est **indicatif**, pas une vraie ventilation comptable.

---

## 3. ❓ À CONFIRMER (nécessite une requête lecture seule)

- Les **vraies valeurs sauvegardées** dans `platform_settings.default` ET `impact_settings.default`.
- Où le **`loyalty_bonus_pct`** est-il accordé (quel badge / quelle règle) ?

**Requête lecture seule à coller dans Supabase :**
```sql
select 'platform_settings' as source, pct_livreur, pct_communaute, pct_protection,
       pct_urgence, pct_developpement, pct_marketing, pct_operations, pct_profit
from public.platform_settings where id = 'default';

select 'impact_settings' as source, pct_livreur, pct_plateforme, pct_don,
       pct_securite, pct_assurance
from public.impact_settings where id = 'default';
```

---

## 4. ✅ PLAN D'UNIFICATION (proposé)

1. **Denis fixe la répartition OFFICIELLE des 40 %** (les chiffres assumés publiquement, total = 100 %).
2. **Une seule source de vérité** : la ligne `platform_settings.default`.
3. **Un seul jeu de défauts de secours** partagé (un seul endroit dans le code) — fini les copies divergentes.
4. **Mêmes libellés** partout (un seul vocabulaire).
5. **Honnêteté** : afficher « répartition indicative de notre commission » tant que les 40 % ne sont pas
   réellement ventilés en transactions séparées.
6. (Décision) Rendre `pct_livreur` réellement configurable **ou** retirer le réglage trompeur.
   → Denis a choisi : **garder 60 % de base**, jusqu'à **70 %** via bonus fidélité (badges) + bonus sauvetage.

---

---

## 5. ✅ DÉCISION OFFICIELLE (validée par Denis)

**Répartition officielle (sur le prix) — sécurité d'abord :**
| Poste | % |
|---|---|
| 🚗 Livreur | 60 % (jusqu'à 70 % avec bonus fidélité/sauvetage) |
| 💳 Frais Stripe (réel) | 7 % |
| 🔧 Infra + développement | 5 % |
| 🛡️ Protection + urgence | 16 % |
| 💚 Communauté | 5 % (pour l'instant) |
| 💪 Réserve / pérennité | 7 % |
| **Total** | **100 %** |

**Frais covoiturage — par paliers :** 1,50 $ si trajet < 15 $, sinon 3,00 $.

**Contexte :** le fondateur ne prend **aucun salaire** pour l'instant (emploi ailleurs) →
tout le surplus va à protection / communauté / réserve. Argument de transparence fort.

### À implémenter (mise en cohérence)
1. Une seule source : `platform_settings.default` (DB) + **un seul** jeu de défauts partagé.
2. Mettre ces valeurs comme défauts partout (dashboard-admin, transparence, fondateur,
   parametres, platformSettingsPublic, impactPublic).
3. Mêmes libellés partout.
4. Frais covoiturage par paliers dans `lib/_rides.js` (calcRidePrice) + réglage admin du seuil.
5. Tests + QA avant déploiement.
