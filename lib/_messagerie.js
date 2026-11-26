// lib/_messagerie.js — Messagerie covoiturage liée au trajet (décision de Denis, 23 nov. 2026).
//
// Règles :
//  1. Aucune vraie coordonnée entre conducteur et passager : ils s'écrivent ici seulement.
//  2. Avis par courriel « Tu as un nouveau message », sans l'adresse ni le texte de l'autre
//     (au plus un avis par conversation et par demi-heure).
//  3. Conversation fermée 3 jours après le trajet : on peut encore la lire, plus y écrire.
//  4. Bouton « Signaler » : signalement (ride_reports), journal, alerte admin.
//  5. L'admin lit une conversation SEULEMENT à partir d'un signalement ; chaque lecture est journalisée.
'use strict';

const { sbHeaders, alertAdmin, callNotifier, roleIn } = require('./_lib');
const { uneSeuleFois } = require('./_une-fois');

const JOURS_APRES_TRAJET = 3;
const JOUR_MS = 24 * 3600 * 1000;
const FENETRE_AVIS_MS = 30 * 60 * 1000;
const STATUTS_EN_COURS = ['en_attente', 'confirme', 'driver_completed'];
const RAISONS_SIGNALEMENT = {
  propos: 'Propos déplacés ou menaçants',
  coordonnees: 'Demande mes coordonnées personnelles',
  paiement: 'Demande de paiement hors de PorteàPorte',
  harcelement: 'Harcèlement ou insistance',
  autre: 'Autre',
};
// ─── Masquage des coordonnées (décision de Denis, 24 nov. 2026) ───────────────────────────────────────
// Téléphones (418…, 1-800…, tirets, espaces, points, parenthèses, chiffres séparés ou écrits en lettres)
// et courriels (y compris « at / arobase / point / dot ») sont remplacés avant l'enregistrement.
// L'original n'est gardé qu'au journal, au nom de l'expéditeur, pour l'admin en cas de signalement.
const MASQUE = '[coordonnées masquées pour ta sécurité]';
const CHIFFRES_MOTS = {
  zero: 0, 'zéro': 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9,
};
const MOT_CHIFFRE = Object.keys(CHIFFRES_MOTS).sort((a, b) => b.length - a.length).join('|');
// Un « jeton chiffre » : un chiffre (aussi les chiffres pleine largeur) ou un chiffre écrit en lettres.
// « l », « I », « o », « O » collés à un chiffre comptent aussi (4l8 = 418).
const JETON = `(?:[0-9０-９]|(?<=[0-9])[oOlI]|[oOlI](?=[0-9])|(?<![\\p{L}])(?:${MOT_CHIFFRE})(?![\\p{L}]))`;
const SEP = `(?:[\\s.\\-‐-―−()\\[\\]/+_*,:;~|·•]|\\s(?:et|puis|and|then|pis)\\s)*`;
const RE_SUITE = new RegExp(`(?:[+(\\[]\\s*)?${JETON}(?:${SEP}${JETON})+\\)?`, 'giu');
const RE_COURRIEL = /[\p{L}0-9._%+\-]+\s*[@＠]\s*[\p{L}0-9\-]+(?:\s*\.\s*[\p{L}0-9\-]+)+/giu;
const RE_COURRIEL_DEGUISE = /[\p{L}0-9._%+\-]+\s*(?:[\(\[\{]\s*(?:at|arobase|arrobase|a)\s*[\)\]\}]|\s(?:at|arobase|arrobase|chez)\s)\s*[\p{L}0-9\-]+(?:\s*(?:\.|[\(\[\{]\s*(?:dot|point|\.)\s*[\)\]\}]|\s(?:dot|point)\s)\s*(?:com|ca|net|org|qc|fr|info|me|live|outlook|hotmail|gmail|videotron|bell|sympatico)\b)+/giu;
const RE_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function compterChiffres(s) {
  const re = new RegExp(JETON, 'giu');
  return (s.match(re) || []).length;
}

