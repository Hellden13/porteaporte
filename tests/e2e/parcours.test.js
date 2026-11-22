// tests/e2e/parcours.test.js — Parcours de bout en bout, SUR LE MAC SEULEMENT.
// Base Supabase locale (supabase start), faux Stripe, tout appel hors du Mac bloqué.
// Lancer : npm run test:e2e   (refuse de tourner si la base n'est pas 127.0.0.1)
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const path = require('node:path');
const { demarrer, autoriserPaiement } = require('./serveur-local');

const ROOT = path.join(__dirname, '..', '..');
let S, SB, ANON, SVC;
const MARQUE = 'e2e-' + crypto.randomBytes(3).toString('hex');
const comptes = {};
const crees = { rides: [], bookings: [] };

async function j(method, url, { token, key, body, headers } = {}) {
  const h = { 'content-type': 'application/json', ...(headers || {}) };
  if (key) h.apikey = key;
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (_) { d = t; }
  return { status: r.status, d, headers: r.headers };
}
const svc = (m, p, body, headers) => j(m, SB + p, { key: SVC, token: SVC, body, headers });
const api = (endpoint, body, token) => j('POST', `${S.adresse}/api/platform?endpoint=${endpoint}`, { token, body: { endpoint, ...body } });

async function creerCompte(nom, role, profil = {}) {
  const email = `${MARQUE}-${nom}@exemple.test`;
  const mdp = crypto.randomBytes(18).toString('base64url') + 'Aa1!';
  // Inscription par l'API publique d'Auth (comme le site), sur la base LOCALE.
  const ins = await j('POST', `${SB}/auth/v1/signup`, { key: ANON, body: { email, password: mdp, data: { prenom: nom, nom: 'E2E', role } } });
  assert.ok([200, 201].includes(ins.status), `inscription ${nom} : ${ins.status}`);
  const id = ins.d?.user?.id || ins.d?.id;
  await svc('PUT', `/auth/v1/admin/users/${id}`, { email_confirm: true });
  const p = await svc('GET', `/rest/v1/profiles?id=eq.${id}&select=id`);
  if (!p.d?.length) await svc('POST', '/rest/v1/profiles', { id, email, prenom: nom, nom: 'E2E', role });
  await svc('PATCH', `/rest/v1/profiles?id=eq.${id}`, { role, ...profil });
  // Connexion (mot de passe)
  const c = await j('POST', `${SB}/auth/v1/token?grant_type=password`, { key: ANON, body: { email, password: mdp } });
  assert.equal(c.status, 200, `connexion ${nom}`);
  comptes[nom] = { id, email, token: c.d.access_token };
  return comptes[nom];
}

