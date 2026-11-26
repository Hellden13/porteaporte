'use strict';
// Trajets récurrents (décisions de Denis, 26 nov. 2026) :
// 1. « Terminer » sur un récurrent : réservations « terminé par le conducteur », le trajet reste publié ;
// 2. cron quotidien : date avancée, places remises, « complet » → « publié » (sans réservation en cours) ;
// 3. fiche : bouton remplacé d'avance quand le départ précédent n'est pas terminé ;
// 4. rappel au conducteur le lendemain matin, une seule fois par départ.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
  process.env.SITE_URL = 'https://porteaporte.site';
});

const rides = require('../lib/_rides');
const lire = (f) => fs.readFileSync(f, 'utf8');
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk_test_fake123' };
const D = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const P2 = '33333333-3333-4333-8333-333333333333';
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const jourQc = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
const TOUS = JOURS.slice();
// Départ stocké : hier (Québec), roule tous les jours.
const HIER = new Date(Date.now() - 86400000); HIER.setUTCHours(13, 0, 0, 0);
const trajet = (extra = {}) => ({ id: 'rr', driver_id: D, start_city: 'Lévis', end_city: 'Québec', departure_time: HIER.toISOString(), is_recurring: true, recurrence_days: TOUS, available_seats: 2, total_seats: 3, status: 'publie', cost_per_km: 0.25, total_distance_km: 22, ...extra });
const profils = [{ id: D, email: 'conducteur@courriel-capture.ca', prenom: 'Dan', role: 'livreur' }, { id: P, email: 'p@courriel-capture.ca', prenom: 'Pax', role: 'expediteur' }, { id: P2, email: 'p2@courriel-capture.ca', prenom: 'Pax2', role: 'expediteur' }];

test('« Terminer » sur un trajet récurrent : réservations « terminé par le conducteur », le trajet RESTE publié', async () => {
  const db = creerBase({ rides: [trajet()], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'confirme', seats_reserved: 1 }], profiles: profils });
  global.fetch = db.fetch;
  const res = makeRes();
  await rides.rideComplete({}, res, { ...CTX, session: { id: D }, profile: { role: 'livreur' } }, { ride_id: 'rr', actor: 'driver' });
  assert.equal(res._status, 200, JSON.stringify(res._body));
  assert.equal(db.tables.ride_bookings[0].status, 'driver_completed');
  assert.equal(db.tables.rides[0].status, 'publie', 'le trajet récurrent reste publié');
});

test('« Terminer » sur un trajet ponctuel : le trajet passe à « terminé » (inchangé)', async () => {
  const db = creerBase({ rides: [trajet({ is_recurring: false, recurrence_days: null })], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'confirme', seats_reserved: 1 }], profiles: profils });
  global.fetch = db.fetch;
  const res = makeRes();
  await rides.rideComplete({}, res, { ...CTX, session: { id: D }, profile: { role: 'livreur' } }, { ride_id: 'rr', actor: 'driver' });
  assert.equal(db.tables.rides[0].status, 'termine');
});

test('parcours complet : terminer → validé → cron avance → le prochain départ est réservable', async () => {
  const db = creerBase({ rides: [trajet({ available_seats: 0, status: 'complet' })], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'confirme', seats_reserved: 3 }], profiles: profils });
  global.fetch = db.fetch;
  await rides.rideComplete({}, makeRes(), { ...CTX, session: { id: D }, profile: { role: 'livreur' } }, { ride_id: 'rr', actor: 'driver' });
  assert.equal(db.tables.rides[0].status, 'complet', 'toujours là (pas « terminé »)');
  // Avant validation : le cron ne peut pas avancer (réservation encore en cours).
  let c = await rides.avancerTrajetsRecurrents(CTX);
  assert.deepEqual(c.avances, []);
  assert.equal(c.bloques.length, 1);
  // La validation automatique (ou le code du passager) termine la réservation : « payé ».
  db.tables.ride_bookings[0].status = 'paye';
  c = await rides.avancerTrajetsRecurrents(CTX);
  assert.deepEqual(c.avances, ['rr']);
  const r = db.tables.rides[0];
  assert.equal(r.status, 'publie', '« complet » → « publié »');
  assert.equal(r.available_seats, 3, 'toutes les places reviennent');
  assert.ok(Date.parse(r.departure_time) > Date.now(), 'date à venir');
  // Un autre passager réserve le prochain départ.
  const res = makeRes();
  await rides.rideBook({ headers: {} }, res, { ...CTX, session: { id: P2 }, profile: { id: P2, role: 'expediteur' } }, { ride_id: 'rr', pickup_city: 'Lévis', dropoff_city: 'Québec', seats_reserved: 1 });
  assert.equal(res._status, 200, JSON.stringify(res._body));
  assert.ok(db.tables.ride_bookings.some((b) => b.passenger_id === P2), 'réservation créée');
});

test('rideBook : un récurrent « complet » à date passée, sans réservation en cours, rouvre au prochain départ', async () => {
  const db = creerBase({ rides: [trajet({ available_seats: 0, status: 'complet' })], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'paye', seats_reserved: 3 }], profiles: profils });
  global.fetch = db.fetch;
  const res = makeRes();
  await rides.rideBook({ headers: {} }, res, { ...CTX, session: { id: P2 }, profile: { id: P2, role: 'expediteur' } }, { ride_id: 'rr', pickup_city: 'Lévis', dropoff_city: 'Québec', seats_reserved: 1 });
  assert.equal(res._status, 200, JSON.stringify(res._body));
});

