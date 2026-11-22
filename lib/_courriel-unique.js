// lib/_courriel-unique.js — Un seul courriel par événement (test complet du 22 nov. 2026, point 19).
// Sans migration : une marque « courriel_envoye » dans transaction_audit_events, avec la clé de l'événement
// (ex. « ride_booking_to_driver:<réservation> »). La plus ancienne marque gagne ; les autres appels n'envoient rien.
// Si le journal est illisible, on envoie quand même (mieux vaut un doublon qu'une confirmation perdue).
'use strict';

const { sbHeaders } = require('./_lib');

const EVT_COURRIEL = 'courriel_envoye';

async function premiereFois(ctx, cle, userId = null) {
  if (!ctx?.sbUrl || !ctx?.sbKey || !cle) return true;
  try {
    const p = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
      method: 'POST',
      headers: sbHeaders(ctx.sbKey, 'return=representation'),
      body: JSON.stringify({ user_id: userId, event_type: EVT_COURRIEL, status: 'envoye', evidence: { cle, source: 'lib/_courriel-unique' } }),
    });
    if (!p.ok) return true;
    const moi = (await p.json().catch(() => []))?.[0];
    if (!moi?.id) return true;
    const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${EVT_COURRIEL}&evidence->>cle=eq.${encodeURIComponent(cle)}&select=id,created_at&order=created_at.asc,id.asc&limit=5`, {
      headers: sbHeaders(ctx.sbKey),
    });
    if (!r.ok) return true;
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows) || !rows.length) return true;
    return rows[0].id === moi.id;
  } catch (_) {
    return true;
  }
}

module.exports = { premiereFois, EVT_COURRIEL };
