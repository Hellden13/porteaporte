// lib/_courriel-unique.js — Un seul courriel par événement (test complet du 22 nov. 2026, point 19).
// Sans migration : une marque « courriel_envoye » dans transaction_audit_events, avec la clé de l'événement
// (ex. « ride_booking_to_driver:<réservation> »). La plus ancienne marque gagne ; les autres appels n'envoient rien.
// Si le journal est illisible, on envoie quand même (mieux vaut un doublon qu'une confirmation perdue).
'use strict';

const EVT_COURRIEL = 'courriel_envoye';

const { uneSeuleFois } = require('./_une-fois');

async function premiereFois(ctx, cle, userId = null) {
  return uneSeuleFois(ctx, cle, { eventType: EVT_COURRIEL, userId, status: 'envoye', evidence: { source: 'lib/_courriel-unique' }, failOpen: true });
}

module.exports = { premiereFois, EVT_COURRIEL };
