// lib/_messagerie-livraison.js — Messagerie des livraisons (décision de Denis, 24 nov. 2026).
// Même règle que le covoiturage (lib/_messagerie.js) :
//  • le livreur ne voit plus le téléphone ni le courriel du destinataire : on s'écrit ici ;
//  • conversations : livreur ↔ expéditeur, livreur ↔ destinataire ;
//  • masquage des téléphones, courriels et des codes de CETTE livraison (ramassage, réception) ;
//    l'original est gardé au journal pour l'admin seulement ;
//  • fermeture 3 jours après la livraison (ou l'annulation) ; « Signaler » ; lecture admin sur signalement ;
//  • le destinataire sans compte écrit par un lien personnel (HMAC, impossible à deviner), qui expire
//    à la fermeture et que l'admin peut révoquer.
// Stockage SANS migration : le journal transaction_audit_events (les membres ne peuvent pas y écrire ;
// RLS : chacun ne lit que ses propres lignes, l'admin lit tout). Une vraie table viendra avec prod-v2.
'use strict';

const crypto = require('crypto');
const { sbHeaders, alertAdmin, callNotifier, roleIn, internalSecret, siteOrigin } = require('./_lib');
const { uneSeuleFois } = require('./_une-fois');
const { codesLivraison } = require('./_codes-livraison');
const { masquerCoordonnees, avisMasquage, RAISONS_SIGNALEMENT, JOURS_APRES_TRAJET } = require('./_messagerie');

const JOUR_MS = 24 * 3600 * 1000;
const FENETRE_AVIS_MS = 30 * 60 * 1000;
const EV_MESSAGE = 'livraison_message';
const EV_ORIGINAL = 'message_original_masque';
const EV_REVOQUE = 'lien_destinataire_revoque';
const STATUTS_LIVRES = ['livre', 'livree', 'delivered', 'payee', 'paid', 'depot_securise'];
const STATUTS_ANNULES = ['annule', 'annulee', 'cancelled', 'canceled', 'rembourse', 'retour_expediteur'];
const ROLES = ['livreur', 'expediteur', 'destinataire'];
const NOMS = { livreur: 'Ton livreur', expediteur: 'L’expéditeur', destinataire: 'Le destinataire' };
const NOMS_AVIS = { livreur: 'ton livreur', expediteur: 'l’expéditeur', destinataire: 'le destinataire' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v) => (UUID.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : null);

