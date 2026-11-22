// lib/_une-fois.js — « Une seule fois par clé », sans migration.
// Une marque est écrite dans transaction_audit_events (event_type + evidence.cle) ; la plus ancienne
// marque d'une clé gagne, les appels suivants (même simultanés) reçoivent false.
//   failOpen = true  : journal illisible → true (courriels : mieux vaut un doublon qu'une perte).
//   failOpen = false : journal illisible → false (récompenses, journal d'argent : jamais deux fois).
'use strict';

const { sbHeaders } = require('./_lib');

async function uneSeuleFois(ctx, cle, { eventType, userId = null, livraisonId = null, status = 'fait', evidence = {}, amountCents = null, failOpen = false } = {}) {
  const echec = failOpen;
  if (!ctx?.sbUrl || !ctx?.sbKey || !cle || !eventType) return echec;
  try {
    const ligne = { user_id: userId, event_type: eventType, status, evidence: { ...evidence, cle } };
    if (livraisonId) ligne.livraison_id = livraisonId;
    if (amountCents != null) ligne.amount_cents = amountCents;
    const p = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
      method: 'POST',
      headers: sbHeaders(ctx.sbKey, 'return=representation'),
      body: JSON.stringify(ligne),
    });
    if (!p.ok) return echec;
    const moi = (await p.json().catch(() => []))?.[0];
    if (!moi?.id) return echec;
    const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${encodeURIComponent(eventType)}&evidence->>cle=eq.${encodeURIComponent(cle)}&select=id,created_at&order=created_at.asc,id.asc&limit=5`, {
      headers: sbHeaders(ctx.sbKey),
    });
    if (!r.ok) return echec;
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows) || !rows.length) return echec;
    if (rows[0].id === moi.id) return true;
    // Doublon perdant : on retire sa marque pour que les totaux du journal restent exacts.
    await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?id=eq.${encodeURIComponent(moi.id)}`, {
      method: 'DELETE', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    }).catch(() => {});
    return false;
  } catch (_) {
    return echec;
  }
}

module.exports = { uneSeuleFois };
