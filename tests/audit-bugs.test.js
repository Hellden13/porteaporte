// tests/audit-bugs.test.js — Bugs corrigés pendant l'audit (22 nov. 2026) :
// /trajets, source unique des prix, aller-retour réservable.
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const rides = require('../lib/_rides');
const handler = require('../api/platform');

before(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
});
const rep = (data, ok = true, status = ok ? 200 : 500) => ({ ok, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
function makeRes() {
  return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() { return this; } };
}
async function appel(endpoint, body, fetchImpl, extra = {}) {
  global.fetch = fetchImpl;
  const res = makeRes();
  await handler({ method: 'POST', url: '/api/platform', body: { endpoint, ...body }, headers: { 'content-type': 'application/json', ...(extra.auth ? { authorization: 'Bearer t' } : {}) } }, res);
  return res;
}

describe('/trajets', () => {
  test('redirige vers la recherche de covoiturage (plus de 404)', () => {
    const v = JSON.parse(lire('vercel.json'));
    for (const src of ['/trajets', '/trajets/']) {
      const r = v.redirects.find((x) => x.source === src);
      assert.ok(r, src);
      assert.equal(r.destination, '/covoiturage.html');
    }
  });
});

describe('prix du covoiturage : une seule source de vérité', () => {
  test('la configuration publiée est celle que le calcul utilise vraiment', () => {
    const p = rides.ridePricingConfig({});
    assert.equal(p.platform_fee_mode, 'fixe_par_place');
    const petit = rides.calcRidePrice({ totalDistanceKm: 20, costPerKm: p.cost_per_km_default, seats: 1, totalSeats: 3 });
    assert.equal(petit.platformFee, p.platform_fee_low);
    const gros = rides.calcRidePrice({ totalDistanceKm: 400, costPerKm: p.energy_rates.diesel.def, seats: 1, totalSeats: 1 });
    assert.equal(gros.platformFee, p.platform_fee_high);
    assert.equal(p.cost_per_km_default, p.energy_rates.essence.def);
    const gratuit = rides.calcRidePrice({ totalDistanceKm: 20, costPerKm: 0.25, seats: 1, totalSeats: 3, commissionFree: true });
    assert.equal(gratuit.platformFee, 0);
  });

  test('ride-settings renvoie cette configuration, avec les réglages de l\'admin (impact_settings)', async () => {
    const res = await appel('ride-settings', {}, async (url) => {
      if (url.includes('/rpc/check_rate_limit')) return rep(true);
      if (url.includes('/rest/v1/impact_settings')) return rep([{ id: 'default', ride_platform_fee: 2, ride_platform_fee_high: 4, ride_fee_threshold: 20, ride_free_trips: 3 }]);
      return rep([]);
    });
    assert.equal(res._status, 200);
    const p = res._body.pricing;
    assert.deepEqual([p.platform_fee_low, p.platform_fee_high, p.platform_fee_threshold, p.free_trips], [2, 4, 20, 3]);
    assert.equal(res._body.settings.ride_platform_fee, 2);
    assert.ok(p.energy_rates.essence.def > 0);
  });

  test('formulaire de publication : lit ride-settings → pricing (tarifs par énergie et frais)', () => {
    const html = lire('covoiturage-publier.html');
    assert.match(html, /fetch\('\/api\/platform\?endpoint=ride-settings'\)/);
    assert.match(html, /out\.pricing/);
    assert.match(html, /ENERGY_RATES\[k\]\.def = Number\(v\.def\)/);
    assert.doesNotMatch(html, /const lugFee = 5\.00/);
  });

  test('admin « Seuils tarifaires » : plus de 10 % ni de 0,35 $/km écrits en dur, rendu depuis le serveur', () => {
    const html = lire('admin/dashboard-admin.html');
    const debut = html.indexOf('Seuils tarifaires');
    const bloc = html.slice(debut, html.indexOf('PARRAINAGE', debut));
    assert.doesNotMatch(bloc, /10%|0,35 \$\/km|RIDE_PLATFORM_PCT/);
    // Exécute le vrai rendu avec la vraie configuration du serveur.
    const i = html.indexOf('  function fmtDollars(');
    const j = html.indexOf('  async function loadSeuilsTarifaires()');
    const k = html.indexOf('function afEsc(');
    const finEsc = html.indexOf('\n  }', k) + 4;
    const els = {};
    const ctx = { document: { getElementById: (id) => (els[id] ||= { innerHTML: '' }) }, Number, Object, String };
    vm.createContext(ctx);
    vm.runInContext(html.slice(k, finEsc) + '\n' + html.slice(i, j), ctx);
    ctx.renderSeuilsTarifaires(rides.ridePricingConfig({}));
    const out = els['seuils-tarifaires'].innerHTML;
    assert.match(out, /0,25 \$\/km/);
    assert.match(out, /1,50\s\$/);
    assert.match(out, /3,00\s\$/);
    assert.doesNotMatch(out, /10\s?%/);
  });
});

describe('aller-retour : le retour est un trajet réservable', () => {
  const DRIVER = '11111111-1111-4111-8111-111111111111';
  const ALLER = '2026-12-05T13:00:00.000Z';
  const RETOUR = '2026-12-05T21:00:00.000Z';

  function sb({ retourExiste = false, role = 'conducteur' } = {}) {
    const inserts = [];
    const fetchImpl = async (url, o = {}) => {
      const m = o.method || 'GET';
      if (url.includes('/auth/v1/user')) return rep({ id: DRIVER });
      if (url.includes('/rpc/check_rate_limit')) return rep(true);
      if (url.includes('/rest/v1/profiles')) return rep([{ id: DRIVER, role, suspendu: false, driver_status: 'verified', prenom: 'X' }]);
      if (url.includes('/rest/v1/rides') && m === 'POST') {
        const b = JSON.parse(o.body); inserts.push(b);
        return rep([{ ...b, id: `a0000000-0000-4000-8000-00000000000${inserts.length}` }], true, 201);
      }
      if (url.includes('/rest/v1/rides?driver_id=') && url.includes('start_city=eq.')) return rep(retourExiste ? [{ id: 'deja' }] : []);
      if (url.includes('/rest/v1/rides?id=eq.')) {
        return rep([{ id: 'a0000000-0000-4000-8000-000000000001', driver_id: DRIVER, status: 'publie', start_city: 'Lévis', end_city: 'Québec', start_sector: 'Centre', end_sector: 'Sainte-Foy', departure_time: ALLER, is_return_trip: true, return_departure_time: RETOUR, available_seats: 1, total_seats: 3, commission_free: true, created_at: 'x' }]);
      }
      return rep([]);
    };
    return { inserts, fetchImpl };
  }
  const corps = { start_city: 'Lévis', end_city: 'Québec', start_sector: 'Centre', end_sector: 'Sainte-Foy', departure_time: ALLER, available_seats: 3, is_return_trip: true, return_departure_time: RETOUR, stop_points: [{ city: 'A' }, { city: 'B' }] };

  test('publication : l\'aller et le retour sont créés (villes inversées, heure du retour)', async () => {
    const s = sb();
    const res = await appel('ride-create', corps, s.fetchImpl, { auth: true });
    assert.equal(res._status, 200, JSON.stringify(res._body));
    assert.equal(s.inserts.length, 2);
    const [a, r] = s.inserts;
    assert.equal(a.start_city, 'Lévis');
    assert.equal(r.start_city, 'Québec');
    assert.equal(r.end_city, 'Lévis');
    assert.equal(r.start_sector, 'Sainte-Foy');
    assert.equal(r.departure_time, RETOUR);
    assert.equal(r.is_return_trip, false);
    assert.equal(r.return_departure_time, null);
    assert.equal(r.status, 'publie');
    assert.equal(r.available_seats, a.available_seats);
    assert.equal(r.commission_free, a.commission_free);
    assert.deepEqual(r.stop_points.map((x) => x.city), ['B', 'A']);
    assert.ok(res._body.ride_retour);
  });

  test('aller simple : un seul trajet', async () => {
    const s = sb();
    await appel('ride-create', { ...corps, is_return_trip: false }, s.fetchImpl, { auth: true });
    assert.equal(s.inserts.length, 1);
  });

  test('retour avant l\'aller : pas de retour créé, l\'aller reste publié avec un avertissement', async () => {
    const s = sb();
    const res = await appel('ride-create', { ...corps, return_departure_time: '2026-12-05T08:00:00.000Z' }, s.fetchImpl, { auth: true });
    assert.equal(res._status, 200);
    assert.equal(s.inserts.length, 1);
    assert.match(res._body.retour_avertissement, /après/);
  });

  test('admin : « Créer le retour » d\'un aller-retour déjà publié ; sans effet s\'il existe', async () => {
    let s = sb({ role: 'admin' });
    let res = await appel('admin-ride-create-return', { ride_id: 'a0000000-0000-4000-8000-000000000001' }, s.fetchImpl, { auth: true });
    assert.equal(res._status, 200);
    assert.equal(s.inserts.length, 1);
    assert.equal(s.inserts[0].start_city, 'Québec');
    assert.equal(s.inserts[0].available_seats, 3, 'le retour repart avec toutes ses places');
    assert.ok(!('id' in s.inserts[0]) && !('created_at' in s.inserts[0]));
    s = sb({ role: 'admin', retourExiste: true });
    res = await appel('admin-ride-create-return', { ride_id: 'a0000000-0000-4000-8000-000000000001' }, s.fetchImpl, { auth: true });
    assert.equal(res._status, 200);
    assert.equal(res._body.deja, true);
    assert.equal(s.inserts.length, 0);
  });

  test('« Créer le retour » : réservé à l\'admin', async () => {
    const s = sb({ role: 'conducteur' });
    const res = await appel('admin-ride-create-return', { ride_id: 'a0000000-0000-4000-8000-000000000001' }, s.fetchImpl, { auth: true });
    assert.equal(res._status, 403);
    assert.equal(s.inserts.length, 0);
  });
});

describe('recherche par date : jour du Québec, quel que soit le fuseau du serveur', () => {
  test('trajet à 20 h 30 (heure de l\'Est) trouvé à SA date, même si le serveur est en UTC (Vercel)', async () => {
    const tzAvant = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const soir = { id: 'r-soir', driver_id: 'd', start_city: 'Lévis', end_city: 'Québec', departure_time: '2026-12-10T01:30:00Z', available_seats: 2, status: 'publie' };
      const matin = { id: 'r-matin', driver_id: 'd', start_city: 'Lévis', end_city: 'Québec', departure_time: '2026-12-09T13:00:00Z', available_seats: 2, status: 'publie' };
      global.fetch = async (url) => {
        if (url.includes('/rpc/check_rate_limit')) return rep(true);
        if (url.includes('/rest/v1/rides?')) return rep([soir, matin]);
        return rep([]);
      };
      const res = makeRes();
      const qs = 'endpoint=ride-search&from=L%C3%A9vis&to=Qu%C3%A9bec&date=2026-12-09';
      await handler({ method: 'GET', url: '/api/platform?' + qs, query: Object.fromEntries(new URLSearchParams(qs)), body: {}, headers: {} }, res);
      const ids = (res._body.rides || []).map((r) => r.id).sort();
      assert.deepEqual(ids, ['r-matin', 'r-soir']);
    } finally {
      if (tzAvant === undefined) delete process.env.TZ; else process.env.TZ = tzAvant;
    }
  });

  test('jourQuebec : heure d\'été et d\'hiver', () => {
    assert.equal(rides.jourQuebec(new Date('2026-12-10T01:30:00Z')), '2026-12-09');
    assert.equal(rides.jourQuebec(new Date('2026-07-01T03:30:00Z')), '2026-06-30');
    assert.equal(rides.jourQuebec(new Date('2026-07-01T04:30:00Z')), '2026-07-01');
  });
});
