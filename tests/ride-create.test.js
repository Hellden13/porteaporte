// tests/ride-create.test.js — Tests pour rideCreate avec schema fallback
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// On va mocker fetch pour simuler Supabase rejetant certaines colonnes
const originalFetch = global.fetch;

function makeMockFetch({ rejectColumns = [], failAll = false } = {}) {
  return async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    // Si on simule un échec de toutes les requêtes
    if (failAll) {
      return {
        ok: false, status: 500,
        json: async () => ({ message: 'Internal server error' }),
        text: async () => 'Internal error'
      };
    }
    // Détecte une colonne rejetée dans le body
    if (body && rejectColumns.length > 0) {
      const rejectedCol = rejectColumns.find(c => body[c] !== undefined);
      if (rejectedCol) {
        return {
          ok: false, status: 400,
          json: async () => ({
            code: '42703',
            message: `column "${rejectedCol}" of relation "rides" does not exist`,
            hint: null, details: null
          }),
          text: async () => `column "${rejectedCol}" does not exist`
        };
      }
    }
    // Succès par défaut : retourne le body inséré
    return {
      ok: true, status: 201,
      json: async () => [{ id: 'ride_test_' + Date.now(), ...body }],
      text: async () => JSON.stringify(body)
    };
  };
}

function makeMockReq() {
  return { method: 'POST', headers: {} };
}
function makeMockRes() {
  let _status = 200, _data = null;
  return {
    status(s) { _status = s; return this; },
    json(d) { _data = d; return this; },
    end() { return this; },
    get statusCode() { return _status; },
    get data() { return _data; }
  };
}
function makeMockCtx() {
  return {
    session: { id: 'user_test_123', email: 'test@test.com' },
    sbUrl: 'https://test.supabase.co',
    sbKey: 'test_key',
    profile: { id: 'user_test_123', role: 'livreur' }
  };
}

const { rideCreate, rideUpdate } = (() => {
  // On doit instancier le module en isolation pour ré-importer après chaque mock
  delete require.cache[require.resolve('../lib/_rides.js')];
  return require('../lib/_rides.js');
})();

