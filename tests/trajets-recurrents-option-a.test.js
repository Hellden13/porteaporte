'use strict';
// Option A (décision de Denis, 26 nov. 2026) : la date stockée d'un trajet récurrent avance au
// prochain départ, seulement quand aucune réservation n'est en cours. Une réservation suit
// rides.departure_time : sans ça, annuler plusieurs jours d'avance était compté « tardif » (50 %).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const rides = require('../lib/_rides');
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk_test_fake123' };
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
// Jour de la semaine (Québec) dans n jours : le trajet ne roule que ce jour-là.
const jourDansN = (n) => {
  const d = new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', weekday: 'short' });
  return JOURS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(d)];
};
const PASSE = '2026-06-07T16:00:00+00:00'; // date de création, passée
const trajet = (extra = {}) => ({ id: 'rr1', driver_id: 'd1', start_city: 'Québec', end_city: 'Montréal', departure_time: PASSE, is_recurring: true, recurrence_days: [jourDansN(4)], available_seats: 1, total_seats: 3, status: 'publie', cost_per_km: 0.3, total_distance_km: 250, ...extra });

test('aucune réservation en cours (seulement payées / annulées) : la date avance et les places se libèrent', async () => {
  const db = creerBase({ rides: [trajet()], ride_bookings: [
    { id: 'b1', ride_id: 'rr1', status: 'paye' }, { id: 'b2', ride_id: 'rr1', status: 'annule_passager' },
  ] });
  global.fetch = db.fetch;
  const ride = { ...db.tables.rides[0] };
  const r = await rides.avancerDepartRecurrent(CTX, ride, null);
  assert.equal(r.avance, true);
  const attendu = rides.prochainDepart(trajet());
  assert.equal(db.tables.rides[0].departure_time, attendu);
  assert.equal(ride.departure_time, attendu);
  assert.equal(db.tables.rides[0].available_seats, 3);
  const jours = (Date.parse(attendu) - Date.now()) / 86400000;
  assert.ok(jours > 3 && jours < 5, `prochain départ dans ~4 jours (${jours.toFixed(2)})`);
});

test('réservation en cours pour la date passée : on n’avance pas et on refuse la nouvelle réservation', async () => {
  for (const statut of ['confirme', 'driver_completed', 'en_attente', 'statut_inconnu']) {
    const db = creerBase({ rides: [trajet()], ride_bookings: [{ id: 'b1', ride_id: 'rr1', status: statut }] });
    global.fetch = db.fetch;
    const r = await rides.avancerDepartRecurrent(CTX, { ...db.tables.rides[0] }, null);
    assert.equal(r.status, 409, statut);
    assert.equal(r.erreur.code, 'depart_precedent_en_cours');
    assert.equal(db.tables.rides[0].departure_time, PASSE, 'date stockée inchangée');
  }
});

test('date stockée encore à venir avec réservations en cours : on la garde (elles sont pour cette date)', async () => {
  const futur = new Date(Date.now() + 2 * 86400000).toISOString();
  const db = creerBase({ rides: [trajet({ departure_time: futur, recurrence_days: [jourDansN(1)] })], ride_bookings: [{ id: 'b1', ride_id: 'rr1', status: 'confirme' }] });
  global.fetch = db.fetch;
  const r = await rides.avancerDepartRecurrent(CTX, { ...db.tables.rides[0] }, null);
  assert.equal(r.avance, false);
  assert.equal(db.tables.rides[0].departure_time, futur);
});

test('lecture des réservations impossible : on échoue fermé (503), rien n’est écrit', async () => {
  const db = creerBase({ rides: [trajet()], ride_bookings: [] });
  db.illisible = ['ride_bookings'];
  global.fetch = db.fetch;
  const r = await rides.avancerDepartRecurrent(CTX, { ...db.tables.rides[0] }, null);
  assert.equal(r.status, 503);
  assert.equal(db.tables.rides[0].departure_time, PASSE);
});

