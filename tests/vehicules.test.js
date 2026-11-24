// tests/vehicules.test.js — Branche vehicules-debut-journee : véhicules enregistrés, début de journée
// obligatoire (véhicule + selfie + photo), jumelage selon le véhicule du jour, covoiturage
// (véhicule à la publication, début de journée au départ), conservation 90 jours sauf litige.
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const V = require('../lib/_vehicules');
const U = '55555555-5555-4555-8555-555555555555';
const AUTRE = '66666666-6666-4666-8666-666666666666';
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fausse-photo-jpeg').toString('base64');
const lire = (f) => fs.readFileSync(f, 'utf8');
const ctxDe = (uid, profile = { role: 'livreur', driver_status: 'verified' }) => ({ ...CTX, session: { id: uid }, profile });
async function appel(fn, ctx, body, opts) { const res = makeRes(); await fn({}, res, ctx, body, opts); return res; }
const veh = (type, cap = {}, extra = {}) => ({ type, capacite: cap, ...extra });
const liv = (o) => ({ ville_depart: 'Québec', ville_arrivee: 'Québec', taille_colis: 'petit', poids_kg: 2, type_colis: 'colis', ...o });

describe('règles de jumelage par type (tableau accepté par Denis)', () => {
  const cas = [
    ['à pied : petit 5 kg même ville', 'a_pied', liv({}), true],
    ['à pied : 6 kg refusé', 'a_pied', liv({ poids_kg: 6 }), false],
    ['à pied : moyen refusé', 'a_pied', liv({ taille_colis: 'moyen' }), false],
    ['à pied : autre ville refusé', 'a_pied', liv({ ville_arrivee: 'Lévis' }), false],
    ['trottinette : 10 kg ok, 11 kg non', 'trottinette_electrique', liv({ poids_kg: 10 }), true],
    ['trottinette : 11 kg', 'trottinette_electrique', liv({ poids_kg: 11 }), false],
    ['vélo : moyen 15 kg ok', 'velo', liv({ taille_colis: 'moyen', poids_kg: 15 }), true],
    ['vélo : panier d\'épicerie refusé', 'velo', liv({ type_colis: 'nourriture' }), false],
    ['vélo : gros refusé', 'velo', liv({ taille_colis: 'gros' }), false],
    ['vélo électrique : 20 kg ok', 'velo_electrique', liv({ poids_kg: 20 }), true],
    ['vélo électrique : épicerie refusée', 'velo_electrique', liv({ type_colis: 'nourriture' }), false],
    ['moto : Québec → Montréal moyen ok', 'moto', liv({ ville_arrivee: 'Montréal', taille_colis: 'moyen', poids_kg: 30 }), true],
    ['moto : gros refusé', 'moto', liv({ taille_colis: 'gros' }), false],
    ['auto : gros 100 kg autre ville ok', 'auto', liv({ ville_arrivee: 'Lévis', taille_colis: 'gros', poids_kg: 100 }), true],
    ['auto : XL refusé', 'auto', liv({ taille_colis: 'xl' }), false],
    ['auto : meuble refusé', 'auto', liv({ type_colis: 'meuble', taille_colis: 'gros' }), false],
    ['VUS : 150 kg ok, épicerie ok', 'vus', liv({ taille_colis: 'gros', poids_kg: 150, type_colis: 'nourriture' }), true],
    ['VUS : 151 kg refusé', 'vus', liv({ poids_kg: 151 }), false],
    ['camionnette : XL meuble 500 kg ok', 'camionnette', liv({ taille_colis: 'xl', type_colis: 'meuble', poids_kg: 500 }), true],
    ['camionnette : 501 kg refusé', 'camionnette', liv({ poids_kg: 501 }), false],
    ['taille inconnue traitée comme « moyen » (trottinette refuse)', 'trottinette_electrique', liv({ taille_colis: null }), false],
    ['taille non reconnue traitée comme « moyen » (trottinette refuse)', 'trottinette_electrique', liv({ taille_colis: 'enorme' }), false],
    ['vélo : Québec → Lévis refusé (même ville seulement, même si 20 km)', 'velo', liv({ ville_arrivee: 'Lévis' }), false],
  ];
  for (const [nom, type, l, attendu] of cas) {
    test(nom, () => assert.equal(V.eligibiliteVehicule(veh(type), l).allowed, attendu, V.eligibiliteVehicule(veh(type), l).reason));
  }
  test('la capacité déclarée réduit le plafond (jamais au-dessus du type)', () => {
    assert.equal(V.eligibiliteVehicule(veh('auto', { poids_max_kg: 40 }), liv({ poids_kg: 50 })).allowed, false);
    assert.equal(V.capaciteReelle(veh('velo', { poids_max_kg: 999, taille_max: 'xl' })).poidsMax, 15);
    assert.equal(V.capaciteReelle(veh('velo', { taille_max: 'xl' })).tailleMax, 'moyen');
    assert.equal(V.capaciteReelle(veh('auto', { places: 99 })).places, 7);
    assert.equal(V.capaciteReelle(veh('velo', { places: 3 })).places, 0);
  });
  test('vélo : la ville de départ doit être celle du livreur', () => {
    assert.equal(V.eligibiliteVehicule(veh('velo'), liv({}), { ville: 'Lévis' }).allowed, false);
    assert.equal(V.eligibiliteVehicule(veh('velo'), liv({}), { ville: 'Québec' }).allowed, true);
  });
  test('sans véhicule du jour : rien', () => {
    assert.equal(V.eligibiliteVehicule(null, liv({})).allowed, false);
  });
});