// Un jeton → son chiffre (« 4 », « ４ », « l », « o », « quatre »…).
function versChiffres(s) {
  const re = new RegExp(JETON, 'giu');
  return (s.match(re) || []).map((j) => {
    const c = j.charCodeAt(0);
    if (c >= 0xFF10 && c <= 0xFF19) return String(c - 0xFF10);
    if (/^[0-9]$/.test(j)) return j;
    if (/^[oO]$/.test(j)) return '0';
    if (/^[lI]$/.test(j)) return '1';
    const v = CHIFFRES_MOTS[j.toLowerCase()];
    return v == null ? '' : String(v);
  }).join('');
}

const MASQUE_CODE = '[code masqué : ne partage ton code qu’à l’arrivée, en personne]';
const AVIS_CODE = 'Ne partage ton code qu’à l’arrivée, en personne.';
const RE_SUITE_OU_SEUL = new RegExp(`(?:[+(\\[]\\s*)?${JETON}(?:${SEP}${JETON})*\\)?`, 'giu');

// opts.codes : SEULEMENT les codes de cette réservation / livraison (6 chiffres). Les autres nombres restent.
function masquerCoordonnees(texte, opts = {}) {
  let t = String(texte || '');
  let masque = false;
  let codeMasque = false;
  const codes = (opts.codes || []).map(String).filter((c) => /^\d{6}$/.test(c));
  if (codes.length) {
    t = t.replace(RE_SUITE_OU_SEUL, (m) => {
      const ch = versChiffres(m);
      if (ch.length >= 6 && codes.some((c) => ch.includes(c))) { codeMasque = true; return MASQUE_CODE; }
      return m;
    });
  }
  const remplacer = (re, garder) => {
    t = t.replace(re, (m) => {
      if (garder && garder(m)) return m;
      masque = true;
      return MASQUE;
    });
  };
  remplacer(RE_COURRIEL);
  remplacer(RE_COURRIEL_DEGUISE);
  // Suite de 7 chiffres ou plus (séparés ou non) = numéro de téléphone. Les dates AAAA-MM-JJ restent.
  remplacer(RE_SUITE, (m) => {
    const net = m.trim().replace(/[.,;:]+$/, '');
    return compterChiffres(m) < 7 || RE_DATE_ISO.test(net);
  });
  return { texte: t, masque: masque || codeMasque, coordonnees: masque, codeMasque };
}

function avisMasquage(m) {
  if (m.codeMasque) return AVIS_CODE;
  if (m.coordonnees) return 'Tes coordonnées ont été masquées : ici, on s’écrit sans numéro ni courriel.';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v) => (UUID.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : null);

