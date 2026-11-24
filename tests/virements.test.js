// tests/virements.test.js — Correction du virement livreur (décision de Denis, 23 nov. 2026).
// Cas réel : retrait de 15,60 $ envoyé depuis UNE charge de 10 $ (Stripe refuse), gains de mai sans paiement
// comptés, compte Connect jamais « active » (colonnes inexistantes) donc aucun virement automatique.
'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { creerBase, makeRes } = require('./aide-fausse-base');
const V = require('../lib/_virements');

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const UID = 'b2a260a2-d55a-4c49-8ca0-000000000001';
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk_test_fake123' };
const SCHEMA_CONNECT = { stripe_connect_accounts: V.COLONNES_CONNECT };
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Les 4 gains réels de Denis au 23 nov. 2026 (montants seulement).
function gainsDenis() {
  return [
    { id: 'g-mai-1', user_id: UID, net_amount: 1.8, status: 'available', available_after: '2026-05-23T00:00:00Z', stripe_payment_intent: null },
    { id: 'g-mai-2', user_id: UID, net_amount: 1.8, status: 'available', available_after: '2026-05-24T00:00:00Z', stripe_payment_intent: null },
    { id: 'g-aout', user_id: UID, net_amount: 6, status: 'available', available_after: '2026-08-20T00:00:00Z', stripe_payment_intent: 'pi_aout' },
    { id: 'g-nov', user_id: UID, net_amount: 6, status: 'available', available_after: '2026-11-23T00:00:00Z', stripe_payment_intent: 'pi_nov' },
  ];
}