describe('enregistrer un véhicule', () => {
  test('type inconnu, numéro manquant ou photo manquante : refusé, rien n\'est écrit', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    assert.equal((await appel(V.enregistrerVehicule, ctxDe(U), { type: 'fusee' }))._status, 400);
    assert.match((await appel(V.enregistrerVehicule, ctxDe(U), { type: 'trottinette_electrique', photo_data_url: PHOTO }))._body.error, /Numéro de série ou plaque requis/);
    assert.match((await appel(V.enregistrerVehicule, ctxDe(U), { type: 'velo', numero: 'SN-1234' }))._body.error, /Photo du véhicule requise/);
    assert.equal(db.tables.transaction_audit_events.length, 0);
  });
  test('trottinette de Simon : photo rangée en privé (kyc-documents/vehicules/…), journal, capacité plafonnée', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    const r = await appel(V.enregistrerVehicule, ctxDe(U), { type: 'trottinette_electrique', numero: 'sn 48213', photo_data_url: PHOTO, poids_max_kg: 80 });
    assert.equal(r._status, 200, JSON.stringify(r._body));
    assert.equal(r._body.vehicule.numero, 'SN 48213');
    assert.equal(r._body.vehicule.capacite.poidsMax, 10, 'plafond du type');
    assert.equal(db.tables.transaction_audit_events[0].evidence.capacite.poids_max_kg, 10, 'enregistré au plafond du type');
    const up = db.stockage.find((x) => x.m === 'POST');
    assert.match(up.chemin, new RegExp(`^kyc-documents/vehicules/${U}/[0-9a-f-]{36}\\.jpg$`));
    const e = db.tables.transaction_audit_events[0];
    assert.equal(e.event_type, 'vehicule_enregistre');
    assert.equal(e.user_id, U);
    assert.equal(e.evidence.photo_path.startsWith(`vehicules/${U}/`), true);
    assert.equal((await appel(V.enregistrerVehicule, ctxDe(U), { type: 'trottinette_electrique', numero: 'SN 48213', photo_data_url: PHOTO }))._status, 409, 'même véhicule deux fois');
  });
  test('à pied : ni numéro ni photo', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    assert.equal((await appel(V.enregistrerVehicule, ctxDe(U), { type: 'a_pied' }))._status, 200);
  });
  test('retirer : le membre retire le sien ; l\'admin peut retirer celui d\'un autre ; un non-admin non', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    const r = await appel(V.enregistrerVehicule, ctxDe(U), { type: 'auto', numero: 'ABC 123', photo_data_url: PHOTO, places: 4 });
    const vid = r._body.vehicule.vehicule_id;
    assert.equal((await appel(V.retirerVehicule, ctxDe(AUTRE), { user_id: U, vehicule_id: vid }, { parAdmin: true }))._status, 403);
    assert.equal((await appel(V.retirerVehicule, ctxDe(AUTRE), { vehicule_id: vid }))._status, 404, 'pas le sien');
    assert.equal((await appel(V.retirerVehicule, ctxDe('adm', { role: 'admin' }), { user_id: U, vehicule_id: vid, raison: 'photo floue' }, { parAdmin: true }))._status, 200);
    assert.deepEqual(await V.vehiculesDe(CTX, U), []);
  });
});

