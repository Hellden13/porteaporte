// tests/ride-delete.test.js — Suppression logique d'un trajet + trajets passés cachés (lot 1 admin, morceau 1).
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DRIVER = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const RIDE = 'a0000000-0000-4000-8000-000000000001';

const handler = require('../api/platform');

before(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
});

const rep = (data, ok = true, status = ok ? 200 : 400) => ({
  ok, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data),
});

function makeRes() {
  return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() {} };
}

// Faux Supabase : enregistre chaque appel (méthode + URL + corps).
function supabase({ moi, role = 'conducteur', ride = { id: RIDE, driver_id: DRIVER, status: 'publie' }, bookings = [], bookingsOk = true, bookingsBody = {}, patchOk = true, patchErr = {} }) {
  const appels = [];
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    appels.push({ method, url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/auth/v1/user')) return rep({ id: moi });
    if (url.includes('/rpc/check_rate_limit')) return rep(true);
    if (url.includes('/rest/v1/profiles')) return rep([{ id: moi, role, suspendu: false }]);
    if (url.includes('/rest/v1/rides') && method === 'PATCH') return patchOk ? rep([{ ...ride, status: 'supprime' }]) : rep(patchErr, false, 400);
    if (url.includes('/rest/v1/rides')) return rep(ride ? [ride] : []);
    if (url.includes('/rest/v1/ride_bookings')) {
      if (!bookingsOk) return rep(bookingsBody, false, 500);
      // Le serveur demande seulement les réservations qui ne sont pas annulées ou remboursées.
      const m = url.match(/status=not\.in\.\(([^)]*)\)/);
      const fermes = m ? m[1].split(',') : [];
      return rep(bookings.filter((b) => !fermes.includes(b.status)));
    }
    return rep([]);
  };
  return { appels, fetchImpl };
}

