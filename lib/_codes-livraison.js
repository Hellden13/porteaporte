// lib/_codes-livraison.js — Les deux codes d'une livraison (test complet du 22 nov. 2026).
//
//  • Code de ramassage : à donner au livreur quand il vient chercher le colis (pickup).
//  • Code de réception : à donner à la personne qui reçoit le colis (libère le paiement).
//
// Les deux codes sont créés UNE SEULE FOIS, à la création de la livraison, et ne changent plus.
// Ils sont dérivés du secret serveur et de l'identifiant de la livraison (HMAC) : on peut donc les
// réafficher à l'expéditeur sans jamais les stocker en clair. Seuls leurs hachages sont en base.
// Avant de réafficher un code, on vérifie qu'il correspond au hachage enregistré (les vieilles
// livraisons, créées avec un code au hasard, ne sont jamais réaffichées avec un code faux).
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
const CODE_IP_MAX_PAR_HEURE = 20;
const RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1000;

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
  const ok = (code, hash) => Boolean(code && hash && hashReceptionCode(code, livraison.id) === hash);
  return {
    ramassage: c && ok(c.ramassage, livraison.pickup_code_hash) ? c.ramassage : null,
    reception: c && ok(c.reception, livraison.recipient_confirmation_hash || livraison.code_reception_hash) ? c.reception : null,
  };
}

async function insertAudit(sbUrl, sbKey, payload) {
  await fetch(`${sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify({ ...payload, retention_until: payload.retention_until || new Date(Date.now() + RETENTION_MS).toISOString() }),
  }).catch(() => {});
}

// Compte les codes faux déjà enregistrés pour une livraison. Échec fermé : { ok:false } si illisible.
async function compterEchecsCode(sbUrl, sbKey, livraisonId) {
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/transaction_audit_events?livraison_id=eq.${encodeURIComponent(livraisonId)}&event_type=eq.${CODE_ECHEC_EVENT}&select=id&limit=100`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (!r.ok) return { ok: false, n: 0 };
    const rows = await r.json();
    return Array.isArray(rows) ? { ok: true, n: rows.length } : { ok: false, n: 0 };
  } catch (_) {
    return { ok: false, n: 0 };
  }
}

// Vérifie un code de réception, avec la limite de 5 essais par livraison (journal + garde atomique).
// Ne change JAMAIS le statut de la livraison. Réponse : { ok:true } ou { ok:false, status, body }.
async function verifierCodeReception({ sbUrl, sbKey, livraison, code, req, acteurId }) {
  const codeStr = String(code == null ? '' : code).trim();
  if (!codeStr) return { ok: false, status: 400, body: { error: `${NOM_RECEPTION} requis.`, code: 'code_requis' } };
  if (codeStr.length < 6) return { ok: false, status: 400, body: { error: `${NOM_RECEPTION} invalide (6 chiffres).`, code: 'code_invalide' } };

  const ip = getClientIp(req) || 'inconnue';
  const rlIp = await checkRateLimit(`recipient-code:ip:${ip}`, CODE_IP_MAX_PAR_HEURE, 3600);
  if (!rlIp.allowed) return { ok: false, status: 429, body: { error: 'Trop d\'essais de code. Réessaie plus tard.', code: 'RATE_LIMIT' } };

  const hash = livraison.recipient_confirmation_hash || livraison.code_reception_hash || null;
  if (!hash) return { ok: false, status: 409, body: { error: 'Cette livraison n\'a pas de code de réception : validation admin requise.', requires_admin_override: true } };

  const compte = await compterEchecsCode(sbUrl, sbKey, livraison.id);
  if (!compte.ok) return { ok: false, status: 503, body: { error: 'Vérification du code indisponible. Réessaie dans un instant.' } };
  const echecs = compte.n;
  if (echecs >= CODE_MAX_ESSAIS) {
    return { ok: false, status: 423, body: { error: 'Trop d\'essais de code : cette livraison est bloquée. L\'équipe PorteàPorte a été prévenue et va vérifier.', code: 'code_bloque' } };
  }
  // Garde atomique (essais simultanés). +2 : le bon code est vérifié deux fois au moment de la remise
  // (« Marquer livré » puis libération du paiement) ; la vraie limite reste 5 codes FAUX (journal ci-dessus).
  const rlLiv = await checkRateLimit(`recipient-code:liv:${livraison.id}`, CODE_MAX_ESSAIS + 2, 30 * 86400);
  if (!rlLiv.allowed) return { ok: false, status: 423, body: { error: 'Trop d\'essais de code : cette livraison est bloquée.', code: 'code_bloque' } };

  if (hashReceptionCode(codeStr, livraison.id) === hash) return { ok: true };

  const total = echecs + 1;
  await insertAudit(sbUrl, sbKey, {
    livraison_id: livraison.id,
    user_id: livraison.expediteur_id || null,
    actor_id: acteurId || null,
    event_type: CODE_ECHEC_EVENT,
    status: 'echec',
    evidence: { source: 'lib/_codes-livraison', essai: total, max: CODE_MAX_ESSAIS, ip_hash: hashReceptionCode(ip, 'ip') },
  });
  if (total >= CODE_MAX_ESSAIS) {
    await insertAudit(sbUrl, sbKey, {
      livraison_id: livraison.id,
      user_id: livraison.expediteur_id || null,
      actor_id: acteurId || null,
      event_type: CODE_BLOQUE_EVENT,
      status: 'bloque',
      evidence: { source: 'lib/_codes-livraison', essais: total },
    });
    await alertAdmin(
      'Livraison bloquée : trop d\'essais de code de réception',
      `La livraison ${livraison.code || livraison.id} a reçu ${total} codes de réception faux. La libération du paiement par code est bloquée. Seul un admin peut la valider (avec une raison).`,
      { severity: 'critical', details: { livraison_id: livraison.id, essais: total } }
    );
  }
  return {
    ok: false,
    status: 403,
    body: {
      error: total >= CODE_MAX_ESSAIS
        ? 'Code invalide. Trop d\'essais : la livraison est bloquée et l\'équipe a été prévenue.'
        : `${NOM_RECEPTION} invalide. Rien n'a changé : le paiement reste protégé.`,
      essais_restants: Math.max(0, CODE_MAX_ESSAIS - total),
      code: total >= CODE_MAX_ESSAIS ? 'code_bloque' : 'code_invalide',
    },
  };
}

module.exports = {
  codesLivraison, codesAffichables, verifierCodeReception, compterEchecsCode, insertAudit,
  NOM_RAMASSAGE, AIDE_RAMASSAGE, NOM_RECEPTION, AIDE_RECEPTION,
  CODE_MAX_ESSAIS, CODE_ECHEC_EVENT, CODE_BLOQUE_EVENT,
};
