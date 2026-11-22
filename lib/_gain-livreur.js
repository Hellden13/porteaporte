// lib/_gain-livreur.js — LA règle du gain du livreur (livraison), utilisée par le paiement réel
// (api/capture-livraison.js) et recopiée telle quelle dans js/gain-livreur.js pour l'affichage.
// Un test vérifie que les deux donnent toujours le même résultat.
//   Gain = 60 % du montant payé + bonus fidélité (0 à 10 points de %) ; sauvetage : + X % de ce gain.
'use strict';

const PART_LIVREUR_PCT = 60;
const BONUS_FIDELITE_MAX = 10;

function gainLivreurCents(montantCents, { fidelitePct = 0, sauvetagePct = 0 } = {}) {
  const brut = Math.max(0, Math.round(Number(montantCents) || 0));
  const fidelite = Math.min(BONUS_FIDELITE_MAX, Math.max(0, Number(fidelitePct) || 0));
  const pct = PART_LIVREUR_PCT + fidelite;
  const base = Math.floor(brut * (pct / 100));
  const sauvetage = Math.max(0, Number(sauvetagePct) || 0);
  const bonus = sauvetage > 0 ? Math.floor(base * (sauvetage / 100)) : 0;
  const net = base + bonus;
  return { pct, baseCents: base, bonusCents: bonus, netCents: net, plateformeCents: brut - net };
}

module.exports = { gainLivreurCents, PART_LIVREUR_PCT, BONUS_FIDELITE_MAX };