async function supprimer(ctxSb, rideId = RIDE) {
  global.fetch = ctxSb.fetchImpl;
  const req = { method: 'POST', url: '/api/platform', body: { endpoint: 'ride-delete', ride_id: rideId }, headers: { 'content-type': 'application/json', authorization: 'Bearer tok' } };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const patches = (appels) => appels.filter((a) => a.method === 'PATCH' && a.url.includes('/rest/v1/rides'));
const deletes = (appels) => appels.filter((a) => a.method === 'DELETE');

describe('ride-delete — qui peut supprimer', () => {
  test('propriétaire : suppression logique (statut supprime + date + auteur), jamais un DELETE', async () => {
    const sb = supabase({ moi: DRIVER, bookings: [{ id: 'b1', status: 'annule_passager' }] });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.equal(res._body.status, 'supprime');
    const p = patches(sb.appels);
    assert.equal(p.length, 1);
    assert.equal(p[0].body.status, 'supprime');
    assert.ok(!Number.isNaN(Date.parse(p[0].body.supprime_le)));
    assert.equal(p[0].body.supprime_par, DRIVER);
    assert.match(p[0].url, /id=eq\.a0000000-0000-4000-8000-000000000001/);
    assert.deepEqual(deletes(sb.appels), []);
  });

  test('non-propriétaire : 403, rien modifié', async () => {
    const sb = supabase({ moi: AUTRE });
    const res = await supprimer(sb);
    assert.equal(res._status, 403);
    assert.deepEqual(patches(sb.appels), []);
  });

  test('admin : peut supprimer le trajet d\'un autre', async () => {
    const sb = supabase({ moi: ADMIN, role: 'admin' });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.equal(res._body.par, 'admin');
    assert.equal(patches(sb.appels)[0].body.supprime_par, ADMIN);
  });

  test('sans connexion : 401', async () => {
    global.fetch = async () => rep({}, false, 401);
    const res = makeRes();
    await handler({ method: 'POST', url: '/api/platform', body: { endpoint: 'ride-delete', ride_id: RIDE }, headers: {} }, res);
    assert.ok([401, 403].includes(res._status));
  });

  test('trajet introuvable : 404 ; identifiant invalide : 400', async () => {
    const r1 = await supprimer(supabase({ moi: DRIVER, ride: null }));
    assert.equal(r1._status, 404);
    const sb = supabase({ moi: DRIVER });
    const r2 = await supprimer(sb, "x');drop");
    assert.equal(r2._status, 400);
    assert.deepEqual(patches(sb.appels), []);
  });

  test('déjà supprimé : rien de plus', async () => {
    const sb = supabase({ moi: DRIVER, ride: { id: RIDE, driver_id: DRIVER, status: 'supprime' } });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.equal(res._body.deja_supprime, true);
    assert.deepEqual(patches(sb.appels), []);
  });
});

describe('ride-delete — réservations', () => {
  for (const statut of ['paye', 'confirme', 'en_attente', 'driver_completed', 'complete']) {
    test(`réservation « ${statut} » : refusé, le message dit d'annuler`, async () => {
      const sb = supabase({ moi: DRIVER, bookings: [{ id: 'b1', status: statut }] });
      const res = await supprimer(sb);
      assert.equal(res._status, 409);
      assert.equal(res._body.code, 'reservation_active');
      assert.match(res._body.error, /Annule-le plutôt/);
      assert.deepEqual(patches(sb.appels), []);
    });
  }

  test('admin aussi refusé si une réservation est payée', async () => {
    const sb = supabase({ moi: ADMIN, role: 'admin', bookings: [{ id: 'b1', status: 'paye' }] });
    const res = await supprimer(sb);
    assert.equal(res._status, 409);
    assert.deepEqual(patches(sb.appels), []);
  });

  test('réservations illisibles : refus (échec fermé)', async () => {
    const sb = supabase({ moi: DRIVER, bookingsOk: false });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.deepEqual(patches(sb.appels), []);
  });

  test('erreur HTTP avec une liste vide : refus quand même (jamais « aucune réservation » par défaut)', async () => {
    const sb = supabase({ moi: DRIVER, bookingsOk: false, bookingsBody: [] });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.deepEqual(patches(sb.appels), []);
  });

  test('garde de la base (réservation arrivée entre-temps) : message « annule-le »', async () => {
    const sb = supabase({ moi: DRIVER, patchOk: false, patchErr: { message: 'Trajet avec une réservation payée ou en cours : annule-le plutôt' } });
    const res = await supprimer(sb);
    assert.equal(res._status, 409);
    assert.match(res._body.error, /annule-le plutôt/);
  });

  test('migration non appliquée : erreur claire', async () => {
    const sb = supabase({ moi: DRIVER, patchOk: false, patchErr: { message: 'violates check constraint "rides_status_check"' } });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.match(res._body.error, /migration/);
  });
});

describe('trajet supprimé caché, trajets passés cachés', () => {
  const futur = new Date(Date.now() + 3 * 86400000).toISOString();
  const passe = new Date(Date.now() - 3 * 86400000).toISOString();
  const tantot = new Date(Date.now() - 5 * 60000).toISOString(); // aujourd'hui, déjà parti
  const rides = [
    { id: 'r-futur', driver_id: DRIVER, start_city: 'Lévis', end_city: 'Québec', departure_time: futur, available_seats: 2, status: 'publie' },
    { id: 'r-passe', driver_id: DRIVER, start_city: 'Lévis', end_city: 'Québec', departure_time: passe, available_seats: 2, status: 'publie' },
    { id: 'r-tantot', driver_id: DRIVER, start_city: 'Lévis', end_city: 'Québec', departure_time: tantot, available_seats: 2, status: 'publie' },
    { id: 'r-recurrent', driver_id: DRIVER, start_city: 'Lévis', end_city: 'Québec', departure_time: passe, available_seats: 2, status: 'publie',
      is_recurring: true, recurrence_days: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] },
  ];

  async function chercher(params) {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      if (url.includes('/rest/v1/rides?')) return rep(rides);
      return rep([]);
    };
    const qs = new URLSearchParams({ endpoint: 'ride-search', ...params }).toString();
    const req = { method: 'GET', url: '/api/platform?' + qs, body: {}, query: Object.fromEntries(new URLSearchParams(qs)), headers: {} };
    const res = makeRes();
    await handler(req, res);
    return { res, urls, ids: (res._body?.rides || []).map((r) => r.id) };
  }

  test('recherche publique : seulement les trajets publiés (jamais « supprime »)', async () => {
    const { urls } = await chercher({ from: 'Lévis', to: 'Québec' });
    const u = urls.find((x) => x.includes('/rest/v1/rides?'));
    assert.match(u, /status=eq\.publie/);
  });

  test('sans date : trajet passé caché, trajet récurrent toujours visible', async () => {
    const { res, ids } = await chercher({ from: 'Lévis', to: 'Québec' });
    assert.equal(res._status, 200);
    assert.ok(ids.includes('r-futur'));
    assert.ok(ids.includes('r-recurrent'));
    assert.ok(!ids.includes('r-passe'));
    assert.ok(!ids.includes('r-tantot'));
  });

  test('avec la date d\'aujourd\'hui : trajet déjà parti caché, récurrent visible', async () => {
    const auj = new Date().toISOString().slice(0, 10);
    const { ids } = await chercher({ from: 'Lévis', to: 'Québec', date: auj });
    assert.ok(!ids.includes('r-tantot'));
    assert.ok(ids.includes('r-recurrent'));
  });

  test('avec une date passée : trajet ponctuel de ce jour-là caché, récurrent visible', async () => {
    const jour = passe.slice(0, 10);
    const { ids } = await chercher({ from: 'Lévis', to: 'Québec', date: jour });
    assert.ok(!ids.includes('r-passe'));
    assert.ok(ids.includes('r-recurrent'));
  });

  test('« Mes trajets » (ride-my-rides et tableau covoiturage) : jamais un trajet supprimé', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', '_rides.js'), 'utf8');
    assert.match(src, /rides\?driver_id=eq\.\$\{ctx\.session\.id\}&status=neq\.supprime/);
    assert.match(src, /rides\?driver_id=eq\.\$\{uid\}&status=neq\.supprime/);
    const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
    assert.match(dash, /\.neq\('status', 'supprime'\)/);
  });

  test('ride-my-rides demande bien le filtre au serveur', async () => {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      if (url.includes('/auth/v1/user')) return rep({ id: DRIVER });
      if (url.includes('/rest/v1/profiles')) return rep([{ id: DRIVER, role: 'conducteur', suspendu: false }]);
      return rep([]);
    };
    const res = makeRes();
    await handler({ method: 'POST', url: '/api/platform', body: { endpoint: 'ride-my-rides' }, headers: { authorization: 'Bearer tok', 'content-type': 'application/json' } }, res);
    assert.equal(res._status, 200);
    assert.ok(urls.some((u) => u.includes(`/rest/v1/rides?driver_id=eq.${DRIVER}&status=neq.supprime`)));
  });
});

