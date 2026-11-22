// lib/_livraisons-coincees.js — Remettre à « Ramassé » les 2 livraisons coincées du test complet
// (PP-EA656834 et PP-B0FBF7D8), marquées « Livré » avant la correction du code de réception.
// Bouton admin, à utiliser APRÈS la mise en ligne de la correction. Ne touche jamais au paiement :
//   - seulement ces 2 codes ;
//   - seulement si la livraison est encore « livre » ;
//   - seulement si le paiement n'est pas capturé (PaymentIntent Stripe encore « requires_capture ») ;
//   - statut = 'ramasse', livre_le = null ; rien d'autre. Écrit au journal (avant / après).
'use strict';

const { sbHeaders, roleIn } = require('./_lib');

const CODES_COINCES = Object.freeze(['PP-EA656834', 'PP-B0FBF7D8']);
const EVT_REMISE = 'livraison_remise_ramasse';

async function etatPaiement(stripeKey, piId) {
  if (!piId) return { ok: true, statut: 'aucun_paiement' };
  if (!stripeKey) return { ok: false, statut: 'stripe_non_configure' };
  try {
    const r = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piId)}`, { headers: { Authorization: 'Bearer ' + stripeKey } });
    if (!r.ok) return { ok: false, statut: 'stripe_illisible' };
    const pi = await r.json();
    return { ok: pi.status === 'requires_capture', statut: pi.status };
  } catch (_) {
    return { ok: false, statut: 'stripe_illisible' };
  }
}

async function adminRemettreRamasse(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const code = String(body.code || '').trim().toUpperCase();
  if (!CODES_COINCES.includes(code)) return res.status(400).json({ error: `Seulement ${CODES_COINCES.join(' ou ')}.` });
  const lr = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?code=eq.${encodeURIComponent(code)}&select=id,code,statut,livre_le,expediteur_id,stripe_payment_intent&limit=1`, { headers: sbHeaders(ctx.sbKey) }).catch(() => ({ ok: false }));
  const liv = lr.ok ? (await lr.json().catch(() => []))[0] : null;
  if (!liv) return res.status(404).json({ error: 'Livraison introuvable' });
  if (liv.statut !== 'livre') return res.status(409).json({ error: `Rien à faire : la livraison est « ${liv.statut} », pas « livre ».`, statut: liv.statut });
  const paiement = await etatPaiement(ctx.stripeKey || process.env.STRIPE_SECRET_KEY, liv.stripe_payment_intent);
  if (!paiement.ok) return res.status(409).json({ error: `Paiement pas en attente (${paiement.statut}) : rien n'a changé.`, paiement: paiement.statut });
  // PATCH conditionnel : seulement si encore « livre » (deux clics simultanés ne font qu'un changement).
  const w = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(liv.id)}&statut=eq.livre`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey, 'return=representation'),
    body: JSON.stringify({ statut: 'ramasse', livre_le: null }),
  }).catch(() => ({ ok: false }));
  const rows = w.ok ? await w.json().catch(() => []) : [];
  if (!w.ok || !rows.length) return res.status(409).json({ error: 'Aucun changement (statut déjà modifié ?).' });
  await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      livraison_id: liv.id, user_id: liv.expediteur_id || null, actor_id: ctx.session?.id || null,
      event_type: EVT_REMISE, status: 'ramasse',
      evidence: { source: 'lib/_livraisons-coincees', code, avant: { statut: liv.statut, livre_le: liv.livre_le }, apres: { statut: 'ramasse', livre_le: null }, paiement: paiement.statut, raison: String(body.raison || '').slice(0, 300) || null },
    }),
  }).catch(() => {});
  return res.status(200).json({ success: true, code, statut: 'ramasse', paiement: paiement.statut });
}

module.exports = { adminRemettreRamasse, CODES_COINCES, EVT_REMISE };
