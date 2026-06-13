'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { Readable } = require('node:stream');

const { rideCancel, rideCaptureEligible } = require('../lib/_rides');

loadDotEnvTest();

const STRIPE_KEY = pickStripeTestKey();
const HAS_STRIPE_TEST_KEY = /^sk_test_/.test(STRIPE_KEY);
const STRIPE_SKIP = HAS_STRIPE_TEST_KEY ? false : 'Set STRIPE_TEST_SECRET_KEY in .env.test/env with a sk_test_ key; live keys are ignored';
const TEST_CONNECT_ACCOUNT = (process.env.STRIPE_TEST_CONNECT_ACCOUNT_ID || '').trim();
const realFetch = global.fetch;
const originalLoad = Module._load;
const createdPaymentIntents = new Set();

function loadDotEnvTest() {
  const envPath = path.join(__dirname, '..', '.env.test');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function pickStripeTestKey() {
  const candidates = [
    process.env.STRIPE_TEST_SECRET_KEY,
    process.env.STRIPE_SECRET_KEY,
  ].map((v) => String(v || '').trim());
  return candidates.find((key) => /^sk_test_/.test(key)) || '';
}

function makeRes() {
  return {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    setHeader() {},
    end() { return this; },
  };
}

function makeStripeWebhookReq(event, secret = 'whsec_integration_test', signatureOverride) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = signatureOverride || crypto.createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex');
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST';
  req.headers = { 'stripe-signature': `t=${ts},v1=${sig}` };
  req.body = undefined;
  req.url = '/api/stripe-webhook';
  return req;
}

function ctx(overrides = {}) {
  return {
    sbUrl: 'https://fake.supabase.test',
    sbKey: 'service-key-test',
    stripeKey: STRIPE_KEY,
    session: { id: 'passenger-1', email: 'passenger@test.local' },
    profile: { role: 'expediteur' },
    ...overrides,
  };
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function formBody(params) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value != null) form.append(key, String(value));
  }
  return form;
}

