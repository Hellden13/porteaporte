// lib/_grand-livre.js — Grand livre (table transactions) aligné sur la VRAIE table de production
// (décision de Denis, 24 nov. 2026 : on adapte le code, aucune migration possible).
//
// Colonnes de production : id, user_id, livraison_id, type, montant_cad, montant_coins, description,
//                          stripe_id, meta (jsonb), solde_avant, solde_apres, cree_le.
// Le code parlait de montant / statut / stripe_payment_intent / metadata / created_at, qui n'existent pas :
// toutes ces écritures échouaient en silence. Ici :
//   montant → montant_cad · stripe_payment_intent → stripe_id · metadata → meta · created_at → cree_le
//   statut (aucune colonne) → meta.statut
// Le reste du code continue de manipuler la forme « applicative » grâce à depuisBase().
'use strict';

const COLONNES = 'id,user_id,livraison_id,type,montant_cad,description,stripe_id,meta,cree_le';

const entetes = (cle, prefer) => ({
  apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}),
});

// Forme applicative → ligne de la table.
function versBase(e) {
  const meta = { ...(e.metadata || e.meta || {}) };
  if (e.statut !== undefined && e.statut !== null) meta.statut = e.statut;
  const ligne = {
    user_id: e.user_id || null,
    livraison_id: e.livraison_id || null,
    type: e.type,
    montant_cad: e.montant == null ? null : Math.round(Number(e.montant) * 100) / 100,
    description: e.description || e.type || null,
    stripe_id: e.stripe_payment_intent || e.stripe_id || null,
    meta,
  };
  return ligne;
}

// Ligne de la table → forme applicative (les anciens noms restent lisibles par le reste du code).
function depuisBase(l) {
  if (!l) return null;
  const meta = l.meta || {};
  return {
    ...l,
    montant: l.montant_cad == null ? null : Number(l.montant_cad),
    statut: meta.statut || null,
    stripe_payment_intent: l.stripe_id || null,
    metadata: meta,
    created_at: l.cree_le || null,
  };
}

// Filtres PostgREST sur les anciens noms → vrais noms.
const filtre = {
  pi: (pi) => `stripe_id=eq.${encodeURIComponent(pi)}`,
  statut: (s) => `meta->>statut=eq.${encodeURIComponent(s)}`,
};

async function ecrire(ctx, e, prefer = 'return=representation') {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transactions`, {
    method: 'POST', headers: entetes(ctx.sbKey, prefer), body: JSON.stringify(versBase(e)),
  }).catch(() => null);
  if (!r || !r.ok) return { ok: false, status: r ? r.status : 0 };
  const d = await r.json().catch(() => null);
  return { ok: true, data: depuisBase(Array.isArray(d) ? d[0] : d) };
}

async function lire(ctx, requete) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transactions?${requete ? requete + '&' : ''}select=${COLONNES}`, {
    headers: entetes(ctx.sbKey),
  }).catch(() => null);
  if (!r || !r.ok) return { ok: false, rows: [] };
  const rows = await r.json().catch(() => []);
  return { ok: true, rows: (Array.isArray(rows) ? rows : []).map(depuisBase) };
}

// Met à jour statut / metadata (fusionnés dans meta) / montant des lignes visées par `requete` (ex. filtre.pi(pi)).
async function majLignes(ctx, requete, { statut, metadata, montant } = {}) {
  const { ok, rows } = await lire(ctx, requete);
  if (!ok) return false;
  let tout = rows.length > 0;
  for (const l of rows) {
    const meta = { ...(l.meta || {}), ...(metadata || {}) };
    if (statut !== undefined) meta.statut = statut;
    const patch = { meta };
    if (montant !== undefined) patch.montant_cad = Math.round(Number(montant) * 100) / 100;
    const r = await fetch(`${ctx.sbUrl}/rest/v1/transactions?id=eq.${encodeURIComponent(l.id)}`, {
      method: 'PATCH', headers: entetes(ctx.sbKey, 'return=minimal'), body: JSON.stringify(patch),
    }).catch(() => null);
    if (!r || !r.ok) tout = false;
  }
  return tout;
}

module.exports = { COLONNES, versBase, depuisBase, filtre, ecrire, lire, majLignes };
