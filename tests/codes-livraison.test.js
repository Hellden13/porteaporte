// tests/codes-livraison.test.js — Test complet du 22 nov. 2026, bloquants 1 à 4 :
//  1. un seul code de réception (créé à la création, jamais regénéré à l'assignation);
//  2. deux codes bien nommés, visibles par l'expéditeur;
//  3. « Marquer livré » : code vérifié AVANT tout changement de statut (5 essais);
//  4. le pickup exige le bon code de ramassage pour TOUT le monde, admin compris.
'use strict';

const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
  process.env.SITE_URL = 'https://porteaporte.site';
});

const platform = require('../api/platform');
const { codesLivraison, codesAffichables, codeCorrespond, PREFIXE_H2 } = require('../lib/_codes-livraison');
const { hashReceptionCode } = require('../lib/_lib');

const EXP = '11111111-1111-4111-8111-111111111111';
const LIVREUR = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const AUTRE = '44444444-4444-4444-8444-444444444444';
const LIV_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const PROFILS = {
  [EXP]: { id: EXP, role: 'expediteur', email: 'exp@courriel-capture.ca', prenom: 'Exp', suspendu: false, email_verified: true, est_expediteur: true },
  [LIVREUR]: { id: LIVREUR, role: 'livreur', email: 'liv@courriel-capture.ca', prenom: 'Liv', suspendu: false, email_verified: true, driver_status: 'verified', transport_mode: 'auto' },
  [ADMIN]: { id: ADMIN, role: 'admin', email: 'adm@courriel-capture.ca', prenom: 'Adm', suspendu: false, email_verified: true, driver_status: 'verified' },
  [AUTRE]: { id: AUTRE, role: 'expediteur', email: 'autre@courriel-capture.ca', prenom: 'Autre', suspendu: false, email_verified: true },
};

