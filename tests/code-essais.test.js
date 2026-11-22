// tests/code-essais.test.js — Codes qui libèrent un paiement : 5 essais, puis blocage (audit sécurité, 22 nov. 2026).
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const rep = (data, ok = true, status = ok ? 200 : 500) => ({ ok, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
function makeRes() {
  return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() { return this; } };
}
const hashLiv = (code, id) => crypto.createHash('sha256').update(`${code}|${id}`).digest('hex');

// ─── Livraison : code destinataire (api/capture-livraison.js) ─────────────────
describe('capture-livraison — code destinataire', () => {
  const handler = require('../api/capture-livraison');
  const LIV = 'liv-1';
  const BON = '123456';

  function sb({ echecs = 0, auditOk = true, rlIp = true, rlLiv = true, admin = false } = {}) {
    const appels = [];
    const fetchImpl = async (url, o = {}) => {
      const m = o.method || 'GET';
      appels.push({ m, url, body: o.body ? JSON.parse(o.body) : null });
      if (url.includes('/auth/v1/user')) return admin ? rep({ id: 'adm-1' }) : rep({}, false, 401);
      if (url.includes('/rest/v1/profiles')) return rep([{ id: 'adm-1', role: admin ? 'admin' : 'expediteur' }]);
      if (url.includes('/rpc/check_rate_limit')) {
        const k = JSON.parse(o.body).p_key;
        return rep(k.includes(':ip:') ? rlIp : rlLiv);
      }
      if (url.includes('/rest/v1/transaction_audit_events') && m === 'GET') {
        return auditOk ? rep(Array.from({ length: echecs }, (_, i) => ({ id: 'e' + i }))) : rep({}, false, 500);
      }
      if (url.includes('/rest/v1/livraisons') && m === 'GET') {
        return rep([{ id: LIV, code: 'PAP-1', statut: 'livre', expediteur_id: 'exp-1', recipient_confirmation_hash: hashLiv(BON, LIV) }]);
      }
      return rep([]);
    };
    return { appels, fetchImpl };
  }
  async function appel(s, body) {
    global.fetch = s.fetchImpl;
    const res = makeRes();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9', ...(body.auth ? { authorization: 'Bearer t' } : {}) }, body: { livraison_id: LIV, ...body } }, res);
    return res;
  }
  const evenements = (a, type) => a.filter((x) => x.m === 'POST' && x.url.includes('/transaction_audit_events') && x.body?.event_type === type);
  const stripe = (a) => a.filter((x) => x.url.includes('api.stripe.com'));
  const alertes = (a) => a.filter((x) => x.url.includes('/api/notifier') && x.body?.type === 'admin_critical_alert');

  test('1er code faux : 403, essai noté au journal (livraison), 4 essais restants', async () => {
    const s = sb();
    const res = await appel(s, { recipient_code: '000000' });
    assert.equal(res._status, 403);
    assert.equal(res._body.essais_restants, 4);
    const e = evenements(s.appels, 'recipient_code_failed');
    assert.equal(e.length, 1);
    assert.equal(e[0].body.livraison_id, LIV);
    assert.equal(e[0].body.evidence.essai, 1);
    assert.deepEqual(evenements(s.appels, 'recipient_code_blocked'), []);
    assert.deepEqual(stripe(s.appels), []);
  });

  test('5e code faux : blocage noté au journal et alerte courriel à l\'admin', async () => {
    const s = sb({ echecs: 4 });
    const res = await appel(s, { recipient_code: '000000' });
    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'code_bloque');
    assert.equal(res._body.essais_restants, 0);
    assert.equal(evenements(s.appels, 'recipient_code_blocked').length, 1);
    assert.equal(alertes(s.appels).length, 1);
    assert.deepEqual(stripe(s.appels), []);
  });

  test('après 5 échecs, même le BON code est refusé (423), rien chez Stripe', async () => {
    const s = sb({ echecs: 5 });
    const res = await appel(s, { recipient_code: BON });
    assert.equal(res._status, 423);
    assert.equal(res._body.code, 'code_bloque');
    assert.deepEqual(stripe(s.appels), []);
    assert.deepEqual(evenements(s.appels, 'recipient_code_failed'), []);
  });

  test('journal illisible : refus (échec fermé), rien chez Stripe', async () => {
    const s = sb({ auditOk: false });
    const res = await appel(s, { recipient_code: BON });
    assert.equal(res._status, 503);
    assert.deepEqual(stripe(s.appels), []);
  });

  test('essais envoyés en même temps : la garde atomique par livraison bloque', async () => {
    const s = sb({ rlLiv: false });
    const res = await appel(s, { recipient_code: BON });
    assert.equal(res._status, 423);
    assert.deepEqual(stripe(s.appels), []);
  });

  test('trop d\'essais depuis la même adresse IP : 429', async () => {
    const s = sb({ rlIp: false });
    const res = await appel(s, { recipient_code: '000000' });
    assert.equal(res._status, 429);
    assert.deepEqual(stripe(s.appels), []);
  });

  test('bon code, pas encore bloqué : le blocage ne gêne pas (passe à la capture)', async () => {
    const s = sb({ echecs: 2 });
    const res = await appel(s, { recipient_code: BON });
    assert.notEqual(res._status, 423);
    assert.notEqual(res._status, 403);
    assert.deepEqual(evenements(s.appels, 'recipient_code_failed'), []);
  });

  test('livraison bloquée : l\'admin peut encore valider sans code, avec une raison', async () => {
    const s = sb({ echecs: 5, admin: true });
    const res = await appel(s, { auth: true, admin_override_reason: 'Vérifié au téléphone avec le destinataire' });
    assert.notEqual(res._status, 423);
    assert.notEqual(res._status, 403);
  });
});