describe('rideCreate validation', () => {
  test('refuse si start_city manquant', async () => {
    global.fetch = makeMockFetch();
    const res = makeMockRes();
    await rideCreate(makeMockReq(), res, makeMockCtx(), {
      end_city: 'Lévis', departure_time: new Date().toISOString(), available_seats: 2
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.data.error, /start_city/);
  });

  test('refuse si end_city manquant', async () => {
    global.fetch = makeMockFetch();
    const res = makeMockRes();
    await rideCreate(makeMockReq(), res, makeMockCtx(), {
      start_city: 'Québec', departure_time: new Date().toISOString(), available_seats: 2
    });
    assert.equal(res.statusCode, 400);
  });

  test('refuse si auth manquante', async () => {
    global.fetch = makeMockFetch();
    const res = makeMockRes();
    await rideCreate(makeMockReq(), res, { session: null, sbUrl: 'x', sbKey: 'y', profile: null }, {
      start_city: 'Québec', end_city: 'Lévis',
      departure_time: new Date().toISOString(), available_seats: 2
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('rideCreate schema fallback', () => {
  test('succès avec tous les champs si schéma complet', async () => {
    global.fetch = makeMockFetch();
    const res = makeMockRes();
    await rideCreate(makeMockReq(), res, makeMockCtx(), {
      start_city: 'Québec', end_city: 'Lévis',
      departure_time: '2026-06-01T08:00:00Z', available_seats: 3,
      vehicle_type: 'berline', accepts_pets: true
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.data.success);
  });

  test('succès avec retry si colonne stop_points manquante', async () => {
    global.fetch = makeMockFetch({ rejectColumns: ['stop_points'] });
    const res = makeMockRes();
    await rideCreate(makeMockReq(), res, makeMockCtx(), {
      start_city: 'Québec', end_city: 'Lévis',
      departure_time: '2026-06-01T08:00:00Z', available_seats: 3,
      stop_points: [{ city: 'Saint-Augustin' }]
    });
    assert.equal(res.statusCode, 200, 'Le fallback doit réussir en retirant stop_points');
  });

  test('succès même si plusieurs colonnes manquent', async () => {
    global.fetch = makeMockFetch({ rejectColumns: ['accepts_packages', 'package_max_kg', 'women_only'] });
    const res = makeMockRes();
    await rideCreate(makeMockReq(), res, makeMockCtx(), {
      start_city: 'Québec', end_city: 'Lévis',
      departure_time: '2026-06-01T08:00:00Z', available_seats: 2,
      accepts_packages: true, package_max_kg: 20, women_only: false
    });
    assert.equal(res.statusCode, 200, 'Doit retirer 3 colonnes manquantes et réussir');
  });

  test('erreur explicite si Supabase totalement injoignable', async () => {
    global.fetch = makeMockFetch({ failAll: true });
    const res = makeMockRes();
    await rideCreate(makeMockReq(), res, makeMockCtx(), {
      start_city: 'Québec', end_city: 'Lévis',
      departure_time: '2026-06-01T08:00:00Z', available_seats: 2
    });
    assert.equal(res.statusCode, 400);
    assert.ok(res.data.error.includes('Création trajet impossible'));
    assert.ok(res.data.hint, 'Doit fournir un hint pour debug');
  });
});

describe('rideUpdate securite', () => {
  test('refuse un utilisateur qui n est ni conducteur ni admin', async () => {
    let patched = false;
    global.fetch = async (url, opts = {}) => {
      if (url.includes('/rest/v1/rides?id=eq.ride-1') && !opts.method) {
        return { ok: true, status: 200, json: async () => [{ id: 'ride-1', driver_id: 'other-driver', status: 'publie' }] };
      }
      if (opts.method === 'PATCH') patched = true;
      return { ok: true, status: 200, json: async () => [] };
    };

    const res = makeMockRes();
    await rideUpdate(makeMockReq(), res, makeMockCtx(), { ride_id: 'ride-1', available_seats: 3 });
    assert.equal(res.statusCode, 403);
    assert.equal(patched, false);
  });

  test('bloque la modification si une reservation active existe', async () => {
    let patched = false;
    global.fetch = async (url, opts = {}) => {
      if (url.includes('/rest/v1/rides?id=eq.ride-1') && !opts.method) {
        return { ok: true, status: 200, json: async () => [{ id: 'ride-1', driver_id: 'user_test_123', status: 'publie' }] };
      }
      if (url.includes('/rest/v1/ride_bookings?ride_id=eq.ride-1')) {
        return { ok: true, status: 200, json: async () => [{ id: 'book-1', status: 'confirme', seats_reserved: 1 }] };
      }
      if (opts.method === 'PATCH') patched = true;
      return { ok: true, status: 200, json: async () => [] };
    };

    const res = makeMockRes();
    await rideUpdate(makeMockReq(), res, makeMockCtx(), { ride_id: 'ride-1', departure_time: new Date(Date.now() + 86400000).toISOString() });
    assert.equal(res.statusCode, 409);
    assert.match(res.data.error, /reservation active/i);
    assert.equal(patched, false);
  });

  test('bloque la modification si la verification des reservations echoue', async () => {
    let patched = false;
    global.fetch = async (url, opts = {}) => {
      if (url.includes('/rest/v1/rides?id=eq.ride-1') && !opts.method) {
        return { ok: true, status: 200, json: async () => [{ id: 'ride-1', driver_id: 'user_test_123', status: 'publie' }] };
      }
      if (url.includes('/rest/v1/ride_bookings?ride_id=eq.ride-1')) {
        return { ok: false, status: 500, json: async () => ({ message: 'db down' }) };
      }
      if (opts.method === 'PATCH') patched = true;
      return { ok: true, status: 200, json: async () => [] };
    };

    const res = makeMockRes();
    await rideUpdate(makeMockReq(), res, makeMockCtx(), { ride_id: 'ride-1', available_seats: 3 });
    assert.equal(res.statusCode, 503);
    assert.match(res.data.error, /bloquee par securite/i);
    assert.equal(patched, false);
  });

  test('met a jour les champs permis quand aucune reservation active n existe', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || null });
      if (url.includes('/rest/v1/rides?id=eq.ride-1') && !opts.method) {
        return { ok: true, status: 200, json: async () => [{ id: 'ride-1', driver_id: 'user_test_123', status: 'publie' }] };
      }
      if (url.includes('/rest/v1/ride_bookings?ride_id=eq.ride-1')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-1') && opts.method === 'PATCH') {
        const body = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => [{ id: 'ride-1', ...body }] };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeMockRes();
    const departure = new Date(Date.now() + 2 * 86400000).toISOString();
    await rideUpdate(makeMockReq(), res, makeMockCtx(), {
      ride_id: 'ride-1',
      departure_time: departure,
      available_seats: 4,
      accepts_pets: true,
      cost_per_km: 0.30,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    const patchCall = calls.find(c => c.method === 'PATCH');
    assert.ok(patchCall, 'rides doit etre patche');
    const patch = JSON.parse(patchCall.body);
    assert.equal(patch.available_seats, 4);
    assert.equal(patch.total_seats, 4);
    assert.equal(patch.accepts_pets, true);
    assert.equal(patch.cost_per_km, 0.30);
  });

  test('refuse un ride_id invalide avant Supabase', async () => {
    let called = false;
    global.fetch = async () => { called = true; return { ok: true, json: async () => [] }; };
    const res = makeMockRes();
    await rideUpdate(makeMockReq(), res, makeMockCtx(), { ride_id: 'bad/id', available_seats: 3 });
    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  });
});

// Reset fetch après les tests
test('cleanup', () => {
  global.fetch = originalFetch;
});
