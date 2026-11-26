// lib/_codes-livraison.js — Les deux codes d'une livraison.
//
//  • Code de ramassage : à donner au livreur quand il vient chercher le colis (pickup).
//  • Code de réception : à donner à la personne qui reçoit le colis (libère le paiement).
//
// Depuis le 26 nov. 2026 (point 9 de Denis) :
//  • codes AU HASARD (crypto.randomInt), jamais dérivés de l'identifiant ;
//  • en base, un hachage À CLÉ (« h2$ » + HMAC du secret serveur) : le lire ne sert à rien sans le secret
//    (l'ancien hachage SHA-256 sans clé se retrouvait en moins d'une seconde parmi 900 000 codes, et un
//    livreur pouvait lire la ligne de la livraison) ;
//  • une copie CHIFFRÉE (AES-256-GCM) dans le journal, pour réafficher les codes à l'expéditeur et à l'admin ;
//  • 5 essais faux au maximum pour CHACUN des deux codes, puis blocage et alerte admin.
// Les livraisons créées avant (codes dérivés HMAC du 22 nov.) restent valides : leur hachage est mis à
// niveau au format à clé, avec le MÊME code (mettreAJourHachages).
'use strict';

const crypto = require('crypto');
const { internalSecret, hashReceptionCode, alertAdmin, sbHeaders } = require('./_lib');
const { checkRateLimit, getClientIp } = require('./_ratelimit');

const NOM_RAMASSAGE = 'Code de ramassage';
const AIDE_RAMASSAGE = 'à donner au livreur quand il vient chercher le colis';
const NOM_RECEPTION = 'Code de réception';
const AIDE_RECEPTION = 'à donner à la personne qui reçoit le colis';

const CODE_MAX_ESSAIS = 5;
const CODE_ECHEC_EVENT = 'recipient_code_failed';
const CODE_BLOQUE_EVENT = 'recipient_code_blocked';
const PICKUP_ECHEC_EVENT = 'pickup_code_failed';
const PICKUP_BLOQUE_EVENT = 'pickup_code_blocked';
const CODES_CHIFFRES_EVENT = 'codes_livraison_chiffres';
const PREFIXE_H2 = 'h2$';
const CODE_IP_MAX_PAR_HEURE = 20;
const RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1000;

// ── Nouveaux codes (26 nov. 2026) ─────────────────────────────────────────────
function nouveauxCodes() {
  const ramassage = String(crypto.randomInt(100000, 1000000));
  let reception = String(crypto.randomInt(100000, 1000000));
  while (reception === ramassage) reception = String(crypto.randomInt(100000, 1000000));
  return { ramassage, reception };
}

// Hachage à clé. null si le secret serveur manque (échec fermé : aucun code ne correspondra).
function hacherCode(sorte, code, livraisonId) {
  const secret = internalSecret();
  const c = String(code == null ? '' : code).trim();
  if (!secret || !livraisonId || !c) return null;
  return PREFIXE_H2 + crypto.createHmac('sha256', secret).update(`pap-code|${sorte}|${livraisonId}|${c}`).digest('hex');
}

