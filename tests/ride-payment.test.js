'use strict';

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');

const { ridePaymentCreate, ridePaymentSync, rideCancel, rideCaptureEligible } = require('../lib/_rides');

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

  test('code test admin confirme sans appeler Stripe', async () => {
    process.env.RIDE_TEST_PAYMENT_ENABLED = 'true';
    process.env.RIDE_TEST_PAYMENT_CODE = 'PAP-TEST';
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/ride_bookings?id=eq.book-test')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: 'book-test',
            ride_id: 'ride-test',
            passenger_id: 'passenger-1',
            status: 'en_attente',
            total_passenger: 12.5,
            driver_amount: 10,
            platform_fee: 2.5,
            seats_reserved: 1,
          }],
        };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-test')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'ride-test', driver_id: 'driver-1', start_city: 'Levis', end_city: 'Quebec', status: 'publie' }],
        };
      }
      if (url.includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/transactions') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/transaction_audit_events') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await ridePaymentCreate({ method: 'POST' }, res, ctx({ profile: { role: 'admin' } }), {
      booking_id: 'book-test',
      test_code: 'PAP-TEST',
    });

    assert.equal(res._status, 200);
    assert.equal(res._body.test_mode, true);
    assert.equal(res._body.no_stripe_charge, true);
    assert.equal(res._body.status, 'test_authorized');
    assert.equal(calls.some(c => String(c.url).includes('api.stripe.com')), false);

    const bookingPatch = calls.find(c => c.url.includes('/rest/v1/ride_bookings') && c.method === 'PATCH');
    assert.ok(bookingPatch, 'reservation doit etre confirmee');
    assert.equal(JSON.parse(bookingPatch.body).payment_status, 'test_authorized');

    delete process.env.RIDE_TEST_PAYMENT_ENABLED;
    delete process.env.RIDE_TEST_PAYMENT_CODE;
  });

  test('code live admin limite le PaymentIntent a 1 CAD', async () => {
    process.env.RIDE_LIVE_DOLLAR_TEST_ENABLED = 'true';
    process.env.RIDE_LIVE_DOLLAR_TEST_CODE = 'PAP-1CAD';
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '', headers: opts.headers || {} });
      if (url.includes('/rest/v1/ride_bookings?id=eq.book-dollar')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: 'book-dollar',
            ride_id: 'ride-dollar',
            passenger_id: 'passenger-1',
            status: 'en_attente',
            total_passenger: 12.5,
            driver_amount: 10,
            platform_fee: 2.5,
            seats_reserved: 1,
          }],
        };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-dollar')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'ride-dollar', driver_id: 'driver-1', start_city: 'Levis', end_city: 'Quebec', status: 'publie' }],
        };
      }
      if (url.includes('/rest/v1/transactions?type=eq.paiement_covoiturage')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === 'https://api.stripe.com/v1/payment_intents' && opts.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'pi_one_dollar', client_secret: 'cs_one_dollar', status: 'requires_payment_method', amount: 100, currency: 'cad' }),
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
    await ridePaymentCreate({ method: 'POST' }, res, ctx({ profile: { role: 'admin' } }), {
      booking_id: 'book-dollar',
      live_test_code: 'PAP-1CAD',
    });

    assert.equal(res._status, 200);
    assert.equal(res._body.amount, 100);
    assert.equal(res._body.montant_dollars, '1.00');

    const stripeCall = calls.find(c => c.url === 'https://api.stripe.com/v1/payment_intents');
    assert.ok(stripeCall, 'Stripe doit etre appele pour le test live');
    const params = new URLSearchParams(stripeCall.body);
    assert.equal(params.get('amount'), '100');
    assert.equal(params.get('metadata[test_mode]'), 'live_1cad_admin');
    assert.equal(params.get('metadata[original_amount_cents]'), '1250');
    assert.equal(stripeCall.headers['Idempotency-Key'], 'ride-booking-v1-book-dollar-100-cad');

    delete process.env.RIDE_LIVE_DOLLAR_TEST_ENABLED;
    delete process.env.RIDE_LIVE_DOLLAR_TEST_CODE;
  });
});