describe('pages et migration', () => {
  const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  test('fenêtre de confirmation dans la page, jamais window.confirm, appelle ride-delete', () => {
    const js = lire('js/ride-delete.js');
    assert.doesNotMatch(js, /\bconfirm\s*\(/);
    assert.match(js, /role', 'dialog'/);
    assert.match(js, /endpoint=ride-delete/);
    assert.match(js, /esc\(libelle\)/);
  });

  for (const page of ['dashboard-covoiturage.html', 'dashboard.html', 'admin/dashboard-admin.html']) {
    test(`${page} : bouton Supprimer branché sur la fenêtre`, () => {
      const html = lire(page);
      assert.match(html, /<script src="\/js\/ride-delete\.js"><\/script>/);
      assert.match(html, /🗑️ Supprimer/);
      assert.match(html, /PAPRideDelete\.ouvrir\(/);
    });
  }

  test('migration : statut supprime, colonnes date et auteur, garde en base, aucun DELETE', () => {
    const dir = path.join(ROOT, 'supabase', 'migrations');
    const f = fs.readdirSync(dir).find((n) => n.endsWith('_rides_suppression_logique.sql'));
    assert.ok(f, 'fichier de migration présent');
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(sql, /'supprime'::text/);
    assert.match(sql, /add column if not exists supprime_le timestamptz/);
    assert.match(sql, /add column if not exists supprime_par uuid/);
    assert.match(sql, /before update of status on public\.rides/);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\bdelete\s+from\b/i);
  });
});