// Le code donné correspond-il au hachage en base ? Format à clé, ou ancien SHA-256 (livraisons d'avant).
function codeCorrespond(sorte, code, livraisonId, stocke) {
  if (!stocke || code == null || String(code).trim() === '') return false;
  const attendu = String(stocke).startsWith(PREFIXE_H2) ? hacherCode(sorte, code, livraisonId) : hashReceptionCode(code, livraisonId);
  if (!attendu) return false;
  const a = Buffer.from(attendu); const b = Buffer.from(String(stocke));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Chiffrement de la copie réaffichable (clé dérivée du secret serveur, jamais en base).
function cleChiffrement() {
  const secret = internalSecret();
  return secret ? crypto.createHash('sha256').update(`pap-codes-chiffrement|${secret}`).digest() : null;
}
function chiffrer(texte) {
  const cle = cleChiffrement();
  if (!cle) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  const enc = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}
function dechiffrer(paquet) {
  try {
    const cle = cleChiffrement();
    const [v, iv, tag, enc] = String(paquet || '').split('.');
    if (!cle || v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', cle, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
  } catch (_) { return null; }
}

// Crée les codes d'une nouvelle livraison : copie chiffrée au journal (user_id nul : aucun membre ne
// peut la lire), puis hachages à clé sur la livraison. Retourne les codes en clair (pour la réponse
// et le courriel de création), ou null si quelque chose manque (aucun code faux n'est jamais affiché).
async function creerCodes(ctx, livraisonId) {
  if (!ctx?.sbUrl || !ctx?.sbKey || !livraisonId || !internalSecret()) return null;
  const codes = nouveauxCodes();
  const evidence = { source: 'lib/_codes-livraison', ramassage: chiffrer(codes.ramassage), reception: chiffrer(codes.reception) };
  if (!evidence.ramassage || !evidence.reception) return null;
  const a = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ livraison_id: livraisonId, user_id: null, event_type: CODES_CHIFFRES_EVENT, status: 'cree', evidence, retention_until: new Date(Date.now() + RETENTION_MS).toISOString() }),
  }).catch(() => ({ ok: false }));
  if (!a.ok) return null;
  const p = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}`, {
    method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({
      recipient_confirmation_hash: hacherCode('reception', codes.reception, livraisonId),
      recipient_confirmation_created_at: new Date().toISOString(),
      pickup_code_hash: hacherCode('ramassage', codes.ramassage, livraisonId),
    }),
  }).catch(() => ({ ok: false }));
  return p.ok ? codes : null;
}

// Codes à réafficher (expéditeur, admin, courriels) : copie chiffrée, sinon ancien code dérivé ;
// toujours vérifiés contre le hachage en base.
async function lireCodes(ctx, livraison) {
  const vide = { ramassage: null, reception: null };
  if (!livraison?.id) return vide;
  const hashR = livraison.recipient_confirmation_hash || livraison.code_reception_hash;
  const hashP = livraison.pickup_code_hash;
  let cand = null;
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?livraison_id=eq.${encodeURIComponent(livraison.id)}&event_type=eq.${CODES_CHIFFRES_EVENT}&select=evidence&order=created_at.desc&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    const e = r.ok ? (await r.json().catch(() => []))[0] : null;
    if (e?.evidence) cand = { ramassage: dechiffrer(e.evidence.ramassage), reception: dechiffrer(e.evidence.reception) };
  } catch (_) { /* journal illisible : on essaie l'ancien code */ }
  const ancien = codesLivraison(livraison.id) || {};
  const choisir = (sorte, hash, ...codes) => codes.find((c) => c && codeCorrespond(sorte, c, livraison.id, hash)) || null;
  return {
    ramassage: choisir('ramassage', hashP, cand?.ramassage, ancien.ramassage),
    reception: choisir('reception', hashR, cand?.reception, ancien.reception),
  };
}

// Livraisons en cours d'avant le 26 nov. : leur hachage SHA-256 sans clé devient un hachage à clé,
// avec le MÊME code (rien ne change pour l'expéditeur ni pour le destinataire). Idempotent.
const STATUTS_FINIS = ['livre', 'livree', 'delivered', 'payee', 'paid', 'annulee', 'cancelled', 'annule', 'retour_expediteur', 'termine'];
async function mettreAJourHachages(ctx, { limite = 500 } = {}) {
  const out = { mis_a_jour: 0, inconnus: 0, inconnus_liste: [] };
  if (!internalSecret()) return out;
  const r = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?statut=not.in.(${STATUTS_FINIS.join(',')})&select=id,statut,prix_total,cree_le,pickup_code_hash,recipient_confirmation_hash&limit=${limite}`, { headers: sbHeaders(ctx.sbKey) });
  const lignes = r.ok ? await r.json().catch(() => []) : [];
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const patch = {};
    let inconnue = false;
    const anc = codesLivraison(l.id) || {};
    for (const [sorte, col, code] of [['ramassage', 'pickup_code_hash', anc.ramassage], ['reception', 'recipient_confirmation_hash', anc.reception]]) {
      const h = l[col];
      if (!h || String(h).startsWith(PREFIXE_H2)) continue;
      if (code && hashReceptionCode(code, l.id) === h) patch[col] = hacherCode(sorte, code, l.id);
      else inconnue = true; // vieux code au hasard : inconnu, on ne peut pas le refaire
    }
    if (inconnue) {
      out.inconnus += 1;
      // Aucune donnée personnelle : identifiant court, date, statut, montant.
      out.inconnus_liste.push({ id: String(l.id).slice(0, 8), cree_le: l.cree_le || null, statut: l.statut || null, prix_total: l.prix_total ?? null });
    }
    if (!Object.keys(patch).length) continue;
    const p = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(l.id)}`, { method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'), body: JSON.stringify(patch) }).catch(() => ({ ok: false }));
    if (p.ok) out.mis_a_jour += 1;
  }
  return out;
}

// ── Anciens codes dérivés (livraisons du 22 au 26 nov. 2026) : lecture seulement ──
function sixChiffres(sorte, livraisonId, tour) {
  const secret = internalSecret();
  if (!secret || !livraisonId) return null;
  const h = crypto.createHmac('sha256', secret).update(`pap-code-livraison|${sorte}|${livraisonId}|${tour}`).digest();
  return String(100000 + (h.readUInt32BE(0) % 900000));
}

// Les deux codes d'une livraison. null si le secret serveur manque.
function codesLivraison(livraisonId) {
  const ramassage = sixChiffres('ramassage', livraisonId, 0);
  if (!ramassage) return null;
  let reception = sixChiffres('reception', livraisonId, 0);
  for (let t = 1; reception === ramassage && t < 10; t++) reception = sixChiffres('reception', livraisonId, t);
  return { ramassage, reception };
}

// Codes à réafficher : seulement ceux qui correspondent vraiment aux hachages en base.
function codesAffichables(livraison) {
  const c = livraison?.id ? codesLivraison(livraison.id) : null;
  return {
    ramassage: c && codeCorrespond('ramassage', c.ramassage, livraison.id, livraison.pickup_code_hash) ? c.ramassage : null,
    reception: c && codeCorrespond('reception', c.reception, livraison.id, livraison.recipient_confirmation_hash || livraison.code_reception_hash) ? c.reception : null,
  };
}

async function insertAudit(sbUrl, sbKey, payload) {
  await fetch(`${sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify({ ...payload, retention_until: payload.retention_until || new Date(Date.now() + RETENTION_MS).toISOString() }),
  }).catch(() => {});
}

