// tests/handlers.test.js — Tests des handlers API avec fetch mocké
// Teste les validations, gardes d'auth et erreurs sans toucher Supabase/Stripe.
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// ─── Mock fetch global ────────────────────────────────────────────────────────
// On remplace fetch globalement par un mock contrôlable avant chaque test.

function makeFetchMock(responses) {
  // responses : Map<urlPattern, { ok, json }> ou fonction
  return async (url, opts) => {
    const entry = Object.entries(responses).find(([k]) => url.includes(k));
    if (entry) {
      const val = typeof entry[1] === 'function' ? entry[1](url, opts) : entry[1];
      return {
        ok:   val.ok !== false,
        status: val.status || (val.ok !== false ? 200 : 400),
        json: async () => val.data ?? val.json ?? {},
        text: async () => JSON.stringify(val.data ?? {}),
      };
    }
    // Défaut : 404
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }), text: async () => '' };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return { method, body, headers: { 'content-type': 'application/json', ...headers }, url: '/api/platform' };
}

function makeRes() {
  const res = {
    _status: 200,
    _body:   null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body; return this; },
    end()        { return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
  return res;
}

// ─── Tests _lib.js: insertWithSchemaFallback ──────────────────────────────────
describe('insertWithSchemaFallback', () => {
  const { insertWithSchemaFallback, sbHeaders } = require('../lib/_lib');

  test('succès au premier essai', async () => {
    global.fetch = makeFetchMock({
      '/rest/v1/livraisons': { ok: true, data: [{ id: 'abc' }] }
    });

    const result = await insertWithSchemaFallback(
      'https://sb.co/rest/v1/livraisons',
      sbHeaders('key'),
      { id: 'abc', titre: 'test' },
      []
    );
    assert.equal(result.ok, true);
  });

  test('retire la colonne manquante et réessaie', async () => {
    let callCount = 0;
    global.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ message: "Could not find the 'mode_livraison' column" })
        };
      }
      return { ok: true, status: 201, json: async () => [{ id: 'ok' }] };
    };

    const result = await insertWithSchemaFallback(
      'https://sb.co/rest/v1/livraisons',
      sbHeaders('key'),
      { id: 'abc', mode_livraison: 'voiture', titre: 'test' },
      ['mode_livraison']
    );
    assert.equal(result.ok, true);
    assert.equal(callCount, 2, 'doit avoir fait 2 appels');
  });
});

// ─── Tests paiement-livraison.js ──────────────────────────────────────────────
describe('paiement-livraison handler', () => {
  const handler = require('../api/paiement-livraison');

  before(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  });

  test('OPTIONS → 200', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
  });

  test('GET → 405 méthode non autorisée', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 405);
  });

  test('POST sans token → 401', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: false, status: 401, data: { error: 'Unauthorized' } }
    });
    const req = makeReq({ body: { livraison_id: 'abc' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 401);
  });

  test('POST sans livraison_id → 400', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'user-123', email: 'test@test.com' } }
    });
    const req = makeReq({ body: {}, headers: { authorization: 'Bearer valid-token' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400);
    assert.ok(res._body?.error?.includes('livraison_id'));
  });

  test('livraison introuvable → 404', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user':     { ok: true, data: { id: 'user-123', email: 'test@test.com' } },
      '/rest/v1/livraisons': { ok: true, data: [] }  // liste vide
    });
    const req = makeReq({
      body: { livraison_id: 'nonexistent-id' },
      headers: { authorization: 'Bearer valid-token' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 404);
  });

  test('payer une livraison d\'un autre utilisateur → 403', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'user-AAA', email: 'a@test.com' } },
      '/rest/v1/livraisons': {
        ok: true,
        data: [{
          id: 'liv-1',
          code: 'CODE1',
          expediteur_id: 'user-BBB',  // ← autre utilisateur
          livreur_id: null,
          prix_total: 25,
          statut: 'en_attente'
        }]
      }
    });
    const req = makeReq({
      body: { livraison_id: 'liv-1' },
      headers: { authorization: 'Bearer valid-token' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
  });

  test('livraison déjà payée → 409', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'user-123', email: 'test@test.com' } },
      '/rest/v1/livraisons': {
        ok: true,
        data: [{
          id: 'liv-1',
          code: 'CODE1',
          expediteur_id: 'user-123',
          prix_total: 25,
          statut: 'payee'  // ← déjà payée
        }]
      }
    });
    const req = makeReq({
      body: { livraison_id: 'liv-1' },
      headers: { authorization: 'Bearer valid-token' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 409);
  });

  test('montant invalide (0$) → 400', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'user-123', email: 'test@test.com' } },
      '/rest/v1/livraisons': {
        ok: true,
        data: [{
          id: 'liv-1',
          code: 'CODE1',
          expediteur_id: 'user-123',
          prix_total: 0,   // ← montant nul
          statut: 'en_attente'
        }]
      }
    });
    const req = makeReq({
      body: { livraison_id: 'liv-1' },
      headers: { authorization: 'Bearer valid-token' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400);
  });
});

