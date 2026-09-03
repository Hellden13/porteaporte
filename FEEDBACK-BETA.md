# Canal de feedback — Bêta fermée Porte à Porte

Objectif : centraliser les retours des 50 testeurs, sans construire d'outil custom.

## Solution recommandée : Google Forms (gratuit)

Avantages : zéro code, notifications courriel, export CSV/Sheets, lien unique
à mettre dans les messages d'invitation (`INVITATIONS-BETA.md`).

### Structure du formulaire à créer

**Titre :** Retour testeur — Porte à Porte (bêta)
**Description :** Merci de tester Porte à Porte! Ton retour aide à améliorer la
plateforme avant l'ouverture. Aucune question sensible.

**Champs :**

1. Prénom (texte court)
2. Ton rôle testé — *choix multiple* : Expéditeur / Livreur / Les deux / Destinataire
3. Type de retour — *choix multiple* : 🔴 Bug bloquant / 🟠 Problème important /
   🟡 Détail mineur / 💡 Suggestion / 👍 Ce qui a bien fonctionné
4. Sur quelle page / étape? — *texte court* (ex: paiement, inscription, dashboard)
5. Décris ce qui s'est passé — *paragraphe*
6. À quoi tu t'attendais? — *paragraphe* (optionnel)
7. Capture d'écran — *téléversement de fichier* (optionnel)
8. Sur quel appareil? — *choix* : iPhone / Android / Ordinateur
9. Note globale de clarté — *échelle 1 à 5*

### Réglages

- Activer « Recueillir les adresses courriel » : non (garder léger).
- Activer les notifications : Réponses → ⋮ → Recevoir des notifications par courriel.
- Lier à une feuille Google Sheets pour le tri (Réponses → icône Sheets).

## Tri des retours (côté Denis)

Classer chaque entrée selon `BETA-50-QUEBEC-LEVIS.md` :
- **Critique** → corriger le jour même (bloque un parcours).
- **Important** → corriger dans le lot du lendemain.
- **Mineur** → backlog, ne bloque pas la bêta.
- **Suggestion** → geler pendant la bêta (voir `GEL-FONCTIONNALITES-BETA.md`).

## Alternative si tu ne veux pas Google

- **Fallback simple :** un fil de discussion Telegram/Messenger dédié « Bêta
  Porte à Porte » + je consigne moi-même les retours dans `SUIVI-TESTEURS-BETA.csv`.
- Moins structuré, mais zéro friction pour les testeurs.

## Prochaine action

Denis crée le Google Form (5 min) → colle le lien ici et dans `INVITATIONS-BETA.md`
aux emplacements `https://docs.google.com/forms/d/e/1FAIpQLScXaN2ZQUeu7C0EDgqzlcxfaJN65yqoo73YBAT3jIAIXjmHiQ/viewform`.