describe('début de journée obligatoire', () => {
  async function avecTrottinette() {
    const db = creerBase({ livraisons: [] });
    global.fetch = db.fetch;
    const r = await appel(V.enregistrerVehicule, ctxDe(U), { type: 'trottinette_electrique', numero: 'SN 48213', photo_data_url: PHOTO });
    return { db, vid: r._body.vehicule.vehicule_id };
  }
  test('sans véhicule enregistré : impossible', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    const r = await appel(V.commencerJournee, ctxDe(U), { vehicule_id: 'x', selfie_data_url: PHOTO, photo_data_url: PHOTO });
    assert.equal(r._status, 409);
    assert.equal(r._body.code, 'vehicule_requis');
  });
  test('le vélo du père (non enregistré) ne peut pas servir', async () => {
    await avecTrottinette();
    const r = await appel(V.commencerJournee, ctxDe(U), { vehicule_id: 'velo-du-pere', selfie_data_url: PHOTO, photo_data_url: PHOTO });
    assert.equal(r._status, 400);
    assert.match(r._body.error, /non enregistré ne peut pas servir/);
    assert.equal(await V.debutDuJour(CTX, U), null);
  });
  test('selfie et photo du véhicule obligatoires', async () => {
    const { vid } = await avecTrottinette();
    assert.match((await appel(V.commencerJournee, ctxDe(U), { vehicule_id: vid, photo_data_url: PHOTO }))._body.error, /Selfie requis/);
    assert.match((await appel(V.commencerJournee, ctxDe(U), { vehicule_id: vid, selfie_data_url: PHOTO }))._body.error, /Photo du véhicule requise/);
  });
  test('début de journée : photos privées, journal, véhicule du jour ; l\'ancien champ n\'est qu\'un reflet', async () => {
    const { db, vid } = await avecTrottinette();
    db.tables.profiles = [{ id: U, transport_mode_actif: 'truck' }];
    const r = await appel(V.commencerJournee, ctxDe(U), { vehicule_id: vid, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    assert.equal(r._status, 200, JSON.stringify(r._body));
    const jour = V.dateQc();
    const chemins = db.stockage.filter((x) => x.m === 'POST').map((x) => x.chemin);
    assert.ok(chemins.some((c) => new RegExp(`^kyc-documents/debut-journee/${U}/${jour}/\\d+-selfie\\.jpg$`).test(c)));
    assert.ok(chemins.some((c) => new RegExp(`^kyc-documents/debut-journee/${U}/${jour}/\\d+-vehicule\\.jpg$`).test(c)));
    const d = await V.debutDuJour(CTX, U);
    assert.equal(d.vehicule.type, 'trottinette_electrique');
    assert.equal(db.tables.profiles[0].transport_mode_actif, 'trottinette');
  });
  test('changement de véhicule dans la journée : le dernier début de journée compte', async () => {
    const { vid } = await avecTrottinette();
    const auto = (await appel(V.enregistrerVehicule, ctxDe(U), { type: 'auto', numero: 'XYZ 987', photo_data_url: PHOTO, places: 4 }))._body.vehicule.vehicule_id;
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: vid, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: auto, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    assert.equal((await V.debutDuJour(CTX, U)).vehicule.type, 'auto');
  });
  test('véhicule retiré après le début de journée : il faut le refaire', async () => {
    const { vid } = await avecTrottinette();
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: vid, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    await appel(V.retirerVehicule, ctxDe(U), { vehicule_id: vid });
    assert.equal(await V.debutDuJour(CTX, U), null);
  });
  test('un début de journée d\'hier ne compte pas aujourd\'hui', async () => {
    const { db, vid } = await avecTrottinette();
    db.tables.transaction_audit_events.push({ id: 'hier', user_id: U, event_type: 'debut_journee', created_at: '2026-01-01T12:00:00Z', evidence: { vehicule_id: vid, date_qc: '2026-01-01' } });
    assert.equal(await V.debutDuJour(CTX, U), null);
  });
  test('membres actuels : livreur ou conducteur sans véhicule → enregistrement obligatoire', async () => {
    let db = creerBase({ rides: [] });
    global.fetch = db.fetch;
    assert.equal((await appel(V.mesVehicules, ctxDe(U)))._body.doit_enregistrer, true);
    assert.equal((await appel(V.mesVehicules, ctxDe(U, { role: 'expediteur' })))._body.doit_enregistrer, false);
    db = creerBase({ rides: [{ id: 'r1', driver_id: U }] });
    global.fetch = db.fetch;
    assert.equal((await appel(V.mesVehicules, ctxDe(U, { role: 'expediteur' })))._body.doit_enregistrer, true, 'conducteur de covoiturage');
    await appel(V.enregistrerVehicule, ctxDe(U), { type: 'a_pied' });
    assert.equal((await appel(V.mesVehicules, ctxDe(U)))._body.doit_enregistrer, false);
  });
});

describe('le jumelage utilise le véhicule du jour (missions disponibles et acceptation)', () => {
  const platform = require('../api/platform');
  const LIVRAISONS = [
    { id: 'L1', code: 'PP-PETIT', ville_depart: 'Québec', ville_arrivee: 'Québec', taille_colis: 'petit', poids_kg: 2, type_colis: 'colis', statut: 'paiement_autorise', livreur_id: null, prix_total: 10, cree_le: '2026-11-22T10:00:00Z' },
    { id: 'L2', code: 'PP-EPICE', ville_depart: 'Québec', ville_arrivee: 'Québec', taille_colis: 'moyen', poids_kg: 8, type_colis: 'nourriture', statut: 'paiement_autorise', livreur_id: null, prix_total: 15, cree_le: '2026-11-22T10:00:00Z' },
    { id: 'L3', code: 'PP-GROS', ville_depart: 'Québec', ville_arrivee: 'Lévis', taille_colis: 'gros', poids_kg: 40, type_colis: 'colis', statut: 'paiement_autorise', livreur_id: null, prix_total: 40, cree_le: '2026-11-22T10:00:00Z' },
  ];
  function base() {
    const db = creerBase({ livraisons: LIVRAISONS, profiles: [{ id: U, role: 'livreur', driver_status: 'verified', email_verified: true, ville: 'Québec', transport_mode_actif: 'truck', suspendu: false }] });
    const f = db.fetch;
    global.fetch = async (url, o = {}) => (url.includes('/auth/v1/user') ? { ok: true, status: 200, json: async () => ({ id: U, email: 'l@courriel-capture.ca', email_confirmed_at: '2026-01-01' }) } : f(url, o));
    return db;
  }
  const api = async (endpoint, body = {}) => {
    const res = makeRes();
    await platform({ method: 'POST', url: `/api/platform?endpoint=${endpoint}`, query: { endpoint }, headers: { authorization: 'Bearer ' + U, 'content-type': 'application/json' }, body: { endpoint, ...body } }, res);
    return res;
  };
  test('sans début de journée : aucune mission (même si l\'ancien choix dit « camion »)', async () => {
    base();
    const r = await api('available-livraisons');
    assert.equal(r._status, 200, JSON.stringify(r._body));
    assert.equal(r._body.debut_journee_requis, true);
    assert.deepEqual(r._body.livraisons, []);
    const a = await api('assign-driver', { livraison_id: 'L1', livreur_id: U });
    assert.equal(a._status, 409);
    assert.equal(a._body.code, 'debut_journee_requis');
  });
  test('vélo du jour : seulement le petit colis de la même ville ; épicerie et gros colis refusés à l\'acceptation', async () => {
    base();
    const v = (await appel(V.enregistrerVehicule, ctxDe(U), { type: 'velo', numero: 'VELO 1', photo_data_url: PHOTO }))._body.vehicule.vehicule_id;
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: v, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    const r = await api('available-livraisons');
    assert.deepEqual(r._body.livraisons.map((x) => x.code || x.id), ['PP-PETIT']);
    const a = await api('assign-driver', { livraison_id: 'L2', livreur_id: U });
    assert.equal(a._status, 403);
    assert.match(a._body.reason, /épicerie/);
    assert.equal((await api('assign-driver', { livraison_id: 'L3', livreur_id: U }))._status, 403);
  });
  test('auto du jour : petit, épicerie et gros colis vers Lévis proposés', async () => {
    base();
    const v = (await appel(V.enregistrerVehicule, ctxDe(U), { type: 'auto', numero: 'ABC 123', photo_data_url: PHOTO, places: 4 }))._body.vehicule.vehicule_id;
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: v, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    const r = await api('available-livraisons');
    assert.deepEqual(r._body.livraisons.map((x) => x.code || x.id).sort(), ['PP-EPICE', 'PP-GROS', 'PP-PETIT']);
  });
});

describe('covoiturage : véhicule à la publication, début de journée au départ', () => {
  test('publication : un véhicule de covoiturage avec assez de places est exigé', async () => {
    let db = creerBase();
    global.fetch = db.fetch;
    assert.equal((await V.vehiculePourTrajet(CTX, U, 2)).code, 'vehicule_requis');
    await appel(V.enregistrerVehicule, ctxDe(U), { type: 'velo', numero: 'VELO 1', photo_data_url: PHOTO });
    assert.equal((await V.vehiculePourTrajet(CTX, U, 1)).ok, false, 'un vélo ne transporte pas de passagers');
    await appel(V.enregistrerVehicule, ctxDe(U), { type: 'auto', numero: 'ABC 123', photo_data_url: PHOTO, places: 2 });
    assert.equal((await V.vehiculePourTrajet(CTX, U, 3)).ok, false, '2 places pour un trajet de 3');
    const ok = await V.vehiculePourTrajet(CTX, U, 2);
    assert.equal(ok.ok, true);
    assert.equal(ok.vehicule.type, 'auto');
  });
  test('rideCreate refuse sans véhicule (409) et enregistre le type du véhicule', async () => {
    const { rideCreate } = require('../lib/_rides');
    const db = creerBase({ rides: [] });
    global.fetch = db.fetch;
    const corps = { start_city: 'Lévis', end_city: 'Québec', departure_time: new Date(Date.now() + 86400000).toISOString(), available_seats: 3, total_distance_km: 20 };
    let res = makeRes();
    await rideCreate({ headers: {} }, res, { ...ctxDe(U, { role: 'conducteur' }) }, corps);
    assert.equal(res._status, 409);
    assert.equal(res._body.code, 'vehicule_requis');
    await appel(V.enregistrerVehicule, ctxDe(U), { type: 'vus', numero: 'VUS 555', photo_data_url: PHOTO, places: 5 });
    res = makeRes();
    await rideCreate({ headers: {} }, res, { ...ctxDe(U, { role: 'conducteur' }) }, corps);
    assert.notEqual(res._status, 409, JSON.stringify(res._body));
    assert.equal(db.tables.rides[0]?.vehicle_type, 'vus');
  });
  test('départ : début de journée obligatoire avec un véhicule qui a assez de places', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    assert.equal((await V.departTrajetPermis(CTX, U, 3)).code, 'debut_journee_requis');
    const velo = (await appel(V.enregistrerVehicule, ctxDe(U), { type: 'velo', numero: 'VELO 1', photo_data_url: PHOTO }))._body.vehicule.vehicule_id;
    const auto = (await appel(V.enregistrerVehicule, ctxDe(U), { type: 'auto', numero: 'ABC 123', photo_data_url: PHOTO, places: 4 }))._body.vehicule.vehicule_id;
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: velo, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    assert.equal((await V.departTrajetPermis(CTX, U, 3)).code, 'vehicule_du_jour_incompatible');
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: auto, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    assert.equal((await V.departTrajetPermis(CTX, U, 3)).ok, true);
    assert.equal((await V.departTrajetPermis(CTX, U, 5)).ok, false, '4 places pour 5');
  });
  test('GPS du conducteur (départ) et fin du trajet refusés sans début de journée', async () => {
    const rides = require('../lib/_rides');
    const db = creerBase({
      ride_bookings: [{ id: 'b1', ride_id: 'r1', passenger_id: AUTRE, status: 'paye', seats_reserved: 1 }],
      rides: [{ id: 'r1', driver_id: U, departure_time: new Date(Date.now() - 3600000).toISOString(), total_seats: 3 }],
    });
    global.fetch = db.fetch;
    let res = makeRes();
    await rides.rideGpsUpdate({}, res, ctxDe(U, { role: 'conducteur' }), { ride_id: 'r1', booking_id: 'b1', lat: 46.8, lng: -71.2 });
    assert.equal(res._status, 409, JSON.stringify(res._body));
    assert.equal(res._body.code, 'debut_journee_requis');
    res = makeRes();
    await rides.rideDriverComplete({}, res, ctxDe(U, { role: 'conducteur' }), { booking_id: 'b1' });
    assert.equal(res._status, 409);
    assert.equal(res._body.code, 'debut_journee_requis');
    const auto = (await appel(V.enregistrerVehicule, ctxDe(U), { type: 'auto', numero: 'ABC 123', photo_data_url: PHOTO, places: 4 }))._body.vehicule.vehicule_id;
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: auto, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    res = makeRes();
    await rides.rideGpsUpdate({}, res, ctxDe(U, { role: 'conducteur' }), { ride_id: 'r1', booking_id: 'b1', lat: 46.8, lng: -71.2 });
    assert.notEqual(res._status, 409, 'avec le début de journée, le GPS part');
  });
  test('branché au départ (GPS du conducteur) et à la fin du trajet', () => {
    const src = lire('lib/_rides.js');
    assert.equal((src.match(/const dep = await departTrajetPermis\(ctx, ctx\.session\.id, booking\.ride\?\.total_seats \|\| booking\.seats_reserved \|\| 1\);/g) || []).length, 2);
    assert.match(src, /vehicle_type: vehiculeTrajet \? vehiculeTrajet\.type : \(vehicle_type \|\| 'berline'\),/);
  });
});