test('cron : ne touche ni un trajet « terminé » ou annulé, ni une date encore à venir', async () => {
  const futur = new Date(Date.now() + 86400000).toISOString();
  const db = creerBase({ rides: [trajet({ id: 'r1', status: 'termine' }), trajet({ id: 'r2', status: 'annule' }), trajet({ id: 'r3', departure_time: futur })], ride_bookings: [] });
  global.fetch = db.fetch;
  const c = await rides.avancerTrajetsRecurrents(CTX);
  assert.deepEqual(c.avances, []);
  assert.equal(db.tables.rides[0].departure_time, HIER.toISOString());
  assert.equal(db.tables.rides[2].departure_time, futur);
});

test('fiche : le départ précédent pas terminé est signalé d’avance ; sinon rien', async () => {
  let db = creerBase({ rides: [trajet()], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'confirme' }] });
  global.fetch = db.fetch;
  const p = await rides.departPrecedentEnCours(CTX, db.tables.rides[0]);
  assert.equal(p.date, jourQc(HIER.getTime()));
  db = creerBase({ rides: [trajet()], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'paye' }] });
  global.fetch = db.fetch;
  assert.equal(await rides.departPrecedentEnCours(CTX, db.tables.rides[0]), null);
  assert.equal(await rides.departPrecedentEnCours(CTX, trajet({ is_recurring: false })), null);
});

test('fiche (page) : bouton remplacé par « Le prochain départ s’ouvrira quand le conducteur aura terminé celui du … »', () => {
  const h = lire('covoiturage-trajet.html');
  assert.match(h, /<div class="depart-bloque" id="depart-bloque" role="status" hidden><\/div>\s*<button class="btn-reserve" id="btn-reserve"/);
  assert.match(h, /'⏳ Le prochain départ s’ouvrira quand le conducteur aura terminé celui du ' \+ jour \+ '\.'/);
  assert.match(h, /#btn-reserve\[hidden\], \.depart-bloque\[hidden\] \{ display: none !important; \}/);
  assert.match(lire('lib/_rides.js'), /safeRide\.depart_precedent_en_cours = await departPrecedentEnCours\(ctx, ride\);/);
});

test('rappel : le lendemain, une seule fois par départ, seulement s’il reste des réservations « confirmées »', async () => {
  const db = creerBase({ rides: [trajet()], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'confirme' }], profiles: profils });
  global.fetch = db.fetch;
  let r = await rides.rappelsTerminerTrajet(CTX);
  assert.deepEqual(r.envoyes, ['rr']);
  const mail = db.courriels.find((m) => m.type === 'ride_rappel_terminer');
  assert.equal(mail.data.driver_email, 'conducteur@courriel-capture.ca');
  r = await rides.rappelsTerminerTrajet(CTX);
  assert.deepEqual(r.envoyes, []);
  assert.equal(r.deja, 1);
  assert.equal(db.courriels.filter((m) => m.type === 'ride_rappel_terminer').length, 1, 'un seul rappel');
});

test('rappel : rien le jour même, ni si le conducteur a déjà terminé', async () => {
  const ilYa1h = new Date(Date.now() - 3600000).toISOString();
  let db = creerBase({ rides: [trajet({ departure_time: ilYa1h })], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'confirme' }], profiles: profils });
  global.fetch = db.fetch;
  // « Aujourd'hui » au Québec : le départ d'il y a une heure est du même jour, sauf juste après minuit.
  if (jourQc(Date.parse(ilYa1h)) === jourQc(Date.now())) assert.deepEqual((await rides.rappelsTerminerTrajet(CTX)).envoyes, []);
  db = creerBase({ rides: [trajet()], ride_bookings: [{ id: 'b1', ride_id: 'rr', passenger_id: P, status: 'driver_completed' }], profiles: profils });
  global.fetch = db.fetch;
  assert.deepEqual((await rides.rappelsTerminerTrajet(CTX)).envoyes, []);
  assert.equal(db.courriels.length, 0);
});

test('courriel de rappel : sujet clair, données échappées, lien vers le tableau de bord', () => {
  const { buildEmails } = require('../api/notifier');
  const [m] = buildEmails('ride_rappel_terminer', { driver_email: 'c@x.ca', driver_name: '<b>Dan</b>', ville_depart: 'Lévis', ville_arrivee: 'Québec', departure_time: '2026-11-26T13:00:00Z' }, 'a@x.ca', 'f@x.ca', 'PorteàPorte');
  assert.equal(m.to, 'c@x.ca');
  assert.equal(m.subject, 'Termine ton trajet du jeudi 26 novembre (Lévis → Québec)');
  assert.doesNotMatch(m.html, /<b>Dan<\/b>/);
  assert.match(m.html, /tes passagers ne peuvent pas réserver ton prochain départ/);
  assert.match(m.html, /dashboard\.html\?onglet=covoiturage/);
});

test('tâches planifiées : avancement dans le cron du soir, rappel le matin (12 h UTC) sans nouvelle fonction', () => {
  const v = JSON.parse(lire('vercel.json'));
  assert.deepEqual(v.crons.map((c) => [c.path, c.schedule]).slice(0, 2), [['/api/cron-cleanup', '0 3 * * *'], ['/api/cron-rappels-trajets', '0 12 * * *']]);
  assert.ok(v.rewrites.some((r) => r.source === '/api/cron-rappels-trajets' && r.destination === '/api/cron-cleanup?tache=rappels-trajets'));
  assert.match(lire('api/cron-cleanup.js'), /if \(tache === 'rappels-trajets'\) \{/);
  assert.match(lire('lib/_cron-ride-capture.js'), /recurrents = await avancerTrajetsRecurrents\(ctx\);/);
});