async function lire(ctx, chemin) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/${chemin}`, { headers: sbHeaders(ctx.sbKey) });
  if (!r.ok) throw new Error('lecture impossible (' + r.status + ')');
  return r.json();
}
async function ecrire(ctx, ligne) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=representation'), body: JSON.stringify(ligne),
  });
  if (!r.ok) throw new Error('écriture impossible (' + r.status + ')');
  return ((await r.json().catch(() => [])) || [])[0] || null;
}

const SELECT_LIV = 'id,code,statut,expediteur_id,livreur_id,destinataire_user_id,destinataire_email,destinataire_nom,ville_depart,ville_arrivee,livre_le,recipient_confirmed_at,mis_a_jour_le,pickup_code_hash,recipient_confirmation_hash';
async function lireLivraison(ctx, livraisonId) {
  return (await lire(ctx, `livraisons?id=eq.${livraisonId}&select=${SELECT_LIV}&limit=1`))[0] || null;
}

// ─── Fermeture : 3 jours après la livraison (ou l'annulation) ───────────────────────────────────────
function etatFermetureLivraison(l, maintenant = new Date()) {
  const statut = String(l.statut || '').toLowerCase();
  let fin = null;
  if (STATUTS_LIVRES.includes(statut) || l.livre_le || l.recipient_confirmed_at) {
    const t = Math.max(...[l.livre_le, l.recipient_confirmed_at, l.mis_a_jour_le].map((v) => (v ? new Date(v).getTime() : 0)));
    fin = t || null;
  } else if (STATUTS_ANNULES.includes(statut)) {
    fin = l.mis_a_jour_le ? new Date(l.mis_a_jour_le).getTime() : null;
  }
  if (!fin) return { ferme: false, ferme_le: null };
  const fermeLe = new Date(fin + JOURS_APRES_TRAJET * JOUR_MS);
  return { ferme: maintenant >= fermeLe, ferme_le: fermeLe.toISOString() };
}

// ─── Lien personnel du destinataire ─────────────────────────────────────────────────────────────────
function jetonDestinataire(livraisonId, version) {
  const secret = internalSecret();
  if (!secret || !livraisonId) return null;
  return crypto.createHmac('sha256', secret).update(`pap-lien-destinataire|${livraisonId}|${version}`).digest('base64url');
}
async function versionLien(ctx, livraisonId) {
  const rows = await lire(ctx, `transaction_audit_events?livraison_id=eq.${livraisonId}&event_type=eq.${EV_REVOQUE}&select=id`);
  return rows.length;
}
async function lienDestinataire(ctx, livraisonId) {
  const v = await versionLien(ctx, livraisonId);
  const t = jetonDestinataire(livraisonId, v);
  return t ? `${siteOrigin()}/message-livraison.html?l=${encodeURIComponent(livraisonId)}&t=${encodeURIComponent(t)}` : null;
}
function egal(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ─── Qui parle à qui ─────────────────────────────────────────────────────────────────────────────────
function roleDe(l, uid) {
  if (!uid) return null;
  if (l.livreur_id === uid) return 'livreur';
  if (l.expediteur_id === uid) return 'expediteur';
  if (l.destinataire_user_id === uid) return 'destinataire';
  return null;
}
const nomConv = (a, b) => (a === 'livreur' ? `livreur-${b}` : `livreur-${a}`);
function convPermise(moi, avec) {
  return ROLES.includes(moi) && ROLES.includes(avec) && moi !== avec && (moi === 'livreur' || avec === 'livreur');
}

// Identifie l'appelant : membre connecté, ou destinataire par son lien. Retourne { l, moi, avec, uid } ou { erreur }.
async function identifier(ctx, body, { parLien = false } = {}) {
  const livraisonId = id(body.livraison_id || body.l);
  if (!livraisonId) return { erreur: 400, message: 'livraison_id requis' };
  const l = await lireLivraison(ctx, livraisonId);
  if (!l) return { erreur: 404, message: 'Livraison introuvable' };
  let moi, uid = null;
  if (parLien) {
    const v = await versionLien(ctx, livraisonId);
    if (!egal(body.t, jetonDestinataire(livraisonId, v))) return { erreur: 403, message: 'Lien invalide ou révoqué. Demande un nouveau lien à PorteàPorte.', code: 'lien_invalide' };
    moi = 'destinataire';
  } else {
    if (!ctx.session) return { erreur: 401, message: 'Connexion requise' };
    uid = ctx.session.id;
    moi = roleDe(l, uid);
    if (!moi) return { erreur: 403, message: 'Tu ne participes pas à cette livraison' };
  }
  const avec = parLien ? 'livreur' : String(body.avec || '');
  if (!convPermise(moi, avec)) return { erreur: 403, message: 'Conversation non permise' };
  if (!l.livreur_id) return { erreur: 409, message: 'Aucun livreur n’est encore assigné à cette livraison.', code: 'pas_de_livreur' };
  const fermeture = etatFermetureLivraison(l);
  if (parLien && fermeture.ferme) return { erreur: 410, message: 'Ce lien a expiré : la conversation est fermée 3 jours après la livraison.', code: 'lien_expire' };
  return { l, moi, avec, uid, conv: nomConv(moi, avec), fermeture };
}

async function messagesConv(ctx, livraisonId, conv) {
  return lire(ctx, `transaction_audit_events?livraison_id=eq.${livraisonId}&event_type=eq.${EV_MESSAGE}&evidence->>conv=eq.${conv}&select=id,created_at,evidence&order=created_at.asc&limit=300`);
}
const versClient = (moi) => (m) => ({ id: m.id, created_at: m.created_at, de: m.evidence.de, moi: m.evidence.de === moi, body: m.evidence.body });

// Adresse de la personne à aviser (jamais renvoyée à l'autre).
async function courrielDe(ctx, l, role) {
  if (role === 'destinataire') {
    if (l.destinataire_user_id) {
      const p = (await lire(ctx, `profiles?id=eq.${l.destinataire_user_id}&select=email,prenom`).catch(() => []))[0];
      if (p && p.email) return { email: p.email, prenom: p.prenom || '' };
    }
    return l.destinataire_email ? { email: l.destinataire_email, prenom: l.destinataire_nom || '', lien: true } : null;
  }
  const uid = role === 'livreur' ? l.livreur_id : l.expediteur_id;
  const p = (await lire(ctx, `profiles?id=eq.${uid}&select=email,prenom`).catch(() => []))[0];
  return p && p.email ? { email: p.email, prenom: p.prenom || '' } : null;
}

async function aviser(ctx, l, de, a, conv) {
  const tranche = Math.floor(Date.now() / FENETRE_AVIS_MS);
  if (!(await uneSeuleFois(ctx, `avis_message_livraison:${l.id}:${conv}:${a}:${tranche}`, { eventType: 'courriel_envoye', livraisonId: l.id, status: 'envoye', evidence: { sorte: 'avis_message_livraison', conv } }))) return false;
  const dest = await courrielDe(ctx, l, a);
  if (!dest) return false;
  const lien = dest.lien ? await lienDestinataire(ctx, l.id) : `${siteOrigin()}/message-livraison.html?l=${encodeURIComponent(l.id)}&avec=${de}`;
  await callNotifier('livraison_nouveau_message', {
    to_email: dest.email, prenom: dest.prenom, expediteur_label: NOMS_AVIS[de],
    code_livraison: l.code || '', ville_depart: l.ville_depart || '', ville_arrivee: l.ville_arrivee || '', lien,
  }).catch(() => null);
  return true;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────────────────────────────
async function threadLivraison(req, res, ctx, body, parLien) {
  let c;
  try { c = await identifier(ctx, body || {}, { parLien }); } catch (_) { return res.status(503).json({ error: 'Messagerie indisponible pour le moment' }); }
  if (c.erreur) return res.status(c.erreur).json({ error: c.message, code: c.code });
  const msgs = await messagesConv(ctx, c.l.id, c.conv).catch(() => []);
  return res.status(200).json({
    livraison: { code: c.l.code, ville_depart: c.l.ville_depart, ville_arrivee: c.l.ville_arrivee },
    moi: c.moi, avec: c.avec, avec_nom: NOMS[c.avec], messages: msgs.map(versClient(c.moi)),
    ferme: c.fermeture.ferme, ferme_le: c.fermeture.ferme_le, raisons: RAISONS_SIGNALEMENT,
  });
}

async function envoyerLivraison(req, res, ctx, body, parLien) {
  let c;
  try { c = await identifier(ctx, body || {}, { parLien }); } catch (_) { return res.status(503).json({ error: 'Messagerie indisponible pour le moment' }); }
  if (c.erreur) return res.status(c.erreur).json({ error: c.message, code: c.code });
  if (c.fermeture.ferme) return res.status(403).json({ error: 'Cette conversation est fermée (3 jours après la livraison). En cas de problème, utilise « Signaler ».', code: 'messagerie_fermee' });
  const texte = String(body.body || body.text || '').trim().slice(0, 2000);
  if (!texte) return res.status(400).json({ error: 'Message vide' });
  if (ctx.checkRateLimit) {
    const cle = parLien ? `livmsg:lien:${c.l.id}` : `livmsg:${c.uid}`;
    const rl = await ctx.checkRateLimit(cle, 30, 300);
    if (!rl.allowed) return res.status(429).json({ error: 'Trop de messages — attends quelques minutes' });
  }
  // Codes de CETTE livraison, toujours masqués (même si leur hachage manque en base) ; jamais renvoyés au client.
  const codes = codesLivraison(c.l.id) || {};
  const m = masquerCoordonnees(texte, { codes: [codes.ramassage, codes.reception].filter(Boolean) });
  let ligne;
  try {
    ligne = await ecrire(ctx, { event_type: EV_MESSAGE, status: 'envoye', livraison_id: c.l.id, user_id: c.uid, evidence: { conv: c.conv, de: c.moi, a: c.avec, body: m.texte } });
  } catch (_) { return res.status(503).json({ error: 'Envoi impossible pour le moment' }); }
  if (m.masque) {
    await ecrire(ctx, { event_type: EV_ORIGINAL, status: 'masque', livraison_id: c.l.id, user_id: c.uid, evidence: { message_id: ligne && ligne.id, livraison_id: c.l.id, conv: c.conv, original: texte } }).catch(() => null);
  }
  callNotifier('admin_nouveau_message', {
    contexte: 'livraison',
    ville_depart: c.l.ville_depart || '',
    ville_arrivee: c.l.ville_arrivee || '',
    created_at: ligne?.created_at || new Date().toISOString(),
    admin_link: 'https://porteaporte.site/admin/operations.html'
  }).then((result) => {
    if (!result.ok) console.error('[alerte-admin] nouveau message livraison refusé; statut', result.status);
  }).catch(() => console.error('[alerte-admin] nouveau message livraison non envoyé'));
  await aviser(ctx, c.l, c.moi, c.avec, c.conv).catch(() => false);
  return res.status(200).json({ success: true, message: ligne ? versClient(c.moi)(ligne) : null, masque: m.masque, avis: avisMasquage(m) });
}

async function signalerLivraison(req, res, ctx, body, parLien) {
  let c;
  try { c = await identifier(ctx, body || {}, { parLien }); } catch (_) { return res.status(503).json({ error: 'Signalement impossible pour le moment' }); }
  if (c.erreur) return res.status(c.erreur).json({ error: c.message, code: c.code });
  const raison = Object.prototype.hasOwnProperty.call(RAISONS_SIGNALEMENT, body.raison) ? body.raison : null;
  if (!raison) return res.status(400).json({ error: 'raison requise' });
  const details = body.details ? String(body.details).trim().slice(0, 1000) : null;
  let ev;
  try {
    ev = await ecrire(ctx, { event_type: 'messages_signales', status: 'ouvert', livraison_id: c.l.id, user_id: c.uid, evidence: { sorte: 'livraison', livraison_id: c.l.id, conv: c.conv, par: c.moi, signale: c.avec, raison, details } });
  } catch (_) { return res.status(503).json({ error: 'Signalement impossible pour le moment' }); }
  alertAdmin('Conversation de livraison signalée', `Un participant (${c.moi}) a signalé la conversation ${c.conv} de la livraison ${c.l.code || c.l.id} (${RAISONS_SIGNALEMENT[raison]}).`, {
    severity: 'warning', details: { Livraison: c.l.code || c.l.id, Signalement: ev && ev.id },
    cta_url: `https://porteaporte.site/admin/signalements-messages.html?report=${ev && ev.id}`, cta_label: 'Lire la conversation signalée →',
  });
  return res.status(200).json({ success: true, report_id: ev && ev.id, message: 'Merci. Ton signalement est reçu ; l’équipe PorteàPorte va lire la conversation.' });
}