// Stripe factice : PI prélevés de 10 $ (charge développée), virements OK sauf ceux listés dans `refuser`.
function stripeFaux(db, opts = {}) {
  db.stripeReponse = (url, m, body) => {
    const ok = (d) => ({ ok: true, status: 200, json: async () => d });
    const pi = (url.match(/\/v1\/payment_intents\/([^?/]+)/) || [])[1];
    if (pi) {
      const st = (opts.statuts && opts.statuts[pi]) || 'succeeded';
      const montant = (opts.montants && opts.montants[pi]) || 1000;
      return ok({ id: pi, status: st, amount_received: st === 'succeeded' ? montant : 0, latest_charge: { id: 'ch_' + pi, amount: montant, amount_captured: montant, amount_refunded: (opts.rembourse && opts.rembourse[pi]) || 0 } });
    }
    if (/\/v1\/accounts\//.test(url)) return ok({ id: 'acct_denis', payouts_enabled: opts.payouts !== false, charges_enabled: true, details_submitted: true });
    if (url.endsWith('/v1/transfers') && m === 'POST') {
      const src = new URLSearchParams(body).get('source_transaction');
      if ((opts.refuser || []).includes(src)) return { ok: false, status: 400, json: async () => ({ error: { message: 'Transfers using this transaction as a source must not exceed the source amount' } }) };
      return ok({ id: 'tr_' + src });
    }
    return ok({});
  };
}

function baseDenis(statutConnect = 'pending') {
  const db = creerBase({
    livreur_earnings: gainsDenis(),
    stripe_connect_accounts: [{ id: 'c1', user_id: UID, stripe_account_id: 'acct_denis', status: statutConnect }],
    platform_settings: [{ id: 'default', payout_min_cad: 5 }],
    payout_requests: [],
    notifications: [],
  });
  db.colonnes = SCHEMA_CONNECT;
  return db;
}

const transferts = (db) => db.stripe.filter((s) => s.url.endsWith('/v1/transfers') && s.m === 'POST').map((s) => new URLSearchParams(s.body));

describe('règles pures', () => {
  test('le solde ne compte que les gains d’un paiement prélevé : 12,00 $ dispo, 3,60 $ à vérifier', () => {
    const s = V.soldeLivreur(gainsDenis(), new Date('2026-11-24T00:00:00Z'));
    assert.equal(s.available, 12);
    assert.equal(s.a_verifier, 3.6);
    assert.equal(s.total_earned, 15.6);
  });
  test('gains annulés (« failed ») : ne comptent dans aucun solde', () => {
    const g = gainsDenis().map((x) => (x.stripe_payment_intent ? x : { ...x, status: 'failed' }));
    const s = V.soldeLivreur(g, new Date('2026-11-24T00:00:00Z'));
    assert.deepEqual([s.available, s.a_verifier, s.total_earned, s.pending], [12, 0, 12, 0]);
  });
  test('un virement par paiement source ; plusieurs gains d’un même paiement : un seul groupe', () => {
    const g = [...gainsDenis(), { id: 'g-nov-b', net_amount: 1.5, status: 'available', stripe_payment_intent: 'pi_nov' }].filter((x) => V.estVersable(x, new Date('2026-11-24T00:00:00Z')));
    const grp = V.grouperParPaiement(g);
    assert.deepEqual(grp.map((x) => [x.pi, x.cents, x.ids.length]), [['pi_aout', 600, 1], ['pi_nov', 750, 2]]);
  });
  test('jamais plus que la charge moins ce qui est déjà versé', () => {
    const grp = [{ pi: 'a', ids: ['1'], cents: 600 }, { pi: 'b', ids: ['2'], cents: 600 }, { pi: 'c', ids: ['3'], cents: 1560 }];
    const infos = { a: { statut: 'succeeded', chargeId: 'ch_a', chargeCents: 1000, dejaVerseCents: 0 },
      b: { statut: 'succeeded', chargeId: 'ch_b', chargeCents: 1000, dejaVerseCents: 600 },
      c: { statut: 'succeeded', chargeId: 'ch_c', chargeCents: 1000, dejaVerseCents: 0 } };
    const p = V.planVirements(grp, infos);
    assert.deepEqual(p.versables.map((v) => [v.pi, v.cents, v.chargeId]), [['a', 600, 'ch_a']]);
    assert.deepEqual(p.ecartes.map((e) => [e.pi, e.raison]), [['b', 'depasse_la_charge'], ['c', 'depasse_la_charge']]);
    const juste = V.planVirements([{ pi: 'b', ids: ['2'], cents: 400 }], infos);
    assert.equal(juste.versables.length, 1, 'exactement le reste (400 = 1000 - 600) : permis');
  });
  test('paiement non prélevé (autorisé seulement, ex. 4,20 $ non saisis) : écarté', () => {
    const p = V.planVirements([{ pi: 'x', ids: ['1'], cents: 252 }], { x: { statut: 'requires_capture', chargeId: 'ch_x', chargeCents: 0 } });
    assert.equal(p.versables.length, 0);
    assert.equal(p.ecartes[0].raison, 'paiement_non_preleve');
  });
  test('clé anti-doublon : stable pour un même groupe, différente d’un groupe à l’autre', () => {
    const a = { pi: 'pi_aout', ids: ['g-aout'], cents: 600 };
    assert.equal(V.cleVirement(UID, a), V.cleVirement(UID, { ...a }));
    assert.notEqual(V.cleVirement(UID, a), V.cleVirement(UID, { pi: 'pi_nov', ids: ['g-nov'], cents: 600 }));
  });
});

describe('retrait du livreur (cas réel de Denis)', () => {
  const { stripeConnectPayout } = require('../lib/_connect');
  const ctxL = () => ({ ...CTX, session: { id: UID, email_confirmed_at: '2026-01-01' }, profile: { id: UID, role: 'livreur', driver_status: 'verified', email_verified: true } });

  test('2 virements de 6,00 $, chacun depuis SA charge ; les 3,60 $ de mai ne bougent pas', async () => {
    const db = baseDenis('pending');
    stripeFaux(db);
    global.fetch = db.fetch;
    const res = makeRes();
    await stripeConnectPayout({}, res, ctxL(), {});
    assert.equal(res._status, 200, JSON.stringify(res._body));
    assert.equal(res._body.amount, 12);
    const t = transferts(db);
    assert.deepEqual(t.map((p) => [p.get('amount'), p.get('source_transaction')]), [['600', 'ch_pi_aout'], ['600', 'ch_pi_nov']]);
    for (const p of t) assert.ok(Number(p.get('amount')) <= 1000, 'jamais plus que la charge');
    const cles = db.stripe.filter((s) => s.url.endsWith('/v1/transfers')).length;
    assert.equal(cles, 2);
    const g = Object.fromEntries(db.tables.livreur_earnings.map((x) => [x.id, x]));
    assert.equal(g['g-aout'].status, 'transferred'); assert.equal(g['g-aout'].stripe_transfer_id, 'tr_ch_pi_aout');
    assert.equal(g['g-nov'].status, 'transferred'); assert.equal(g['g-nov'].stripe_transfer_id, 'tr_ch_pi_nov');
    assert.equal(g['g-mai-1'].status, 'available'); assert.equal(g['g-mai-1'].stripe_transfer_id, undefined);
    assert.equal(db.tables.payout_requests.length, 2);
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'virement_livreur').length, 2);
    assert.equal(db.tables.stripe_connect_accounts[0].status, 'active', 'statut resynchronisé');
    assert.deepEqual(db.refus || [], [], 'aucune colonne inexistante lue ou écrite');
  });

  test('réussite partielle : seul le gain dont le virement a réussi passe « versé »', async () => {
    const db = baseDenis('active');
    stripeFaux(db, { refuser: ['ch_pi_aout'] });
    global.fetch = db.fetch;
    const res = makeRes();
    await stripeConnectPayout({}, res, ctxL(), {});
    assert.equal(res._status, 200, JSON.stringify(res._body));
    assert.equal(res._body.partiel, true);
    assert.equal(res._body.amount, 6);
    const g = Object.fromEntries(db.tables.livreur_earnings.map((x) => [x.id, x]));
    assert.equal(g['g-aout'].status, 'available', 'virement refusé : reste disponible');
    assert.equal(g['g-nov'].status, 'transferred');
    assert.equal(db.tables.payout_requests.length, 1);
  });

  test('tout refusé : 502, aucun gain marqué, aucune demande de virement', async () => {
    const db = baseDenis('active');
    stripeFaux(db, { refuser: ['ch_pi_aout', 'ch_pi_nov'] });
    global.fetch = db.fetch;
    const res = makeRes();
    await stripeConnectPayout({}, res, ctxL(), {});
    assert.equal(res._status, 502);
    assert.ok(db.tables.livreur_earnings.every((x) => x.status === 'available'));
    assert.equal(db.tables.payout_requests.length, 0);
  });

  test('double clic : le deuxième retrait ne verse rien de plus (jamais deux virements pour un gain)', async () => {
    const db = baseDenis('active');
    stripeFaux(db);
    global.fetch = db.fetch;
    await stripeConnectPayout({}, makeRes(), ctxL(), {});
    const res2 = makeRes();
    await stripeConnectPayout({}, res2, ctxL(), {});
    assert.equal(res2._status, 400, 'il ne reste que les gains sans paiement : sous le minimum');
    assert.equal(transferts(db).length, 2);
    assert.equal(db.tables.payout_requests.length, 2);
  });

  test('déjà versé sur un paiement (virement automatique) : ce paiement ne peut pas être reversé au-delà de sa charge', async () => {
    const db = baseDenis('active');
    db.tables.livreur_earnings.push({ id: 'g-auto', user_id: 'autre', net_amount: 6, status: 'transferred', stripe_payment_intent: 'pi_nov' });
    stripeFaux(db);
    global.fetch = db.fetch;
    const res = makeRes();
    await stripeConnectPayout({}, res, ctxL(), {});
    assert.equal(res._status, 200, JSON.stringify(res._body));
    assert.deepEqual(transferts(db).map((p) => p.get('source_transaction')), ['ch_pi_aout'], '6 + 6 > 10 sur pi_nov : écarté');
  });

  test('gains sans paiement seulement : rien n’est versé', async () => {
    const db = baseDenis('active');
    db.tables.livreur_earnings = gainsDenis().filter((g) => !g.stripe_payment_intent).concat([{ id: 'g3', user_id: UID, net_amount: 9, status: 'available', stripe_payment_intent: null }]);
    stripeFaux(db);
    global.fetch = db.fetch;
    const res = makeRes();
    await stripeConnectPayout({}, res, ctxL(), {});
    assert.equal(res._status, 400);
    assert.equal(transferts(db).length, 0);
  });

  test('compte Stripe sans virements permis : 400, rien versé', async () => {
    const db = baseDenis('pending');
    stripeFaux(db, { payouts: false });
    global.fetch = db.fetch;
    const res = makeRes();
    await stripeConnectPayout({}, res, ctxL(), {});
    assert.equal(res._status, 400);
    assert.equal(transferts(db).length, 0);
  });

  test('portefeuille affiché : 12,00 $ disponibles, 3,60 $ à vérifier, statut écrit sans colonne inexistante', async () => {
    const { stripeConnectStatus } = require('../lib/_connect');
    const db = baseDenis('pending');
    stripeFaux(db);
    global.fetch = db.fetch;
    const res = makeRes();
    await stripeConnectStatus({}, res, ctxL());
    assert.equal(res._status, 200);
    assert.equal(res._body.balance.available, 12);
    assert.equal(res._body.balance.a_verifier, 3.6);
    assert.equal(db.tables.stripe_connect_accounts[0].status, 'active');
    assert.deepEqual(db.refus || [], []);
  });
});