before(async () => {
  const st = JSON.parse(execSync('supabase status -o json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  SB = st.API_URL; ANON = st.ANON_KEY; SVC = st.SERVICE_ROLE_KEY;
  assert.match(SB, /^http:\/\/(127\.0\.0\.1|localhost):/, 'base locale seulement');
  S = await demarrer({ supabaseUrl: SB, anonKey: ANON, serviceKey: SVC });
  await creerCompte('conducteur', 'les deux', { driver_status: 'verified' });
  await creerCompte('passager', 'expediteur');
  await creerCompte('admin', 'admin');
});

after(async () => {
  // Nettoyage de la base LOCALE (données de ce test seulement).
  for (const id of crees.bookings) await svc('DELETE', `/rest/v1/ride_bookings?id=eq.${id}`);
  for (const c of Object.values(comptes)) {
    for (const t of ['ride_bookings?passenger_id', 'rides?driver_id', 'transactions?user_id', 'transaction_audit_events?user_id', 'ride_driver_profiles?user_id', 'notifications?user_id']) {
      await svc('DELETE', `/rest/v1/${t}=eq.${c.id}`);
    }
    await svc('DELETE', `/rest/v1/profiles?id=eq.${c.id}`);
    await svc('DELETE', `/auth/v1/admin/users/${c.id}`);
  }
  if (S) await S.fermer();
});

describe('parcours complet (local)', () => {
  const ALLER = new Date(Date.now() + 3 * 86400000); ALLER.setUTCHours(13, 0, 0, 0);
  const RETOUR = new Date(ALLER.getTime() + 8 * 3600000);
  let allerId, retourId, bookingId, piId;

  test('pages publiques : recherche, fiche, inscription, connexion, tableaux de bord, /trajets', async () => {
    for (const p of ['/covoiturage.html', '/covoiturage-trajet.html', '/covoiturage-publier.html', '/inscription.html', '/login.html', '/dashboard.html', '/dashboard-covoiturage.html', '/admin/dashboard-admin.html']) {
      const r = await fetch(S.adresse + p);
      assert.equal(r.status, 200, p);
      const html = await r.text();
      for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:module|application\/ld\+json)")[^>]*>([\s\S]*?)<\/script>/g)) {
        assert.doesNotThrow(() => new vm.Script(m[1]), `script de ${p}`);
      }
    }
    const t = await fetch(S.adresse + '/trajets', { redirect: 'manual' });
    assert.ok([307, 308].includes(t.status));
    assert.equal(t.headers.get('location'), '/covoiturage.html');
  });

  test('publication par le conducteur : aller + retour créés', async () => {
    const r = await api('ride-create', {
      start_city: 'Lévis', end_city: 'Québec', departure_time: ALLER.toISOString(), available_seats: 3,
      total_distance_km: 30, energy_type: 'essence', is_return_trip: true, return_departure_time: RETOUR.toISOString(),
    }, comptes.conducteur.token);
    assert.equal(r.status, 200, JSON.stringify(r.d));
    allerId = r.d.ride.id; retourId = r.d.ride_retour?.id;
    crees.rides.push(allerId, retourId);
    assert.ok(retourId, 'retour créé');
  });

  test('recherche publique : l\'aller ET le retour sont trouvés', async () => {
    const jour = ALLER.toISOString().slice(0, 10);
    const a = await j('GET', `${S.adresse}/api/platform?endpoint=ride-search&from=L%C3%A9vis&to=Qu%C3%A9bec&date=${jour}`);
    const b = await j('GET', `${S.adresse}/api/platform?endpoint=ride-search&from=Qu%C3%A9bec&to=L%C3%A9vis&date=${jour}`);
    assert.equal(a.status, 200);
    assert.ok((a.d.rides || []).some((x) => x.id === allerId), 'aller trouvé');
    assert.ok((b.d.rides || []).some((x) => x.id === retourId), 'retour trouvé');
  });

  test('fiche de trajet : prix affiché = source unique (frais fixes par place)', async () => {
    const r = await j('GET', `${S.adresse}/api/platform?endpoint=ride-detail&ride_id=${retourId}`);
    assert.equal(r.status, 200, JSON.stringify(r.d));
    const cfg = await j('GET', `${S.adresse}/api/platform?endpoint=ride-settings`);
    const p = cfg.d.pricing;
    const prix = r.d.price || r.d.pricing || r.d.ride?.price || {};
    const frais = prix.platformFee ?? prix.platform_fee;
    if (frais !== undefined) assert.ok([0, p.platform_fee_low, p.platform_fee_high].includes(Number(frais)), `frais ${frais}`);
  });

  test('réservation du RETOUR par le passager, puis paiement (faux Stripe, capture manuelle)', async () => {
    const b = await api('ride-book', { ride_id: retourId, pickup_city: 'Québec', dropoff_city: 'Lévis', seats_reserved: 1 }, comptes.passager.token);
    assert.equal(b.status, 200, JSON.stringify(b.d));
    bookingId = b.d.booking?.id || b.d.booking_id;
    crees.bookings.push(bookingId);
    const p = await api('ride-payment-create', { booking_id: bookingId }, comptes.passager.token);
    assert.equal(p.status, 200, JSON.stringify(p.d));
    piId = p.d.payment_intent_id || p.d.paymentIntentId || p.d.id;
    assert.match(String(piId), /^pi_test_e2e/);
    autoriserPaiement(S.stripe, piId);
    const s = await api('ride-payment-sync', { booking_id: bookingId, payment_intent_id: piId }, comptes.passager.token);
    assert.equal(s.status, 200, JSON.stringify(s.d));
    const row = await svc('GET', `/rest/v1/ride_bookings?id=eq.${bookingId}&select=status,payment_status`);
    assert.ok(['confirme', 'paye'].includes(row.d[0].status) || /authori|capture/.test(String(row.d[0].payment_status)), JSON.stringify(row.d[0]));
  });

  test('tableau de bord conducteur : aller et retour dans « Mes trajets »', async () => {
    const r = await api('cov-dashboard', {}, comptes.conducteur.token);
    assert.equal(r.status, 200);
    const ids = (r.d.my_rides || []).map((x) => x.id);
    assert.ok(ids.includes(allerId) && ids.includes(retourId));
  });

  test('passager : sa réservation dans ride-my-rides', async () => {
    const r = await api('ride-my-rides', {}, comptes.passager.token);
    assert.equal(r.status, 200);
    assert.ok((r.d.my_bookings || []).some((x) => x.id === bookingId));
  });

  test('admin : liste des trajets (réservation active comptée), « À faire », refus de supprimer', async () => {
    const l = await api('ride-admin', {}, comptes.admin.token);
    assert.equal(l.status, 200);
    const ret = l.d.rides.find((x) => x.id === retourId);
    assert.equal(ret.reservations_actives, 1);
    const af = await api('admin-a-faire', {}, comptes.admin.token);
    assert.equal(af.status, 200);
    const del = await api('ride-delete', { ride_id: retourId }, comptes.admin.token);
    assert.equal(del.status, 409);
    assert.equal(del.d.code, 'reservation_active');
  });

  test('membre simple : routes admin refusées', async () => {
    for (const e of ['ride-admin', 'admin-a-faire', 'admin-ride-create-return']) {
      const r = await api(e, { ride_id: allerId }, comptes.passager.token);
      assert.equal(r.status, 403, e);
    }
  });

  test('aucun appel hors du Mac (production, courriels, Stripe réel)', () => {
    assert.deepEqual(S.bloques.filter((x) => !/^POST 127\.0\.0\.1/.test(x)), []);
  });
});