async function stripeRequest(method, path, params, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${STRIPE_KEY}`,
  };
  const init = { method, headers };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    init.body = params instanceof URLSearchParams ? params : formBody(params);
  }
  const r = await realFetch(`https://api.stripe.com${path}`, init);
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function stripePost(path, params, idempotencyKey) {
  return stripeRequest('POST', path, params, idempotencyKey);
}

async function stripeGet(path) {
  return stripeRequest('GET', path);
}

async function createManualPaymentIntent(amount, label) {
  const out = await stripePost('/v1/payment_intents', {
    amount,
    currency: 'cad',
    capture_method: 'manual',
    payment_method: 'pm_card_visa',
    confirm: 'true',
    description: `PorteAPorte integration ${label}`,
    'metadata[test_suite]': 'porteaporte_stripe_integration',
    'metadata[label]': label,
  }, `pap-it-create-manual-${label}-${Date.now()}`);
  assert.equal(out.ok, true, out.data?.error?.message || 'Stripe manual PaymentIntent create failed');
  assert.equal(out.data.status, 'requires_capture');
  createdPaymentIntents.add(out.data.id);
  return out.data;
}

async function createCapturedPaymentIntent(amount, label) {
  const out = await stripePost('/v1/payment_intents', {
    amount,
    currency: 'cad',
    payment_method: 'pm_card_visa',
    confirm: 'true',
    description: `PorteAPorte integration ${label}`,
    'metadata[test_suite]': 'porteaporte_stripe_integration',
    'metadata[label]': label,
  }, `pap-it-create-captured-${label}-${Date.now()}`);
  assert.equal(out.ok, true, out.data?.error?.message || 'Stripe captured PaymentIntent create failed');
  assert.equal(out.data.status, 'succeeded');
  createdPaymentIntents.add(out.data.id);
  return out.data;
}

async function cleanupPaymentIntent(piId) {
  if (!piId || !HAS_STRIPE_TEST_KEY) return;
  const pi = await stripeGet(`/v1/payment_intents/${encodeURIComponent(piId)}`);
  if (!pi.ok) return;
  if (pi.data.status === 'requires_capture') {
    await stripePost(`/v1/payment_intents/${encodeURIComponent(piId)}/cancel`, null, `pap-it-cleanup-${piId}`);
  }
}

function makeRideFetch(state, options = {}) {
  return async (url, opts = {}) => {
    const strUrl = String(url);
    const method = opts.method || 'GET';
    state.calls.push({ url: strUrl, method, body: opts.body || null });
    if (strUrl.startsWith('https://api.stripe.com')) return realFetch(url, opts);

    if (strUrl.includes('/rest/v1/ride_bookings?id=eq.')) {
      const id = strUrl.match(/ride_bookings\?id=eq\.([^&]+)/)?.[1];
      if (method === 'PATCH') {
        const patch = JSON.parse(opts.body || '{}');
        state.bookingPatches.push({ id, patch });
        state.bookings[id] = { ...(state.bookings[id] || {}), ...patch };
        return jsonResponse({}, options.failBookingPatch ? 500 : 204);
      }
      return jsonResponse(state.bookings[id] ? [state.bookings[id]] : []);
    }

    if (strUrl.includes('/rest/v1/ride_bookings?status=eq.confirme')) {
      const rows = Object.values(state.bookings).filter((b) => b.status === 'confirme' && !b.paid_at);
      return jsonResponse(rows);
    }

    if (strUrl.includes('/rest/v1/ride_bookings?ride_id=eq.')) {
      const rideId = strUrl.match(/ride_bookings\?ride_id=eq\.([^&]+)/)?.[1];
      const rows = Object.values(state.bookings).filter((b) => b.ride_id === rideId && !['annule_passager', 'annule_chauffeur', 'complete'].includes(b.status));
      return jsonResponse(rows);
    }

    if (strUrl.includes('/rest/v1/rides?id=eq.')) {
      const id = strUrl.match(/rides\?id=eq\.([^&]+)/)?.[1];
      if (method === 'PATCH') {
        const patch = JSON.parse(opts.body || '{}');
        state.ridePatches.push({ id, patch });
        state.rides[id] = { ...(state.rides[id] || {}), ...patch };
        return jsonResponse({}, options.failRidePatch ? 500 : 204);
      }
      return jsonResponse(state.rides[id] ? [state.rides[id]] : []);
    }

    if (strUrl.includes('/rest/v1/impact_settings')) {
      return jsonResponse([state.settings || {}]);
    }

    if (strUrl.includes('/rest/v1/stripe_connect_accounts')) {
      const userId = strUrl.match(/user_id=eq\.([^&]+)/)?.[1];
      return jsonResponse(state.connectAccounts[userId] ? [state.connectAccounts[userId]] : []);
    }

    if (strUrl.includes('/rest/v1/transactions') && method === 'POST') {
      const body = JSON.parse(opts.body || '{}');
      state.transactions.push(body);
      return jsonResponse({ id: `tx-${state.transactions.length}` }, options.failTransactions ? 500 : 201);
    }

    return jsonResponse({ error: 'not found', url: strUrl }, 404);
  };
}

function rideState({ booking, ride, settings, connectAccount } = {}) {
  return {
    calls: [],
    bookingPatches: [],
    ridePatches: [],
    transactions: [],
    bookings: booking ? { [booking.id]: booking } : {},
    rides: ride ? { [ride.id]: ride } : {},
    settings: settings || {
      ride_cancel_free_window_h: 24,
      ride_cancel_late_window_h: 2,
      ride_cancel_partial_refund_pct: 85,
      ride_cancel_partial_driver_pct: 10,
      ride_cancel_partial_fund_pct: 5,
      ride_cancel_late_refund_pct: 50,
      ride_cancel_late_driver_pct: 40,
      ride_cancel_late_fund_pct: 10,
    },
    connectAccounts: connectAccount ? { [ride.driver_id]: connectAccount } : {},
  };
}

function installStripeModuleForDelivery(order) {
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'stripe') {
      return () => ({
        refunds: {
          create: async (params) => {
            order.push('stripe_refund');
            const out = await stripePost('/v1/refunds', params, `pap-it-delivery-refund-${params.payment_intent}-${params.amount || 'full'}`);
            if (!out.ok) throw new Error(out.data?.error?.message || 'Stripe refund failed');
            return out.data;
          },
        },
      });
    }
    return originalLoad.apply(this, arguments);
  };
}