describe('ride cancellation safeguards', () => {
  test('annulation passager +24h libere autorisation Stripe et place', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/ride_bookings?id=eq.book-cancel-free')) {
        return { ok: true, status: 200, json: async () => [{
          id: 'book-cancel-free',
          ride_id: 'ride-free',
          passenger_id: 'passenger-1',
          status: 'confirme',
          total_passenger: 12.50,
          seats_reserved: 1,
          stripe_payment_intent: 'pi_free_real_1234567890',
          payment_currency: 'cad',
        }] };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-free') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => [{
          id: 'ride-free',
          driver_id: 'driver-1',
          departure_time: new Date(Date.now() + 30 * 3600 * 1000).toISOString(),
          available_seats: 1,
        }] };
      }
      if (url.includes('/rest/v1/impact_settings')) {
        return { ok: true, status: 200, json: async () => [{
          ride_cancel_free_window_h: 24,
          ride_cancel_late_window_h: 2,
          ride_cancel_partial_refund_pct: 85,
          ride_cancel_partial_driver_pct: 10,
          ride_cancel_partial_fund_pct: 5,
        }] };
      }
      if (url.includes('/v1/payment_intents/pi_free_real_1234567890') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_free_real_1234567890', status: 'requires_capture', currency: 'cad' }) };
      }
      if (url.includes('/v1/payment_intents/pi_free_real_1234567890/cancel') && opts.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_free_real_1234567890', status: 'canceled' }) };
      }
      if (url.includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/rides') && opts.method === 'PATCH') {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (url.includes('/rest/v1/transactions') && opts.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-cancel-free' });

    assert.equal(res._status, 200);
    assert.equal(res._body.refund, 12.5);
    assert.equal(res._body.driver_compensation, 0);
    assert.equal(res._body.security_fund, 0);
    assert.equal(res._body.stripe_action, 'autorisation_liberee');
    assert.ok(calls.some(c => c.url.includes('/cancel') && c.method === 'POST'));
    assert.ok(calls.some(c => c.url.includes('/rest/v1/rides?id=eq.ride-free') && c.method === 'PATCH'));
  });

  test('annulation passager entre 2h et 24h capture seulement la penalite', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/ride_bookings?id=eq.book-cancel-partial')) {
        return { ok: true, status: 200, json: async () => [{
          id: 'book-cancel-partial',
          ride_id: 'ride-partial',
          passenger_id: 'passenger-1',
          status: 'confirme',
          total_passenger: 12.50,
          seats_reserved: 1,
          stripe_payment_intent: 'pi_partial_real_1234567890',
          payment_currency: 'cad',
        }] };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-partial') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => [{
          id: 'ride-partial',
          driver_id: 'driver-1',
          departure_time: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          available_seats: 1,
        }] };
      }
      if (url.includes('/rest/v1/impact_settings')) {
        return { ok: true, status: 200, json: async () => [{
          ride_cancel_free_window_h: 24,
          ride_cancel_late_window_h: 2,
          ride_cancel_partial_refund_pct: 85,
          ride_cancel_partial_driver_pct: 10,
          ride_cancel_partial_fund_pct: 5,
        }] };
      }
      if (url.includes('/v1/payment_intents/pi_partial_real_1234567890') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_partial_real_1234567890', status: 'requires_capture', currency: 'cad' }) };
      }
      if (url.includes('/v1/payment_intents/pi_partial_real_1234567890/capture') && opts.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_partial_real_1234567890', status: 'succeeded', latest_charge: 'ch_partial' }) };
      }
      if (url.includes('/rest/v1/stripe_connect_accounts')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') return { ok: true, status: 204, json: async () => ({}) };
      if (url.includes('/rest/v1/rides') && opts.method === 'PATCH') return { ok: true, status: 204, json: async () => ({}) };
      if (url.includes('/rest/v1/transactions') && opts.method === 'POST') return { ok: true, status: 201, json: async () => ({}) };
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-cancel-partial' });

    assert.equal(res._status, 200);
    assert.equal(res._body.refund, 10.62);
    assert.equal(res._body.driver_compensation, 1.25);
    assert.equal(res._body.security_fund, 0.63);
    const captureCall = calls.find(c => c.url.includes('/capture'));
    assert.ok(captureCall, 'capture partielle requise');
    assert.equal(new URLSearchParams(captureCall.body).get('amount_to_capture'), '188');
    const driverLedger = calls.find(c => c.url.includes('/rest/v1/transactions') && c.method === 'POST' && String(c.body).includes('dedommagement_covoiturage'));
    assert.ok(driverLedger, 'grand livre conducteur requis');
    assert.equal(JSON.parse(driverLedger.body).statut, 'manual_review');
  });

  test('annulation passager bloque le statut si Stripe echoue', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/ride_bookings?id=eq.book-cancel-fail')) {
        return { ok: true, status: 200, json: async () => [{
          id: 'book-cancel-fail',
          ride_id: 'ride-fail',
          passenger_id: 'passenger-1',
          status: 'confirme',
          total_passenger: 12.50,
          seats_reserved: 1,
          stripe_payment_intent: 'pi_fail_real_1234567890',
          payment_currency: 'cad',
        }] };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-fail') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => [{ id: 'ride-fail', driver_id: 'driver-1', departure_time: new Date(Date.now() + 30 * 3600 * 1000).toISOString(), available_seats: 1 }] };
      }
      if (url.includes('/rest/v1/impact_settings')) return { ok: true, status: 200, json: async () => [{}] };
      if (url.includes('/v1/payment_intents/pi_fail_real_1234567890') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_fail_real_1234567890', status: 'requires_capture' }) };
      }
      if (url.includes('/v1/payment_intents/pi_fail_real_1234567890/cancel')) {
        return { ok: false, status: 402, json: async () => ({ error: { message: 'Stripe failure' } }) };
      }
      if (url.includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') return { ok: true, status: 204, json: async () => ({}) };
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx(), { booking_id: 'book-cancel-fail' });

    assert.equal(res._status, 502);
    assert.equal(calls.some(c => c.url.includes('/rest/v1/ride_bookings') && c.method === 'PATCH'), false);
  });

  test('annulation conducteur rembourse/libere avant de marquer annule', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/rides?id=eq.ride-driver') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => [{ id: 'ride-driver', driver_id: 'driver-1', status: 'publie' }] };
      }
      if (url.includes('/rest/v1/ride_bookings?ride_id=eq.ride-driver')) {
        return { ok: true, status: 200, json: async () => [
          { id: 'book-a', passenger_id: 'passenger-a', status: 'confirme', stripe_payment_intent: 'pi_a_real_1234567890' },
          { id: 'book-b', passenger_id: 'passenger-b', status: 'confirme', stripe_payment_intent: 'pi_b_real_1234567890' },
        ] };
      }
      if (url.includes('/v1/payment_intents/pi_a_real_1234567890') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_a_real_1234567890', status: 'requires_capture' }) };
      }
      if (url.includes('/v1/payment_intents/pi_a_real_1234567890/cancel')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_a_real_1234567890', status: 'canceled' }) };
      }
      if (url.includes('/v1/payment_intents/pi_b_real_1234567890') && (!opts.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => ({ id: 'pi_b_real_1234567890', status: 'succeeded' }) };
      }
      if (url.includes('/v1/refunds')) {
        return { ok: true, status: 200, json: async () => ({ id: 're_b', status: 'succeeded' }) };
      }
      if (url.includes('/rest/v1/rides') && opts.method === 'PATCH') return { ok: true, status: 204, json: async () => ({}) };
      if (url.includes('/rest/v1/ride_bookings') && opts.method === 'PATCH') return { ok: true, status: 204, json: async () => ({}) };
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await rideCancel({ method: 'POST' }, res, ctx({ session: { id: 'driver-1' }, profile: { role: 'livreur' } }), { ride_id: 'ride-driver' });

    assert.equal(res._status, 200);
    assert.equal(res._body.bookings_affected, 2);
    const ridePatchIndex = calls.findIndex(c => c.url.includes('/rest/v1/rides?id=eq.ride-driver') && c.method === 'PATCH');
    const refundIndex = calls.findIndex(c => c.url.includes('/v1/refunds'));
    assert.ok(refundIndex > -1 && ridePatchIndex > refundIndex, 'le trajet est annule apres remboursement');
  });

  test('rideCaptureEligible ne paie PAS un trajet pas encore passe (delai de grace)', async () => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body || '' });
      if (url.includes('/rest/v1/ride_bookings?status=eq.confirme')) {
        return { ok: true, status: 200, json: async () => [{
          id: 'book-future', ride_id: 'ride-future', passenger_id: 'passenger-1',
          status: 'confirme', driver_amount: 10,
          stripe_payment_intent: 'pi_future_real_1234567890',
        }] };
      }
      if (url.includes('/rest/v1/rides?id=eq.ride-future')) {
        return { ok: true, status: 200, json: async () => [{
          id: 'ride-future', driver_id: 'driver-1',
          departure_time: new Date(Date.now() + 30 * 3600 * 1000).toISOString(), // trajet dans 30h
        }] };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const res = makeRes();
    await rideCaptureEligible(
      { method: 'POST' },
      res,
      ctx({ session: { id: 'admin-1' }, profile: { role: 'admin' } }),
      { grace_hours: 4 }
    );

    assert.equal(res._status, 200);
    assert.equal((res._body.captured || []).length, 0, 'aucun paiement avant le trajet');
    assert.ok((res._body.skipped || []).some(s => s.reason === 'trip_not_finished'), 'le trajet futur est saute');
    assert.ok(!calls.some(c => c.url.includes('/capture')), 'pas de capture Stripe avant le trajet');
  });
});

after(() => {
  delete global.fetch;
});
