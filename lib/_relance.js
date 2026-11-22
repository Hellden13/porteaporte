// lib/_relance.js — Bouton « Relancer » (admin) : un seul envoi par compte aux 7 jours, vérifié côté serveur.
// Sans migration : chaque envoi laisse une marque dans transaction_audit_events
// (event_type « verification_rappel_envoye », user_id = le membre, actor_id = l'admin).
// La marque est écrite AVANT l'envoi; si l'envoi échoue, elle passe à « echec » et ne compte plus.
'use strict';

const { sbHeaders, callNotifier, roleIn } = require('./_lib');

const EVT_RELANCE = 'verification_rappel_envoye';
const DELAI_RELANCE_MS = 7 * 24 * 3600 * 1000;

// JJ/MM à l'heure du Québec.
function jjmm(d) {
  const t = new Date(d);
  if (!Number.isFinite(t.getTime())) return '';
  const parts = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', day: '2-digit', month: '2-digit' }).formatToParts(t);
  const v = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${v('day')}/${v('month')}`;
}

function messageDejaRelance(dernier) {
  const prochain = new Date(new Date(dernier).getTime() + DELAI_RELANCE_MS);
  return `Déjà relancé le ${jjmm(dernier)}, réessaie après le ${jjmm(prochain)}.`;
}

// Marques « envoye » des 7 derniers jours pour un membre (les plus anciennes d'abord). null = journal illisible.
async function marquesRecentes(ctx, userId, now) {
  const depuis = new Date(now - DELAI_RELANCE_MS).toISOString();
  const url = `${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${EVT_RELANCE}&status=eq.envoye` +
    `&user_id=eq.${encodeURIComponent(userId)}&created_at=gt.${encodeURIComponent(depuis)}` +
    '&select=id,created_at&order=created_at.asc,id.asc&limit=50';
  const r = await fetch(url, { headers: sbHeaders(ctx.sbKey) }).catch(() => ({ ok: false }));
  if (!r.ok) return null;
  const rows = await r.json().catch(() => null);
  return Array.isArray(rows) ? rows : null;
}

async function changerStatut(ctx, id, status) {
  await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ status }),
  }).catch(() => {});
}

function refusTropTot(res, dernier) {
  const prochain = new Date(new Date(dernier).getTime() + DELAI_RELANCE_MS).toISOString();
  return res.status(429).json({ error: messageDejaRelance(dernier), code: 'deja_relance', dernier_envoi: dernier, prochain_envoi: prochain });
}

// Admin : renvoie un courriel invitant un inscrit « non démarré » à compléter sa vérification.
async function adminVerificationReminder(req, res, ctx, body, now = Date.now()) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const userId = body.user_id || body.id;
  if (!userId) return res.status(400).json({ error: 'user_id requis' });

  const r = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,prenom,driver_status&limit=1`, {
    headers: sbHeaders(ctx.sbKey),
  }).catch(() => ({ ok: false }));
  const rows = r.ok ? await r.json().catch(() => []) : [];
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || !profile.email) return res.status(404).json({ error: 'Utilisateur ou courriel introuvable' });
  if (profile.driver_status === 'verified') return res.status(400).json({ error: 'Cet utilisateur est déjà vérifié' });

  // 1. Déjà relancé depuis moins de 7 jours ? Journal illisible : on refuse (échec fermé).
  const avant = await marquesRecentes(ctx, profile.id, now);
  if (!avant) return res.status(503).json({ error: 'Journal indisponible : rien n\'a été envoyé. Réessaie dans un moment.' });
  if (avant.length) return refusTropTot(res, avant[0].created_at);

  // 2. La marque d'abord (date + auteur). Sans elle, rien ne part.
  const envoyeLe = new Date(now).toISOString();
  const mRes = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey, 'return=representation'),
    body: JSON.stringify({
      user_id: profile.id,
      actor_id: ctx.session?.id || null,
      event_type: EVT_RELANCE,
      status: 'envoye',
      evidence: { source: 'lib/_relance adminVerificationReminder', envoye_le: envoyeLe },
    }),
  }).catch(() => ({ ok: false }));
  if (!mRes.ok) return res.status(503).json({ error: 'Journal indisponible : rien n\'a été envoyé. Réessaie dans un moment.' });
  const marque = (await mRes.json().catch(() => []))?.[0] || null;
  if (!marque?.id) return res.status(503).json({ error: 'Journal indisponible : rien n\'a été envoyé. Réessaie dans un moment.' });

  // 3. Deux clics en même temps : seule la plus ancienne marque gagne, les autres sont annulées.
  const apres = await marquesRecentes(ctx, profile.id, now);
  if (!apres) { await changerStatut(ctx, marque.id, 'echec'); return res.status(503).json({ error: 'Journal indisponible : rien n\'a été envoyé. Réessaie dans un moment.' }); }
  if (apres.length && apres[0].id !== marque.id) {
    await changerStatut(ctx, marque.id, 'doublon');
    return refusTropTot(res, apres[0].created_at);
  }

  // 4. L'envoi.
  let notif;
  try {
    notif = await callNotifier('verification_rappel', { user_id: profile.id, email: profile.email, prenom: profile.prenom || '' });
  } catch (e) {
    console.error('[verification-reminder]', e.message);
    await changerStatut(ctx, marque.id, 'echec');
    return res.status(502).json({ error: 'Envoi impossible : ' + e.message });
  }
  if (!notif.ok || notif.data?.success === false) {
    const reason = notif.data?.error || (notif.data?.results || []).map((x) => x && x.error).filter(Boolean)[0] || `notifier HTTP ${notif.status}`;
    console.error('[verification-reminder] échec', notif.status, reason);
    await changerStatut(ctx, marque.id, 'echec');
    return res.status(502).json({ error: 'Envoi impossible : ' + reason });
  }

  return res.status(200).json({ success: true, sent_to: profile.email, envoye_le: envoyeLe });
}

module.exports = { adminVerificationReminder, jjmm, messageDejaRelance, EVT_RELANCE, DELAI_RELANCE_MS };
