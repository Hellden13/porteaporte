# ⚠️ CRITICAL - NE JAMAIS ARCHIVER api/platform.js

## Raison
`api/platform.js` est le ROUTEUR CENTRAL de la plateforme.
Il expose ces 6 routes majeures:
- /api/create-livraison
- /api/available-livraisons
- /api/assign-driver
- /api/gps-update
- /api/tracking
- /api/confirm-delivery
- /api/capture-payment

## Si archivé
❌ Toutes les routes ci-dessus retournent 404 silencieux
❌ Frontend ne sait pas pourquoi ça ne marche pas
❌ Production cassée sans erreur visible

## Règle
✅ TOUJOURS garder api/platform.js en production
✅ Refactoriser au besoin, mais NE JAMAIS archiver
✅ Si besoin de cleanup, SPLITTER en plusieurs fichiers
✅ Mais JAMAIS déplacer sans vérifier vercel.json

## Vérification avant tout déploiement
```bash
findstr "platform.js" vercel.json
findstr "capture-livraison.js" vercel.json
# Doivent être en api/, pas _archived/api/
```

## Checklist déploiement
- [ ] platform.js en api/
- [ ] capture-livraison.js en api/
- [ ] Les 6 routes testées (401 sans session)
- [ ] browse-missions.html fonctionne
- [ ] test-modal.html fonctionne
