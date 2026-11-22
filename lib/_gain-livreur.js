// lib/_gain-livreur.js — LA règle du gain du livreur (livraison), utilisée par le paiement réel
// (api/capture-livraison.js). Elle vit dans js/repartition.js (même fichier pour le serveur et
// le navigateur) ; js/gain-livreur.js en est une copie pour l'affichage, un test vérifie l'égalité.
//   Gain = 60 % du prix total + bonus fidélité (0 à 10 points de %) ; sauvetage : + X % de ce gain.
'use strict';

const { gainLivreurCents, PART_LIVREUR_PCT, BONUS_FIDELITE_MAX } = require('../js/repartition');

module.exports = { gainLivreurCents, PART_LIVREUR_PCT, BONUS_FIDELITE_MAX };
