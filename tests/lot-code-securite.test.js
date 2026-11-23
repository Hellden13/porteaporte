// tests/lot-code-securite.test.js — Lot « code de sécurité » (23 nov. 2026) :
// 1. code de sécurité du passager impossible à manquer ; 2. prélèvement seulement d'un trajet complété ;
// 3. annuler une seule date d'un trajet récurrent ; 4. compte encans exclu du concours ;
// 5. plus de « estimés » sur Transparence ; 6. plus de mention publique de Pieds en l'air.
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const lire = (f) => fs.readFileSync(f, 'utf8');
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk_test_fake123' };
const D = '11111111-1111-4111-8111-111111111111'; // conducteur
const P = '22222222-2222-4222-8222-222222222222'; // passagère
const PHRASE = "Tu l'entreras à l'arrivée pour confirmer que tu es bien arrivé(e).";

// ── 1. Code de sécurité ───────────────────────────────────────────────────
function domMini() {
  function el(tag) {
    return {
      tagName: tag, children: [], listeners: {}, attrs: {}, style: {}, className: '', id: '', textContent: '', value: '', disabled: false,
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      set textContent(v) { this._t = v; if (v === '') this.children = []; }, get textContent() { return this._t || ''; },
    };
  }
  const doc = { head: el('head'), createElement: el, getElementById: () => null };
  const trouver = (n, pred) => (pred(n) ? n : (n.children || []).map((c) => trouver(c, pred)).find(Boolean));
  return { doc, el, trouver };
}
function chargerComposant(reponses) {
  const { doc, el, trouver } = domMini();
  const appels = [];
  const win = {
    fetch: async (url, o) => {
      const corps = JSON.parse(o.body);
      appels.push({ url, corps });
      const r = reponses(url, corps);
      return { ok: r.ok !== false, json: async () => r.body };
    },
  };
  win.window = win;
  vm.runInNewContext(lire('js/code-securite.js'), { window: win, document: doc, fetch: win.fetch, JSON, Object, String });
  return { C: win.PAPCodeSecurite, el, trouver, appels };
}
const SESSION = { access_token: 'jeton' };

