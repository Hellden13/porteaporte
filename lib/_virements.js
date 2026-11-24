// lib/_virements.js — Virements des gains livreur et état du compte Stripe Connect (décision de Denis, 23 nov. 2026).
//
// Règles :
//  1. Un virement PAR PAIEMENT SOURCE (PaymentIntent prélevé), jamais plus que la charge moins ce qui a déjà
//     été versé sur ce paiement ; clé anti-doublon par groupe. Un gain passe « versé » seulement si SON virement
//     a réussi.
//  2. Le solde ne compte que les gains liés à un paiement réellement prélevé (stripe_payment_intent présent).
//     Les gains sans paiement restent visibles « à vérifier par l'admin » et ne sont jamais versés ici.
//  3. La table stripe_connect_accounts n'a que : id, user_id, stripe_account_id, status, country, created_at,
//     updated_at. On n'écrit QUE status (+ updated_at) ; l'état réel des virements se lit chez Stripe.
'use strict';

const crypto = require('crypto');

const COLONNES_CONNECT = ['id', 'user_id', 'stripe_account_id', 'status', 'country', 'created_at', 'updated_at'];

function entetes(sbKey, prefer) {
  const h = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  return h;
}

// Statut local déduit de l'état Stripe du compte.
function statutDepuisStripe(acct) {
  if (!acct) return null;
  if (acct.payouts_enabled && acct.details_submitted) return 'active';
  if (acct.details_submitted) return 'onboarding';
  return 'pending';
}

async function lireCompteStripe(stripeKey, accountId) {
  const r = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`, {
    headers: { Authorization: 'Bearer ' + stripeKey },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((d && d.error && d.error.message) || `Stripe ${r.status}`);
    e.code = d && d.error && d.error.code;
    throw e;
  }
  return d;
}

// Écrit le statut seulement (jamais de colonne inexistante). Retourne true si la base a accepté.
async function ecrireStatutConnect(ctx, filtre, statut) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/stripe_connect_accounts?${filtre}`, {
    method: 'PATCH',
    headers: entetes(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ status: statut, updated_at: new Date().toISOString() }),
  }).catch(() => null);
  if (!r || !r.ok) console.error('[connect] statut non écrit', filtre, r && r.status);
  return !!(r && r.ok);
}

