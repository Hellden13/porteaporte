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
// marques = événements « ride_deleted » déjà au journal ; bookingsApres = réservations vues après le changement.
function supabase({
  moi, role = 'conducteur', ride = { id: RIDE, driver_id: DRIVER, status: 'publie' },
  bookings = [], bookingsOk = true, bookingsBody = {}, bookingsApres = null, bookingsBrut = undefined,
  marques = [], marquesOk = true, marqueOk = true, patchOk = true, patchLignes = 1,
}) {
  const appels = [];
  let lecturesReservations = 0;
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    appels.push({ method, url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/auth/v1/user')) return rep({ id: moi });
    if (url.includes('/rpc/check_rate_limit')) return rep(true);
    if (url.includes('/rest/v1/profiles')) return rep([{ id: moi, role, suspendu: false }]);
    if (url.includes('/rest/v1/transaction_audit_events')) {
      if (method === 'POST') return marqueOk ? rep([{ id: 'marque-1' }], true, 201) : rep({}, false, 500);
      if (method === 'PATCH') return rep([]);
      return marquesOk ? rep(marques) : rep({}, false, 500);
    }
    if (url.includes('/rest/v1/rides') && method === 'PATCH') {
      if (!patchOk) return rep({ message: 'erreur' }, false, 400);
      return rep(Array.from({ length: patchLignes }, () => ({ ...ride, status: JSON.parse(opts.body).status })));
    }
    if (url.includes('/rest/v1/rides')) return rep(ride ? [ride] : []);
    if (url.includes('/rest/v1/ride_bookings')) {
      lecturesReservations += 1;
      if (!bookingsOk) return rep(bookingsBody, false, 500);
      if (bookingsBrut !== undefined) return rep(bookingsBrut);
      const liste = lecturesReservations > 1 && bookingsApres ? bookingsApres : bookings;
      // Le serveur demande seulement les réservations qui ne sont pas annulées ou remboursées.
      const m = url.match(/status=not\.in\.\(([^)]*)\)/);
      const fermes = m ? m[1].split(',') : [];
      return rep(liste.filter((b) => !fermes.includes(b.status)));
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
const ajoutsMarque = (appels) => appels.filter((a) => a.method === 'POST' && a.url.includes('/rest/v1/transaction_audit_events'));
const echecsMarque = (appels) => appels.filter((a) => a.method === 'PATCH' && a.url.includes('/rest/v1/transaction_audit_events'));
const ecritures = (appels) => appels.filter((a) => a.method !== 'GET' && !a.url.includes('/rpc/check_rate_limit'));
const MARQUE = { id: 'm0', created_at: '2026-11-20T10:00:00Z', actor_id: DRIVER, user_id: DRIVER, evidence: { ride_id: RIDE, supprime_le: '2026-11-20T10:00:00Z', par: 'conducteur' } };

describe('ride-delete — qui peut supprimer', () => {
  test('propriétaire : statut annule + marque au journal (date, auteur), jamais un DELETE', async () => {
    const sb = supabase({ moi: DRIVER, bookings: [{ id: 'b1', status: 'annule_passager' }] });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.equal(res._body.supprime, true);
    assert.equal(res._body.status, 'annule');
    const m = ajoutsMarque(sb.appels);
    assert.equal(m.length, 1);
    assert.equal(m[0].body.event_type, 'ride_deleted');
    assert.equal(m[0].body.status, 'supprime');
    assert.equal(m[0].body.actor_id, DRIVER);
    assert.equal(m[0].body.user_id, DRIVER);
    assert.equal(m[0].body.evidence.ride_id, RIDE);
    assert.equal(m[0].body.evidence.statut_avant, 'publie');
    assert.ok(!Number.isNaN(Date.parse(m[0].body.evidence.supprime_le)));
    const p = patches(sb.appels);
    assert.equal(p.length, 1);
    assert.deepEqual(p[0].body, { status: 'annule' });
    assert.match(p[0].url, /id=eq\.a0000000-0000-4000-8000-000000000001&status=eq\.publie/);
    // La marque est écrite avant de toucher au trajet.
    assert.ok(sb.appels.indexOf(m[0]) < sb.appels.indexOf(p[0]));
    assert.deepEqual(deletes(sb.appels), []);
    assert.deepEqual(echecsMarque(sb.appels), []);
  });

  test('non-propriétaire : 403, rien écrit', async () => {
    const sb = supabase({ moi: AUTRE });
    const res = await supprimer(sb);
    assert.equal(res._status, 403);
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('admin : peut supprimer le trajet d\'un autre (auteur = admin, conducteur = propriétaire)', async () => {
    const sb = supabase({ moi: ADMIN, role: 'admin' });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.equal(res._body.par, 'admin');
    const m = ajoutsMarque(sb.appels)[0];
    assert.equal(m.body.actor_id, ADMIN);
    assert.equal(m.body.user_id, DRIVER);
    assert.equal(m.body.evidence.par, 'admin');
    assert.equal(patches(sb.appels).length, 1);
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
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('déjà supprimé (annulé + marque) : rien de plus', async () => {
    const sb = supabase({ moi: DRIVER, ride: { id: RIDE, driver_id: DRIVER, status: 'annule' }, marques: [MARQUE] });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.equal(res._body.deja_supprime, true);
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('trajet annulé normalement (sans marque) : peut être supprimé', async () => {
    const sb = supabase({ moi: DRIVER, ride: { id: RIDE, driver_id: DRIVER, status: 'annule' } });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.equal(ajoutsMarque(sb.appels).length, 1);
  });

  test('marque sur un trajet republié depuis : ce n\'est plus « supprimé »', async () => {
    const sb = supabase({ moi: DRIVER, marques: [MARQUE] });
    const res = await supprimer(sb);
    assert.equal(res._status, 200);
    assert.notEqual(res._body.deja_supprime, true);
  });
});

describe('ride-delete — réservations et pannes', () => {
  for (const statut of ['paye', 'confirme', 'en_attente', 'driver_completed', 'complete']) {
    test(`réservation « ${statut} » : refusé, le message dit d'annuler, rien écrit`, async () => {
      const sb = supabase({ moi: DRIVER, bookings: [{ id: 'b1', status: statut }] });
      const res = await supprimer(sb);
      assert.equal(res._status, 409);
      assert.equal(res._body.code, 'reservation_active');
      assert.match(res._body.error, /Annule-le plutôt/);
      assert.deepEqual(ecritures(sb.appels), []);
    });
  }

  test('admin aussi refusé si une réservation est payée', async () => {
    const sb = supabase({ moi: ADMIN, role: 'admin', bookings: [{ id: 'b1', status: 'paye' }] });
    const res = await supprimer(sb);
    assert.equal(res._status, 409);
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('réservations illisibles : refus (échec fermé)', async () => {
    const sb = supabase({ moi: DRIVER, bookingsOk: false });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('erreur HTTP avec une liste vide : refus quand même (jamais « aucune réservation » par défaut)', async () => {
    const sb = supabase({ moi: DRIVER, bookingsOk: false, bookingsBody: [] });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('réponse « OK » mais pas une liste de réservations : refus quand même', async () => {
    const sb = supabase({ moi: DRIVER, bookingsBrut: { message: 'inattendu' } });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('journal illisible : refus, rien écrit', async () => {
    const sb = supabase({ moi: DRIVER, marquesOk: false });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.deepEqual(ecritures(sb.appels), []);
  });

  test('marque impossible à écrire : le trajet n\'est pas touché', async () => {
    const sb = supabase({ moi: DRIVER, marqueOk: false });
    const res = await supprimer(sb);
    assert.equal(res._status, 502);
    assert.deepEqual(patches(sb.appels), []);
  });

  test('trajet changé entre-temps (0 ligne modifiée) : 409, marque mise en échec', async () => {
    const sb = supabase({ moi: DRIVER, patchLignes: 0 });
    const res = await supprimer(sb);
    assert.equal(res._status, 409);
    assert.equal(echecsMarque(sb.appels).length, 1);
    assert.deepEqual(echecsMarque(sb.appels)[0].body, { status: 'echec' });
  });

  test('changement refusé par la base : 409, marque mise en échec', async () => {
    const sb = supabase({ moi: DRIVER, patchOk: false });
    const res = await supprimer(sb);
    assert.equal(res._status, 409);
    assert.equal(echecsMarque(sb.appels).length, 1);
  });

  test('réservation arrivée pendant la suppression : trajet remis comme avant, marque en échec', async () => {
    const sb = supabase({ moi: DRIVER, bookingsApres: [{ id: 'b9', status: 'en_attente' }] });
    const res = await supprimer(sb);
    assert.equal(res._status, 409);
    assert.match(res._body.error, /annule-le plutôt/);
    const p = patches(sb.appels);
    assert.equal(p.length, 2);
    assert.deepEqual(p[1].body, { status: 'publie' });
    assert.match(p[1].url, /status=eq\.annule/);
    assert.equal(echecsMarque(sb.appels).length, 1);
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

  // Faux Supabase pour les listes : un trajet supprimé (annulé + marque), un annulé normal, un publié.
  const SUPP = 'a0000000-0000-4000-8000-0000000000aa';
  const ANNU = 'a0000000-0000-4000-8000-0000000000bb';
  const PUB = 'a0000000-0000-4000-8000-0000000000cc';
  function listes(moi, role = 'conducteur') {
    const urls = [];
    global.fetch = async (url, opts = {}) => {
      urls.push(url);
      if (url.includes('/auth/v1/user')) return rep({ id: moi });
      if (url.includes('/rpc/check_rate_limit')) return rep(true);
      if (url.includes('/rest/v1/profiles')) return rep([{ id: moi, role, suspendu: false }]);
      if (url.includes('/rest/v1/transaction_audit_events')) {
        return rep([{ id: 'm1', created_at: '2026-11-20T10:00:00Z', actor_id: ADMIN, user_id: DRIVER, evidence: { ride_id: SUPP, supprime_le: '2026-11-20T10:00:00Z', par: 'admin' } }]);
      }
      if (url.includes('/rest/v1/rides?')) {
        return rep([
          { id: SUPP, driver_id: DRIVER, start_city: 'A', end_city: 'B', status: 'annule' },
          { id: ANNU, driver_id: DRIVER, start_city: 'C', end_city: 'D', status: 'annule' },
          { id: PUB, driver_id: DRIVER, start_city: 'E', end_city: 'F', status: 'publie' },
        ]);
      }
      return rep([]);
    };
    return urls;
  }
  async function appeler(endpoint, moi, role) {
    const urls = listes(moi, role);
    const res = makeRes();
    await handler({ method: 'POST', url: '/api/platform', body: { endpoint }, headers: { authorization: 'Bearer tok', 'content-type': 'application/json' } }, res);
    return { res, urls };
  }

  test('« Mes trajets » (ride-my-rides) : le trajet supprimé disparaît, l\'annulé normal reste', async () => {
    const { res, urls } = await appeler('ride-my-rides', DRIVER);
    assert.equal(res._status, 200);
    const ids = res._body.my_rides.map((r) => r.id);
    assert.deepEqual(ids, [ANNU, PUB]);
    assert.ok(urls.some((u) => u.includes(`transaction_audit_events?event_type=eq.ride_deleted&status=eq.supprime`) && u.includes(`user_id=eq.${DRIVER}`)));
  });

  test('tableau de bord covoiturage : le trajet supprimé disparaît', async () => {
    const { res } = await appeler('cov-dashboard', DRIVER);
    assert.equal(res._status, 200);
    const ids = (res._body.my_rides || []).map((r) => r.id);
    assert.ok(!ids.includes(SUPP));
    assert.ok(ids.includes(ANNU) && ids.includes(PUB));
  });

  test('admin : le trajet supprimé reste listé avec « supprime » et sa date', async () => {
    const { res } = await appeler('ride-admin', ADMIN, 'admin');
    assert.equal(res._status, 200);
    const supp = res._body.rides.find((r) => r.id === SUPP);
    const annu = res._body.rides.find((r) => r.id === ANNU);
    assert.equal(supp.supprime, true);
    assert.equal(supp.supprime_le, '2026-11-20T10:00:00Z');
    assert.equal(supp.supprime_par, 'admin');
    assert.ok(!annu.supprime);
  });

  test('tableau de bord unifié (dashboard.html) : filtre les trajets marqués « ride_deleted »', () => {
    const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
    assert.match(dash, /\.from\('transaction_audit_events'\)[\s\S]{0,200}\.eq\('event_type', 'ride_deleted'\)/);
    assert.match(dash, /!\(r\.status === 'annule' && supprimes\.has\(r\.id\)\)/);
    assert.doesNotMatch(dash, /neq\('status', 'supprime'\)/);
  });

  test('carte des villes : le repli ne montre jamais les trajets annulés (dont les supprimés)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'api', 'platform.js'), 'utf8');
    assert.match(src, /rides\?status=neq\.annule&select=start_city/);
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

  // Exécute le vrai rendu de « Trajets récents » (loadCovoiturage) avec un faux document.
  function rendreTrajetsAdmin(rides) {
    const vm = require('node:vm');
    const html = lire('admin/dashboard-admin.html');
    const extraire = (debut) => {
      const i = html.indexOf(debut);
      assert.ok(i > 0, debut);
      let n = 0, j = html.indexOf('{', i);
      for (let k = j; k < html.length; k++) {
        if (html[k] === '{') n++;
        else if (html[k] === '}' && --n === 0) return html.slice(i, k + 1);
      }
      throw new Error('fin introuvable');
    };
    const els = {};
    const ctx = {
      document: { getElementById: (id) => (els[id] ||= { id, innerHTML: '', textContent: '', style: {} }) },
      AUTH_API: { getUser: () => ({ session: { access_token: 't' } }) },
      fetch: async () => ({ ok: true, json: async () => ({ rides, bookings: [], reports: [] }) }),
      Date, Number, String, Math, JSON, console,
    };
    vm.createContext(ctx);
    vm.runInContext([extraire('function afEsc('), extraire('function afId('), extraire('async function loadCovoiturage()')].join('\n'), ctx);
    return ctx.loadCovoiturage().then(() => els['cov-rides-body'].innerHTML);
  }

  test('admin : Supprimer caché si réservation active, « Supprimé le … » sinon, bouton retour', async () => {
    const id = (n) => `a0000000-0000-4000-8000-00000000000${n}`;
    const out = await rendreTrajetsAdmin([
      { id: id(1), start_city: 'A', end_city: 'B', status: 'annule', supprime: true, supprime_le: '2026-11-20T10:00:00Z', supprime_par: 'admin', reservations_actives: 0 },
      { id: id(2), start_city: 'C', end_city: 'D', status: 'publie', reservations_actives: 1 },
      { id: id(3), start_city: 'E', end_city: 'F', status: 'publie', reservations_actives: 0, is_return_trip: true, return_departure_time: '2026-12-01T21:00:00Z' },
      { id: id(4), start_city: 'G', end_city: 'H', status: 'publie', reservations_actives: null },
    ]);
    const lignes = out.split('<tr>').slice(1);
    assert.equal(lignes.length, 4);
    assert.match(lignes[0], /Supprimé le 2026-11-20 \(admin\)/);
    assert.doesNotMatch(lignes[0], /adminSupprimerTrajet/);
    assert.doesNotMatch(lignes[1], /adminSupprimerTrajet/);
    assert.match(lignes[1], /1 réservation\(s\) active\(s\)/);
    assert.match(lignes[2], /adminSupprimerTrajet/);
    assert.match(lignes[2], /adminCreerRetour/);
    assert.doesNotMatch(lignes[3], /adminSupprimerTrajet/, 'lecture impossible : bouton caché par prudence');
  });

  test('ride-admin : compte les réservations actives de chaque trajet', async () => {
    const R1 = 'a0000000-0000-4000-8000-0000000000d1';
    const R2 = 'a0000000-0000-4000-8000-0000000000d2';
    global.fetch = async (url) => {
      if (url.includes('/auth/v1/user')) return rep({ id: ADMIN });
      if (url.includes('/rpc/check_rate_limit')) return rep(true);
      if (url.includes('/rest/v1/profiles')) return rep([{ id: ADMIN, role: 'admin', suspendu: false }]);
      if (url.includes('/rest/v1/ride_bookings?ride_id=in.')) {
        assert.match(url, /status=not\.in\.\(annule_passager,annule_chauffeur,cancelled,refunded,rembourse\)/);
        return rep([{ ride_id: R1, status: 'paye' }]);
      }
      if (url.includes('/rest/v1/rides?')) return rep([{ id: R1, status: 'publie' }, { id: R2, status: 'publie' }]);
      return rep([]);
    };
    const res = makeRes();
    await handler({ method: 'POST', url: '/api/platform', body: { endpoint: 'ride-admin' }, headers: { authorization: 'Bearer tok', 'content-type': 'application/json' } }, res);
    assert.equal(res._status, 200);
    assert.deepEqual(res._body.rides.map((r) => r.reservations_actives), [1, 0]);
  });

  test('aucun code n\'écrit le statut « supprime » dans rides (la base actuelle ne le permet pas)', () => {
    const src = lire('lib/_rides.js');
    assert.doesNotMatch(src, /JSON\.stringify\(\{ status: 'supprime'/);
    assert.doesNotMatch(src, /supprime_le: new Date\(\)\.toISOString\(\), supprime_par/);
    assert.doesNotMatch(src, /rides\?[^`]*status=neq\.supprime/);
  });

  test('migration gardée pour prod-v2, hors de supabase/migrations, marquée « NE PAS APPLIQUER »', () => {
    const migr = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations'));
    assert.ok(!migr.some((n) => n.includes('suppression_logique')), 'pas dans supabase/migrations');
    const dir = path.join(ROOT, 'supabase', 'prod-v2-plus-tard');
    const f = fs.readdirSync(dir).find((n) => n.includes('_rides_suppression_logique.sql'));
    assert.ok(f, 'fichier gardé');
    assert.ok(!f.endsWith('.sql'), 'extension changée pour que le CLI l\'ignore');
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(sql.split('\n')[0], /NE PAS APPLIQUER/);
    assert.match(sql, /'supprime'::text/);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\bdelete\s+from\b/i);
  });
});