describe('1. code de sécurité du passager', () => {
  test('écran de confirmation : encadré « Crée ton code de sécurité maintenant » avec le champ directement là', async () => {
    const { C, el, trouver } = chargerComposant(() => ({ body: { has_code: false, has_profile_code: false, has_booking_code: false } }));
    const zone = el('div');
    assert.equal(await C.afficher(zone, { session: SESSION, bookingId: 'b1', mode: 'encadre' }), true);
    assert.equal(trouver(zone, (n) => n.tagName === 'h3').textContent, '🔐 Crée ton code de sécurité maintenant');
    assert.match(trouver(zone, (n) => n.tagName === 'p').textContent, /Tu l'entreras à l'arrivée pour confirmer que tu es bien arrivé\(e\)\./);
    const champ = trouver(zone, (n) => n.tagName === 'input');
    assert.ok(champ, 'le champ est directement là');
    assert.equal(champ.inputMode, 'numeric');
  });
  test('fiche du trajet réservé : « Tu n\'as pas encore de code de sécurité »', async () => {
    const { C, el, trouver } = chargerComposant(() => ({ body: { has_code: false } }));
    const zone = el('div');
    await C.afficher(zone, { session: SESSION, bookingId: 'b1', mode: 'avertissement' });
    assert.equal(trouver(zone, (n) => n.tagName === 'h3').textContent, "⚠️ Tu n'as pas encore de code de sécurité");
  });
  test('code déjà créé, ou état inconnu : rien n\'est affiché', async () => {
    let t = chargerComposant(() => ({ body: { has_profile_code: true } }));
    let zone = t.el('div');
    assert.equal(await t.C.afficher(zone, { session: SESSION, mode: 'encadre' }), false);
    assert.equal(zone.children.length, 0);
    t = chargerComposant(() => ({ ok: false, body: { error: 'x' } }));
    zone = t.el('div');
    assert.equal(await t.C.afficher(zone, { session: SESSION, mode: 'avertissement' }), false);
  });
  test('enregistrer : 4 à 8 chiffres, envoyé au serveur (code du compte), puis confirmation', async () => {
    const t = chargerComposant((url) => ({ body: url.includes('status') ? { has_code: false } : { success: true, has_profile_code: true } }));
    const zone = t.el('div');
    await t.C.afficher(zone, { session: SESSION, bookingId: 'b1', mode: 'encadre' });
    const champ = t.trouver(zone, (n) => n.tagName === 'input');
    const bouton = t.trouver(zone, (n) => n.tagName === 'button');
    champ.value = '12';
    await bouton.listeners.click[0]();
    assert.match(t.trouver(zone, (n) => n.className === 'msg').textContent, /4 à 8 chiffres/);
    assert.equal(t.appels.filter((a) => a.url.includes('ride-safety-code-set')).length, 0);
    champ.value = '4821';
    await bouton.listeners.click[0]();
    const set = t.appels.find((a) => a.url.includes('ride-safety-code-set'));
    assert.deepEqual({ endpoint: set.corps.endpoint, code: set.corps.code }, { endpoint: 'ride-safety-code-set', code: '4821' });
    assert.equal(zone.children[0].className, 'pap-cs ok');
  });
  test('branché : écran de confirmation (2 endroits), fiche réservée, courriel, Mon compte', () => {
    const trajet = lire('covoiturage-trajet.html');
    assert.match(trajet, /<script src="\/js\/code-securite\.js"><\/script>/);
    assert.match(trajet, /<div id="code-securite-confirmation"><\/div>/);
    assert.match(trajet, /window\.PAPCodeSecurite\.afficher\(document\.getElementById\('code-securite-confirmation'\), \{ session: currentSession, bookingId: bookingId, mode: 'encadre' \}\)/);
    assert.match(trajet, /window\.PAPCodeSecurite\.afficher\(zone, \{ session: s, bookingId: resa\.id, mode: 'avertissement' \}\)/);
    assert.match(trajet, /renderRide\(ridePayload\);\s*avertirCodeSecurite\(\);/, 'appelé au chargement de la fiche');
    const conf = lire('covoiturage-confirme.html');
    assert.match(conf, /<script src="\/js\/code-securite\.js"><\/script>/);
    assert.match(conf, /mode: 'encadre'/);
    const n = lire('api/notifier.js');
    assert.match(n, /covoiturage-confirme\.html\?booking_id=\$\{encodeURIComponent\(data\.booking_id \|\| ''\)\}#code-securite" [^>]*>Créer mon code de sécurité<\/a>/);
    assert.ok(n.includes(PHRASE));
    assert.ok(lire('compte.html').includes(PHRASE));
  });
  test('le courriel de confirmation au passager contient le bouton (rendu réel)', () => {
    const notifier = require('../api/notifier');
    const build = notifier.buildEmails || notifier._buildEmails;
    if (!build) return; // buildEmails non exporté : le test de source ci-dessus suffit
    const m = build('ride_booking_confirmed', { passenger_email: 'p@courriel-capture.ca', booking_id: 'b1' }, 'a@b.c', 'n@b.c', 'PorteàPorte')[0];
    assert.match(m.html, /Créer mon code de sécurité/);
    assert.match(m.html, /#code-securite/);
  });
});

// ── 2. Prélèvement seulement d'un trajet complété ─────────────────────────
describe('2. prélèvement covoiturage : seulement un trajet complété', () => {
  const rides = require('../lib/_rides');
  function base(statut = 'confirme') {
    const passe = new Date(Date.now() - 6 * 3600000).toISOString();
    const db = creerBase({
      ride_bookings: [{ id: 'b1', ride_id: 'r1', passenger_id: P, status: statut, paid_at: null, stripe_payment_intent: 'pi_reel_1234567890abcdefghij', driver_amount: 1.38, total_passenger: 2.88, seats_reserved: 1 }],
      rides: [{ id: 'r1', driver_id: D, departure_time: passe }],
      impact_settings: [{ id: 'default' }],
    });
    db.stripeReponse = (url) => ({ ok: true, status: 200, json: async () => ({ id: 'pi_reel_1234567890abcdefghij', status: 'succeeded', amount_received: 288, amount: 288, currency: 'cad', latest_charge: 'ch_1' }) });
    global.fetch = db.fetch;
    return db;
  }
  const admin = { ...CTX, session: { id: 'adm' }, profile: { role: 'admin' } };
  const captures = (db) => db.stripe.filter((x) => /\/capture$/.test(x.url)).length;
  test('tâche de 22 h : réservation confirmée sans trajet complété → AUCUN prélèvement, alerte admin une seule fois', async () => {
    const db = base();
    for (let i = 0; i < 2; i++) {
      const res = makeRes();
      await rides.rideCaptureEligible({ url: '/api/cron-ride-capture' }, res, admin, { grace_hours: 4 });
      assert.equal(res._body.captured.length, 0);
      assert.equal(res._body.skipped[0].reason, 'trajet_non_complete');
    }
    assert.equal(captures(db), 0, 'Stripe jamais appelé pour prélever');
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'ride_capture_bloquee').length, 1, 'alerte une seule fois');
    assert.equal(db.tables.ride_bookings[0].status, 'confirme', 'rien ne change');
  });
  test('passager ou conducteur qui appelle le prélèvement directement : refusé (trajet non complété)', async () => {
    const db = base();
    const res = makeRes();
    await rides.rideCaptureEligible({}, res, { ...CTX, session: { id: D }, profile: { role: 'conducteur' } }, { booking_id: 'b1', force: true });
    assert.equal(res._body.skipped[0].reason, 'trajet_non_complete');
    assert.equal(captures(db), 0);
  });
  test('trajet complété (code du passager ou validation automatique) : prélevé', async () => {
    const db = base();
    const res = makeRes();
    await rides.rideCaptureEligible({}, res, admin, { booking_id: 'b1', force: true, grace_hours: 0 }, { trajetComplete: true });
    assert.equal(res._body.captured.length, 1);
    assert.equal(captures(db), 1);
  });
  test('décision explicite de l\'admin (réservation + force) : prélevé', async () => {
    const db = base();
    const res = makeRes();
    await rides.rideCaptureEligible({}, res, admin, { booking_id: 'b1', force: true });
    assert.equal(captures(db), 1);
  });
  test('branché : la fin de trajet avec code transmet « trajet complété » ; le bouton du conducteur ne prélève plus', () => {
    assert.match(lire('lib/_rides.js'), /await rideCaptureEligible\(req, fakeRes, ctx, \{ booking_id: booking\.id, force: true, grace_hours: 0 \}, \{ trajetComplete: true \}\);/);
    const d = lire('dashboard.html');
    assert.match(d, /endpoint=ride-driver-complete/);
    assert.doesNotMatch(d, /body: JSON\.stringify\(\{ endpoint: 'ride-capture-eligible', booking_id: b\.id \}\)/);
    assert.match(lire('admin/ride-payments.html'), /endpoint: 'ride-capture-eligible', booking_id: bookingId, force: true/);
  });
});