// Membre : ses livraisons et les conversations possibles (aucune coordonnée renvoyée).
async function conversationsLivraison(req, res, ctx) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const u = ctx.session.id;
  const rows = await lire(ctx, `livraisons?or=(livreur_id.eq.${u},expediteur_id.eq.${u},destinataire_user_id.eq.${u})&select=${SELECT_LIV}&order=cree_le.desc&limit=100`).catch(() => []);
  return res.status(200).json({
    livraisons: rows.map((l) => {
      const moi = roleDe(l, u);
      const avec = moi === 'livreur' ? ['expediteur', 'destinataire'] : ['livreur'];
      return { id: l.id, code: l.code, ville_depart: l.ville_depart, ville_arrivee: l.ville_arrivee, statut: l.statut, moi, avec: l.livreur_id ? avec : [], ferme: etatFermetureLivraison(l).ferme };
    }),
  });
}

// Admin : signalements de livraison (sans contenu) — fusionnés avec ceux du covoiturage dans la page admin.
async function signalementsLivraison(ctx) {
  const rows = await lire(ctx, 'transaction_audit_events?event_type=eq.messages_signales&evidence->>sorte=eq.livraison&order=created_at.desc&limit=100&select=id,created_at,status,livraison_id,evidence').catch(() => []);
  return rows.map((r) => ({ id: r.id, sorte: 'livraison', created_at: r.created_at, status: r.status, livraison_id: r.livraison_id, conv: r.evidence.conv, raison: RAISONS_SIGNALEMENT[r.evidence.raison] || r.evidence.raison, details: r.evidence.details || null }));
}

