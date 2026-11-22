/* js/repartition.js — LA répartition réelle de chaque dollar payé (livraison et covoiturage).
   Même fichier pour le serveur (require) et le navigateur (window.PAPRepartition) :
   le paiement réel, le journal, l'admin et la page Transparence lisent tous ce calcul.

   Livraison (règle de Denis, option B, 22 nov. 2026) :
     1. Le livreur touche 60 % du prix total (+ bonus fidélité 0 à 10 points, + bonus sauvetage),
        calculé sur le prix AVANT rabais : un code promo est payé par la plateforme, jamais par le livreur.
     2. Les frais Stripe réels (lus sur Stripe à la capture ; sinon estimés 2,9 % + 0,30 $) sont payés
        par la plateforme.
     3. Ce qui reste à la plateforme est partagé entre les postes de « Paramètres financiers »
        (protection colis, fonds d'urgence, communauté…) au prorata de leurs pourcentages.
     4. Si le reste est négatif (gros rabais), PorteàPorte paie la différence (ligne « deficit »).
   Covoiturage :
     Le conducteur touche exactement son montant (partage des frais). Les frais de service payés
     par le passager paient d'abord Stripe ; le reste est partagé selon la redistribution covoiturage.

   Tous les montants sont en cents entiers. La somme des lignes égale toujours le montant payé, au cent près. */