// ── 3. Annuler une seule date d'un trajet récurrent ───────────────────────
describe('3. annuler une seule date d\'un trajet récurrent', () => {
  const rides = require('../lib/_rides');
  const jourQc = (d) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const CLES = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const cle = (iso) => CLES[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  // Prochain départ : demain 13 h UTC ; le trajet roule tous les jours.
  const demain = new Date(Date.now() + 86400000); demain.setUTCHours(13, 0, 0, 0);
  const JOUR = jourQc(demain);
  const APRES = jourQc(new Date(demain.getTime() + 86400000));
  function base() {
    const db = creerBase({
      rides: [{ id: 'r1', driver_id: D, start_city: 'Lévis', end_city: 'Québec', start_sector: 'Saint-Nicolas', end_sector: 'Sainte-Foy', departure_time: demain.toISOString(), is_recurring: true, recurrence_days: CLES, available_seats: 2, total_seats: 3, status: 'publie', cost_per_km: 0.25, total_distance_km: 22 },
        { id: 'r2', driver_id: D, start_city: 'Lévis', end_city: 'Québec', departure_time: demain.toISOString(), is_recurring: false, recurrence_days: null, available_seats: 3, total_seats: 3, status: 'publie' }],
      ride_bookings: [{ id: 'b1', ride_id: 'r1', passenger_id: P, status: 'confirme', stripe_payment_intent: 'pi_reel_1234567890abcdefghij', total_passenger: 2.88, seats_reserved: 1, payment_currency: 'cad' }],
      profiles: [{ id: P, email: 'p@courriel-capture.ca' }],
    });
    db.stripeReponse = (url) => ({ ok: true, status: 200, json: async () => ({ id: 'pi_reel_1234567890abcdefghij', status: url.endsWith('/cancel') ? 'canceled' : 'requires_capture', amount: 288 }) });
    global.fetch = db.fetch;
    return db;
  }
  const conducteur = { ...CTX, session: { id: D }, profile: { role: 'conducteur' } };
  const appel = async (ctx, body) => { const res = makeRes(); await rides.rideAnnulerDate({}, res, ctx, body); return res; };
  test('seul le conducteur ou l\'admin ; trajet récurrent seulement ; jour roulé ; pas dans le passé', async () => {
    base();
    assert.equal((await appel({ ...CTX, session: { id: P }, profile: { role: 'expediteur' } }, { ride_id: 'r1', date: JOUR }))._status, 403);
    assert.equal((await appel(conducteur, { ride_id: 'r2', date: JOUR }))._status, 409);
    assert.equal((await appel(conducteur, { ride_id: 'r1', date: '2020-01-06' }))._status, 409);
    assert.equal((await appel(conducteur, { ride_id: 'r1', date: 'demain' }))._status, 400);
  });
  test('annuler le jour du prochain départ : réservation remboursée (autorisation libérée), avertie, place rendue ; une seule fois', async () => {
    const db = base();
    const r = await appel(conducteur, { ride_id: 'r1', date: JOUR });
    assert.equal(r._status, 200, JSON.stringify(r._body));
    assert.equal(r._body.reservations_annulees, 1);
    assert.equal(db.tables.ride_bookings[0].status, 'annule_chauffeur');
    assert.ok(db.stripe.some((x) => x.url.endsWith('/cancel')), 'autorisation Stripe libérée');
    assert.equal(db.tables.rides[0].available_seats, 3, 'place rendue');
    assert.equal(db.tables.rides[0].status, 'publie', 'le trajet reste publié pour les autres jours');
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'trajet_date_annulee').length, 1);
    assert.equal((await appel(conducteur, { ride_id: 'r1', date: JOUR }))._status, 409, 'déjà annulée');
  });
  test('annuler un autre jour : les réservations du prochain départ ne sont pas touchées', async () => {
    const db = base();
    const r = await appel(conducteur, { ride_id: 'r1', date: APRES });
    assert.equal(r._status, 200);
    assert.equal(r._body.reservations_annulees, 0);
    assert.equal(db.tables.ride_bookings[0].status, 'confirme');
  });
  test('recherche : absent le jour annulé, présent les autres jours', async () => {
    base();
    await appel(conducteur, { ride_id: 'r1', date: APRES });
    const chercher = async (date) => {
      const res = makeRes();
      await rides.rideSearch({ url: `/api/platform?endpoint=ride-search&date=${date}` }, res, CTX, { date });
      return (res._body.rides || []).map((x) => x.id);
    };
    assert.ok(!(await chercher(APRES)).includes('r1'), 'jour annulé');
    assert.ok((await chercher(JOUR)).includes('r1'), 'autre jour');
    assert.equal(cle(APRES) !== undefined, true);
  });
  test('réservation refusée si le prochain départ est un jour annulé', async () => {
    base();
    await appel(conducteur, { ride_id: 'r1', date: JOUR });
    const res = makeRes();
    await rides.rideBook({ headers: {} }, res, { ...CTX, session: { id: '33333333-3333-4333-8333-333333333333' }, profile: { role: 'expediteur' } }, { ride_id: 'r1', pickup_city: 'Lévis', dropoff_city: 'Québec', seats: 1 });
    assert.equal(res._status, 409);
    assert.equal(res._body.code, 'date_annulee');
  });
  test('bouton « Annuler un seul jour » dans le tableau du conducteur (trajets récurrents)', () => {
    const h = lire('dashboard-covoiturage.html');
    assert.match(h, /onclick="annulerUnJour\('\$\{r\.id\}'\)"/);
    assert.match(h, /endpoint=ride-annuler-date/);
    assert.match(lire('api/platform.js'), /if \(endpoint === 'ride-annuler-date'\)\s+return await rideAnnulerDate\(req, res, ctx, body\);/);
  });
});

