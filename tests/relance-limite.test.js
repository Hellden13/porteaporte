// tests/relance-limite.test.js — « Relancer » : un seul envoi par compte aux 7 jours (journal d'audit, sans migration).
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

before(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const { adminVerificationReminder, jjmm, messageDejaRelance, EVT_RELANCE } = require('../lib/_relance');
const { construireAFaire } = require('../lib/_admin-a-faire');

const MEMBRE = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const NOW = Date.parse('2026-11-22T15:00:00Z'); // 22 nov., 10 h au Québec
const JOUR = 86400000;
const rep = (data, ok = true, status = ok ? 200 : 500) => ({ ok, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
function makeRes() {
  return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() { return this; } };
}

// marques : ce que le journal contient avant; `concurrente` : une marque plus ancienne apparaît pendant l'insertion.
function sb({ marques = [], lectureOk = true, insertOk = true, insertRefuseAvecCorps = false, envoiOk = true, concurrente = null, verifie = false } = {}) {
  const appels = [];
  let lectures = 0;
  const fetchImpl = async (url, o = {}) => {
    const m = o.method || 'GET';
    appels.push({ m, url, body: o.body ? JSON.parse(o.body) : null });
    if (url.includes('/rest/v1/profiles')) return rep([{ id: MEMBRE, email: 'membre@example.com', prenom: 'Julie', driver_status: verifie ? 'verified' : 'not_started' }]);
    if (url.includes('/rest/v1/transaction_audit_events') && m === 'GET') {
      lectures += 1;
      if (!lectureOk) return rep({}, false, 500);
      if (lectures === 1) return rep(marques);
      return rep([...(concurrente ? [concurrente] : []), ...marques, { id: 'ma-marque', created_at: new Date(NOW).toISOString() }]);
    }
    if (url.includes('/rest/v1/transaction_audit_events') && m === 'POST' && insertRefuseAvecCorps) return rep([{ id: 'ma-marque' }], false, 409);
    if (url.includes('/rest/v1/transaction_audit_events') && m === 'POST') return insertOk ? rep([{ id: 'ma-marque' }], true, 201) : rep({}, false, 500);
    if (url.includes('/rest/v1/transaction_audit_events') && m === 'PATCH') return rep([], true, 204);
    if (url.includes('/api/notifier')) return envoiOk ? rep({ success: true }) : rep({ success: false, error: 'Resend a refusé' }, false, 500);
    return rep([]);
  };
  return { appels, fetchImpl };
}
const ctx = { sbUrl: 'https://fake.supabase.co', sbKey: 'k', profile: { id: ADMIN, role: 'admin' }, session: { id: ADMIN } };
async function relancer(s, now = NOW, c = ctx) {
  global.fetch = s.fetchImpl;
  const res = makeRes();
  await adminVerificationReminder({}, res, c, { user_id: MEMBRE }, now);
  return res;
}
const courriels = (a) => a.filter((x) => x.url.includes('/api/notifier'));
const marquesPosees = (a) => a.filter((x) => x.m === 'POST' && x.url.includes('/transaction_audit_events'));
const patchs = (a) => a.filter((x) => x.m === 'PATCH' && x.url.includes('/transaction_audit_events'));

describe('Relancer — limite de 7 jours (serveur)', () => {
  test('jamais relancé : envoi, marque au journal (membre, admin, date)', async () => {
    const s = sb();
    const res = await relancer(s);
    assert.equal(res._status, 200);
    assert.equal(courriels(s.appels).length, 1);
    const [mq] = marquesPosees(s.appels);
    assert.equal(mq.body.event_type, EVT_RELANCE);
    assert.equal(mq.body.status, 'envoye');
    assert.equal(mq.body.user_id, MEMBRE);
    assert.equal(mq.body.actor_id, ADMIN);
    assert.equal(mq.body.evidence.envoye_le, new Date(NOW).toISOString());
    assert.deepEqual(patchs(s.appels), []);
  });

  test('la lecture ne compte que les envois réussis des 7 derniers jours, pour CE membre', async () => {
    const s = sb();
    await relancer(s);
    const lecture = s.appels.find((x) => x.m === 'GET' && x.url.includes('/transaction_audit_events'));
    assert.match(lecture.url, new RegExp(`event_type=eq\\.${EVT_RELANCE}`));
    assert.match(lecture.url, /status=eq\.envoye/);
    assert.match(lecture.url, new RegExp(`user_id=eq\\.${MEMBRE}`));
    assert.ok(lecture.url.includes(`created_at=gt.${encodeURIComponent(new Date(NOW - 7 * JOUR).toISOString())}`));
  });

  test('relancé il y a 3 jours : refus 429 avec le message JJ/MM, aucun courriel, aucune marque', async () => {
    const s = sb({ marques: [{ id: 'm1', created_at: '2026-11-19T15:00:00Z' }] });
    const res = await relancer(s);
    assert.equal(res._status, 429);
    assert.equal(res._body.code, 'deja_relance');
    assert.equal(res._body.error, 'Déjà relancé le 19/11, réessaie après le 26/11.');
    assert.equal(res._body.prochain_envoi, '2026-11-26T15:00:00.000Z');
    assert.deepEqual(courriels(s.appels), []);
    assert.deepEqual(marquesPosees(s.appels), []);
  });

  test('journal illisible : refus (échec fermé), aucun courriel', async () => {
    const s = sb({ lectureOk: false });
    const res = await relancer(s);
    assert.equal(res._status, 503);
    assert.deepEqual(courriels(s.appels), []);
  });

  test('marque impossible à écrire : aucun courriel', async () => {
    const s = sb({ insertOk: false });
    const res = await relancer(s);
    assert.equal(res._status, 503);
    assert.deepEqual(courriels(s.appels), []);
  });

  test('marque refusée par la base (409), même avec un corps : aucun courriel', async () => {
    const s = sb({ insertRefuseAvecCorps: true });
    const res = await relancer(s);
    assert.equal(res._status, 503);
    assert.deepEqual(courriels(s.appels), []);
  });

  test('deux clics en même temps : le second est refusé, sa marque passe à « doublon »', async () => {
    const s = sb({ concurrente: { id: 'autre', created_at: new Date(NOW - 1000).toISOString() } });
    const res = await relancer(s);
    assert.equal(res._status, 429);
    assert.deepEqual(courriels(s.appels), []);
    const [p] = patchs(s.appels);
    assert.match(p.url, /id=eq\.ma-marque/);
    assert.equal(p.body.status, 'doublon');
  });

  test('envoi raté : la marque passe à « echec » (ne bloque pas un nouvel essai)', async () => {
    const s = sb({ envoiOk: false });
    const res = await relancer(s);
    assert.equal(res._status, 502);
    const [p] = patchs(s.appels);
    assert.match(p.url, /id=eq\.ma-marque/);
    assert.equal(p.body.status, 'echec');
  });

  test('non-admin : 403, rien lu ni envoyé', async () => {
    const s = sb();
    const res = await relancer(s, NOW, { ...ctx, profile: { id: 'x', role: 'livreur' } });
    assert.equal(res._status, 403);
    assert.deepEqual(s.appels, []);
  });

  test('membre déjà vérifié : 400, aucun courriel', async () => {
    const s = sb({ verifie: true });
    const res = await relancer(s);
    assert.equal(res._status, 400);
    assert.deepEqual(courriels(s.appels), []);
  });

  test('par la route platform : même limite', async () => {
    const platform = require('../api/platform');
    const s = sb({ marques: [{ id: 'm1', created_at: new Date(Date.now() - JOUR).toISOString() }] });
    const base = s.fetchImpl;
    global.fetch = async (url, o = {}) => {
      if (url.includes('/auth/v1/user')) return rep({ id: ADMIN });
      if (url.includes('/rest/v1/profiles') && url.includes(`id=eq.${ADMIN}`)) return rep([{ id: ADMIN, role: 'admin', suspendu: false }]);
      return base(url, o);
    };
    const res = makeRes();
    await platform({ method: 'POST', url: '/api/platform', body: { endpoint: 'verification-reminder', user_id: MEMBRE }, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } }, res);
    assert.equal(res._status, 429);
    assert.match(res._body.error, /^Déjà relancé le \d\d\/\d\d, réessaie après le \d\d\/\d\d\.$/);
    assert.deepEqual(courriels(s.appels), []);
  });
});

describe('Relancer — dates JJ/MM (heure du Québec)', () => {
  test('format JJ/MM, fuseau du Québec', () => {
    assert.equal(jjmm('2026-11-19T15:00:00Z'), '19/11');
    assert.equal(jjmm('2026-12-01T03:00:00Z'), '30/11'); // 22 h le 30 nov. au Québec
    assert.equal(jjmm('nimporte'), '');
  });
  test('même si le serveur tourne en UTC (Vercel), les dates suivent le Québec', () => {
    const avant = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      assert.equal(jjmm('2026-12-01T03:00:00Z'), '30/11');
      assert.equal(messageDejaRelance('2026-11-20T02:00:00Z'), 'Déjà relancé le 19/11, réessaie après le 26/11.');
    } finally {
      if (avant === undefined) delete process.env.TZ; else process.env.TZ = avant;
    }
  });
  test('message : + 7 jours', () => {
    assert.equal(messageDejaRelance('2026-12-28T15:00:00Z'), 'Déjà relancé le 28/12, réessaie après le 04/01.');
  });
});