const SORTES = {
  reception: { nom: NOM_RECEPTION, echec: CODE_ECHEC_EVENT, bloque: CODE_BLOQUE_EVENT, colonne: (l) => l.recipient_confirmation_hash || l.code_reception_hash || null, cleRl: 'recipient-code' },
  ramassage: { nom: NOM_RAMASSAGE, echec: PICKUP_ECHEC_EVENT, bloque: PICKUP_BLOQUE_EVENT, colonne: (l) => l.pickup_code_hash || null, cleRl: 'pickup-code' },
};

// Compte les codes faux déjà enregistrés pour une livraison. Échec fermé : { ok:false } si illisible.
async function compterEchecsCode(sbUrl, sbKey, livraisonId, eventType = CODE_ECHEC_EVENT) {
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/transaction_audit_events?livraison_id=eq.${encodeURIComponent(livraisonId)}&event_type=eq.${eventType}&select=id&limit=100`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (!r.ok) return { ok: false, n: 0 };
    const rows = await r.json();
    return Array.isArray(rows) ? { ok: true, n: rows.length } : { ok: false, n: 0 };
  } catch (_) {
    return { ok: false, n: 0 };
  }
}

// Vérifie un code (réception ou ramassage), 5 essais faux au maximum par livraison (journal + garde
// atomique), 20 essais par heure par adresse IP. Ne change JAMAIS le statut de la livraison.
// Réponse : { ok:true } ou { ok:false, status, body }.
async function verifierCode({ sorte = 'reception', sbUrl, sbKey, livraison, code, req, acteurId }) {
  const S = SORTES[sorte] || SORTES.reception;
  const codeStr = String(code == null ? '' : code).trim();
  if (!codeStr) return { ok: false, status: 400, body: { error: `${S.nom} requis.`, code: 'code_requis' } };
  if (codeStr.length < 6) return { ok: false, status: 400, body: { error: `${S.nom} invalide (6 chiffres).`, code: 'code_invalide' } };

  const ip = getClientIp(req) || 'inconnue';
  const rlIp = await checkRateLimit(`${S.cleRl}:ip:${ip}`, CODE_IP_MAX_PAR_HEURE, 3600);
  if (!rlIp.allowed) return { ok: false, status: 429, body: { error: 'Trop d\'essais de code. Réessaie plus tard.', code: 'RATE_LIMIT' } };

  const hash = S.colonne(livraison);
  if (!hash) return { ok: false, status: 409, body: { error: `Cette livraison n'a pas de ${S.nom.toLowerCase()} : validation admin requise.`, requires_admin_override: true } };

  const compte = await compterEchecsCode(sbUrl, sbKey, livraison.id, S.echec);
  if (!compte.ok) return { ok: false, status: 503, body: { error: 'Vérification du code indisponible. Réessaie dans un instant.' } };
  const echecs = compte.n;
  if (echecs >= CODE_MAX_ESSAIS) {
    return { ok: false, status: 423, body: { error: 'Trop d\'essais de code : cette livraison est bloquée. L\'équipe PorteàPorte a été prévenue et va vérifier.', code: 'code_bloque' } };
  }
  // Garde atomique (essais simultanés). +2 : le bon code peut être vérifié deux fois au moment de la remise
  // (« Marquer livré » puis libération du paiement) ; la vraie limite reste 5 codes FAUX (journal ci-dessus).
  const rlLiv = await checkRateLimit(`${S.cleRl}:liv:${livraison.id}`, CODE_MAX_ESSAIS + 2, 30 * 86400);
  if (!rlLiv.allowed) return { ok: false, status: 423, body: { error: 'Trop d\'essais de code : cette livraison est bloquée.', code: 'code_bloque' } };

  if (codeCorrespond(sorte, codeStr, livraison.id, hash)) return { ok: true };

  const total = echecs + 1;
  await insertAudit(sbUrl, sbKey, {
    livraison_id: livraison.id,
    user_id: livraison.expediteur_id || null,
    actor_id: acteurId || null,
    event_type: S.echec,
    status: 'echec',
    evidence: { source: 'lib/_codes-livraison', essai: total, max: CODE_MAX_ESSAIS, ip_hash: hashReceptionCode(ip, 'ip') },
  });
  if (total >= CODE_MAX_ESSAIS) {
    await insertAudit(sbUrl, sbKey, {
      livraison_id: livraison.id,
      user_id: livraison.expediteur_id || null,
      actor_id: acteurId || null,
      event_type: S.bloque,
      status: 'bloque',
      evidence: { source: 'lib/_codes-livraison', essais: total },
    });
    await alertAdmin(
      `Livraison bloquée : trop d'essais de ${S.nom.toLowerCase()}`,
      `La livraison ${livraison.code || livraison.id} a reçu ${total} codes faux (${S.nom.toLowerCase()}). Ce code est bloqué. Seul un admin peut débloquer (avec une raison).`,
      { severity: 'critical', details: { livraison_id: livraison.id, essais: total } }
    );
  }
  return {
    ok: false,
    status: 403,
    body: {
      error: total >= CODE_MAX_ESSAIS
        ? 'Code invalide. Trop d\'essais : la livraison est bloquée et l\'équipe a été prévenue.'
        : (sorte === 'ramassage' ? `${S.nom} invalide. Demande-le à l'expéditeur.` : `${S.nom} invalide. Rien n'a changé : le paiement reste protégé.`),
      essais_restants: Math.max(0, CODE_MAX_ESSAIS - total),
      code: total >= CODE_MAX_ESSAIS ? 'code_bloque' : 'code_invalide',
    },
  };
}

function verifierCodeReception(o) { return verifierCode({ ...o, sorte: 'reception' }); }
function verifierCodeRamassage(o) { return verifierCode({ ...o, sorte: 'ramassage' }); }

module.exports = {
  codesLivraison, codesAffichables, verifierCodeReception, verifierCodeRamassage, verifierCode, compterEchecsCode, insertAudit,
  nouveauxCodes, hacherCode, codeCorrespond, chiffrer, dechiffrer, creerCodes, lireCodes, mettreAJourHachages,
  PICKUP_ECHEC_EVENT, PICKUP_BLOQUE_EVENT, CODES_CHIFFRES_EVENT, PREFIXE_H2,
  NOM_RAMASSAGE, AIDE_RAMASSAGE, NOM_RECEPTION, AIDE_RECEPTION,
  CODE_MAX_ESSAIS, CODE_ECHEC_EVENT, CODE_BLOQUE_EVENT,
};