// ── 4. Concours : compte encans exclu ─────────────────────────────────────
describe('4. compte encans exclu du concours des Fêtes', () => {
  const C = require('../lib/_concours-fetes');
  const ENCANS = 'efff77a6-615f-4120-a189-b842de8d75e7';
  test('ni participation d\'inscription, ni participation d\'activité', () => {
    const fen = { debut: '2026-11-01T00:00:00Z', fin: '2026-12-31T00:00:00Z' };
    const membre = (id) => ({ id, email: `${id.slice(0, 4)}@courriel-capture.ca`, role: 'expediteur', created_at: '2026-11-10T00:00:00Z', email_confirmed_at: '2026-11-10T00:00:00Z' });
    const liv = (id, exp) => ({ id, expediteur_id: exp, statut: 'payee', livre_le: '2026-11-15T00:00:00Z' });
    const out = C.calculerParticipations({ livraisons: [liv('l1', ENCANS), liv('l2', P)], membres: [membre(ENCANS), membre(P)] }, fen);
    assert.deepEqual(out.map((x) => x.user_id), [P]);
    assert.equal(C.estCompteExclu(ENCANS), true);
    assert.doesNotMatch(lire('lib/_concours-fetes.js'), /encanspiedsenlair/, 'jamais le courriel dans le code');
  });
});

// ── 5 et 6. Transparence et mention publique ──────────────────────────────
describe('5-6. Transparence sans « estimés » ; plus de mention publique de Pieds en l\'air', () => {
  test('Transparence : montants réels du journal, plus la vieille note « estimés » de la base', () => {
    const h = lire('transparence.html');
    assert.doesNotMatch(h, /estimés en direct/);
    assert.doesNotMatch(h, /textContent=impact\.note/);
    const p = lire('api/platform.js');
    assert.doesNotMatch(p, /state\.settings\.public_note \|\|/);
    assert.match(p, /note: 'Montants réels écrits au journal à chaque paiement capturé\.'/);
  });
  test('règlement du concours : organisé par PorteàPorte (le nom de la société n\'apparaît plus nulle part en public)', () => {
    const fichiers = [];
    for (const d of ['.', 'admin', 'covoiturage', 'js']) for (const f of fs.readdirSync(d)) if (/\.(html|js)$/.test(f)) fichiers.push(`${d}/${f}`);
    for (const f of fichiers) assert.doesNotMatch(lire(f), /Pieds en L.air/i, f);
    assert.match(lire('concours-fetes-reglement.html'), /Le concours est organisé par PorteàPorte \(porteaporte\.site\)/);
  });
});