describe('conservation : selfies et photos du jour 90 jours, sauf litige ouvert', () => {
  const vieux = (j, uid) => ({ id: `d${j}${uid}`, user_id: uid, event_type: 'debut_journee', created_at: new Date(Date.now() - j * 86400000).toISOString(), evidence: { vehicule_id: 'v', date_qc: 'x', selfie_path: `debut-journee/${uid}/s.jpg`, photo_path: `debut-journee/${uid}/p.jpg` } });
  test('91 jours sans litige : photos supprimées et notées ; avec litige ouvert ou à 89 jours : gardées', async () => {
    const db = creerBase({ transaction_audit_events: [vieux(91, U), vieux(91, AUTRE), vieux(89, U)], livraisons: [{ id: 'lit', livreur_id: AUTRE, statut: 'litige' }] });
    global.fetch = db.fetch;
    const r = await V.purgerPhotosDuJour(CTX);
    assert.deepEqual(r, { purges: 1, gardes: 1 });
    const supp = db.stockage.filter((x) => x.m === 'DELETE');
    assert.equal(supp.length, 1);
    assert.deepEqual(supp[0].body.prefixes, [`debut-journee/${U}/s.jpg`, `debut-journee/${U}/p.jpg`]);
    const e = db.tables.transaction_audit_events.find((x) => x.id === `d91${U}`);
    assert.equal(e.evidence.selfie_path, null);
    assert.ok(e.evidence.photos_supprimees_le);
    assert.ok(db.tables.transaction_audit_events.find((x) => x.id === `d91${AUTRE}`).evidence.selfie_path, 'litige : gardée');
    assert.ok(db.tables.transaction_audit_events.find((x) => x.id === `d89${U}`).evidence.selfie_path);
    assert.deepEqual(await V.purgerPhotosDuJour(CTX), { purges: 0, gardes: 1 }, 'pas deux fois');
  });
  test('litige illisible : on garde (prudent) ; la tâche quotidienne lance la purge', async () => {
    const db = creerBase({ transaction_audit_events: [vieux(120, U)] });
    db.illisible = ['livraisons'];
    global.fetch = db.fetch;
    assert.deepEqual(await V.purgerPhotosDuJour(CTX), { purges: 0, gardes: 1 });
    assert.match(lire('api/cron-cleanup.js'), /results\.photos_debut_journee = await purgerPhotosDuJour\(\{ sbUrl, sbKey \}\);/);
  });
});

