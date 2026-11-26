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

// ── Plan de protection ↔ colonnes de la base actuelle (26 nov. 2026) ─────────────────────────────
// La base de production n'accepte dans assurance_plan que basique / standard / premium / vehicule
// (défaut « basique », jamais vide). Le code parle none / base / standard / plus. Avant ce correctif,
// « base » ou « none » faisaient échouer l'insertion et des colonnes étaient retirées EN SILENCE.
// Écriture : le plan est traduit, et la prime va dans assurance_prix (0 = aucune, 1 = Base, 2,99 = Standard).
// Lecture : planProtectionReel (js/repartition.js), qui préfère le plan noté au journal (« plan_protection »).
const COLONNES_PLAN = { none: ['basique', 0], base: ['basique', 1], standard: ['standard', 2.99], plus: ['premium', 5.99] };
const EVT_PLAN = 'plan_protection';

// Ce que les formulaires envoient : clé (« base »), texte d'option (« Base - 1 $ - … »), prime (« 2.99 »).
function normaliserPlan(valeur) {
  const v = String(valeur == null ? '' : valeur).trim().toLowerCase();
  if (estPlanPlus(v)) return 'plus';
  if (/^(protection\s+)?standard\b/.test(v) || /^2[.,]99\b/.test(v)) return 'standard';
  if (/^(protection\s+)?(base|basique)\b/.test(v) || /^1([.,]0+)?$/.test(v)) return 'base';
  return 'none';
}
function colonnesPlan(plan) {
  const [assurance_plan, assurance_prix] = COLONNES_PLAN[plan] || COLONNES_PLAN.none;
  return { assurance_plan, assurance_prix };
}
// Le plan réel est aussi noté au journal de la livraison (la prime dans assurance_prix reste en secours).
async function noterPlan(ctx, livraisonId, plan, acteurId) {
  if (!ctx?.sbUrl || !livraisonId) return false;
  const { sbHeaders } = require('./_lib');
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ livraison_id: livraisonId, user_id: null, actor_id: acteurId || null, event_type: EVT_PLAN, status: 'note', evidence: { plan } }),
  }).catch(() => ({ ok: false }));
  return Boolean(r.ok);
}
async function lirePlanJournal(ctx, livraisonId) {
  try {
    const { sbHeaders } = require('./_lib');
    const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?livraison_id=eq.${encodeURIComponent(livraisonId)}&event_type=eq.${EVT_PLAN}&select=evidence&order=created_at.asc&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    const e = r.ok ? (await r.json().catch(() => []))[0] : null;
    return e?.evidence?.plan || null;
  } catch (_) { return null; }
}

module.exports = { PROTECTION_PLUS_ACTIVE, PLAFOND_PROTECTION_CAD, estPlanPlus, refusPlanProtection, normaliserPlan, colonnesPlan, noterPlan, lirePlanJournal, EVT_PLAN, COLONNES_PLAN };
