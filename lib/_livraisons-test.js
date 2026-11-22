// lib/_livraisons-test.js — Livraisons de test cachées aux livreurs, sans rien supprimer
// (test complet du 22 nov. 2026, point 25). Sans migration : un drapeau dans transaction_audit_events.
//   « livraison_marquee_test »  : cachée aux livreurs
//   « livraison_test_retire »   : de nouveau visible
// Le dernier événement d'une livraison gagne. Seul l'admin peut marquer ou démarquer.
'use strict';

const { sbHeaders, roleIn } = require('./_lib');

const EVT_TEST = 'livraison_marquee_test';
const EVT_RETIRE = 'livraison_test_retire';

async function idsLivraisonsTest(ctx) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=in.(${EVT_TEST},${EVT_RETIRE})&select=livraison_id,event_type,created_at&order=created_at.asc&limit=1000`, {
    headers: sbHeaders(ctx.sbKey),
  }).catch(() => ({ ok: false }));
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  const etat = new Map();
  for (const e of Array.isArray(rows) ? rows : []) if (e.livraison_id) etat.set(e.livraison_id, e.event_type === EVT_TEST);
  return [...etat].filter(([, test]) => test).map(([id]) => id);
}

async function livraisonsTestIds(req, res, ctx) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ success: true, ids: await idsLivraisonsTest(ctx) });
}

async function adminLivraisonTest(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const cle = String(body.livraison_id || body.code || '').trim();
  if (!cle) return res.status(400).json({ error: 'livraison_id ou code requis' });
  const filtre = /^PP-/i.test(cle) ? `code=eq.${encodeURIComponent(cle.toUpperCase())}` : `id=eq.${encodeURIComponent(cle)}`;
  const lr = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?${filtre}&select=id,code,expediteur_id,statut&limit=1`, { headers: sbHeaders(ctx.sbKey) }).catch(() => ({ ok: false }));
  const liv = lr.ok ? (await lr.json().catch(() => []))[0] : null;
  if (!liv) return res.status(404).json({ error: 'Livraison introuvable' });
  const cacher = body.test !== false;
  const w = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      livraison_id: liv.id, user_id: liv.expediteur_id || null, actor_id: ctx.session?.id || null,
      event_type: cacher ? EVT_TEST : EVT_RETIRE, status: cacher ? 'cachee' : 'visible',
      evidence: { source: 'lib/_livraisons-test', code: liv.code || null, statut: liv.statut, raison: String(body.raison || '').slice(0, 300) || null },
    }),
  }).catch(() => ({ ok: false }));
  if (!w.ok) return res.status(503).json({ error: 'Journal indisponible : rien n\'a changé.' });
  return res.status(200).json({ success: true, livraison_id: liv.id, code: liv.code, cachee: cacher });
}

module.exports = { idsLivraisonsTest, livraisonsTestIds, adminLivraisonTest, EVT_TEST, EVT_RETIRE };