(function (root) {
  'use strict';

  var PART_LIVREUR_PCT = 60;
  var BONUS_FIDELITE_MAX = 10;
  var STRIPE_POURCENT = 2.9;   // Stripe Canada, cartes canadiennes (tarif standard)
  var STRIPE_FIXE_CENTS = 30;

  var POSTES_LIVRAISON = [
    { key: 'pct_protection', poste: 'protection', label: 'Protection colis' },
    { key: 'pct_urgence', poste: 'urgence', label: 'Fonds d’urgence' },
    { key: 'pct_communaute', poste: 'communaute', label: 'Communauté (organismes d’ici)' },
    { key: 'pct_developpement', poste: 'developpement', label: 'Infrastructure & développement' },
    { key: 'pct_marketing', poste: 'marketing', label: 'Marketing & croissance' },
    { key: 'pct_operations', poste: 'operations', label: 'Opérations' },
    { key: 'pct_profit', poste: 'profit', label: 'Réserve / pérennité' }
  ];

  var DEFAUTS = {
    pct_livreur: 60, pct_stripe: 7, pct_developpement: 5, pct_protection: 10, pct_urgence: 6,
    pct_communaute: 5, pct_profit: 7, pct_marketing: 0, pct_operations: 0
  };

  function cents(v) { var n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; }
  function nombre(v, d) { var n = Number(v); return Number.isFinite(n) ? n : d; }

  // Frais Stripe estimés (quand Stripe ne les a pas encore donnés).
  function fraisStripeEstimes(montantCents) {
    var m = Math.max(0, cents(montantCents));
    if (!m) return 0;
    return Math.min(m, Math.round(m * STRIPE_POURCENT / 100) + STRIPE_FIXE_CENTS);
  }

  // Partage un montant entier selon des poids (méthode du plus grand reste) : somme exacte.
  function partager(totalCents, poids) {
    var total = Math.max(0, cents(totalCents));
    var somme = poids.reduce(function (s, p) { return s + Math.max(0, Number(p.poids) || 0); }, 0);
    if (!total || somme <= 0) return poids.map(function (p) { return Object.assign({}, p, { cents: 0 }); });
    var bruts = poids.map(function (p, i) {
      var exact = total * Math.max(0, Number(p.poids) || 0) / somme;
      return { i: i, base: Math.floor(exact), reste: exact - Math.floor(exact) };
    });
    var distribue = bruts.reduce(function (s, b) { return s + b.base; }, 0);
    var ordre = bruts.slice().sort(function (a, b) { return b.reste - a.reste || a.i - b.i; });
    for (var k = 0; distribue < total; k++, distribue++) ordre[k % ordre.length].base += 1;
    return poids.map(function (p, i) { return Object.assign({}, p, { cents: bruts[i].base }); });
  }

  // Si tous les postes sont à 0 %, le reste n'est pas perdu : il reste à la plateforme, non réparti.
  function ajouterNonReparti(lignes, reste) {
    if (!(reste > 0)) return;
    var dejaPartage = lignes.slice(2).reduce(function (t, l) { return t + l.cents; }, 0);
    if (dejaPartage < reste) lignes.push({ poste: 'non_reparti', label: 'Plateforme (non réparti)', cents: reste - dejaPartage, detail: 'aucun poste n’a de pourcentage' });
  }

  function gainLivreurCents(montantCents, opts) {
    opts = opts || {};
    var brut = Math.max(0, cents(montantCents));
    var fidelite = Math.min(BONUS_FIDELITE_MAX, Math.max(0, Number(opts.fidelitePct) || 0));
    var pct = PART_LIVREUR_PCT + fidelite;
    var base = Math.floor(brut * (pct / 100));
    var sauvetage = Math.max(0, Number(opts.sauvetagePct) || 0);
    var bonus = sauvetage > 0 ? Math.floor(base * (sauvetage / 100)) : 0;
    return { pct: pct, baseCents: base, bonusCents: bonus, netCents: base + bonus, plateformeCents: brut - base - bonus };
  }

  /* Livraison.
     montantPayeCents : ce que Stripe a réellement encaissé.
     rabaisCents : rabais d'un code promo (payé par la plateforme).
     fraisStripeCents : frais réels Stripe (null = estimés). */
  function repartitionLivraison(o) {
    o = o || {};
    var paye = Math.max(0, cents(o.montantPayeCents));
    var rabais = Math.max(0, cents(o.rabaisCents));
    var reglages = o.settings || {};
    var prixAvantRabais = paye + rabais;
    var gain = gainLivreurCents(prixAvantRabais, { fidelitePct: o.fidelitePct, sauvetagePct: o.sauvetagePct });
    var stripeReel = o.fraisStripeCents != null && Number.isFinite(Number(o.fraisStripeCents));
    var stripe = stripeReel ? Math.max(0, cents(o.fraisStripeCents)) : fraisStripeEstimes(paye);
    var reste = paye - gain.netCents - stripe;
    var postes = partager(Math.max(0, reste), POSTES_LIVRAISON.map(function (p) {
      return { poste: p.poste, label: p.label, cle: p.key, poids: Math.max(0, nombre(reglages[p.key], DEFAUTS[p.key])) };
    }));
    var lignes = [
      { poste: 'livreur', label: 'Livreur', cents: gain.netCents,
        detail: gain.pct + ' % du prix total' + (gain.bonusCents ? ' + bonus sauvetage' : '') + (rabais ? ' (calculé avant le rabais)' : '') },
      { poste: 'stripe', label: 'Frais Stripe', cents: stripe, detail: stripeReel ? 'frais réels Stripe' : 'estimés : 2,9 % + 0,30 $' }
    ].concat(postes.map(function (p) { return { poste: p.poste, label: p.label, cents: p.cents, detail: 'part du reste plateforme' }; }));
    ajouterNonReparti(lignes, reste);
    var deficit = reste < 0 ? -reste : 0;
    if (deficit) lignes.push({ poste: 'deficit', label: 'Payé par PorteàPorte (rabais)', cents: -deficit, detail: 'la plateforme couvre la différence' });
    return {
      sorte: 'livraison', montantPayeCents: paye, rabaisCents: rabais, prixAvantRabaisCents: prixAvantRabais,
      livreurCents: gain.netCents, livreurPct: gain.pct, fraisStripeCents: stripe, fraisStripeReels: stripeReel,
      restePlateformeCents: Math.max(0, reste), deficitCents: deficit, lignes: lignes,
      total: lignes.reduce(function (s, l) { return s + l.cents; }, 0)
    };
  }

  /* Covoiturage : montantPayeCents = total payé par le passager ; conducteurCents = driver_amount. */
  function repartitionTrajet(o) {
    o = o || {};
    var paye = Math.max(0, cents(o.montantPayeCents));
    var conducteur = Math.min(paye, Math.max(0, cents(o.conducteurCents)));
    var stripeReel = o.fraisStripeCents != null && Number.isFinite(Number(o.fraisStripeCents));
    var stripe = stripeReel ? Math.max(0, cents(o.fraisStripeCents)) : fraisStripeEstimes(paye);
    var reste = paye - conducteur - stripe;
    var redistribution = Array.isArray(o.redistribution) && o.redistribution.length ? o.redistribution : [{ key: 'operations', label: 'Frais & opérations', pct: 100 }];
    var postes = partager(Math.max(0, reste), redistribution.map(function (p) {
      return { poste: String(p.key || p.label || 'poste'), label: p.label || p.key, poids: Math.max(0, Number(p.pct) || 0) };
    }));
    var lignes = [
      { poste: 'conducteur', label: 'Conducteur', cents: conducteur, detail: 'partage des frais du trajet' },
      { poste: 'stripe', label: 'Frais Stripe', cents: stripe, detail: stripeReel ? 'frais réels Stripe' : 'estimés : 2,9 % + 0,30 $' }
    ].concat(postes.map(function (p) { return { poste: p.poste, label: p.label, cents: p.cents, detail: 'part des frais de service' }; }));
    ajouterNonReparti(lignes, reste);
    var deficit = reste < 0 ? -reste : 0;
    if (deficit) lignes.push({ poste: 'deficit', label: 'Payé par PorteàPorte', cents: -deficit, detail: 'les frais de service ne couvrent pas Stripe' });
    return {
      sorte: 'covoiturage', montantPayeCents: paye, conducteurCents: conducteur, fraisStripeCents: stripe, fraisStripeReels: stripeReel,
      restePlateformeCents: Math.max(0, reste), deficitCents: deficit, lignes: lignes,
      total: lignes.reduce(function (s, l) { return s + l.cents; }, 0)
    };
  }

  // Les pourcentages des Paramètres financiers doivent faire 100 % et garder la part livreur à 60 %.
  function validerParametres(s) {
    var erreurs = [];
    var livreur = nombre(s && s.pct_livreur, DEFAUTS.pct_livreur);
    if (livreur !== PART_LIVREUR_PCT) erreurs.push('La part du livreur est fixée à ' + PART_LIVREUR_PCT + ' % du prix total (règle de paiement).');
    var total = ['pct_livreur', 'pct_stripe'].concat(POSTES_LIVRAISON.map(function (p) { return p.key; }))
      .reduce(function (t, k) { return t + Math.max(0, nombre(s && s[k], DEFAUTS[k])); }, 0);
    if (Math.abs(total - 100) > 0.001) erreurs.push('Le total des pourcentages doit faire 100 % (actuellement ' + (Math.round(total * 100) / 100) + ' %).');
    ['pct_stripe'].concat(POSTES_LIVRAISON.map(function (p) { return p.key; })).forEach(function (k) {
      if (s && s[k] != null && !(Number(s[k]) >= 0)) erreurs.push(k + ' doit être un nombre positif.');
    });
    return { ok: erreurs.length === 0, erreurs: erreurs, total: total };
  }

  // Redistribution des frais de service du covoiturage (impact_settings.ride_redistribution).
  var REDISTRIBUTION_TRAJET_DEFAUT = [
    { key: 'operations', label: 'Frais & opérations', emoji: '⚙️', pct: 30 },
    { key: 'securite', label: 'Fond de sécurité', emoji: '🛡️', pct: 35 },
    { key: 'dons', label: 'Dons organismes', emoji: '❤️', pct: 25 },
    { key: 'developpeur', label: 'Développeur', emoji: '💻', pct: 10 }
  ];
  function normaliserRedistribution(input) {
    var arr = input;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (_) { arr = null; } }
    if (!Array.isArray(arr) || !arr.length) return REDISTRIBUTION_TRAJET_DEFAUT.slice();
    var propre = [];
    arr.forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      var label = String(raw.label || '').trim().slice(0, 60);
      if (!label) return;
      var key = String(raw.key || label.toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 40) || ('poste_' + (propre.length + 1));
      var pct = Math.max(0, Math.min(100, nombre(raw.pct, 0)));
      propre.push({ key: key, label: label, emoji: String(raw.emoji || '•').slice(0, 4), pct: pct });
    });
    return propre.length ? propre : REDISTRIBUTION_TRAJET_DEFAUT.slice();
  }

  // Prix minimum TOTAL d'une livraison (ce que l'expéditeur paie au minimum) : le minimum de la
  // livraison + les frais de service (15 %, au moins 2 $), comme le calcul du formulaire.
  // Les options (protection, priorité, colis en plus) s'ajoutent par-dessus.
  function fraisServiceLivraison(baseDollars) {
    var b = Math.max(0, Number(baseDollars) || 0);
    return b > 0 ? Math.max(2, b * 0.15) : 0;
  }
  function prixMinimumTotal(minBaseDollars) {
    var b = Math.max(0, Number(minBaseDollars) || 0);
    return Math.round((b + fraisServiceLivraison(b)) * 100) / 100;
  }

  function dollars(c) {
    var v = (Number(c) || 0) / 100;
    return v.toFixed(2).replace('.', ',') + ' $';
  }

  var api = {
    PART_LIVREUR_PCT: PART_LIVREUR_PCT, BONUS_FIDELITE_MAX: BONUS_FIDELITE_MAX,
    STRIPE_POURCENT: STRIPE_POURCENT, STRIPE_FIXE_CENTS: STRIPE_FIXE_CENTS, POSTES_LIVRAISON: POSTES_LIVRAISON,
    fraisStripeEstimes: fraisStripeEstimes, partager: partager, gainLivreurCents: gainLivreurCents,
    repartitionLivraison: repartitionLivraison, repartitionTrajet: repartitionTrajet,
    validerParametres: validerParametres, dollars: dollars,
    fraisServiceLivraison: fraisServiceLivraison, prixMinimumTotal: prixMinimumTotal,
    REDISTRIBUTION_TRAJET_DEFAUT: REDISTRIBUTION_TRAJET_DEFAUT, normaliserRedistribution: normaliserRedistribution
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PAPRepartition = api;
})(typeof window !== 'undefined' ? window : globalThis);
