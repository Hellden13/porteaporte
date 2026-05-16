# PorteàPorte - Instructions de Déploiement 🚀

## 📋 Fichiers à télécharger

Télécharge ces 3 fichiers depuis la session Claude:
- ✅ `index.html` - Page d'accueil avec comparateur de prix
- ✅ `map.html` - Carte interactive avec colis en temps réel
- ✅ `porteaporte-pricing-analysis.xlsx` - Analyse pricing complète

## 📂 Dossier de déploiement

**Chemin**: `C:\Users\User\OneDrive\Desktop\Site\`

Place les fichiers **index.html** et **map.html** dans ce dossier.

⚠️ **IMPORTANT**: Assure-toi que tu as TOUS les fichiers du Site avant de déployer! Sinon Vercel va supprimer les fichiers manquants de la production.

## 🌐 Déploiement Vercel

Depuis ton terminal:

```bash
cd "C:\Users\User\OneDrive\Desktop\Site"
npx vercel --prod
```

Puis attends que Vercel déploie. C'est bon quand tu vois:
```
✓ Production: https://porteaporte.site
```

## ✅ Vérifications après déploiement

1. **Page d'accueil** (index.html):
   - [ ] Photos des problèmes visibles (Unsplash)
   - [ ] Widget comparateur fonctionne (tape 20km + 2kg)
   - [ ] Minimap teaser visible
   - [ ] Footer propre (pas de Kit Instagram, pas d'Admin)
   - [ ] Bouton "Connexion" fonctionne

2. **Carte interactive** (map.html):
   - [ ] Clique sur minimap teaser redirige vers map.html
   - [ ] Carte Leaflet affichée (Google Maps teaser au démarrage)
   - [ ] Bouton "Vérifier identité" visible
   - [ ] Biométrique modal fonctionne
   - [ ] Colis apparaissent après vérif biométrique

## 🔧 Code Patterns

### Supabase initialization (CORRECT)
```javascript
var db = window.supabase.createClient(
    'https://miqrircrfpzkmvvacgwt.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
);
```

⚠️ **NE JAMAIS utiliser**: `var supabase = ...` (cause SyntaxError!)

## 📱 Design System

### Couleurs (à utiliser partout)
- **Fond foncé**: `#0A0C0F`
- **Surface**: `#12151A`
- **Bordure**: `#1F242C`
- **Texte principal**: `#E8EAED`
- **Texte secondaire**: `#A0A3A8`
- **Lime (accent)**: `#B8F53E`
- **Cyan (accent)**: `#0BFFCB`
- **Bleu Québec**: `#0051BA`

## 🔒 Sécurité

### Biométrique (implémenté)
- 👆 Empreinte digitale
- 👤 Reconnaissance faciale (Face ID)
- Simulation de vérification (90% success rate)

### À faire plus tard (IMPORTANT!)
- [ ] Vrai intégration WebAuthn API (Web Authentication)
- [ ] Dashboard livreur avec biométrique
- [ ] Système de remboursement/assurance (6% reserve)
- [ ] Limite colis visibles par niveau livreur

## 📊 Pricing Widget

Le widget calcule:
- **Prix PorteàPorte**: distance × 0.15 + poids × 0.25 × 1.12
- **Comparaison UPS/Purolator**: Tarifs réels 2026
- **Économies**: Pourcentage par rapport aux compétiteurs

Exemple:
- Distance: 20km
- Poids: 2kg
- **PorteàPorte**: $3.50
- **UPS**: $12.00
- **Économies**: 71%

## 🗺️ Carte

La carte teaser sur index.html est une Google Maps embed de Québec-Lévis.

En cliquant dessus, l'utilisateur est redirigé vers map.html avec une carte interactive Leaflet.

### Mock Parcels (dans map.html)
5 colis de test avec:
- Localisation (lat/lng)
- Distance du livreur
- Titre et commentaire BD-style
- Zone (Quebec ou Levis)

## 📞 Support

Si tu as des questions ou bugs:
1. Vérifie la console du navigateur (F12 → Console)
2. Regarde les logs de Vercel (https://vercel.com/porteaporte)
3. Teste sur mobile pour voir si responsive fonctionne

---

**Créé**: Mai 2026 | **Version**: 1.0 | **Status**: 🟢 Prêt à déployer