// État Connect d'un livreur/conducteur, pour TOUS les comptes : lit la ligne locale ; si elle n'est pas « active »,
// vérifie chez Stripe et resynchronise le statut. Retourne { compte, actif, statut, stripe }.
async function etatConnect(ctx, userId, opts = {}) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${encodeURIComponent(userId)}&select=stripe_account_id,status&limit=1`, {
    headers: entetes(ctx.sbKey),
  });
  if (!r.ok) throw new Error('lecture compte Connect impossible (' + r.status + ')');
  const compte = (await r.json())[0] || null;
  if (!compte || !compte.stripe_account_id) return { compte: null, actif: false, statut: 'absent', stripe: null };
  let statut = compte.status;
  let stripe = null;
  if ((statut !== 'active' || opts.toujoursVerifier) && ctx.stripeKey) {
    stripe = await lireCompteStripe(ctx.stripeKey, compte.stripe_account_id);
    const nouveau = statutDepuisStripe(stripe);
    if (nouveau && nouveau !== statut) {
      await ecrireStatutConnect(ctx, `user_id=eq.${encodeURIComponent(userId)}`, nouveau);
      statut = nouveau;
    }
  }
  const actif = stripe ? !!stripe.payouts_enabled && statut === 'active' : statut === 'active';
  return { compte, actif, statut, stripe };
}

// Règle 2 : gains qui comptent dans le solde versable.
function estVersable(g, maintenant = new Date()) {
  return g && g.status === 'available'
    && !!g.stripe_payment_intent
    && (!g.available_after || new Date(g.available_after) <= maintenant);
}

const cents = (x) => Math.round((Number(x) || 0) * 100);

// Résumé du portefeuille, calculé à partir des gains (et non de la vue qui additionne aussi les gains sans paiement).
function soldeLivreur(gains, maintenant = new Date()) {
  let dispo = 0, attente = 0, verse = 0, aVerifier = 0, total = 0;
  for (const g of gains || []) {
    const c = cents(g.net_amount);
    if (g.status === 'failed') continue;
    total += c;
    if (g.status === 'transferred') verse += c;
    else if (g.status === 'pending') attente += c;
    else if (g.status === 'available') {
      if (!g.stripe_payment_intent) aVerifier += c;
      else if (estVersable(g, maintenant)) dispo += c;
      else attente += c;
    }
  }
  return { available: dispo / 100, pending: attente / 100, transferred: verse / 100, a_verifier: aVerifier / 100, total_earned: total / 100 };
}

// Groupes par paiement source : [{ pi, ids, cents }]
function grouperParPaiement(gains) {
  const m = new Map();
  for (const g of gains) {
    const k = g.stripe_payment_intent;
    if (!m.has(k)) m.set(k, { pi: k, ids: [], cents: 0 });
    const grp = m.get(k);
    grp.ids.push(g.id);
    grp.cents += cents(g.net_amount);
  }
  for (const grp of m.values()) grp.ids.sort();
  return [...m.values()].sort((a, b) => (a.pi < b.pi ? -1 : 1));
}

// Règle 1 : décide pour chaque groupe. infos[pi] = { statut, chargeId, chargeCents, dejaVerseCents }.
function planVirements(groupes, infos) {
  const versables = [], ecartes = [];
  for (const g of groupes) {
    const i = infos[g.pi];
    if (!i) { ecartes.push({ pi: g.pi, cents: g.cents, raison: 'paiement_illisible' }); continue; }
    if (i.statut !== 'succeeded') { ecartes.push({ pi: g.pi, cents: g.cents, raison: 'paiement_non_preleve' }); continue; }
    if (!i.chargeId) { ecartes.push({ pi: g.pi, cents: g.cents, raison: 'charge_introuvable' }); continue; }
    const reste = (i.chargeCents || 0) - (i.dejaVerseCents || 0);
    if (!(g.cents > 0) || g.cents > reste) { ecartes.push({ pi: g.pi, cents: g.cents, raison: 'depasse_la_charge', reste }); continue; }
    versables.push({ pi: g.pi, chargeId: i.chargeId, cents: g.cents, ids: g.ids });
  }
  return { versables, ecartes };
}

function cleVirement(uid, groupe) {
  return 'payout_' + crypto.createHash('sha256').update(JSON.stringify([uid, groupe.pi, groupe.ids, groupe.cents])).digest('hex');
}

// Infos Stripe et déjà-versé pour chaque paiement.
async function infosPaiements(ctx, pis) {
  const infos = {};
  if (!pis.length) return infos;
  const r = await fetch(`${ctx.sbUrl}/rest/v1/livreur_earnings?stripe_payment_intent=in.(${pis.map(encodeURIComponent).join(',')})&status=eq.transferred&select=stripe_payment_intent,net_amount`, {
    headers: entetes(ctx.sbKey),
  });
  if (!r.ok) throw new Error('lecture des gains déjà versés impossible');
  const deja = {};
  for (const g of await r.json()) deja[g.stripe_payment_intent] = (deja[g.stripe_payment_intent] || 0) + cents(g.net_amount);
  for (const pi of pis) {
    try {
      const pr = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}?expand[]=latest_charge`, {
        headers: { Authorization: 'Bearer ' + ctx.stripeKey },
      });
      const d = await pr.json().catch(() => ({}));
      if (!pr.ok) continue;
      const ch = d.latest_charge && typeof d.latest_charge === 'object' ? d.latest_charge : null;
      const chargeId = ch ? ch.id : (typeof d.latest_charge === 'string' ? d.latest_charge : null);
      const brut = ch ? (Number(ch.amount_captured ?? ch.amount) || 0) - (Number(ch.amount_refunded) || 0) : (Number(d.amount_received) || 0);
      infos[pi] = { statut: d.status, chargeId, chargeCents: brut, dejaVerseCents: deja[pi] || 0 };
    } catch (_) { /* paiement illisible : groupe écarté */ }
  }
  return infos;
}