function makeDeliveryFetch(row, options = {}) {
  const state = { calls: [], order: [], transactions: [], earnings: [], patches: [] };
  state.fetch = async (url, opts = {}) => {
    const strUrl = String(url);
    const method = opts.method || 'GET';
    state.calls.push({ url: strUrl, method, body: opts.body || null });
    if (strUrl.startsWith('https://api.stripe.com')) return realFetch(url, opts);
    if (strUrl.includes('/auth/v1/user')) return jsonResponse({ id: row.expediteur_id, email: 'exp@test.local' });
    if (strUrl.includes('/rest/v1/livraisons?id=eq.') && method === 'GET') return jsonResponse([row]);
    if (strUrl.includes('/rest/v1/livraisons?id=eq.') && method === 'PATCH') {
      state.patches.push(JSON.parse(opts.body || '{}'));
      return jsonResponse({}, 204);
    }
    if (strUrl.includes('/rest/v1/profiles?id=eq.' + row.expediteur_id)) return jsonResponse([{ role: 'expediteur' }]);
    if (strUrl.includes('/rest/v1/profiles?id=eq.' + row.livreur_id)) return jsonResponse([{ email: 'driver@test.local', prenom: 'Driver' }]);
    if (strUrl.includes('/rest/v1/impact_settings')) return jsonResponse([{ delivery_cancel_assigned_fund_pct: 2 }]);
    if (strUrl.includes('/rest/v1/transactions') && method === 'POST') {
      state.order.push('fund_ledger');
      state.transactions.push(JSON.parse(opts.body || '{}'));
      return jsonResponse({ id: 'tx-delivery' }, options.failTransactions ? 500 : 201);
    }
    if (strUrl.includes('/rest/v1/livreur_earnings') && method === 'POST') {
      state.order.push('driver_compensation');
      state.earnings.push(JSON.parse(opts.body || '{}'));
      return jsonResponse({ id: 'earn-delivery' }, options.failEarnings ? 500 : 201);
    }
    if (strUrl.includes('/api/notifier')) return jsonResponse({ success: true });
    return jsonResponse({ error: 'not found', url: strUrl }, 404);
  };
  return state;
}

async function callDeliveryCancel(row, options = {}) {
  const delivery = makeDeliveryFetch(row, options);
  installStripeModuleForDelivery(delivery.order);
  delete require.cache[require.resolve('../api/cancel-livraison')];
  const handler = require('../api/cancel-livraison');
  global.fetch = delivery.fetch;
  process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
  process.env.SUPABASE_URL = 'https://fake.supabase.test';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-test';
  const res = makeRes();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer token-test' },
    body: { livraison_id: row.id, raison: 'integration stripe test' },
  }, res);
  return { res, delivery };
}