// ─── Covoiturage : code de sécurité (ride-safety-code-verify) ─────────────────
describe('ride-safety-code-verify — code de sécurité du passager', () => {
  const platform = require('../api/platform');
  const PASSAGER = '55555555-5555-4555-8555-555555555555';
  const CHAUFFEUR = '66666666-6666-4666-8666-666666666666';
  const BOOKING = 'b0000000-0000-4000-8000-000000000001';
  const RIDE = 'a0000000-0000-4000-8000-000000000009';
  const HASH = bcrypt.hashSync('4321', 4);

  function sb({ essais = 0, moi = CHAUFFEUR, role = 'conducteur', rl = true } = {}) {
    const appels = [];
    const fetchImpl = async (url, o = {}) => {
      const m = o.method || 'GET';
      appels.push({ m, url, body: o.body ? JSON.parse(o.body) : null });
      if (url.includes('/auth/v1/user')) return rep({ id: moi });
      if (url.includes('/rpc/check_rate_limit')) {
        const k = JSON.parse(o.body).p_key;
        return rep(k.startsWith('ride-code:') ? rl : true);
      }
      if (url.includes('/rest/v1/profiles') && url.includes('ride_safety_code_hash')) return rep([{ id: PASSAGER, ride_safety_code_hash: null }]);
      if (url.includes('/rest/v1/profiles')) return rep([{ id: moi, role, suspendu: false }]);
      if (url.includes('/rest/v1/ride_bookings') && m === 'GET') {
        return rep([{ id: BOOKING, ride_id: RIDE, passenger_id: PASSAGER, status: 'driver_completed', safety_code_hash: HASH, safety_code_set_at: '2026-11-20T10:00:00Z', safety_code_failed_attempts: essais, safety_alert_triggered: essais >= 3 }]);
      }
      if (url.includes('/rest/v1/rides') && m === 'GET') return rep([{ id: RIDE, driver_id: CHAUFFEUR }]);
      return rep([]);
    };
    return { appels, fetchImpl };
  }
  async function verifier(s, code, actor = 'driver', endpoint = 'ride-safety-code-verify') {
    global.fetch = s.fetchImpl;
    const res = makeRes();
    await platform({ method: 'POST', url: '/api/platform', body: { endpoint, booking_id: BOOKING, code, actor }, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } }, res);
    return res;
  }
  const evenements = (a, type) => a.filter((x) => x.m === 'POST' && x.url.includes('/transaction_audit_events') && x.body?.event_type === type);
  const stripe = (a) => a.filter((x) => x.url.includes('api.stripe.com'));
  const alertes = (a) => a.filter((x) => x.url.includes('/api/notifier') && x.body?.type === 'admin_critical_alert' && /bloquée/.test(x.body?.data?.subject || ''));

  test('code faux : 403, essai compté et noté au journal', async () => {
    const s = sb();
    const res = await verifier(s, '1111');
    assert.equal(res._status, 403);
    assert.equal(res._body.attempts_remaining, 4);
    assert.equal(evenements(s.appels, 'ride_safety_code_failed').length, 1);
    const p = s.appels.find((x) => x.m === 'PATCH' && x.url.includes('/ride_bookings'));
    assert.equal(p.body.safety_code_failed_attempts, 1);
  });

  test('5e code faux : blocage au journal et alerte courriel à l\'admin', async () => {
    const s = sb({ essais: 4 });
    const res = await verifier(s, '1111');
    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'code_bloque');
    assert.equal(evenements(s.appels, 'ride_safety_code_blocked').length, 1);
    assert.equal(alertes(s.appels).length, 1);
  });

  test('après 5 échecs, même le BON code est refusé (423), aucun paiement', async () => {
    const s = sb({ essais: 5 });
    const res = await verifier(s, '4321');
    assert.equal(res._status, 423);
    assert.deepEqual(stripe(s.appels), []);
    assert.ok(!s.appels.some((x) => x.m === 'PATCH' && x.url.includes('/ride_bookings')));
  });

  test('essais envoyés en même temps : la garde atomique bloque', async () => {
    const s = sb({ rl: false });
    const res = await verifier(s, '4321');
    assert.equal(res._status, 423);
    assert.deepEqual(stripe(s.appels), []);
  });

  test('réservation bloquée : le passager ne peut pas se débloquer en changeant le code', async () => {
    const s = sb({ essais: 5, moi: PASSAGER, role: 'expediteur' });
    global.fetch = s.fetchImpl;
    const res = makeRes();
    await platform({ method: 'POST', url: '/api/platform', body: { endpoint: 'ride-safety-code-set', booking_id: BOOKING, code: '9999' }, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } }, res);
    assert.equal(res._status, 423);
    assert.ok(!s.appels.some((x) => x.m === 'PATCH' && x.url.includes('/ride_bookings')));
  });

  test('l\'admin peut remettre un code (débloquer)', async () => {
    const s = sb({ essais: 5, moi: '77777777-7777-4777-8777-777777777777', role: 'admin' });
    global.fetch = s.fetchImpl;
    const res = makeRes();
    await platform({ method: 'POST', url: '/api/platform', body: { endpoint: 'ride-safety-code-set', booking_id: BOOKING, code: '9999' }, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } }, res);
    assert.equal(res._status, 200);
    const p = s.appels.find((x) => x.m === 'PATCH' && x.url.includes('/ride_bookings'));
    assert.equal(p.body.safety_code_failed_attempts, 0);
  });
});