const rep = (data, ok = true, status = ok ? 200 : 500) => ({ ok, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
function makeRes() {
  return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() { return this; } };
}

// Petite base en mémoire : livraisons, journal, compteurs atomiques, courriels envoyés.
let db;
function nouvelleBase(livraison) {
  db = { livraisons: livraison ? [{ ...livraison }] : [], audit: [], rl: {}, courriels: [], patches: [] };
}
async function fakeFetch(url, o = {}) {
  const m = o.method || 'GET';
  const body = o.body ? JSON.parse(o.body) : null;
  const token = (o.headers?.Authorization || o.headers?.authorization || '').replace('Bearer ', '');
  if (url.includes('/auth/v1/user')) return PROFILS[token] ? rep({ id: token, email: PROFILS[token].email, email_confirmed_at: '2026-01-01T00:00:00Z' }) : rep({}, false, 401);
  if (url.includes('/api/notifier')) { db.courriels.push(body); return rep({ success: true }); }
  if (url.includes('/rpc/check_rate_limit')) {
    db.rl[body.p_key] = (db.rl[body.p_key] || 0) + 1;
    return rep(db.rl[body.p_key] <= body.p_max);
  }
  if (url.includes('/rest/v1/profiles')) {
    const id = (url.match(/id=eq\.([0-9a-f-]{36})/) || [])[1];
    return rep(PROFILS[id] ? [PROFILS[id]] : []);
  }
  if (url.includes('/rest/v1/transaction_audit_events')) {
    if (m === 'POST') { db.audit.push(body); return rep([body]); }
    const lid = decodeURIComponent((url.match(/livraison_id=eq\.([^&]+)/) || [])[1] || '');
    const type = (url.match(/event_type=eq\.([^&]+)/) || [])[1];
    return rep(db.audit.filter((e) => (!lid || e.livraison_id === lid) && (!type || e.event_type === type)).map((e, i) => ({ id: 'e' + i, ...e })).reverse());
  }
  if (url.includes('/rest/v1/livraisons')) {
    if (m === 'POST') {
      const l = { id: LIV_ID, code: 'PP-TEST0001', statut: 'en_attente', ...body };
      db.livraisons.push(l);
      return rep([l], true, 201);
    }
    const id = decodeURIComponent((url.match(/id=eq\.([^&]+)/) || [])[1] || '');
    const rows = db.livraisons.filter((l) => l.id === id);
    if (m === 'PATCH') { db.patches.push(body); rows.forEach((l) => Object.assign(l, body)); return rep(rows); }
    return rep(rows);
  }
  return rep([]);
}

async function appel(token, body) {
  global.fetch = fakeFetch;
  const res = makeRes();
  await platform({ method: 'POST', url: '/api/platform', query: {}, body, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' } }, res);
  return res;
}

const statut = () => db.livraisons[0].statut;
const hashes = () => ({ r: db.livraisons[0].recipient_confirmation_hash, p: db.livraisons[0].pickup_code_hash });

function livraisonPayee(extra = {}) {
  const c = codesLivraison(LIV_ID);
  return {
    id: LIV_ID, code: 'PP-TEST0001', expediteur_id: EXP, livreur_id: null, statut: 'paiement_autorise',
    ville_depart: 'Lévis', ville_arrivee: 'Québec', type_colis: 'document', poids_kg: 0.2,
    recipient_confirmation_hash: hashReceptionCode(c.reception, LIV_ID),
    pickup_code_hash: hashReceptionCode(c.ramassage, LIV_ID),
    ...extra,
  };
}

describe('codes d\'une livraison — dérivation', () => {
  test('6 chiffres, toujours les mêmes, ramassage différent de réception', () => {
    const a = codesLivraison(LIV_ID);
    const b = codesLivraison(LIV_ID);
    assert.deepEqual(a, b);
    assert.match(a.ramassage, /^\d{6}$/);
    assert.match(a.reception, /^\d{6}$/);
    assert.notEqual(a.ramassage, a.reception);
    assert.notDeepEqual(codesLivraison('bbbbbbbb-0000-4000-8000-000000000002'), a);
  });

  test('sans secret serveur : aucun code dérivé', () => {
    const avant = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_SECRET = '';
    try { assert.equal(codesLivraison(LIV_ID), null); } finally { process.env.INTERNAL_API_SECRET = avant; }
  });

  test('vieille livraison (code au hasard) : rien n\'est réaffiché', () => {
    const c = codesAffichables({ id: LIV_ID, recipient_confirmation_hash: hashReceptionCode('999999', LIV_ID), pickup_code_hash: hashReceptionCode('888888', LIV_ID) });
    assert.deepEqual(c, { ramassage: null, reception: null });
  });
});

describe('1. un seul code de réception', () => {
  beforeEach(() => nouvelleBase());

  test('création : hachages enregistrés = codes affichés = codes du courriel', async () => {
    const res = await appel(EXP, { endpoint: 'create-livraison', ville_depart: 'Lévis', ville_arrivee: 'Québec', adresse_depart: '1 rue A, Lévis', adresse_arrivee: '2 rue B, Québec', prix_total: 30, type_colis: 'document' });
    assert.equal(res._status, 200, JSON.stringify(res._body));
    // 26 nov. 2026 : codes au hasard (plus dérivés de l'identifiant), hachages À CLÉ en base.
    const c = { reception: res._body.recipient_confirmation_code, ramassage: res._body.pickup_code };
    assert.match(c.reception, /^\d{6}$/);
    assert.match(c.ramassage, /^\d{6}$/);
    assert.notEqual(c.reception, codesLivraison(LIV_ID).reception, 'pas l’ancien code dérivé');
    assert.ok(hashes().r.startsWith(PREFIXE_H2) && hashes().p.startsWith(PREFIXE_H2));
    assert.ok(codeCorrespond('reception', c.reception, LIV_ID, hashes().r));
    assert.ok(codeCorrespond('ramassage', c.ramassage, LIV_ID, hashes().p));
    // L'expéditeur revoit les mêmes codes (copie chiffrée).
    const vus = await appel(EXP, { endpoint: 'livraison-codes', livraison_id: LIV_ID });
    assert.equal(vus._body.code_reception, c.reception);
    assert.equal(vus._body.code_ramassage, c.ramassage);
    const mail = db.courriels.find((x) => x.type === 'livraison_creee_expediteur');
    assert.equal(mail.data.recipient_code, c.reception);
    assert.equal(mail.data.pickup_code, c.ramassage);
  });

  test('assignation : les hachages ne changent PAS et le courriel rappelle les mêmes codes', async () => {
    nouvelleBase(livraisonPayee());
    const avant = hashes();
    const res = await appel(ADMIN, { endpoint: 'assign-driver', livraison_id: LIV_ID, livreur_id: LIVREUR });
    assert.equal(res._status, 200, JSON.stringify(res._body));
    assert.deepEqual(hashes(), avant);
    for (const p of db.patches) {
      assert.ok(!('recipient_confirmation_hash' in p), 'aucun nouveau code de réception');
      assert.ok(!('pickup_code_hash' in p), 'aucun nouveau code de ramassage');
    }
    const c = codesLivraison(LIV_ID);
    const mail = db.courriels.find((x) => x.type === 'code_confirmation_livraison');
    assert.equal(mail.data.code_reception, c.reception);
    assert.equal(mail.data.code_ramassage, c.ramassage);
    assert.ok(!('code' in mail.data), 'plus de « code de livraison » ambigu');
  });

  test('chemin complet : création → assignation → le code de la création marque bien livré', async () => {
    const cree = await appel(EXP, { endpoint: 'create-livraison', ville_depart: 'Lévis', ville_arrivee: 'Québec', adresse_depart: '1 rue A, Lévis', adresse_arrivee: '2 rue B, Québec', prix_total: 30, type_colis: 'document' });
    const codeAffiche = cree._body.recipient_confirmation_code;
    db.livraisons[0].statut = 'paiement_autorise';
    await appel(ADMIN, { endpoint: 'assign-driver', livraison_id: LIV_ID, livreur_id: LIVREUR });
    db.livraisons[0].statut = 'ramasse';
    const res = await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: codeAffiche });
    assert.equal(res._status, 200, JSON.stringify(res._body));
    assert.equal(statut(), 'livre');
  });
});

describe('2. l\'expéditeur voit ses deux codes', () => {
  beforeEach(() => nouvelleBase(livraisonPayee()));

  test('l\'expéditeur reçoit les deux codes, avec leurs noms', async () => {
    const res = await appel(EXP, { endpoint: 'livraison-codes', livraison_id: LIV_ID });
    assert.equal(res._status, 200);
    const c = codesLivraison(LIV_ID);
    assert.equal(res._body.code_ramassage, c.ramassage);
    assert.equal(res._body.code_reception, c.reception);
    assert.match(res._body.noms.ramassage, /^Code de ramassage — à donner au livreur quand il vient chercher le colis$/);
    assert.match(res._body.noms.reception, /^Code de réception — à donner à la personne qui reçoit le colis$/);
  });

  test('un autre membre ne voit rien (403), le livreur non plus', async () => {
    assert.equal((await appel(AUTRE, { endpoint: 'livraison-codes', livraison_id: LIV_ID }))._status, 403);
    db.livraisons[0].livreur_id = LIVREUR;
    const r = await appel(LIVREUR, { endpoint: 'livraison-codes', livraison_id: LIV_ID });
    assert.equal(r._status, 403);
    assert.equal(r._body.code_reception, undefined);
  });
});

describe('3. « Marquer livré » : code vérifié avant tout changement', () => {
  beforeEach(() => nouvelleBase(livraisonPayee({ livreur_id: LIVREUR, statut: 'ramasse' })));

  test('code faux : 403, statut inchangé, aucun PATCH, essai noté au journal', async () => {
    const res = await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: '000000' });
    assert.equal(res._status, 403);
    assert.equal(res._body.essais_restants, 4);
    assert.equal(statut(), 'ramasse');
    assert.deepEqual(db.patches, []);
    assert.equal(db.audit.filter((e) => e.event_type === 'recipient_code_failed' && e.livraison_id === LIV_ID).length, 1);
  });

  test('code absent (fenêtre annulée côté serveur) : 400, statut inchangé', async () => {
    const res = await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID });
    assert.equal(res._status, 400);
    assert.equal(statut(), 'ramasse');
    assert.deepEqual(db.patches, []);
  });

  test('bon code de RAMASSAGE à la place du code de réception : refusé', async () => {
    const res = await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: codesLivraison(LIV_ID).ramassage });
    assert.equal(res._status, 403);
    assert.equal(statut(), 'ramasse');
  });

  test('bon code : statut « livre »', async () => {
    const res = await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: codesLivraison(LIV_ID).reception });
    assert.equal(res._status, 200);
    assert.equal(statut(), 'livre');
  });

  test('5 codes faux : bloqué (423), même le bon code ne change plus rien', async () => {
    for (let i = 0; i < 5; i++) await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: '00000' + i });
    assert.equal(db.audit.filter((e) => e.event_type === 'recipient_code_blocked').length, 1);
    const res = await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: codesLivraison(LIV_ID).reception });
    assert.equal(res._status, 423);
    assert.equal(statut(), 'ramasse');
    assert.deepEqual(db.patches, []);
  });

  test('admin avec un code faux : refusé aussi, statut inchangé', async () => {
    const res = await appel(ADMIN, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: '000000' });
    assert.equal(res._status, 403);
    assert.equal(statut(), 'ramasse');
  });

  test('remise normale : bon code à « Marquer livré » puis à la libération, pas de blocage après 4 essais ratés', async () => {
    for (let i = 0; i < 4; i++) await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: '00000' + i });
    const ok = await appel(LIVREUR, { endpoint: 'confirm-delivery', livraison_id: LIV_ID, recipient_code: codesLivraison(LIV_ID).reception });
    assert.equal(ok._status, 200);
    const handler = require('../api/capture-livraison');
    const res = makeRes();
    global.fetch = fakeFetch;
    await handler({ method: 'POST', headers: { authorization: 'Bearer ' + LIVREUR, 'x-forwarded-for': '203.0.113.7' }, body: { livraison_id: LIV_ID, recipient_code: codesLivraison(LIV_ID).reception } }, res);
    assert.notEqual(res._status, 423, JSON.stringify(res._body));
    assert.notEqual(res._status, 403, JSON.stringify(res._body));
  });
});

