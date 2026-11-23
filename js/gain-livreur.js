/* js/gain-livreur.js — Gain du livreur affiché, avec EXACTEMENT la règle du paiement réel
   (copie de lib/_gain-livreur.js ; un test vérifie que les deux restent identiques).
   PAPGain.cents(montantCents, {fidelitePct, sauvetagePct}) ; PAPGain.texte(prixDollars, opts) -> « 6,00 $ » */
(function () {
  'use strict';
  if (window.PAPGain) return;
  var PART_LIVREUR_PCT = 60;
  var BONUS_FIDELITE_MAX = 10;

  function cents(montantCents, opts) {
    opts = opts || {};
    var brut = Math.max(0, Math.round(Number(montantCents) || 0));
    var fidelite = Math.min(BONUS_FIDELITE_MAX, Math.max(0, Number(opts.fidelitePct) || 0));
    var pct = PART_LIVREUR_PCT + fidelite;
    var base = Math.floor(brut * (pct / 100));
    var sauvetage = Math.max(0, Number(opts.sauvetagePct) || 0);
    var bonus = sauvetage > 0 ? Math.floor(base * (sauvetage / 100)) : 0;
    var net = base + bonus;
    return { pct: pct, baseCents: base, bonusCents: bonus, netCents: net, plateformeCents: brut - net };
  }

  // Primes de protection (copie de js/repartition.js ; un test vérifie l'égalité) : la prime va au fonds
  // de protection, hors des 60 % du livreur.
  var PRIMES_PROTECTION_CENTS = { none: 0, base: 100, standard: 299, plus: 599 };
  function texte(prixDollars, opts) {
    opts = opts || {};
    var total = Math.round((Number(prixDollars) || 0) * 100);
    var prime = Math.min(total, PRIMES_PROTECTION_CENTS[String(opts.planProtection || 'none').toLowerCase()] || 0);
    var g = cents(total - prime, opts);
    return (g.netCents / 100).toFixed(2).replace('.', ',') + ' $';
  }

  window.PAPGain = { cents: cents, texte: texte, PART_LIVREUR_PCT: PART_LIVREUR_PCT, PRIMES_PROTECTION_CENTS: PRIMES_PROTECTION_CENTS };
})();