describe('À faire maintenant — date du dernier envoi', () => {
  const profils = [
    { id: MEMBRE, prenom: 'Julie', role: 'livreur', driver_status: 'not_started' },
    { id: '22222222-2222-4222-8222-222222222222', prenom: 'Ana', role: 'les deux', driver_status: 'not_started' },
  ];
  test('le plus récent envoi par membre, null si jamais relancé', () => {
    const r = construireAFaire({ profiles: profils, relances: [
      { user_id: MEMBRE, created_at: '2026-11-01T12:00:00Z' },
      { user_id: MEMBRE, created_at: '2026-11-15T12:00:00Z' },
      { user_id: 'autre', created_at: '2026-11-20T12:00:00Z' },
    ] });
    const parId = Object.fromEntries(r.items.relancer.map((p) => [p.id, p.derniere_relance]));
    assert.equal(parId[MEMBRE], '2026-11-15T12:00:00Z');
    // Le journal arrive du plus récent au plus ancien : le résultat ne dépend pas de l'ordre.
    const r2 = construireAFaire({ profiles: profils, relances: [
      { user_id: MEMBRE, created_at: '2026-11-15T12:00:00Z' },
      { user_id: MEMBRE, created_at: '2026-11-01T12:00:00Z' },
    ] });
    assert.equal(r2.items.relancer.find((p) => p.id === MEMBRE).derniere_relance, '2026-11-15T12:00:00Z');
    assert.equal(parId['22222222-2222-4222-8222-222222222222'], null);
  });
  test('adminAFaire lit les envois réussis au journal', async () => {
    const { adminAFaire } = require('../lib/_admin-a-faire');
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      if (url.includes('/profiles')) return rep(profils);
      if (url.includes('/transaction_audit_events')) return rep([{ user_id: MEMBRE, created_at: '2026-11-15T12:00:00Z' }]);
      return rep([]);
    };
    const res = makeRes();
    await adminAFaire({}, res, ctx);
    const u = urls.find((x) => x.includes('/transaction_audit_events'));
    assert.match(u, new RegExp(`event_type=eq\\.${EVT_RELANCE}`));
    assert.match(u, /status=eq\.envoye/);
    assert.equal(res._body.items.relancer.find((p) => p.id === MEMBRE).derniere_relance, '2026-11-15T12:00:00Z');
    assert.deepEqual(res._body.erreurs, []);
  });
});