describe('4. pickup : bon code de ramassage pour tout le monde', () => {
  beforeEach(() => nouvelleBase(livraisonPayee({ livreur_id: LIVREUR, statut: 'confirme' })));

  test('livreur, code faux : 403, statut inchangé', async () => {
    const res = await appel(LIVREUR, { endpoint: 'livraison-pickup', livraison_id: LIV_ID, pickup_code: '000000' });
    assert.equal(res._status, 403);
    assert.equal(statut(), 'confirme');
  });

  test('ADMIN, code faux : 403 aussi (plus d\'exemption), statut inchangé', async () => {
    const res = await appel(ADMIN, { endpoint: 'livraison-pickup', livraison_id: LIV_ID, pickup_code: '000000' });
    assert.equal(res._status, 403);
    assert.match(res._body.error, /Code de ramassage invalide/);
    assert.equal(statut(), 'confirme');
    assert.deepEqual(db.patches, []);
  });

  test('le code de RÉCEPTION ne sert pas de code de ramassage', async () => {
    const res = await appel(LIVREUR, { endpoint: 'livraison-pickup', livraison_id: LIV_ID, pickup_code: codesLivraison(LIV_ID).reception });
    assert.equal(res._status, 403);
  });

  test('livreur, bon code : ramassé', async () => {
    const res = await appel(LIVREUR, { endpoint: 'livraison-pickup', livraison_id: LIV_ID, pickup_code: codesLivraison(LIV_ID).ramassage });
    assert.equal(res._status, 200);
    assert.equal(statut(), 'ramasse');
  });

  test('admin, bon code : ramassé', async () => {
    const res = await appel(ADMIN, { endpoint: 'livraison-pickup', livraison_id: LIV_ID, pickup_code: codesLivraison(LIV_ID).ramassage });
    assert.equal(res._status, 200);
    assert.equal(statut(), 'ramasse');
  });
});