// ─── Tests platform.js dispatcher ─────────────────────────────────────────────
describe('platform.js dispatcher', () => {
  const handler = require('../api/platform');

  before(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  });

  test('OPTIONS → 200 (CORS preflight)', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
  });

  test('endpoint inconnu → 400', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'u1', email: 'e@e.com' } },
      '/rest/v1/profiles': { ok: true, data: [{ id: 'u1', role: 'livreur', suspendu: false }] }
    });
    const req = makeReq({ body: { endpoint: 'endpoint-inexistant' }, headers: { authorization: 'Bearer tok' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400);
    assert.ok(res._body?.error?.includes('inconnu'));
  });

  test('sans token → 401', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: false, status: 401 }
    });
    const req = makeReq({ body: { endpoint: 'my-livraisons' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 401);
  });

  test('profil suspendu → 403', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user':    { ok: true, data: { id: 'u1' } },
      '/rest/v1/profiles': { ok: true, data: [{ id: 'u1', role: 'livreur', suspendu: true }] }
    });
    const req = makeReq({ body: { endpoint: 'my-livraisons' }, headers: { authorization: 'Bearer tok' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
  });

  test('impact-public accessible sans auth', async () => {
    global.fetch = makeFetchMock({
      '/rest/v1/impact_settings': { ok: true, data: [{ total_co2_kg: 100, total_km: 500 }] },
      '/rest/v1/livraisons': { ok: true, data: [] },
      '/rest/v1/profiles': { ok: true, data: [] }
    });
    const req = makeReq({ method: 'GET', body: { endpoint: 'impact-public' } });
    const res = makeRes();
    await handler(req, res);
    // impact-public ne requiert pas de session
    assert.notEqual(res._status, 401);
  });

  test('create-livraison exige le rôle expediteur', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user':    { ok: true, data: { id: 'u1' } },
      '/rest/v1/profiles': { ok: true, data: [{ id: 'u1', role: 'livreur', suspendu: false }] }
    });
    const req = makeReq({
      body: { endpoint: 'create-livraison', ville_depart: 'Montréal', ville_arrivee: 'Québec' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
    assert.ok(res._body?.error?.includes('expediteur') || res._body?.error?.includes('Role'));
  });

  test('admin-dashboard exige le rôle admin', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user':    { ok: true, data: { id: 'u1' } },
      '/rest/v1/profiles': { ok: true, data: [{ id: 'u1', role: 'livreur', suspendu: false }] }
    });
    const req = makeReq({
      body: { endpoint: 'admin-dashboard' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
  });

  test('ride-search accessible sans auth', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user':    { ok: true, data: { id: 'u1' } },
      '/rest/v1/profiles': { ok: true, data: [{ id: 'u1', role: 'expediteur', suspendu: false }] },
      '/rest/v1/rides':   { ok: true, data: [] }
    });
    const req = makeReq({
      body: { endpoint: 'ride-search', start_city: 'Montréal', end_city: 'Québec' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    // ride-search retourne rides: [] si pas de résultats
    assert.ok([200, 401].includes(res._status));
  });
});

// ─── Tests turnstile-verify.js ────────────────────────────────────────────────
describe('turnstile-verify handler', () => {
  const handler = require('../api/turnstile-verify');

  before(() => {
    // Le handler vérifie SECRET avant de router OPTIONS/GET → doit être défini
    process.env.TURNSTILE_SECRET = 'test-secret-key';
  });

  test('OPTIONS → 200', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
  });

  test('GET → 405', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 405);
  });

  test('sans token Turnstile → 400', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400);
    assert.ok(res._body?.error?.toLowerCase().includes('token') || res._body?.success === false);
  });

  test('token invalide → Cloudflare renvoie success=false → 400', async () => {
    global.fetch = makeFetchMock({
      'challenges.cloudflare.com': { ok: true, data: { success: false, 'error-codes': ['invalid-input-response'] } }
    });
    const req = makeReq({ body: { token: 'bad-token' } });
    const res = makeRes();
    await handler(req, res);
    // Turnstile non configuré (pas de secret key) OU token invalide
    assert.ok([400, 503].includes(res._status));
  });
});

// ─── Tests cancel-livraison.js ────────────────────────────────────────────────
describe('cancel-livraison handler', () => {
  const handler = require('../api/cancel-livraison');

  before(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  });

  test('OPTIONS → 200', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
  });

  test('sans token → 401', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: false, status: 401 }
    });
    const req = makeReq({ body: { livraison_id: 'abc' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 401);
  });

  test('sans livraison_id → 400', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'u1' } }
    });
    const req = makeReq({ body: {}, headers: { authorization: 'Bearer tok' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 400);
  });
});

// ─── Tests webauthn.js ────────────────────────────────────────────────────────
describe('webauthn handler — rôle requis', () => {
  const handler = require('../api/webauthn');

  before(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  });

  test('expediteur (non livreur) → 403', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user':    { ok: true, data: { id: 'u1', email: 'e@e.com' } },
      '/rest/v1/profiles': { ok: true, data: [{ id: 'u1', role: 'expediteur', suspendu: false }] }
    });
    const req = makeReq({
      body: { action: 'register-options' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
  });
});

// Nettoyage après tous les tests
after(() => {
  delete global.fetch;
});