describe('Stripe integration - covoiturage cancellations', { skip: STRIPE_SKIP }, () => {
  beforeEach(() => {
    global.fetch = realFetch;
  });

  afterEach(async () => {
    global.fetch = realFetch;
    Module._load = originalLoad;
    for (const piId of Array.from(createdPaymentIntents)) {
      await cleanupPaymentIntent(piId);
      createdPaymentIntents.delete(piId);
    }
  });

  test('annulation +24h libere autorisation Stripe et relibere la place', async () => {
    const pi = await createManualPaymentIntent(1250, 'ride-free');
    const state = rideState({
      booking: {
        id: 'book-free',
        passenger_id: 'passenger-1',
        ride_id: 'ride-free',
        status: 'confirme',
        total_passenger: 12.50,
        driver_amount: 11,
        seats_reserved: 1,
        stripe_payment_intent: pi.id,
        payment_currency: 'cad',
      },
      ride: {
        id: 'ride-free',
        driver_id: 'driver-1',
        departure_time: new Date(Date.now() + 48 * 3600000).toISOString(),
        available_seats: 1,
      },
    });
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-free' });

    assert.equal(res._status, 200);
    assert.equal(res._body.stripe_action, 'autorisation_liberee');
    assert.equal(res._body.refund, 12.5);
    assert.equal(res._body.driver_compensation, 0);
    assert.equal(res._body.security_fund, 0);
    assert.equal(state.bookings['book-free'].status, 'annule_passager');
    assert.equal(state.rides['ride-free'].available_seats, 2);
    assert.equal(state.transactions.some((tx) => tx.type === 'dedommagement_covoiturage'), false);

    const stripePi = await stripeGet(`/v1/payment_intents/${pi.id}`);
    assert.equal(stripePi.data.status, 'canceled');
    createdPaymentIntents.delete(pi.id);
  });

  test('annulation 2-24h capture la penalite et transfere au conducteur Connect actif', { skip: TEST_CONNECT_ACCOUNT ? false : 'Set STRIPE_TEST_CONNECT_ACCOUNT_ID to test real Connect transfer' }, async () => {
    const pi = await createManualPaymentIntent(1250, 'ride-partial-connect');
    const state = rideState({
      booking: {
        id: 'book-partial-connect',
        passenger_id: 'passenger-1',
        ride_id: 'ride-partial-connect',
        status: 'confirme',
        total_passenger: 12.50,
        driver_amount: 11,
        seats_reserved: 1,
        stripe_payment_intent: pi.id,
        payment_currency: 'cad',
      },
      ride: {
        id: 'ride-partial-connect',
        driver_id: 'driver-1',
        departure_time: new Date(Date.now() + 12 * 3600000).toISOString(),
        available_seats: 1,
      },
      connectAccount: { stripe_account_id: TEST_CONNECT_ACCOUNT, status: 'active' },
    });
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-partial-connect' });

    assert.equal(res._status, 200);
    assert.equal(res._body.stripe_action, 'capture_partielle');
    assert.equal(res._body.admin_review_required, false);
    assert.equal(res._body.driver_compensation, 1.25);
    assert.equal(res._body.security_fund, 0.63);

    const stripePi = await stripeGet(`/v1/payment_intents/${pi.id}`);
    assert.equal(stripePi.data.status, 'succeeded');
    assert.equal(stripePi.data.amount_received, 188);
    createdPaymentIntents.delete(pi.id);

    const driverLedger = state.transactions.find((tx) => tx.type === 'dedommagement_covoiturage');
    assert.ok(driverLedger, 'driver compensation ledger required');
    assert.equal(driverLedger.statut, 'complete');
    assert.match(driverLedger.metadata.transfer_id || '', /^tr_/);
    const fundLedger = state.transactions.find((tx) => tx.type === 'fond_securite_covoiturage');
    assert.ok(fundLedger, 'security fund ledger required');
  });

  test('annulation -2h capture 50%', async () => {
    const pi = await createManualPaymentIntent(1250, 'ride-late');
    const state = rideState({
      booking: {
        id: 'book-late',
        passenger_id: 'passenger-1',
        ride_id: 'ride-late',
        status: 'confirme',
        total_passenger: 12.50,
        driver_amount: 11,
        seats_reserved: 1,
        stripe_payment_intent: pi.id,
        payment_currency: 'cad',
      },
      ride: {
        id: 'ride-late',
        driver_id: 'driver-1',
        departure_time: new Date(Date.now() + 1 * 3600000).toISOString(),
        available_seats: 1,
      },
    });
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-late' });

    assert.equal(res._status, 200);
    assert.equal(res._body.tier, 'tardif');
    assert.equal(res._body.refund, 6.25);
    assert.equal(res._body.driver_compensation, 5);
    assert.equal(res._body.security_fund, 1.25);
    const stripePi = await stripeGet(`/v1/payment_intents/${pi.id}`);
    assert.equal(stripePi.data.amount_received, 625);
    createdPaymentIntents.delete(pi.id);
  });

  test('conducteur sans Connect actif reste en manual_review jamais complete', async () => {
    const pi = await createManualPaymentIntent(1250, 'ride-no-connect');
    const state = rideState({
      booking: {
        id: 'book-no-connect',
        passenger_id: 'passenger-1',
        ride_id: 'ride-no-connect',
        status: 'confirme',
        total_passenger: 12.50,
        driver_amount: 11,
        seats_reserved: 1,
        stripe_payment_intent: pi.id,
        payment_currency: 'cad',
      },
      ride: {
        id: 'ride-no-connect',
        driver_id: 'driver-1',
        departure_time: new Date(Date.now() + 12 * 3600000).toISOString(),
        available_seats: 1,
      },
    });
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-no-connect' });

    assert.equal(res._status, 200);
    assert.equal(res._body.admin_review_required, true);
    assert.ok(res._body.review_flags.includes('transfert_conducteur'));
    const driverLedger = state.transactions.find((tx) => tx.type === 'dedommagement_covoiturage');
    assert.equal(driverLedger.statut, 'manual_review');
    createdPaymentIntents.delete(pi.id);
  });

  test('echec Stripe capture bloque le statut et ne marque pas la reservation annulee', async () => {
    const pi = await createManualPaymentIntent(100, 'ride-capture-fail');
    const state = rideState({
      booking: {
        id: 'book-capture-fail',
        passenger_id: 'passenger-1',
        ride_id: 'ride-capture-fail',
        status: 'confirme',
        total_passenger: 12.50,
        driver_amount: 11,
        seats_reserved: 1,
        stripe_payment_intent: pi.id,
        payment_currency: 'cad',
      },
      ride: {
        id: 'ride-capture-fail',
        driver_id: 'driver-1',
        departure_time: new Date(Date.now() + 12 * 3600000).toISOString(),
        available_seats: 1,
      },
    });
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-capture-fail' });

    assert.equal(res._status, 502);
    assert.match(res._body.error, /Capture|amount|captur/i);
    assert.equal(state.bookingPatches.length, 0);
    assert.equal(state.ridePatches.length, 0);
  });

  test('annulation conducteur rembourse/libere toutes les reservations avant patch final', async () => {
    const piAuth = await createManualPaymentIntent(700, 'driver-cancel-auth');
    const piPaid = await createCapturedPaymentIntent(800, 'driver-cancel-paid');
    const state = rideState({
      ride: { id: 'ride-driver-cancel', driver_id: 'driver-1', status: 'publie' },
    });
    state.bookings = {
      'book-auth': { id: 'book-auth', passenger_id: 'passenger-a', ride_id: 'ride-driver-cancel', status: 'confirme', stripe_payment_intent: piAuth.id },
      'book-paid': { id: 'book-paid', passenger_id: 'passenger-b', ride_id: 'ride-driver-cancel', status: 'confirme', stripe_payment_intent: piPaid.id },
    };
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx({ session: { id: 'driver-1' }, profile: { role: 'livreur' } }), { ride_id: 'ride-driver-cancel' });

    assert.equal(res._status, 200);
    assert.equal(res._body.bookings_affected, 2);
    assert.equal(state.rides['ride-driver-cancel'].status, 'annule');
    assert.equal(state.bookings['book-auth'].status, 'annule_chauffeur');
    assert.equal(state.bookings['book-paid'].status, 'annule_chauffeur');

    const stripeAuth = await stripeGet(`/v1/payment_intents/${piAuth.id}`);
    assert.equal(stripeAuth.data.status, 'canceled');
    createdPaymentIntents.delete(piAuth.id);
    createdPaymentIntents.delete(piPaid.id);

    const refunds = await stripeGet(`/v1/refunds?payment_intent=${encodeURIComponent(piPaid.id)}`);
    assert.equal(refunds.ok, true);
    assert.equal(refunds.data.data.some((r) => r.amount === 800), true);
  });
});