// Lot 3 (26 nov. 2026) : la protection « Plus » (5,99 $ / 1 000 $) est refusée à la création, sous toutes ses formes.
describe('protection colis : « Plus » refusé à la création, maximum 250 $', () => {
  beforeEach(() => nouvelleBase());
  const base = { endpoint: 'create-livraison', ville_depart: 'Lévis', ville_arrivee: 'Québec', adresse_depart: '1 rue A, Lévis', adresse_arrivee: '2 rue B, Québec', prix_total: 30, type_colis: 'document' };
  for (const plan of ['plus', 'Plus', 'Plus - 5,99 $ - couverture max 1 000 $', '5.99', 'Protection Plus']) {
    test(`« ${plan} » → 400 protection_plus_indisponible, aucune livraison créée`, async () => {
      const res = await appel(EXP, { ...base, assurance_plan: plan });
      assert.equal(res._status, 400, JSON.stringify(res._body));
      assert.equal(res._body.code, 'protection_plus_indisponible');
      assert.equal(res._body.plafond_cad, 250);
      assert.equal(db.livraisons.length, 0);
    });
  }
  for (const plan of ['none', 'base', 'standard', 'Standard - 2,99 $ - couverture max 250 $', undefined]) {
    test(`« ${plan} » accepté`, async () => {
      const res = await appel(EXP, { ...base, assurance_plan: plan });
      assert.equal(res._status, 200, JSON.stringify(res._body));
      assert.equal(db.livraisons.length, 1);
    });
  }
  test('les livraisons existantes en « Plus » ne sont pas touchées : la prime reste comptée à la répartition', () => {
    const { primeProtectionCents } = require('../js/repartition');
    assert.equal(primeProtectionCents('plus'), 599);
  });
});
