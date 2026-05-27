# Parcours complets a tester - Beta PorteaPorte

Objectif: tester les 4 parcours critiques avec de vrais comptes.

## 1. Parcours expediteur

Compte requis: expediteur avec email confirme.

### Test

- ouvrir `https://porteaporte.site/login.html`;
- se connecter;
- ouvrir le dashboard expediteur;
- creer une livraison simple;
- entrer un destinataire reel ou test controle;
- payer avec Stripe;
- verifier que la livraison apparait dans le dashboard expediteur;
- verifier que le statut est clair;
- verifier que le code destinataire est visible ou envoye;
- attendre l'acceptation livreur;
- suivre le statut;
- verifier reception apres confirmation destinataire ou preuve.

### Resultat attendu

- l'expediteur ne doit pas remplir deux fois les memes infos;
- le montant doit rester coherent entre creation et paiement;
- la livraison doit apparaitre dans le dashboard;
- aucun paiement ne doit etre capture avant confirmation/preuve/regle admin.

## 2. Parcours livreur

Compte requis: livreur avec email confirme et `driver_status = verified`.

### Test

- se connecter comme livreur;
- ouvrir le dashboard livreur;
- verifier le statut livreur;
- voir seulement les missions autorisees;
- verifier que les adresses sensibles sont protegees avant acceptation si applicable;
- accepter une mission;
- verifier que les details complets apparaissent seulement apres acceptation;
- activer GPS ou deposer une preuve;
- marquer livre;
- verifier que le paiement n'est pas libere sans confirmation/preuve/regle valide.

### Resultat attendu

- un livreur non verifie ne voit pas de vrais colis;
- un livreur a pied ou velo ne voit pas des missions illogiques;
- les actions sont claires;
- les preuves de livraison sont conservees.

## 3. Parcours destinataire

Compte requis: aucun compte obligatoire si le lien/code destinataire fonctionne.

### Test

- recevoir le code ou lien de confirmation;
- ouvrir `confirmation-destinataire.html`;
- entrer le code;
- confirmer reception si le colis est recu;
- tester un mauvais code;
- tester une livraison pas encore marquee livree.

### Resultat attendu

- mauvais code refuse;
- livraison non livree refusee;
- bon code + livraison livree permet confirmation;
- la confirmation declenche la suite logique Stripe.

## 4. Parcours admin

Compte requis: admin reel seulement.

### Test

- ouvrir `https://porteaporte.site/admin/login.html`;
- se connecter;
- ouvrir dashboard admin;
- verifier livraisons;
- verifier utilisateurs;
- verifier livreurs en revision;
- verifier demandes support/litiges si disponibles;
- verifier paiements et transactions;
- tester une action prudente: pause/reverification si disponible;
- ne jamais retirer un utilisateur sans raison de test documentee.

### Resultat attendu

- un non-admin ne peut pas entrer;
- admin voit les livraisons recentes;
- admin voit le statut paiement;
- admin peut comprendre ce qui bloque;
- chaque action sensible doit etre explicite et protegee.

## Test de securite minimum

- visiteur non connecte ouvre dashboard livreur: refuse ou redirige;
- livreur non verifie ouvre missions: refuse ou donne message limite;
- expediteur tente dashboard livreur: refuse ou limite;
- livreur tente dashboard admin: refuse;
- admin protege ne peut pas etre retire par erreur;
- paiement capture impossible sans condition valide.