describe('Stripe integration - covoiturage capture cron fusionnee', { skip: STRIPE_SKIP }, () => {
  beforeEach(() => {
    global.fetch = realFetch;
  });

  afterEach(async () => {
    global.fetch = realFetch;
    for (const piId of Array.from(createdPaymentIntents)) {
      await cleanupPaymentIntent(piId);
      createdPaymentIntents.delete(piId);
    }
  });

  test('autorisation manual capture cree un PaymentIntent requires_capture', async () => {
    const pi = await createManualPaymentIntent(1000, 'manual-authorize');
    assert.equal(pi.capture_method, 'manual');
    assert.equal(pi.status, 'requires_capture');
  });

  test('rideCaptureEligible capture un trajet passe apres le delai de grace', async () => {
    const pi = await createManualPaymentIntent(1000, 'cron-capture-past');
    const state = rideState({
      booking: {
        id: 'book-cron-past',
        passenger_id: 'passenger-1',
        ride_id: 'ride-cron-past',
        status: 'confirme',
        driver_amount: 8.5,
        stripe_payment_intent: pi.id,
        payment_currency: 'cad',
      },
      ride: {
        id: 'ride-cron-past',
        driver_id: 'driver-1',
        departure_time: new Date(Date.now() - 6 * 3600000).toISOString(),
      },
    });
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCaptureEligible(
      { method: 'POST', url: '/api/cron-cleanup' },
      res,
      ctx({ session: { id: '__cron__' }, profile: { role: 'admin' } }),
      { grace_hours: 4 }
    );

    assert.equal(res._status, 200);
    assert.equal(res._body.total, 1);
    assert.equal(res._body.errors.length, 0);
    assert.equal(res._body.captured.length, 1);
    assert.equal(state.bookings['book-cron-past'].status, 'paye');
    assert.ok(state.bookings['book-cron-past'].paid_at, 'paid_at doit etre ecrit apres capture');

    const stripePi = await stripeGet(`/v1/payment_intents/${pi.id}`);
    assert.equal(stripePi.data.status, 'succeeded');
    assert.equal(stripePi.data.amount_received, 1000);
    createdPaymentIntents.delete(pi.id);
  });

  test('rideCaptureEligible ne capture pas un trajet futur', async () => {
    const pi = await createManualPaymentIntent(1000, 'cron-capture-future');
    const state = rideState({
      booking: {
        id: 'book-cron-future',
        passenger_id: 'passenger-1',
        ride_id: 'ride-cron-future',
        status: 'confirme',
        driver_amount: 8.5,
        stripe_payment_intent: pi.id,
        payment_currency: 'cad',
      },
      ride: {
        id: 'ride-cron-future',
        driver_id: 'driver-1',
        departure_time: new Date(Date.now() + 2 * 3600000).toISOString(),
      },
    });
    global.fetch = makeRideFetch(state);

    const res = makeRes();
    await rideCaptureEligible(
      { method: 'POST', url: '/api/cron-cleanup' },
      res,
      ctx({ session: { id: '__cron__' }, profile: { role: 'admin' } }),
      { grace_hours: 4 }
    );

    assert.equal(res._status, 200);
    assert.equal(res._body.captured.length, 0);
    assert.equal(res._body.skipped[0]?.reason, 'trip_not_finished');
    assert.equal(state.bookingPatches.length, 0);

    const stripePi = await stripeGet(`/v1/payment_intents/${pi.id}`);
    assert.equal(stripePi.data.status, 'requires_capture');
  });
});