async function lire(ctx, chemin) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/${chemin}`, { headers: sbHeaders(ctx.sbKey) });
  if (!r.ok) throw new Error('lecture impossible (' + r.status + ')');
  return r.json();
}

// Fin du trajet pour la conversation conducteur ↔ passager (null = trajet récurrent encore en cours).
function finDuTrajet(ride, reservations) {
  const t = (v) => (v ? new Date(v).getTime() : 0);
  const fins = [];
  for (const b of reservations) fins.push(t(b.completed_at), t(b.driver_completed_at), t(b.passenger_confirmed_at));
  if (ride.is_recurring) {
    if (reservations.some((b) => STATUTS_EN_COURS.includes(String(b.status)))) return null;
    for (const b of reservations) fins.push(t(b.updated_at), t(b.created_at));
  } else {
    fins.push(t(ride.departure_time), t(ride.return_departure_time));
  }
  const m = Math.max(0, ...fins);
  return m ? new Date(m) : null;
}

function etatFermeture(ride, reservations, maintenant = new Date()) {
  const fin = finDuTrajet(ride, reservations);
  if (!fin) return { ferme: false, ferme_le: null };
  const fermeLe = new Date(fin.getTime() + JOURS_APRES_TRAJET * JOUR_MS);
  return { ferme: maintenant >= fermeLe, ferme_le: fermeLe.toISOString() };
}

// Charge le trajet et vérifie que les 2 personnes en sont (conducteur + passager de CE trajet).
async function conversation(ctx, rideId, moi, autre) {
  const rides = await lire(ctx, `rides?id=eq.${rideId}&select=id,driver_id,start_city,end_city,departure_time,return_departure_time,is_recurring,status`);
  const ride = rides[0];
  if (!ride) return { erreur: 404, message: 'Trajet introuvable' };
  const passager = moi === ride.driver_id ? autre : moi;
  if (![moi, autre].includes(ride.driver_id) || passager === ride.driver_id) return { erreur: 403, message: 'Vous ne participez pas à ce trajet' };
  const reservations = await lire(ctx, `ride_bookings?ride_id=eq.${rideId}&passenger_id=eq.${passager}&select=id,status,created_at,updated_at,completed_at,driver_completed_at,passenger_confirmed_at,safety_code_hash,safety_code_custom`);
  if (!reservations.length) return { erreur: 403, message: 'Vous ne participez pas à ce trajet' };
  return { ride, passager, reservations, fermeture: etatFermeture(ride, reservations) };
}

// Codes de sécurité des réservations de cette conversation (seulement ceux-là ; jamais renvoyés au client).
async function codesReservations(reservations) {
  const { codeTrajet } = require('./_rides');
  const out = [];
  for (const b of reservations || []) {
    const c = codeTrajet(b.id);
    if (c) out.push(c);
  }
  return out;
}

async function messagesEntre(ctx, rideId, a, b) {
  const q = `ride_id=eq.${rideId}&or=(and(sender_id.eq.${a},recipient_id.eq.${b}),and(sender_id.eq.${b},recipient_id.eq.${a}))&order=created_at.asc&limit=200`;
  return lire(ctx, `ride_messages?${q}&select=id,sender_id,recipient_id,body,created_at,read_at`);
}

async function avisNouveauMessage(ctx, ride, expediteurId, destinataireId) {
  const tranche = Math.floor(Date.now() / FENETRE_AVIS_MS);
  const cle = `avis_message:${ride.id}:${expediteurId}:${destinataireId}:${tranche}`;
  if (!(await uneSeuleFois(ctx, cle, { eventType: 'courriel_envoye', userId: destinataireId, status: 'envoye', evidence: { sorte: 'avis_message', ride_id: ride.id } }))) return false;
  const profils = await lire(ctx, `profiles?id=in.(${expediteurId},${destinataireId})&select=id,prenom,email`).catch(() => []);
  const dest = profils.find((p) => p.id === destinataireId);
  const exp = profils.find((p) => p.id === expediteurId);
  if (!dest || !dest.email) return false;
  await callNotifier('ride_nouveau_message', {
    to_email: dest.email,
    prenom: dest.prenom || '',
    expediteur_prenom: (exp && exp.prenom) || (expediteurId === ride.driver_id ? 'Ton conducteur' : 'Ton passager'),
    ville_depart: ride.start_city || '',
    ville_arrivee: ride.end_city || '',
    lien: `/covoiturage-trajet.html?id=${encodeURIComponent(ride.id)}&message=${encodeURIComponent(expediteurId)}`,
  }).catch(() => null);
  return true;
}

async function rideMessageSend(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const rideId = id(body.ride_id), autre = id(body.recipient_id), moi = ctx.session.id;
  const texte = String(body.body || body.text || '').trim().slice(0, 2000);
  if (!rideId || !autre || !texte) return res.status(400).json({ error: 'ride_id, recipient_id, body requis' });
  if (autre === moi) return res.status(400).json({ error: 'Impossible de s\'écrire à soi-même' });
  let c;
  try { c = await conversation(ctx, rideId, moi, autre); } catch (e) { return res.status(503).json({ error: 'Messagerie indisponible pour le moment' }); }
  if (c.erreur) return res.status(c.erreur).json({ error: c.message });
  if (c.fermeture.ferme) {
    return res.status(403).json({ error: `Cette conversation est fermée (${JOURS_APRES_TRAJET} jours après le trajet). En cas de problème, utilise « Signaler ».`, code: 'messagerie_fermee', ferme_le: c.fermeture.ferme_le });
  }
  const m = masquerCoordonnees(texte, { codes: await codesReservations(c.reservations) });
  if (ctx.checkRateLimit) {
    const rl = await ctx.checkRateLimit(`ridemsg:${moi}`, 30, 300);
    if (!rl.allowed) return res.status(429).json({ error: 'Trop de messages — attendez quelques minutes' });
  }
  const r = await fetch(`${ctx.sbUrl}/rest/v1/ride_messages`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
    body: JSON.stringify({ ride_id: rideId, sender_id: moi, recipient_id: autre, body: m.texte }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Envoi message impossible' });
  const msg = Array.isArray(data) ? data[0] : data;
  if (m.masque) {
    // Original : au journal seulement (lisible par l'admin et par son auteur, jamais par l'autre personne).
    await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
      method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
      body: JSON.stringify({ event_type: 'message_original_masque', status: 'masque', user_id: moi, evidence: { message_id: msg && msg.id, ride_id: rideId, original: texte } }),
    }).catch(() => {});
  }
  callNotifier('admin_nouveau_message', {
    contexte: 'covoiturage',
    ville_depart: c.ride.start_city || '',
    ville_arrivee: c.ride.end_city || '',
    created_at: msg?.created_at || new Date().toISOString(),
    admin_link: 'https://porteaporte.site/admin/operations.html'
  }).then((result) => {
    if (!result.ok) console.error('[alerte-admin] nouveau message covoiturage refusé; statut', result.status);
  }).catch(() => console.error('[alerte-admin] nouveau message covoiturage non envoyé'));
  await avisNouveauMessage(ctx, c.ride, moi, autre).catch(() => false);
  return res.status(200).json({ success: true, message: msg, masque: m.masque, avis: avisMasquage(m) });
}

async function rideMessageThread(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const rideId = id(body.ride_id), autre = id(body.other_user_id), moi = ctx.session.id;
  if (!rideId || !autre) return res.status(400).json({ error: 'ride_id et other_user_id requis' });
  let c;
  try { c = await conversation(ctx, rideId, moi, autre); } catch (e) { return res.status(503).json({ error: 'Messagerie indisponible pour le moment' }); }
  if (c.erreur) return res.status(c.erreur).json({ error: c.message });
  const messages = await messagesEntre(ctx, rideId, moi, autre);
  const nonLus = messages.filter((m) => m.recipient_id === moi && !m.read_at).map((m) => m.id);
  if (nonLus.length) {
    await fetch(`${ctx.sbUrl}/rest/v1/ride_messages?id=in.(${nonLus.join(',')})&recipient_id=eq.${moi}`, {
      method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'), body: JSON.stringify({ read_at: new Date().toISOString() }),
    }).catch(() => {});
  }
  return res.status(200).json({ ride_id: rideId, other_user_id: autre, messages, ferme: c.fermeture.ferme, ferme_le: c.fermeture.ferme_le, raisons: RAISONS_SIGNALEMENT });
}

async function rideMessageReport(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const rideId = id(body.ride_id), autre = id(body.other_user_id), moi = ctx.session.id;
  const raison = Object.prototype.hasOwnProperty.call(RAISONS_SIGNALEMENT, body.raison) ? body.raison : null;
  if (!rideId || !autre || !raison) return res.status(400).json({ error: 'ride_id, other_user_id et raison requis' });
  let c;
  try { c = await conversation(ctx, rideId, moi, autre); } catch (e) { return res.status(503).json({ error: 'Signalement impossible pour le moment' }); }
  if (c.erreur) return res.status(c.erreur).json({ error: c.message });
  const details = body.details ? String(body.details).trim().slice(0, 1000) : null;
  const r = await fetch(`${ctx.sbUrl}/rest/v1/ride_reports`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
    body: JSON.stringify({ ride_id: rideId, booking_id: c.reservations[0].id, reporter_id: moi, reported_id: autre, reason: 'messagerie:' + raison, details, status: 'ouvert' }),
  });
  const rows = await r.json().catch(() => []);
  const rapport = Array.isArray(rows) ? rows[0] : null;
  if (!r.ok || !rapport) return res.status(400).json({ error: 'Signalement impossible' });
  await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ event_type: 'messages_signales', status: 'ouvert', user_id: moi, evidence: { report_id: rapport.id, ride_id: rideId, signale: autre, raison } }),
  }).catch(() => {});
  alertAdmin('Conversation covoiturage signalée', `Un membre a signalé une conversation (${RAISONS_SIGNALEMENT[raison]}). Tu peux la lire depuis le signalement.`, {
    severity: 'warning', details: { Signalement: rapport.id, Trajet: rideId },
    cta_url: `https://porteaporte.site/admin/signalements-messages.html?report=${rapport.id}`, cta_label: 'Lire la conversation signalée →',
  });
  return res.status(200).json({ success: true, report_id: rapport.id, message: 'Merci. Ton signalement est reçu ; l’équipe PorteàPorte va lire la conversation.' });
}