test('date déjà avancée par une autre requête (PATCH conditionnel sans ligne) : 409, pas d’écrasement', async () => {
  const db = creerBase({ rides: [trajet()], ride_bookings: [] });
  global.fetch = db.fetch;
  const vieux = { ...db.tables.rides[0], departure_time: '2026-06-02T16:00:00+00:00' }; // copie périmée
  const r = await rides.avancerDepartRecurrent(CTX, vieux, null);
  assert.equal(r.status, 409);
  assert.equal(r.erreur.code, 'trajet_modifie');
  assert.equal(db.tables.rides[0].departure_time, PASSE);
});

test('une date annulée par le conducteur est sautée par l’avancement', async () => {
  const db = creerBase({ rides: [trajet({ recurrence_days: [jourDansN(2), jourDansN(4)] })], ride_bookings: [] });
  global.fetch = db.fetch;
  const dans2 = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  await rides.avancerDepartRecurrent(CTX, { ...db.tables.rides[0] }, new Set([dans2]));
  const jours = (Date.parse(db.tables.rides[0].departure_time) - Date.now()) / 86400000;
  assert.ok(jours > 3 && jours < 5, `saute la date annulée (${jours.toFixed(2)} j)`);
});

test('rideBook sur un récurrent à date passée : la date stockée avance avant la réservation', async () => {
  const db = creerBase({ rides: [trajet({ available_seats: 3 })], ride_bookings: [], profiles: [{ id: 'p1', role: 'expediteur' }, { id: 'd1', role: 'livreur' }] });
  global.fetch = db.fetch;
  const res = makeRes();
  await rides.rideBook({ headers: {} }, res, { ...CTX, session: { id: 'p1' }, profile: { id: 'p1', role: 'expediteur' } }, { ride_id: 'rr1', pickup_city: 'Québec', dropoff_city: 'Montréal', seats_reserved: 1 });
  assert.equal(db.tables.rides[0].departure_time, rides.prochainDepart(trajet()), `statut ${res._status} ${JSON.stringify(res._body)}`);
});

test('annulation plusieurs jours avant le prochain départ = 100 % remboursé (et pas « tardif »)', async () => {
  const db = creerBase({ rides: [trajet()], ride_bookings: [], impact_settings: [] });
  global.fetch = db.fetch;
  await rides.avancerDepartRecurrent(CTX, { ...db.tables.rides[0] }, null);
  db.tables.ride_bookings.push({ id: 'bk', ride_id: 'rr1', passenger_id: 'p1', status: 'confirme', seats_reserved: 1, total_passenger: 40, driver_amount: 34, stripe_payment_intent: 'pi_test_option_a_123456', payment_currency: 'cad' });
  const res = makeRes();
  await rides.rideCancel({ method: 'POST' }, res, { ...CTX, session: { id: 'p1' }, profile: { role: 'expediteur' } }, { booking_id: 'bk', preview_only: true });
  assert.equal(res._status, 200, JSON.stringify(res._body));
  const corps = JSON.stringify(res._body);
  assert.equal(res._body.refund, 40, corps);
  assert.equal(res._body.driver_compensation, 0, corps);
  assert.equal(res._body.security_fund, 0, corps);
});

test('sans l’avancement (date de création passée), la même annulation était comptée tardive : 50 %', async () => {
  const db = creerBase({ rides: [trajet()], ride_bookings: [{ id: 'bk', ride_id: 'rr1', passenger_id: 'p1', status: 'confirme', seats_reserved: 1, total_passenger: 40, driver_amount: 34, stripe_payment_intent: 'pi_test_option_a_123456', payment_currency: 'cad' }], impact_settings: [] });
  global.fetch = db.fetch;
  const res = makeRes();
  await rides.rideCancel({ method: 'POST' }, res, { ...CTX, session: { id: 'p1' }, profile: { role: 'expediteur' } }, { booking_id: 'bk', preview_only: true });
  assert.equal(res._body.refund, 20, 'preuve du problème corrigé par l’option A');
});