describe('Stripe integration - delivery cancellation', { skip: STRIPE_SKIP }, () => {
  beforeEach(() => {
    global.fetch = realFetch;
    Module._load = originalLoad;
  });

  afterEach(async () => {
    global.fetch = realFetch;
    Module._load = originalLoad;
    for (const piId of Array.from(createdPaymentIntents)) {
      await cleanupPaymentIntent(piId);
      createdPaymentIntents.delete(piId);
    }
  });

  test('annulation apres assignation refund puis fonds puis compensation manual_review', async () => {
    const pi = await createCapturedPaymentIntent(1000, 'delivery-assigned');
    const row = {
      id: 'liv-delivery-assigned',
      expediteur_id: 'exp-1',
      livreur_id: 'drv-1',
      statut: 'confirme',
      prix_total: 10,
      stripe_payment_intent: pi.id,
    };

    const { res, delivery } = await callDeliveryCancel(row);

    assert.equal(res._status, 200);
    assert.equal(res._body.success, true);
    assert.equal(res._body.refund_cents, 900);
    assert.equal(res._body.security_fund_cents, 20);
    assert.equal(res._body.livreur_compensation_cents, 80);
    assert.equal(res._body.admin_review_required, false);
    assert.equal(delivery.transactions.length, 1);
    assert.equal(delivery.earnings.length, 1);
    assert.equal(delivery.earnings[0].status, 'manual_review');
    assert.ok(delivery.order.indexOf('stripe_refund') < delivery.order.indexOf('fund_ledger'));
    assert.ok(delivery.order.indexOf('stripe_refund') < delivery.order.indexOf('driver_compensation'));
    createdPaymentIntents.delete(pi.id);
  });

  test('echec ecriture fonds/compensation retourne admin_review_required et review_flags', async () => {
    const pi = await createCapturedPaymentIntent(1000, 'delivery-ledger-fail');
    const row = {
      id: 'liv-delivery-fail',
      expediteur_id: 'exp-1',
      livreur_id: 'drv-1',
      statut: 'confirme',
      prix_total: 10,
      stripe_payment_intent: pi.id,
    };

    const { res, delivery } = await callDeliveryCancel(row, { failTransactions: true, failEarnings: true });

    assert.equal(res._status, 200);
    assert.equal(res._body.success, true);
    assert.equal(res._body.admin_review_required, true);
    assert.deepEqual(res._body.review_flags.sort(), ['compensation_livreur', 'fond_securite_livraison'].sort());
    assert.equal(delivery.earnings[0].status, 'manual_review');
    assert.ok(delivery.order.indexOf('stripe_refund') < delivery.order.indexOf('fund_ledger'));
    createdPaymentIntents.delete(pi.id);
  });
});