describe('admin : photos consultables, liens signés seulement', () => {
  test('admin seulement ; liens signés du bucket privé', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    const v = (await appel(V.enregistrerVehicule, ctxDe(U), { type: 'auto', numero: 'ABC 123', photo_data_url: PHOTO, places: 4 }))._body.vehicule.vehicule_id;
    await appel(V.commencerJournee, ctxDe(U), { vehicule_id: v, selfie_data_url: PHOTO, photo_data_url: PHOTO });
    assert.equal((await appel(V.adminVehicules, ctxDe(U), {}))._status, 403);
    const r = await appel(V.adminVehicules, ctxDe('adm', { role: 'admin' }), {});
    assert.equal(r._status, 200);
    assert.equal(r._body.vehicules.length, 1);
    assert.match(r._body.vehicules[0].photo_url, /\/storage\/v1\/object\/sign\/kyc-documents\/vehicules\//);
    assert.match(r._body.debuts_journee[0].selfie_url, /\/object\/sign\/kyc-documents\/debut-journee\//);
    assert.doesNotMatch(lire('lib/_vehicules.js'), /profile-photos/, 'jamais le bucket public');
  });
});

describe('écrans', () => {
  test('« Mes véhicules » : appareil photo du cellulaire, début de journée, enregistrement', () => {
    const h = lire('vehicules.html');
    assert.match(h, /id="selfieFichier" type="file" accept="image\/\*" capture="user"/);
    assert.match(h, /id="photoFichier" type="file" accept="image\/\*" capture="environment"/);
    assert.match(h, /api\('debut-journee'/);
    assert.match(h, /api\('vehicule-enregistrer'/);
    assert.match(h, /Un véhicule non enregistré \(par exemple un vélo emprunté\) ne peut pas servir/);
    assert.match(lire('js/session-expiree.js'), /confirmation\|vehicules\)/);
  });
  test('tableau du livreur : véhicule du jour lu sur le serveur, plus de choix libre ; obligatoire à la connexion', () => {
    const d = lire('membre-livrer.html');
    assert.match(d, /endpoint=vehicules-mes/);
    assert.match(d, /window\.location\.href = '\/vehicules\.html\?obligatoire=1';/);
    assert.doesNotMatch(d, /id="modeButtons"/);
    assert.match(d, /out\.debut_journee_requis/);
    for (const f of ['membre-accueil.html', 'membre-covoiturage.html']) assert.match(lire(f), /src="\/js\/vehicule-obligatoire\.js"/, f);
    assert.match(lire('browse-missions.html'), /out\.debut_journee_requis/);
    assert.match(lire('covoiturage-publier.html'), /data\.code === 'vehicule_requis'/);
  });
  test('admin : page des véhicules et des débuts de journée', () => {
    const h = lire('admin/vehicules.html');
    assert.match(h, /endpoint=admin-vehicules/);
    assert.match(h, /aucune vérification automatique/);
    assert.match(lire('admin/dashboard-admin.html'), /href="\/admin\/vehicules\.html"/);
  });
});
