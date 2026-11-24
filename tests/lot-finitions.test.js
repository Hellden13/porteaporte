// tests/lot-finitions.test.js — Lot finitions (24 nov. 2026) :
// 1. Mon compte : le code de sécurité n'est plus créé à la main ; 2. annulation non payée = pas de « remboursement » ;
// 3. « Niveau » ne cache plus le menu de gauche du tableau de bord covoiturage.
'use strict';
const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rideCancel, paiementFait } = require('../lib/_rides');
const { buildEmails } = require('../api/notifier');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });
const res = () => ({ _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });
const ctx = () => ({ sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk_test_fake', session: { id: 'passenger-1', email: 'p@test.ca' }, profile: { role: 'expediteur' } });

describe('1. Mon compte : code de sécurité automatique', () => {
  const h = lire('membre-securite.html');
  test('explication exacte et lien vers mes réservations', () => {
    assert.ok(h.includes('Ton code de sécurité est créé automatiquement à chaque réservation. Tu le trouves sur ta confirmation, dans ton courriel et sur la fiche du trajet réservé. Donne-le au conducteur à l\'arrivée.'));
    assert.match(h, /<a class="btn btn-primary" href="\/dashboard\.html\?onglet=covoiturage">Voir mes réservations<\/a>/);
  });
  test('plus de champ ni de bouton Enregistrer côté passager', () => {
    for (const x of ['id="ride-safety-code"', 'safety-secret-question', 'safety-secret-answer', 'saveRideSafetyCode', 'ride-safety-code-set', 'ride-safety-code-status', 'Code par défaut']) assert.ok(!h.includes(x), x);
  });
  test('le serveur garde la vérification et le déblocage (admin et anciennes réservations)', () => {
    const p = lire('api/platform.js');
    assert.ok(p.includes("endpoint === 'ride-safety-code-reset'") && p.includes("endpoint === 'ride-safety-code-verify'"));
  });
});

describe('2. Annulation : « remboursement » seulement si un paiement avait été autorisé ou prélevé', () => {
  test('paiementFait', () => {
    for (const a of ['autorisation_liberee', 'capture_partielle', 'remboursement_partiel', 'rembourse', 'capture_partielle_conducteur_en_attente']) assert.equal(paiementFait(a), true, a);
    for (const a of ['aucun_paiement', 'rien_requires_payment_method', 'rien_a_rembourser_canceled', '', undefined]) assert.equal(paiementFait(a), false, String(a));
  });

  function fauxFetch(booking, piStatus) {
    const appels = [];
    global.fetch = async (url, o = {}) => {
      const m = o.method || 'GET';
      appels.push({ url, m, body: o.body });
      const ok = (d) => ({ ok: true, status: 200, json: async () => d });
      if (url.includes('/ride_bookings?id=eq.') && m === 'GET') return ok([booking]);
      if (url.includes('/rides?id=eq.') && m === 'GET') return ok([{ id: 'ride-1', driver_id: 'driver-1', departure_time: new Date(Date.now() + 30 * 3600000).toISOString(), available_seats: 1, start_city: 'Lévis', end_city: 'Rimouski' }]);
      if (url.includes('/impact_settings')) return ok([{ ride_cancel_free_window_h: 24, ride_cancel_late_window_h: 2 }]);
      if (url.includes('api.stripe.com') && url.includes('/payment_intents/') && m === 'GET') return ok({ id: booking.stripe_payment_intent, status: piStatus, currency: 'cad' });
      if (url.includes('api.stripe.com') && url.endsWith('/cancel')) return ok({ status: 'canceled' });
      if (url.includes('/profiles?id=in.')) return ok([{ id: 'passenger-1', email: 'p@test.ca' }, { id: 'driver-1', email: 'd@test.ca' }]);
      if (url.includes('/api/notifier')) return ok({ success: true });
      if (m === 'PATCH' || m === 'POST') return { ok: true, status: 201, json: async () => ([{}]) };
      return { ok: true, status: 200, json: async () => [] };
    };
    return appels;
  }
  const NON_PAYEE = { id: 'b1', ride_id: 'ride-1', passenger_id: 'passenger-1', status: 'en_attente', total_passenger: 12.5, seats_reserved: 1, stripe_payment_intent: null, payment_currency: 'cad' };
  const AUTORISEE = { ...NON_PAYEE, status: 'confirme', stripe_payment_intent: 'pi_reel_autorise_1234567890' };
  const avis = (appels) => JSON.parse(appels.find((a) => a.url.includes('/api/notifier')).body);

  test('réservation non payée : « Réservation annulée. », paiement:false dans la réponse et dans le courriel', async () => {
    const appels = fauxFetch(NON_PAYEE);
    const r = res();
    await rideCancel({}, r, ctx(), { booking_id: 'b1' });
    assert.equal(r._status, 200);
    assert.equal(r._body.paiement, false);
    assert.equal(r._body.message, 'Réservation annulée.');
    assert.equal(avis(appels).data.paiement, false);
    assert.ok(!appels.some((a) => a.url.includes('api.stripe.com')), 'aucun appel Stripe');
  });

  test('aperçu d’une réservation non payée : paiement:false, sans appeler Stripe', async () => {
    const appels = fauxFetch(NON_PAYEE);
    const r = res();
    await rideCancel({}, r, ctx(), { booking_id: 'b1', preview_only: true });
    assert.equal(r._body.paiement, false);
    assert.ok(!appels.some((a) => a.url.includes('api.stripe.com')));
  });

  test('PaymentIntent créé mais jamais autorisé : traité comme non payé', async () => {
    const appels = fauxFetch({ ...AUTORISEE, status: 'en_attente' }, 'requires_payment_method');
    const r = res();
    await rideCancel({}, r, ctx(), { booking_id: 'b1' });
    assert.equal(r._body.paiement, false);
    assert.equal(r._body.message, 'Réservation annulée.');
    assert.equal(avis(appels).data.paiement, false);
    const rp = res();
    fauxFetch({ ...AUTORISEE, status: 'en_attente' }, 'requires_payment_method');
    await rideCancel({}, rp, ctx(), { booking_id: 'b1', preview_only: true });
    assert.equal(rp._body.paiement, false);
  });

  test('paiement autorisé : on parle de remboursement (réponse et courriel)', async () => {
    const appels = fauxFetch(AUTORISEE, 'requires_capture');
    const r = res();
    await rideCancel({}, r, ctx(), { booking_id: 'b1' });
    assert.equal(r._body.paiement, true);
    assert.equal(r._body.message, 'Réservation annulée. Remboursement : 12.50 $');
    assert.equal(avis(appels).data.paiement, true);
    const rp = res();
    fauxFetch(AUTORISEE, 'requires_capture');
    await rideCancel({}, rp, ctx(), { booking_id: 'b1', preview_only: true });
    assert.equal(rp._body.paiement, true);
  });

  test('courriel : non payé → « Réservation annulée », aucun montant ni remboursement', () => {
    const d = { passenger_email: 'p@test.ca', driver_email: '', ville_depart: 'Lévis', ville_arrivee: 'Rimouski', total_price: 12.5, refund: 12.5, paiement: false };
    const [m] = buildEmails('ride_booking_cancelled', d, 'a@b.c', 'n@b.c', 'PorteàPorte');
    assert.match(m.subject, /^Réservation annulée/);
    assert.ok(!/rembours|Montant rendu|Montant payé|Stripe/i.test(m.html), 'pas un mot sur le remboursement');
    assert.ok(m.html.includes('Aucun paiement n’avait été fait'));
  });

  test('courriel : payé → montants et délai de remboursement (inchangé)', () => {
    const d = { passenger_email: 'p@test.ca', driver_email: '', ville_depart: 'Lévis', ville_arrivee: 'Rimouski', total_price: 12.5, refund: 12.5, paiement: true };
    const [m] = buildEmails('ride_booking_cancelled', d, 'a@b.c', 'n@b.c', 'PorteàPorte');
    assert.match(m.subject, /^Annulation confirmée/);
    assert.ok(m.html.includes('Montant rendu'));
  });

  test('écrans : l’aperçu et le message final suivent paiement', () => {
    for (const p of ['membre-accueil.html', 'membre-covoiturage.html']) {
      const h = lire(p);
      assert.ok(h.includes('preview.paiement === false') && h.includes('Aucun paiement n’a été fait pour cette réservation : rien à rembourser.'), p);
      assert.ok(h.includes("out.message || (out.paiement === false ? 'Réservation annulée.'"), p);
    }
    assert.ok(lire('membre-covoiturage.html').includes("' réservation(s) annulée(s) et avertie(s)'"));
  });

  test('annulations par le conducteur : le courriel reçoit aussi paiement', () => {
    const r = lire('lib/_rides.js');
    assert.ok(r.includes('paiement: paiementFait(actionPaiement),'));
    assert.ok(r.includes('paiement: paiementFait((refunds.find((x) => x.booking_id === booking.id) || {}).action),'));
  });
});

describe('3. « Niveau » ne cache plus le menu de gauche', () => {
  const lm = lire('js/layer-mode.js');
  const fl = lire('js/flottants.js');
  test('sur ordinateur, « Niveau » devient la dernière entrée du menu de gauche (aside.sidebar)', () => {
    assert.ok(lm.includes("const menuGauche = document.querySelector('aside.sidebar');"));
    assert.ok(lm.includes("window.innerWidth >= 769"));
    assert.ok(lm.includes("menuGauche.appendChild(pill);") && lm.includes("pill.classList.add('pp-dans-menu');"));
    assert.ok(lm.includes("document.body.appendChild(pill);"), 'il redevient flottant sur cellulaire');
    assert.ok(lm.includes("window.addEventListener('resize'"));
    assert.ok(fl.includes("'.pp-layer-pill.pp-dans-menu{position:static!important;"));
  });
  test('le tableau de bord covoiturage a bien un menu aside.sidebar avec Signalements', () => {
    const h = lire('membre-covoiturage.html');
    assert.ok(/<aside class="sidebar">[\s\S]*Signalements[\s\S]*<\/aside>/.test(h));
    assert.ok(h.includes('/js/layer-mode.js') && h.includes('/js/flottants.js'));
  });
});

describe('Décision 24 nov. : sans paiement, rien au grand livre', () => {
  function fauxTardif(booking, piStatus) {
    const appels = [];
    global.fetch = async (url, o = {}) => {
      const m = o.method || 'GET';
      appels.push({ url, m, body: o.body });
      const ok = (d) => ({ ok: true, status: 200, json: async () => d });
      if (url.includes('/ride_bookings?id=eq.') && m === 'GET') return ok([booking]);
      // départ dans 1 h : annulation tardive (50 % rendu, 40 % conducteur, 10 % fonds)
      if (url.includes('/rides?id=eq.') && m === 'GET') return ok([{ id: 'ride-1', driver_id: 'driver-1', departure_time: new Date(Date.now() + 3600000).toISOString(), available_seats: 1, start_city: 'Lévis', end_city: 'Rimouski' }]);
      if (url.includes('/impact_settings')) return ok([{ ride_cancel_free_window_h: 24, ride_cancel_late_window_h: 2 }]);
      if (url.includes('api.stripe.com') && url.includes('/payment_intents/') && m === 'GET') return ok({ id: booking.stripe_payment_intent, status: piStatus, currency: 'cad', amount: 1250 });
      if (url.includes('api.stripe.com')) return ok({ id: 'x', status: 'succeeded' });
      if (url.includes('/profiles?id=in.')) return ok([{ id: 'passenger-1', email: 'p@test.ca' }, { id: 'driver-1', email: 'd@test.ca' }]);
      if (url.includes('/api/notifier')) return ok({ success: true });
      if (m === 'PATCH' || m === 'POST') return { ok: true, status: 201, json: async () => ([{}]) };
      return ok([]);
    };
    return appels;
  }
  const B = { id: 'b9', ride_id: 'ride-1', passenger_id: 'passenger-1', status: 'en_attente', total_passenger: 12.5, seats_reserved: 1, stripe_payment_intent: null, payment_currency: 'cad' };
  const grandLivre = (appels) => appels.filter((a) => a.m === 'POST' && a.url.includes('/rest/v1/transactions'));

  test('annulation TARDIVE sans paiement : aucune écriture au grand livre, montants à 0', async () => {
    const appels = fauxTardif(B);
    const r = res();
    await rideCancel({}, r, ctx(), { booking_id: 'b9' });
    assert.equal(r._status, 200);
    assert.equal(r._body.tier, 'tardif');
    assert.equal(grandLivre(appels).length, 0, 'ni dédommagement ni fonds');
    assert.equal(r._body.driver_compensation, 0);
    assert.equal(r._body.security_fund, 0);
    assert.equal(r._body.refund, 0);
    assert.equal(r._body.admin_review_required, false);
  });

  test('intention Stripe jamais autorisée : rien au grand livre non plus', async () => {
    const appels = fauxTardif({ ...B, stripe_payment_intent: 'pi_reel_jamais_autorise_123456' }, 'requires_payment_method');
    const r = res();
    await rideCancel({}, r, ctx(), { booking_id: 'b9' });
    assert.equal(grandLivre(appels).length, 0);
    assert.equal(r._body.driver_compensation, 0);
  });

  test('annulation tardive AVEC paiement autorisé : dédommagement et fonds inscrits (inchangé)', async () => {
    const appels = fauxTardif({ ...B, status: 'confirme', stripe_payment_intent: 'pi_reel_autorise_tardif_123456' }, 'requires_capture');
    const r = res();
    await rideCancel({}, r, ctx(), { booking_id: 'b9' });
    const types = grandLivre(appels).map((a) => JSON.parse(a.body).type).sort();
    assert.deepEqual(types, ['dedommagement_covoiturage', 'fond_securite_covoiturage']);
    assert.ok(r._body.driver_compensation > 0);
  });
});

describe('Décision 24 nov. : « Garder ma réservation » / « Oui, annuler »', () => {
  test('toutes les fenêtres d’annulation', () => {
    const R = "{ title: 'Annuler la réservation', annuler: 'Garder ma réservation', ok: 'Oui, annuler', danger: true }";
    assert.ok(lire('membre-accueil.html').includes(R));
    const dc = lire('membre-covoiturage.html');
    assert.ok(dc.includes(R));
    assert.ok(dc.includes("annuler: 'Garder mon trajet', ok: 'Oui, annuler'"));
    assert.ok(dc.includes("annuler: 'Garder ce jour', ok: 'Oui, annuler ce jour'"));
    assert.ok(lire('membre-envois.html').includes("annuler: 'Garder ma livraison', ok: 'Oui, annuler'"));
    assert.ok(lire('js/cancel-livraison.js').includes("annuler: 'Garder ma livraison', ok: 'Oui, annuler'"));
    const dl = lire('js/dialogues.js');
    assert.ok(dl.includes("'.pap-dlg button.danger{border-color:transparent!important;background:#ef4444!important;color:#fff!important}'"), '« Oui, annuler » reste rouge');
    assert.ok(dl.includes('background:#1a1f28!important'), '« Garder… » reste neutre');
    for (const f of ['membre-accueil.html', 'membre-covoiturage.html']) assert.ok(!/PAPDialog\.confirm\(warning\)\)/.test(lire(f)), f + ' : plus de « Annuler / OK »');
  });
});