describe('compte Connect : statut seulement, pour tous les livreurs', () => {
  test('etatConnect : « pending » en base mais actif chez Stripe → statut « active » écrit, virement permis', async () => {
    const db = baseDenis('pending');
    stripeFaux(db);
    global.fetch = db.fetch;
    const e = await V.etatConnect(CTX, UID);
    assert.equal(e.actif, true);
    assert.equal(db.tables.stripe_connect_accounts[0].status, 'active');
    assert.deepEqual(Object.keys(db.tables.stripe_connect_accounts[0]).sort(), ['id', 'status', 'stripe_account_id', 'updated_at', 'user_id']);
  });

  test('virement automatique à la capture : marche pour un livreur resté « pending » en base', async () => {
    const LIVREUR = '22222222-2222-4222-8222-222222222222';
    const db = creerBase({
      platform_settings: [{ id: 'default' }], impact_settings: [{ id: 'default' }],
      profiles: [{ id: LIVREUR, cree_le: '2026-10-01T00:00:00Z', loyalty_bonus_manual: 0 }],
      v_user_fiabilite: [{ id: LIVREUR, score: 80 }],
      stripe_connect_accounts: [{ id: 'c2', user_id: LIVREUR, stripe_account_id: 'acct_autre', status: 'pending' }],
      promo_code_uses: [],
    });
    db.colonnes = SCHEMA_CONNECT;
    stripeFaux(db);
    global.fetch = db.fetch;
    const { apresCaptureLivraison } = require('../lib/_apres-capture');
    await apresCaptureLivraison(CTX, { id: 'liv-1', livreur_id: LIVREUR, expediteur_id: 'exp', code: 'PP-T' }, { id: 'pi_t', amount_received: 1000, currency: 'cad', latest_charge: 'ch_t' });
    const t = transferts(db);
    assert.equal(t.length, 1, 'virement automatique fait');
    assert.equal(t[0].get('source_transaction'), 'ch_t');
    assert.equal(db.tables.livreur_earnings[0].status, 'transferred');
    assert.equal(db.tables.stripe_connect_accounts[0].status, 'active');
    assert.deepEqual(db.refus || [], []);
  });

  test('covoiturage : transferToDriverConnect écrit le statut sans colonne inexistante', async () => {
    const db = baseDenis('pending');
    stripeFaux(db);
    global.fetch = db.fetch;
    const { transferToDriverConnect } = require('../lib/_rides');
    const r = await transferToDriverConnect(CTX, UID, 252, 'cad', 'ch_ride', 'b1');
    assert.deepEqual(db.refus || [], []);
    assert.equal(db.tables.stripe_connect_accounts[0].status, 'active');
    assert.ok(r.transferId, JSON.stringify(r));
  });

  test('webhook account.updated : écrit « active » sans colonne inexistante', async () => {
    const db = baseDenis('pending');
    global.fetch = db.fetch;
    process.env.SUPABASE_URL = CTX.sbUrl; process.env.SUPABASE_SERVICE_KEY = 'k'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_t';
    const raw = JSON.stringify({ id: 'evt_1', type: 'account.updated', data: { object: { id: 'acct_denis', charges_enabled: true, payouts_enabled: true, details_submitted: true } } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', 'whsec_t').update(`${ts}.${raw}`, 'utf8').digest('hex');
    const req = Readable.from([Buffer.from(raw)]);
    req.method = 'POST'; req.headers = { 'stripe-signature': `t=${ts},v1=${sig}` }; req.url = '/api/stripe-webhook';
    const res = makeRes();
    await require('../api/stripe-webhook')(req, res);
    assert.deepEqual(db.refus || [], []);
    assert.equal(db.tables.stripe_connect_accounts[0].status, 'active');
  });

  test('aucun fichier ne lit ni n’écrit payouts_enabled / charges_enabled / details_submitted dans stripe_connect_accounts', () => {
    const fichiers = ['lib/_connect.js', 'lib/_apres-capture.js', 'lib/_rides.js', 'api/stripe-webhook.js', 'api/platform.js', 'api/matching.js', 'js/onboarding-checklist.js'];
    for (const f of fichiers) {
      const s = lire(f);
      assert.doesNotMatch(s, /stripe_connect_accounts[^`'"\n]*select=[^`'"\n]*(payouts_enabled|charges_enabled|details_submitted)/, f);
      assert.doesNotMatch(s, /from\('stripe_connect_accounts'\)\.select\('[^']*(payouts_enabled|charges_enabled|details_submitted)/, f);
      assert.doesNotMatch(s, /JSON\.stringify\(\{[^}]*status[^}]*(payouts_enabled|charges_enabled|details_submitted)\s*:/, f);
    }
  });
});
