'use strict';

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');

const { ridePaymentCreate, ridePaymentSync } = require('../lib/_rides');

function makeRes() {
  return {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function ctx(overrides = {}) {
  return {
    sbUrl: 'https://fake.supabase.co',
    sbKey: 'service-key',
    stripeKey: 'sk_test_fake',
    session: { id: 'passenger-1', email: 'p@test.com' },
    profile: { role: 'expediteur' },
    ...overrides,
  };
}

describe('ride Stripe payments', () => {
  test('ridePaymentCreate exige une session', async () => {
    const res = makeRes();
    await ridePaymentCreate({ method: 'POST' }, res, ctx({ session: null }), { booking_id: 'book-1' });
    assert.equal(res._status, 401);
  });

  test('cree un PaymentIntent manual capture pour une reservation covoiturage', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/ride_bookings?id=eq.book-1')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: 'book-1',
            ride_id: 'ride-1',
            passenger_id: 'passenger-1',
            status: 'en_attente',
            total_passenger: 12.5,
            driver_amount: 10,
            platform_fee: 2.5,
            seats_reserved: 1,
          }],
        };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-1')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'ride-1', driver_id: 'driver-1', start_city: 'Quebec', end_city: 'Levis', status: 'publie' }],
        };
      }
      if (url.includes('/rest/v1/transactions?type=eq.paiement_covoiturage')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === 'https://api.stripe.com/v1/payment_intents' && opts.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'pi_ride', client_secret: 'cs_ride', status: 'requires_payment_method', amount: 1250, currency: 'cad' }),
        };
      }
      if (url.includes('/rest/v1/transactions') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/transaction_audit_events') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await ridePaymentCreate({ method: 'POST' }, res, ctx(), { booking_id: 'book-1' });

    assert.equal(res._status, 200);
    assert.equal(res._body.payment_intent_id, 'pi_ride');
    assert.equal(res._body.amount, 1250);

    const stripeCall = calls.find(c => c.url === 'https://api.stripe.com/v1/payment_intents');
    assert.ok(stripeCall, 'Stripe doit etre appele');
    const params = new URLSearchParams(stripeCall.body);
    assert.equal(params.get('capture_method'), 'manual');
    assert.equal(params.get('metadata[type]'), 'ride_booking');
    assert.equal(params.get('metadata[booking_id]'), 'book-1');
  });

  test('ridePaymentSync confirme la reservation quand Stripe retourne requires_capture', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/ride_bookings?id=eq.book-1')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: 'book-1',
            ride_id: 'ride-1',
            passenger_id: 'passenger-1',
            status: 'en_attente',
            total_passenger: 12.5,
            seats_reserved: 1,
          }],
        };
      }
      if (url.includes('api.stripe.com/v1/payment_intents/pi_ready')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'pi_ready',
            status: 'requires_capture',
            amount: 1250,
            amount_capturable: 1250,
            currency: 'cad',
            metadata: { booking_id: 'book-1', passenger_id: 'passenger-1' },
          }),
        };
      }
      if (url.includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/transactions') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/transaction_audit_events') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await ridePaymentSync({ method: 'POST' }, res, ctx(), { booking_id: 'book-1', payment_intent_id: 'pi_ready' });

    assert.equal(res._status, 200);
    assert.equal(res._body.authorized, true);
    const bookingPatch = calls.find(c => c.url.includes('/rest/v1/ride_bookings') && c.method === 'PATCH');
    assert.ok(bookingPatch, 'reservation doit etre mise a jour');
    const body = JSON.parse(bookingPatch.body);
    assert.equal(body.status, 'confirme');
    assert.equal(body.payment_status, 'requires_capture');
  });
});

after(() => {
  delete global.fetch;
});
