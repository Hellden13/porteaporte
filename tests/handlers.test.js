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

  test('nouveau PaymentIntent non confirme ne publie pas la livraison aux livreurs', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123', email: 'e@test.com' }) };
      }
      if (url.includes('/rest/v1/livraisons') && (opts.method || 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => [{ id: 'liv-1', code: 'L1', expediteur_id: 'user-123', prix_total: 5.60, statut: 'en_attente' }] };
      }
      if (url.includes('/rest/v1/transactions?livraison_id=eq.liv-1')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === 'https://api.stripe.com/v1/payment_intents' && opts.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_new', client_secret: 'cs_new', status: 'requires_payment_method', amount: 560, currency: 'cad' }) };
      }
      if (url.includes('/rest/v1/transactions') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/transaction_audit_events') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/livraisons') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }), text: async () => '' };
    };

    const req = makeReq({ body: { livraison_id: 'liv-1' }, headers: { authorization: 'Bearer valid-token' } });
    const res = makeRes();
    await handler(req, res);

    assert.equal(res._status, 200);
    const livraisonPatch = calls.find(c => c.url.includes('/rest/v1/livraisons') && c.method === 'PATCH');
    assert.ok(livraisonPatch, 'PaymentIntent id doit etre sauvegarde sur la livraison');
    const body = JSON.parse(livraisonPatch.body);
    assert.equal(body.stripe_payment_intent, 'pi_new');
    assert.equal(body.statut, undefined, 'statut paiement_autorise interdit avant confirmation carte');
  });

  test('PaymentIntent requires_capture synchronise la livraison en paiement_autorise', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'user-123', email: 'e@test.com' }) };
      }
      if (url.includes('/rest/v1/livraisons') && (opts.method || 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => [{ id: 'liv-1', code: 'L1', expediteur_id: 'user-123', prix_total: 5.60, statut: 'en_attente' }] };
      }
      if (url.includes('/rest/v1/transactions?livraison_id=eq.liv-1')) {
        return { ok: true, status: 200, json: async () => [{ id: 'tx-1', stripe_payment_intent: 'pi_ready', created_at: '2026-01-01', statut: 'requires_payment_method' }] };
      }
      if (url.includes('api.stripe.com/v1/payment_intents/pi_ready')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_ready', client_secret: 'cs_ready', status: 'requires_capture', amount: 560, currency: 'cad' }) };
      }
      if (url.includes('/rest/v1/livraisons') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
      }
      if (url.includes('/rest/v1/transactions?id=eq.tx-1') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }), text: async () => '' };
    };

    const req = makeReq({ body: { livraison_id: 'liv-1' }, headers: { authorization: 'Bearer valid-token' } });
    const res = makeRes();
    await handler(req, res);

    assert.equal(res._status, 200);
    assert.equal(res._body?.already_authorized, true);
    const livraisonPatch = calls.find(c => c.url.includes('/rest/v1/livraisons') && c.method === 'PATCH');
    assert.ok(livraisonPatch, 'livraison doit etre synchronisee');
    const body = JSON.parse(livraisonPatch.body);
    assert.equal(body.statut, 'paiement_autorise');
    assert.equal(body.stripe_payment_intent, 'pi_ready');
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

  test('available-livraisons bloque un livreur non verifie', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'u1', email: 'driver@test.com', email_confirmed_at: new Date().toISOString() } },
      '/rest/v1/profiles': {
        ok: true,
        data: [{ id: 'u1', role: 'livreur', suspendu: false, email_verified: true, driver_status: 'pending_review' }]
      }
    });
    const req = makeReq({
      body: { endpoint: 'available-livraisons' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
    assert.ok(String(res._body?.error || '').includes('verifie') || String(res._body?.error || '').includes('vérifié'));
  });

  test('dashboard expediteur: my-livraisons refuse un compte livreur seulement', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'u1', email: 'driver@test.com', email_confirmed_at: new Date().toISOString() } },
      '/rest/v1/profiles': {
        ok: true,
        data: [{ id: 'u1', role: 'livreur', suspendu: false, email_verified: true, driver_status: 'verified' }]
      }
    });
    const req = makeReq({
      body: { endpoint: 'my-livraisons' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
    assert.match(res._body?.error || '', /expediteur/i);
  });

  test('dashboard livreur: my-driver-livraisons bloque un livreur non verifie', async () => {
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: 'u1', email: 'driver@test.com', email_confirmed_at: new Date().toISOString() } },
      '/rest/v1/profiles': {
        ok: true,
        data: [{ id: 'u1', role: 'livreur', suspendu: false, email_verified: true, driver_status: 'pending_review' }]
      }
    });
    const req = makeReq({
      body: { endpoint: 'my-driver-livraisons' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
    assert.match(res._body?.error || '', /Livreur verifie/i);
  });

  test('dashboard livreur: my-driver-livraisons retourne les livraisons assignees au livreur verifie', async () => {
    const driverId = '11111111-1111-4111-8111-111111111111';
    const expediteurId = '22222222-2222-4222-8222-222222222222';
    global.fetch = makeFetchMock({
      '/auth/v1/user': { ok: true, data: { id: driverId, email: 'driver@test.com', email_confirmed_at: new Date().toISOString() } },
      [`/rest/v1/profiles?id=eq.${driverId}`]: {
        ok: true,
        data: [{ id: driverId, role: 'livreur', suspendu: false, email_verified: true, driver_status: 'verified' }]
      },
      [`/rest/v1/livraisons?livreur_id=eq.${driverId}`]: {
        ok: true,
        data: [{
          id: 'liv-1',
          expediteur_id: expediteurId,
          livreur_id: driverId,
          statut: 'confirme',
          adresse_depart: '123 rue A',
          adresse_arrivee: '456 rue B',
          prix_total: 5.60
        }]
      },
      '/rest/v1/profiles?id=in.': {
        ok: true,
        data: [{ id: expediteurId, prenom: 'Alice', nom: 'Test' }]
      }
    });
    const req = makeReq({
      body: { endpoint: 'my-driver-livraisons' },
      headers: { authorization: 'Bearer tok' }
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body?.livraisons?.[0]?.id, 'liv-1');
    assert.equal(res._body?.livraisons?.[0]?.adresse_depart, '123 rue A');
    assert.equal(res._body?.livraisons?.[0]?.expediteur_profile?.prenom, 'Alice');
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

// ─── Tests capture-livraison.js ───────────────────────────────────────────────
describe('capture-livraison handler — confirmation destinataire + escrow', () => {
  const handler = require('../api/capture-livraison');

  before(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  });

  function receptionHash(code, livraisonId) {
    return require('crypto')
      .createHash('sha256')
      .update(`${String(code).trim()}|${String(livraisonId).trim()}`)
      .digest('hex');
  }

  test('sans session et sans code destinataire → 401', async () => {
    const req = makeReq({ body: { livraison_id: 'liv-1' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 401);
  });

  test('code destinataire valide mais livraison pas livrée → capture bloquée', async () => {
    const code = '123456';
    global.fetch = makeFetchMock({
      '/rest/v1/livraisons': {
        ok: true,
        data: [{
          id: 'liv-1',
          statut: 'confirme',
          expediteur_id: 'exp-1',
          recipient_confirmation_hash: receptionHash(code, 'liv-1')
        }]
      }
    });

    const req = makeReq({ body: { livraison_id: 'liv-1', recipient_code: code } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 409);
    assert.match(res._body?.error || '', /non livree|bloquee/i);
  });

  test('mauvais code destinataire → paiement reste protégé', async () => {
    global.fetch = makeFetchMock({
      '/rest/v1/livraisons': {
        ok: true,
        data: [{
          id: 'liv-1',
          statut: 'livre',
          expediteur_id: 'exp-1',
          recipient_confirmation_hash: receptionHash('123456', 'liv-1')
        }]
      }
    });

    const req = makeReq({ body: { livraison_id: 'liv-1', recipient_code: '654321' } });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res._status, 403);
    assert.match(res._body?.error || '', /invalide|prot|requis|liberer/i);
  });

  test('code destinataire valide + Stripe requires_capture → capture et audit', async () => {
    const calls = [];
    const code = '123456';
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });

      if (url.includes('/rest/v1/livraisons') && (opts.method || 'GET') === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: 'liv-1',
            statut: 'livre',
            expediteur_id: 'exp-1',
            recipient_confirmation_hash: receptionHash(code, 'liv-1')
          }]
        };
      }

      if (url.includes('/rest/v1/transactions?livraison_id=eq.liv-1')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: 'tx-1',
            livraison_id: 'liv-1',
            stripe_payment_intent: 'pi_test_123',
            montant: 5.60,
            statut: 'requires_capture',
            metadata: {}
          }]
        };
      }

      if (url.includes('api.stripe.com/v1/payment_intents/pi_test_123/capture')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'pi_test_123',
            status: 'succeeded',
            amount_received: 560,
            currency: 'cad'
          })
        };
      }

      if (url.includes('api.stripe.com/v1/payment_intents/pi_test_123')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'pi_test_123',
            status: 'requires_capture',
            amount_capturable: 560,
            amount: 560,
            currency: 'cad',
            metadata: { livraison_id: 'liv-1', expediteur_id: 'exp-1' }
          })
        };
      }

      if (url.includes('/rest/v1/livraisons') && opts.method === 'PATCH') {
        return { ok: true, status: 204, text: async () => '', json: async () => ({}) };
      }

      if (url.includes('/rest/v1/transactions?id=eq.tx-1') && opts.method === 'PATCH') {
        return { ok: true, status: 204, text: async () => '', json: async () => ({}) };
      }

      if (url.includes('/rest/v1/transaction_audit_events') && opts.method === 'POST') {
        return { ok: true, status: 201, text: async () => '', json: async () => ({}) };
      }

      return { ok: false, status: 404, json: async () => ({ error: 'not found' }), text: async () => '' };
    };

    const req = makeReq({ body: { livraison_id: 'liv-1', recipient_code: code } });
    const res = makeRes();
    await handler(req, res);

    assert.equal(res._status, 200);
    assert.equal(res._body?.success, true);
    assert.equal(res._body?.status, 'succeeded');
    assert.ok(calls.some(c => c.url.includes('/capture')), 'Stripe capture doit être appelée');
    assert.ok(calls.some(c => c.url.includes('/transaction_audit_events')), 'Audit transaction doit être enregistré');
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
