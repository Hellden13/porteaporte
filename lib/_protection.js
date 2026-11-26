'use strict';
// Protection colis — plans offerts (décision de Denis, 26 nov. 2026 : maximum 250 $ pour l'instant).
// Le plan « Plus » (5,99 $, couverture max 1 000 $) est retiré de toutes les pages et refusé à la création.
// Interrupteur : remettre PROTECTION_PLUS_ACTIVE à true (avec l'accord de Denis) le rouvre côté serveur ;
// il faudra aussi remettre l'option dans les pages. Les livraisons existantes en « Plus » ne sont pas touchées
// (leur prime reste dans js/repartition.js).
const PROTECTION_PLUS_ACTIVE = false;
const PLAFOND_PROTECTION_CAD = PROTECTION_PLUS_ACTIVE ? 1000 : 250;

// Reconnaît « Plus » sous toutes ses formes reçues : clé « plus », texte d'option (« Plus - 5,99 $ … »), prime 5.99.
function estPlanPlus(valeur) {
  const v = String(valeur == null ? '' : valeur).trim().toLowerCase();
  if (!v) return false;
  return v === 'plus' || /^(protection\s+)?plus\b/.test(v) || /^5[.,]99\b/.test(v);
}

// null = plan accepté ; sinon { status, body } à renvoyer.
function refusPlanProtection(valeur) {
  if (PROTECTION_PLUS_ACTIVE || !estPlanPlus(valeur)) return null;
  return {
    status: 400,
    body: {
      error: 'La protection « Plus » n’est plus offerte. Choisis Base (jusqu’à 50 $) ou Standard (jusqu’à 250 $).',
      code: 'protection_plus_indisponible',
      plafond_cad: PLAFOND_PROTECTION_CAD,
    },
  };
}

module.exports = { PROTECTION_PLUS_ACTIVE, PLAFOND_PROTECTION_CAD, estPlanPlus, refusPlanProtection };