// Admin : liste des signalements de messagerie, sans le contenu des messages.
async function rideMessageReports(req, res, ctx) {
  if (!ctx.session || !roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Réservé à l’admin' });
  const rows = await lire(ctx, 'ride_reports?reason=like.messagerie:*&order=created_at.desc&limit=100&select=id,ride_id,reporter_id,reported_id,reason,details,status,created_at').catch(() => []);
  return res.status(200).json({ signalements: rows.map((x) => ({ ...x, raison: RAISONS_SIGNALEMENT[String(x.reason).slice(11)] || x.reason })) });
}

// Admin : lecture d'une conversation, seulement à partir d'un signalement de messagerie ; journalisée.
async function rideMessageAdminThread(req, res, ctx, body) {
  if (!ctx.session || !roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Réservé à l’admin' });
  const reportId = id(body.report_id);
  if (!reportId) return res.status(403).json({ error: 'Lecture permise seulement à partir d’un signalement' });
  const rapport = (await lire(ctx, `ride_reports?id=eq.${reportId}&select=id,ride_id,reporter_id,reported_id,reason,details,status,created_at`).catch(() => []))[0];
  if (!rapport || !String(rapport.reason || '').startsWith('messagerie:') || !rapport.ride_id || !rapport.reported_id) {
    return res.status(403).json({ error: 'Lecture permise seulement à partir d’un signalement de messagerie' });
  }
  const messages = await messagesEntre(ctx, rapport.ride_id, rapport.reporter_id, rapport.reported_id);
  const originaux = await lire(ctx, `transaction_audit_events?event_type=eq.message_original_masque&evidence->>ride_id=eq.${rapport.ride_id}&select=user_id,evidence`).catch(() => []);
  const parId = new Map(originaux.filter((o) => o.evidence && o.evidence.message_id).map((o) => [o.evidence.message_id, o]));
  for (const msg of messages) {
    const o = parId.get(msg.id);
    if (o && o.user_id === msg.sender_id) msg.original = o.evidence.original;
  }
  await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ event_type: 'messages_lus_admin', status: 'lu', user_id: ctx.session.id, evidence: { report_id: rapport.id, ride_id: rapport.ride_id, messages: messages.length } }),
  }).catch(() => {});
  return res.status(200).json({ signalement: rapport, messages });
}

module.exports = {
  JOURS_APRES_TRAJET, RAISONS_SIGNALEMENT, MASQUE, MASQUE_CODE, AVIS_CODE, masquerCoordonnees, avisMasquage, finDuTrajet, etatFermeture,
  rideMessageSend, rideMessageThread, rideMessageReport, rideMessageReports, rideMessageAdminThread,
};