describe('Stripe integration - webhook signe', { skip: STRIPE_SKIP }, () => {
  const handler = require('../api/stripe-webhook');
  const webhookSecret = 'whsec_integration_test';

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.test';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-test';
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('signature valide acceptee et paiement autorise persiste', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body || null });
      return jsonResponse({}, opts.method === 'PATCH' ? 204 : 201);
    };
    const event = {
      id: 'evt_integration_auth_ok',
      type: 'payment_intent.amount_capturable_updated',
      data: {
        object: {
          id: 'pi_webhook_auth',
          status: 'requires_capture',
          amount: 1000,
          amount_capturable: 1000,
          currency: 'cad',
          metadata: {
            type: 'ride_booking',
            booking_id: 'book-webhook',
            ride_id: 'ride-webhook',
            passenger_id: 'passenger-1'
          }
        }
      }
    };

    const res = makeRes();
    await handler(makeStripeWebhookReq(event, webhookSecret), res);

    assert.equal(res._status, 200);
    assert.equal(res._body.received, true);
    assert.ok(calls.some((c) => c.url.includes('/rest/v1/ride_bookings?id=eq.book-webhook') && c.method === 'PATCH'));
    assert.ok(calls.some((c) => c.url.includes('/rest/v1/transaction_audit_events') && c.method === 'POST'));
  });

  test('signature invalide refusee', async () => {
    global.fetch = async () => {
      throw new Error('Supabase ne doit pas etre appele avec une signature invalide');
    };
    const event = {
      id: 'evt_bad_sig',
      type: 'account.updated',
      data: { object: { id: 'acct_bad_sig' } }
    };

    const res = makeRes();
    await handler(makeStripeWebhookReq(event, webhookSecret, '0'.repeat(64)), res);

    assert.equal(res._status, 400);
    assert.match(res._body.error, /Signature invalide/);
  });

  test('ecriture critique en echec retourne 500 pour retry Stripe', async () => {
    global.fetch = async (url, opts = {}) => {
      if (String(url).includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') {
        return jsonResponse({ error: 'db down' }, 500);
      }
      return jsonResponse({}, 201);
    };
    const event = {
      id: 'evt_integration_auth_fail',
      type: 'payment_intent.amount_capturable_updated',
      data: {
        object: {
          id: 'pi_webhook_auth_fail',
          status: 'requires_capture',
          amount: 1000,
          amount_capturable: 1000,
          currency: 'cad',
          metadata: {
            type: 'ride_booking',
            booking_id: 'book-webhook-fail',
            ride_id: 'ride-webhook',
            passenger_id: 'passenger-1'
          }
        }
      }
    };

    const res = makeRes();
    await handler(makeStripeWebhookReq(event, webhookSecret), res);

    assert.equal(res._status, 500);
    assert.match(res._body.error, /Webhook Stripe/);
  });

  test('identity.verification_session.verified marque le profil conducteur verifie', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body || null });
      return jsonResponse({}, 204);
    };
    const event = {
      id: 'evt_identity_verified',
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: 'vs_test_verified',
          metadata: { user_id: 'driver-verified' }
        }
      }
    };

    const res = makeRes();
    await handler(makeStripeWebhookReq(event, webhookSecret), res);

    assert.equal(res._status, 200);
    const patch = calls.find((c) => c.url.includes('/rest/v1/profiles?id=eq.driver-verified') && c.method === 'PATCH');
    assert.ok(patch, 'profil conducteur doit etre patch');
    const body = JSON.parse(patch.body);
    assert.equal(body.driver_status, 'verified');
    assert.equal(body.verification_status, 'verified');
    assert.equal(body.stripe_identity_status, 'verified');
  });
});
