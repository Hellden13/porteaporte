// lib/_repartition-journal.js — Ce que chaque paiement capturé finance réellement, écrit au journal.
// À chaque capture (livraison ou covoiturage), une ligne « repartition_capturee » est écrite dans
// transaction_audit_events, une seule fois par paiement, avec chaque poste en cents
// (livreur ou conducteur, frais Stripe réels, protection colis, fonds d'urgence, communauté…).
// La page Transparence additionne ces lignes : elle n'affiche plus d'estimation.
// L'argent des postes reste sur le compte Stripe de PorteàPorte : le journal dit à quoi il est réservé.
'use strict';

const { sbHeaders } = require('./_lib');
const { uneSeuleFois } = require('./_une-fois');
const { repartitionLivraison, repartitionTrajet, repartitionAnnulation } = require('../js/repartition');

const EVT_REPARTITION = 'repartition_capturee';

// Frais Stripe réels d'une charge (balance_transaction.fee). null si Stripe ne répond pas.
async function fraisStripeReels(stripeKey, chargeId) {
  if (!stripeKey || !chargeId) return null;
  try {
    const r = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`, {
      headers: { Authorization: 'Bearer ' + stripeKey },
    });
    if (!r.ok) return null;
    const c = await r.json().catch(() => null);
    const fee = c?.balance_transaction?.fee;
    return Number.isFinite(Number(fee)) ? Math.round(Number(fee)) : null;
  } catch (_) {
    return null;
  }
}

async function lireReglements(ctx) {
  const out = { platform: {}, impact: {} };
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/platform_settings?id=eq.default&select=*&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    if (r.ok) out.platform = (await r.json())[0] || {};
  } catch (_) {}
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_settings?id=eq.default&select=ride_redistribution&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    if (r.ok) out.impact = (await r.json())[0] || {};
  } catch (_) {}
  return out;
}

function lignesCompactes(rep) {
  return rep.lignes.map((l) => ({ poste: l.poste, label: l.label, cents: l.cents }));
}

// Écrit la répartition d'une capture. Une seule fois par (sorte, référence).
async function enregistrerRepartition(ctx, { sorte, refId, livraisonId = null, userId = null, paymentIntent = null, repartition }) {
  if (!repartition || !refId) return { ok: false, raison: 'incomplet' };
  if (repartition.total !== repartition.montantPayeCents) return { ok: false, raison: 'somme_inexacte' };
  const ok = await uneSeuleFois(ctx, `repartition:${sorte}:${refId}`, {
    eventType: EVT_REPARTITION,
    userId,
    livraisonId,
    status: 'enregistre',
    amountCents: repartition.montantPayeCents,
    evidence: {
      sorte,
      ref_id: refId,
      stripe_payment_intent: paymentIntent,
      frais_stripe_reels: repartition.fraisStripeReels,
      rabais_cents: repartition.rabaisCents || 0,
      lignes: lignesCompactes(repartition),
      source: 'lib/_repartition-journal',
    },
  });
  return { ok, raison: ok ? null : 'deja_enregistre_ou_journal_illisible' };
}

// Annulation (livraison ou covoiturage) : remboursement, dédommagement, fonds de sécurité, frais Stripe.
// Une seule fois par (sorte, référence). Si un paiement déjà capturé est remboursé, ses frais Stripe
// sont déjà au journal de la capture : passer fraisStripeCents = 0.
async function enregistrerAnnulation(ctx, { sorte, refId, livraisonId = null, userId = null, paymentIntent = null, totalCents, remboursementCents = 0, dedommagementCents = 0, fondsCents = 0, qui = 'livreur', fraisStripeCents = null }) {
  if (!['annulation_livraison', 'annulation_covoiturage'].includes(sorte)) return { ok: false, raison: 'sorte' };
  if (!(Math.round(Number(totalCents) || 0) > 0)) return { ok: false, raison: 'aucun_montant' };
  const repartition = repartitionAnnulation({ sorte, totalCents, remboursementCents, dedommagementCents, fondsCents, qui, fraisStripeCents });
  return enregistrerRepartition(ctx, { sorte, refId, livraisonId, userId, paymentIntent, repartition });
}

// Additionne le journal : total payé et total par poste (cents), pour la page Transparence.
async function totauxRepartition(ctx, { depuis = null } = {}) {
  const totaux = { paiements: 0, montant_cents: 0, livraison: { paiements: 0, montant_cents: 0 }, covoiturage: { paiements: 0, montant_cents: 0 }, annulation_livraison: { paiements: 0, montant_cents: 0 }, annulation_covoiturage: { paiements: 0, montant_cents: 0 }, postes: {} };
  try {
    let url = `${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${EVT_REPARTITION}&select=amount_cents,evidence,created_at&order=created_at.asc&limit=10000`;
    if (depuis) url += `&created_at=gte.${encodeURIComponent(depuis)}`;
    const r = await fetch(url, { headers: sbHeaders(ctx.sbKey) });
    if (!r.ok) return { ...totaux, lisible: false };
    const rows = await r.json().catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      const ev = row.evidence || {};
      const sorte = ['covoiturage', 'annulation_livraison', 'annulation_covoiturage'].includes(ev.sorte) ? ev.sorte : 'livraison';
      const montant = Math.round(Number(row.amount_cents) || 0);
      // Les annulations ont leurs propres totaux (un remboursement n'est pas un paiement gardé).
      if (sorte === 'livraison' || sorte === 'covoiturage') {
        totaux.paiements += 1;
        totaux.montant_cents += montant;
      }
      const parSorte = totaux[sorte] || (totaux[sorte] = { paiements: 0, montant_cents: 0 });
      parSorte.paiements += 1;
      parSorte.montant_cents += montant;
      for (const l of Array.isArray(ev.lignes) ? ev.lignes : []) {
        const cle = `${sorte}:${l.poste}`;
        const t = totaux.postes[cle] || (totaux.postes[cle] = { sorte, poste: l.poste, label: l.label, cents: 0 });
        t.cents += Math.round(Number(l.cents) || 0);
      }
    }
    return { ...totaux, lisible: true };
  } catch (_) {
    return { ...totaux, lisible: false };
  }
}

module.exports = {
  EVT_REPARTITION, fraisStripeReels, lireReglements, enregistrerRepartition, enregistrerAnnulation, totauxRepartition,
  repartitionLivraison, repartitionTrajet, repartitionAnnulation,
};
