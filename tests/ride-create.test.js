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

const { rideCreate } = (() => {
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

// Reset fetch après les tests
test('cleanup', () => {
  global.fetch = originalFetch;
});