// Admin : lecture d'une conversation de livraison, seulement à partir d'un signalement ; journalisée.
async function adminThreadLivraison(req, res, ctx, body) {
  if (!ctx.session || !roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Réservé à l’admin' });
  const reportId = id(body.report_id);
  if (!reportId) return res.status(403).json({ error: 'Lecture permise seulement à partir d’un signalement' });
  const s = (await lire(ctx, `transaction_audit_events?id=eq.${reportId}&event_type=eq.messages_signales&select=id,created_at,livraison_id,evidence`).catch(() => []))[0];
  if (!s || !s.evidence || s.evidence.sorte !== 'livraison' || !s.livraison_id || !s.evidence.conv) {
    return res.status(403).json({ error: 'Lecture permise seulement à partir d’un signalement de messagerie' });
  }
  const msgs = await messagesConv(ctx, s.livraison_id, s.evidence.conv);
  const originaux = await lire(ctx, `transaction_audit_events?livraison_id=eq.${s.livraison_id}&event_type=eq.${EV_ORIGINAL}&select=evidence`).catch(() => []);
  const parId = new Map(originaux.filter((o) => o.evidence && o.evidence.message_id).map((o) => [o.evidence.message_id, o.evidence.original]));
  await ecrire(ctx, { event_type: 'messages_lus_admin', status: 'lu', livraison_id: s.livraison_id, user_id: ctx.session.id, evidence: { report_id: s.id, conv: s.evidence.conv, messages: msgs.length } }).catch(() => null);
  return res.status(200).json({
    signalement: { id: s.id, sorte: 'livraison', par: s.evidence.par, signale: s.evidence.signale, raison: RAISONS_SIGNALEMENT[s.evidence.raison] || s.evidence.raison },
    messages: msgs.map((m) => ({ id: m.id, created_at: m.created_at, de: m.evidence.de, body: m.evidence.body, original: parId.get(m.id) || undefined, du_signaleur: m.evidence.de === s.evidence.par })),
  });
}

// Admin : révoque le lien du destinataire (l'ancien ne marche plus) ; option : envoyer un nouveau lien.
async function adminRevoquerLien(req, res, ctx, body) {
  if (!ctx.session || !roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Réservé à l’admin' });
  let livraisonId = id(body.livraison_id);
  if (!livraisonId && body.code) {
    const r = (await lire(ctx, `livraisons?code=eq.${encodeURIComponent(String(body.code).trim().toUpperCase())}&select=id&limit=1`).catch(() => []))[0];
    livraisonId = r ? r.id : null;
  }
  if (!livraisonId) return res.status(404).json({ error: 'Livraison introuvable' });
  const l = await lireLivraison(ctx, livraisonId);
  if (!l) return res.status(404).json({ error: 'Livraison introuvable' });
  await ecrire(ctx, { event_type: EV_REVOQUE, status: 'revoque', livraison_id: l.id, user_id: ctx.session.id, evidence: { raison: body.raison ? String(body.raison).slice(0, 300) : null, renvoye: !!body.renvoyer } });
  let renvoye = false;
  if (body.renvoyer && l.destinataire_email && !etatFermetureLivraison(l).ferme) {
    await callNotifier('livraison_lien_destinataire', { to_email: l.destinataire_email, prenom: l.destinataire_nom || '', code_livraison: l.code || '', lien: await lienDestinataire(ctx, l.id) }).catch(() => null);
    renvoye = true;
  }
  return res.status(200).json({ success: true, revoque: true, nouveau_lien_envoye: renvoye });
}

module.exports = {
  EV_MESSAGE, EV_REVOQUE, STATUTS_LIVRES, etatFermetureLivraison, jetonDestinataire, lienDestinataire, convPermise,
  conversationsLivraison, threadLivraison, envoyerLivraison, signalerLivraison, signalementsLivraison, adminThreadLivraison, adminRevoquerLien,
};