// Retrait demandé par le livreur. Ne lance que des virements bornés par leur charge source.
async function verserGainsLivreur(ctx, uid, destination, opts = {}) {
  const maintenant = new Date();
  const r = await fetch(`${ctx.sbUrl}/rest/v1/livreur_earnings?user_id=eq.${encodeURIComponent(uid)}&status=eq.available&select=id,net_amount,status,available_after,stripe_payment_intent`, {
    headers: entetes(ctx.sbKey),
  });
  if (!r.ok) throw new Error('lecture des gains impossible');
  const tous = await r.json();
  const gains = tous.filter((g) => estVersable(g, maintenant));
  const sansPaiement = tous.filter((g) => !g.stripe_payment_intent).length;
  const groupes = grouperParPaiement(gains);
  const infos = await infosPaiements(ctx, groupes.map((g) => g.pi));
  const { versables, ecartes } = planVirements(groupes, infos);
  const totalCents = versables.reduce((t, v) => t + v.cents, 0);
  const minimumCents = Math.round((opts.minimum ?? 5) * 100);
  if (totalCents < minimumCents) {
    return { ok: false, code: 'solde_insuffisant', totalCents, minimumCents, ecartes, sansPaiement, reussis: [], echecs: [] };
  }
  const reussis = [], echecs = [];
  for (const v of versables) {
    const params = new URLSearchParams({
      amount: String(v.cents),
      currency: 'cad',
      destination,
      source_transaction: v.chargeId,
      description: `Gains PorteàPorte — paiement ${v.pi.slice(-8)}`,
      'metadata[livreur_id]': uid,
      'metadata[payment_intent]': v.pi,
      'metadata[gains]': String(v.ids.length),
    });
    let d = {}, ok = false;
    try {
      const tr = await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + ctx.stripeKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': cleVirement(uid, v) },
        body: params.toString(),
      });
      d = await tr.json().catch(() => ({}));
      ok = tr.ok && !!d.id;
    } catch (e) { d = { error: { message: e.message } }; }
    if (!ok) { echecs.push({ pi: v.pi, cents: v.cents, erreur: (d.error && d.error.message) || 'virement refusé' }); continue; }
    // Ce virement a réussi : seuls SES gains passent « versé ».
    await fetch(`${ctx.sbUrl}/rest/v1/livreur_earnings?id=in.(${v.ids.join(',')})&status=eq.available`, {
      method: 'PATCH', headers: entetes(ctx.sbKey, 'return=minimal'),
      body: JSON.stringify({ status: 'transferred', stripe_transfer_id: d.id }),
    });
    const deja = await fetch(`${ctx.sbUrl}/rest/v1/payout_requests?stripe_transfer_id=eq.${encodeURIComponent(d.id)}&select=id&limit=1`, { headers: entetes(ctx.sbKey) })
      .then((x) => (x.ok ? x.json() : [])).catch(() => []);
    if (!deja.length) {
      await fetch(`${ctx.sbUrl}/rest/v1/payout_requests`, {
        method: 'POST', headers: entetes(ctx.sbKey, 'return=minimal'),
        body: JSON.stringify({ user_id: uid, amount_cents: v.cents, currency: 'cad', status: 'processing', stripe_transfer_id: d.id, requested_at: new Date().toISOString() }),
      });
      await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
        method: 'POST', headers: entetes(ctx.sbKey, 'return=minimal'),
        body: JSON.stringify({ event_type: 'virement_livreur', status: 'processing', user_id: uid, amount_cents: v.cents, stripe_payment_intent: v.pi, evidence: { transfer_id: d.id, gains: v.ids, source: 'lib/_virements' } }),
      }).catch(() => {});
    }
    reussis.push({ pi: v.pi, cents: v.cents, transfer_id: d.id });
  }
  return { ok: reussis.length > 0, code: reussis.length ? (echecs.length ? 'partiel' : 'ok') : 'echec', totalCents, reussis, echecs, ecartes, sansPaiement };
}

module.exports = {
  COLONNES_CONNECT, statutDepuisStripe, lireCompteStripe, ecrireStatutConnect, etatConnect,
  estVersable, soldeLivreur, grouperParPaiement, planVirements, cleVirement, infosPaiements, verserGainsLivreur,
};
