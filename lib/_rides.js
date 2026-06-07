// api/_rides.js — Covoiturage / Rides PorteaPorte
'use strict';

const { sbHeaders, toNumber, estimateRouteKm, roleIn, safeIds } = require('./_lib');

// ─── Constantes tarifaires ────────────────────────────────────────────────────
const RIDE_COST_PER_KM       = 0.35;
const RIDE_PLATFORM_FEE      = 1.50; // frais fixe par siège réservé (non %)
const RIDE_PLATFORM_FEE_MIN  = 1.00; // plancher absolu
const RIDE_MAX_COST_PER_KM   = 0.50;
const RIDE_FEE_LUGGAGE       = 5.00;
const RIDE_FEE_PET           = 8.00;
const RIDE_FEE_STOP          = 3.00;
const RIDE_FEE_PACKAGE_BASE  = 8.00;   // frais fixes colis
const RIDE_FEE_PACKAGE_PER_KG = 1.50; // par kg supplémentaire au-delà de 5 kg
const RIDE_FREE_TRIPS_DEFAULT = 10;    // franchise : N premiers trajets publiés sans commission

// Tarif/km suggéré + plafond selon l'énergie du véhicule.
// Objectif : être JUSTE (le prix reflète le vrai coût du véhicule) et empêcher la triche
// (une électrique ne peut pas se facturer au tarif d'un diesel).
const ENERGY_RATES = {
  electrique: { def: 0.12, max: 0.18 },
  hybride:    { def: 0.16, max: 0.24 },
  essence:    { def: 0.25, max: 0.35 },
  diesel:     { def: 0.40, max: 0.50 },
};
function energyRate(energyType) {
  const key = String(energyType || 'essence').toLowerCase();
  return ENERGY_RATES[key] || ENERGY_RATES.essence;
}
const STRIPE_VERSION = '2024-04-10';
const STRIPE_OPEN = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
]);

// ─── Helpers internes ─────────────────────────────────────────────────────────

async function getRideSettings(ctx) {
  try {
    // select=* : récupère toutes les colonnes existantes (ride_platform_fee, ride_free_trips, frais…)
    // sans risque de planter si une colonne récente n'est pas encore migrée.
    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_settings?id=eq.default&select=*&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    const rows = r.ok ? await r.json() : [];
    return rows[0] || {};
  } catch (_) { return {}; }
}

function calcPackageFee(weightKg, rideSettings) {
  const s = rideSettings || {};
  const base  = Math.max(0, toNumber(s.ride_fee_package_base,   RIDE_FEE_PACKAGE_BASE));
  const perKg = Math.max(0, toNumber(s.ride_fee_package_per_kg, RIDE_FEE_PACKAGE_PER_KG));
  const kg    = Math.max(0, Number(weightKg) || 0);
  const extra = Math.max(0, kg - 5) * perKg;
  return Math.round((base + extra) * 100) / 100;
}

function groupBonusPct(confirmedPassengers) {
  const n = Number(confirmedPassengers) || 0;
  if (n >= 4) return 0.15;
  if (n === 3) return 0.10;
  if (n === 2) return 0.05;
  return 0;
}

function calcRidePrice({ totalDistanceKm, passengerDistanceKm, costPerKm, hasLuggage, hasPet, extraStops, detourKm, seats, totalSeats, confirmedPassengers, rideSettings, commissionFree }) {
  const s = rideSettings || {};
  const feeLuggage   = Math.max(0, toNumber(s.ride_fee_luggage, RIDE_FEE_LUGGAGE));
  const feePet       = Math.max(0, toNumber(s.ride_fee_pet, RIDE_FEE_PET));
  const feeStop      = Math.max(0, toNumber(s.ride_fee_stop, RIDE_FEE_STOP));
  const platformFeePerSeat = Math.max(RIDE_PLATFORM_FEE_MIN, toNumber(s.ride_platform_fee, RIDE_PLATFORM_FEE));

  const cpk = Number(costPerKm) || RIDE_COST_PER_KM;
  const totalKm = Number(totalDistanceKm) || 0;
  const paxKm   = Number(passengerDistanceKm) || totalKm;
  const nSeats  = Number(seats) || 1;

  const totalCostBase = totalKm * cpk;
  const paxSharePct   = totalKm > 0 ? (paxKm / totalKm) : 1;

  // ── Partage de frais légal (Québec) ──────────────────────────────────────────
  // Le coût du trajet est divisé entre TOUS les occupants, conducteur inclus (+1).
  // Comme le conducteur garde toujours sa propre part, il ne peut jamais encaisser
  // plus que le coût réel du trajet → c'est du partage de frais, pas du profit.
  const seatsTotalForSplit = Math.max(Number(totalSeats) || nSeats, nSeats);
  const occupants = seatsTotalForSplit + 1; // +1 = le conducteur
  const paxBaseRaw    = (totalCostBase * paxSharePct * nSeats) / occupants;

  const bonus    = groupBonusPct(confirmedPassengers);
  let   paxBase  = Math.round(paxBaseRaw * (1 - bonus) * 100) / 100;

  // Plafond de sécurité : un passager ne paie jamais plus que le tarif/km max sur sa distance
  // (protège contre une erreur de saisie de distance ou de tarif).
  const paxBaseCap = Math.round(paxKm * RIDE_MAX_COST_PER_KM * nSeats * 100) / 100;
  const priceWasCapped = paxBaseCap > 0 && paxBase > paxBaseCap;
  if (paxBaseCap > 0 && paxBase > paxBaseCap) paxBase = paxBaseCap;

  const luggageFee = hasLuggage ? feeLuggage : 0;
  const petFee     = hasPet     ? feePet     : 0;
  const stopFee    = (Number(extraStops) || 0) * feeStop;
  const detourFee  = (Number(detourKm)  || 0) * cpk;

  const commissionBase = paxBase + petFee + stopFee + detourFee;
  // Franchise « N premiers trajets sans commission » : figée à la publication du trajet
  const platformFee    = commissionFree ? 0 : Math.round(platformFeePerSeat * nSeats * 100) / 100;
  const driverAmount   = Math.round((commissionBase + luggageFee) * 100) / 100;
  const totalPassenger = Math.round((commissionBase + platformFee + luggageFee) * 100) / 100;

  const maxAllowed = Math.round(paxKm * RIDE_MAX_COST_PER_KM * 100) / 100;
  const overLimit  = priceWasCapped || totalPassenger > maxAllowed + platformFee;

  return {
    costPerKm: cpk,
    totalDistanceKm: totalKm,
    totalCostBase: Math.round(totalCostBase * 100) / 100,
    paxDistanceKm: paxKm,
    paxSharePct: Math.round(paxSharePct * 10000) / 100,
    paxBase:       Math.round(paxBase * 100) / 100,
    luggageFee, petFee, stopFee, detourFee,
    platformFee, platformFeePerSeat, driverAmount, totalPassenger,
    commissionFree: !!commissionFree,
    overLimit, maxAllowed,
  };
}

async function stripeGetPaymentIntent(piId, stripeKey) {
  if (!piId || !stripeKey) return null;
  const r = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piId)}`, {
    headers: {
      Authorization: 'Bearer ' + stripeKey,
      'Stripe-Version': STRIPE_VERSION,
    },
  });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function stripePostForm(path, stripeKey, params, idempotencyKey) {
  const r = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + stripeKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_VERSION,
      'Idempotency-Key': idempotencyKey,
    },
    body: params ? params.toString() : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data, error: data?.error?.message || data?.error || null };
}

async function stripeCreateRidePaymentIntent({ stripeKey, booking, ride, session, amountCents, currency, metadata = {}, descriptionSuffix = '' }) {
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency,
    description: `Covoiturage PorteaPorte - ${ride.start_city || '?'} vers ${ride.end_city || '?'}${descriptionSuffix}`,
    receipt_email: session.email || '',
    'metadata[type]': 'ride_booking',
    'metadata[plateforme]': 'porteaporte',
    'metadata[booking_id]': booking.id,
    'metadata[ride_id]': booking.ride_id,
    'metadata[passenger_id]': booking.passenger_id,
    'metadata[driver_id]': ride.driver_id || '',
    'payment_method_types[]': 'card',
    capture_method: 'manual',
  });
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value !== undefined && value !== null) params.set(`metadata[${key}]`, String(value));
  }

  const r = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + stripeKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_VERSION,
      'Idempotency-Key': `ride-booking-v1-${booking.id}-${amountCents}-${currency}`,
    },
    body: params.toString(),
  });
  const intent = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(intent.error?.message || 'Erreur Stripe');
    err.statusCode = 402;
    throw err;
  }
  return intent;
}

async function patchRideBookingPayment(ctx, bookingId, patch) {
  const optional = ['stripe_payment_intent', 'payment_status', 'payment_currency', 'payment_authorized_at', 'paid_at'];
  const variants = [
    patch,
    Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && !optional.includes(k))),
  ];
  for (const body of variants) {
    const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    if (!Object.keys(clean).length) continue;
    const r = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${encodeURIComponent(bookingId)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify(clean),
    }).catch(() => ({ ok: false }));
    if (r.ok) return true;
  }
  return false;
}

async function patchRideTransaction(ctx, piId, patch) {
  if (!piId) return false;
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transactions?stripe_payment_intent=eq.${encodeURIComponent(piId)}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(patch),
  }).catch(() => ({ ok: false }));
  return !!r.ok;
}

async function insertRideTransaction(ctx, booking, ride, intent, amountDollars) {
  await fetch(`${ctx.sbUrl}/rest/v1/transactions`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      user_id: booking.passenger_id,
      livraison_id: null,
      type: 'paiement_covoiturage',
      montant: amountDollars,
      statut: intent.status,
      description: `Autorisation covoiturage ${ride.start_city || '?'} - ${ride.end_city || '?'}`,
      stripe_payment_intent: intent.id,
      metadata: {
        ride_id: booking.ride_id,
        booking_id: booking.id,
        driver_id: ride.driver_id || null,
        capture_method: 'manual',
        client_secret_created: true,
      },
    }),
  }).catch(() => null);
}

async function insertRideTestTransaction(ctx, booking, ride, amountDollars) {
  await fetch(`${ctx.sbUrl}/rest/v1/transactions`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      user_id: booking.passenger_id,
      livraison_id: null,
      type: 'paiement_covoiturage',
      montant: amountDollars,
      statut: 'test_authorized',
      description: `[TEST ADMIN] Covoiturage ${ride.start_city || '?'} - ${ride.end_city || '?'}`,
      metadata: {
        ride_id: booking.ride_id,
        booking_id: booking.id,
        driver_id: ride.driver_id || null,
        test_mode: true,
        no_stripe_charge: true,
      },
    }),
  }).catch(() => null);
}

async function insertRideAudit(ctx, booking, intent, eventType, extra = {}) {
  await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      user_id: booking.passenger_id,
      actor_id: ctx.session?.id || booking.passenger_id,
      event_type: eventType,
      amount_cents: intent.amount_capturable || intent.amount_received || intent.amount || 0,
      currency: intent.currency || 'cad',
      stripe_payment_intent: intent.id,
      status: intent.status,
      evidence: {
        source: 'lib/_rides',
        ride_id: booking.ride_id,
        booking_id: booking.id,
        ...extra,
      },
      retention_until: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  }).catch(() => null);
}

async function fetchRideBookingForPayment(ctx, bookingId) {
  const selects = [
    'id,ride_id,passenger_id,status,total_passenger,driver_amount,platform_fee,seats_reserved,stripe_payment_intent,payment_status,payment_currency',
    'id,ride_id,passenger_id,status,total_passenger,driver_amount,platform_fee,seats_reserved',
  ];
  for (const select of selects) {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${encodeURIComponent(bookingId)}&select=${select}`, {
      headers: sbHeaders(ctx.sbKey),
    }).catch(() => ({ ok: false }));
    if (!r.ok) continue;
    const rows = await r.json().catch(() => []);
    return rows[0] || null;
  }
  return null;
}

async function findRideBookingIntentFromTransactions(ctx, bookingId) {
  const r = await fetch(
    `${ctx.sbUrl}/rest/v1/transactions?type=eq.paiement_covoiturage&select=id,stripe_payment_intent,statut,metadata&order=created_at.desc&limit=10`,
    { headers: sbHeaders(ctx.sbKey) }
  ).catch(() => ({ ok: false }));
  const rows = r.ok ? await r.json().catch(() => []) : [];
  return rows.find(row => String(row.metadata?.booking_id || '') === String(bookingId)) || null;
}

async function markRidePaymentAuthorized(ctx, booking, intent) {
  const now = new Date().toISOString();
  await patchRideBookingPayment(ctx, booking.id, {
    status: 'confirme',
    confirmed_at: now,
    stripe_payment_intent: intent.id,
    payment_status: intent.status,
    payment_currency: intent.currency || 'cad',
    payment_authorized_at: now,
    paid_at: intent.status === 'succeeded' ? now : null,
  });
  await patchRideTransaction(ctx, intent.id, { statut: intent.status });
  await insertRideAudit(ctx, booking, intent, intent.status === 'succeeded' ? 'ride_payment_succeeded_sync' : 'ride_payment_authorized_requires_capture');

  // ─── Envoyer emails confirmation au passager + conducteur (best-effort) ──
  try {
    await sendBookingConfirmationEmails(ctx, booking);
  } catch (e) {
    console.warn('[ridePaymentSync] email confirmation echec:', e.message);
  }
}

async function sendBookingConfirmationEmails(ctx, booking) {
  // 1) Récupère le trajet + conducteur + safe points
  const [rideRes, driverRes, paxRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${booking.ride_id}&select=*`, { headers: sbHeaders(ctx.sbKey) }),
    null, // conducteur fetché ci-dessous
    fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${booking.passenger_id}&select=email,prenom,nom,telephone`, { headers: sbHeaders(ctx.sbKey) })
  ]);
  const ride = rideRes.ok ? (await rideRes.json())[0] : null;
  const pax  = paxRes.ok  ? (await paxRes.json())[0]  : null;
  if (!ride) return;

  const dRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${ride.driver_id}&select=email,prenom,nom,telephone`, { headers: sbHeaders(ctx.sbKey) });
  const drv  = dRes.ok ? (await dRes.json())[0] : null;

  const dpRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_driver_profiles?user_id=eq.${ride.driver_id}&select=vehicle_make,vehicle_model,vehicle_year,vehicle_color`, { headers: sbHeaders(ctx.sbKey) });
  const dp = dpRes.ok ? (await dpRes.json())[0] : null;
  const vehicle = dp ? [dp.vehicle_year, dp.vehicle_make, dp.vehicle_model, dp.vehicle_color].filter(Boolean).join(' · ') : '';

  // Récupère safe points (adresses)
  let pickupPoint = null, dropoffPoint = null;
  const ids = [ride.pickup_point_id, ride.dropoff_point_id].filter(Boolean);
  if (ids.length) {
    try {
      const idsF = ids.map(id => `id.eq.${id}`).join(',');
      const sp = await fetch(`${ctx.sbUrl}/rest/v1/safe_meeting_points?or=(${idsF})&select=id,name,address,city,sector`, { headers: sbHeaders(ctx.sbKey) });
      if (sp.ok) {
        const pts = await sp.json();
        pickupPoint = pts.find(p => p.id === ride.pickup_point_id) || null;
        dropoffPoint = pts.find(p => p.id === ride.dropoff_point_id) || null;
      }
    } catch (_) {}
  }

  // Construit le payload commun
  const departureStr = ride.departure_time ? new Date(ride.departure_time).toLocaleString('fr-CA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto'
  }) : '';

  const commonData = {
    booking_id: booking.id,
    ville_depart: ride.start_city,
    ville_arrivee: ride.end_city,
    departure_time: departureStr,
    seats: booking.seats_reserved || 1,
    pickup_label: pickupPoint?.name || ride.pickup_safe_label || ride.start_city,
    pickup_address: pickupPoint?.address || '',
    dropoff_label: dropoffPoint?.name || ride.dropoff_safe_label || ride.end_city,
    dropoff_address: dropoffPoint?.address || '',
  };

  const notifierUrl = `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://porteaporte.site'}/api/notifier`;
  const secret = process.env.INTERNAL_API_SECRET || '';

  // 2) Email passager
  if (pax?.email) {
    fetch(notifierUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-internal-secret': secret } : {}) },
      body: JSON.stringify({
        type: 'ride_booking_confirmed',
        data: {
          ...commonData,
          passenger_email: pax.email,
          driver_name: drv?.prenom || 'Conducteur',
          driver_email: drv?.email || '',
          driver_phone: drv?.telephone || '',
          driver_vehicle: vehicle,
          total_price: (booking.total_passenger || 0).toFixed(2),
        }
      })
    }).catch(() => {});
  }

  // 3) Email conducteur
  if (drv?.email) {
    fetch(notifierUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-internal-secret': secret } : {}) },
      body: JSON.stringify({
        type: 'ride_booking_to_driver',
        data: {
          ...commonData,
          driver_email: drv.email,
          driver_name: drv.prenom || 'Conducteur',
          passenger_name: `${pax?.prenom || ''} ${pax?.nom || ''}`.trim() || 'Passager',
          passenger_email: pax?.email || '',
          passenger_phone: pax?.telephone || '',
          has_luggage: !!booking.has_large_luggage,
          has_pet: !!booking.has_pet,
          special_requests: booking.special_requests || '',
          total_price: (booking.total_passenger || 0).toFixed(2),
          driver_amount: (booking.driver_amount || 0).toFixed(2),
        }
      })
    }).catch(() => {});
  }
}

// ─── Profil chauffeur ─────────────────────────────────────────────────────────

function canUseRideTestPayment(ctx, body) {
  const enabled = String(process.env.RIDE_TEST_PAYMENT_ENABLED || '').toLowerCase() === 'true';
  const expectedCode = String(process.env.RIDE_TEST_PAYMENT_CODE || '').trim();
  const receivedCode = String(body.test_code || body.testCode || '').trim();
  return enabled
    && expectedCode
    && receivedCode
    && receivedCode === expectedCode
    && ctx.profile?.role === 'admin';
}

function canUseRideLiveDollarTest(ctx, body) {
  const enabled = String(process.env.RIDE_LIVE_DOLLAR_TEST_ENABLED || '').toLowerCase() === 'true';
  const expectedCode = String(process.env.RIDE_LIVE_DOLLAR_TEST_CODE || '').trim();
  const receivedCode = String(body.live_test_code || body.liveTestCode || '').trim();
  return enabled
    && expectedCode
    && receivedCode
    && receivedCode === expectedCode
    && ctx.profile?.role === 'admin';
}

async function markRidePaymentTestAuthorized(ctx, booking, ride, amountDollars, currency) {
  const now = new Date().toISOString();
  await patchRideBookingPayment(ctx, booking.id, {
    status: 'confirme',
    confirmed_at: now,
    payment_status: 'test_authorized',
    payment_currency: currency || 'cad',
    payment_authorized_at: now,
  });
  await insertRideTestTransaction(ctx, booking, ride, amountDollars);
  await insertRideAudit(ctx, booking, {
    id: undefined,
    status: 'test_authorized',
    amount: Math.round(Number(amountDollars || 0) * 100),
    currency: currency || 'cad',
  }, 'ride_payment_test_authorized_admin', {
    test_mode: true,
    no_stripe_charge: true,
  });
}

async function rideDriverProfile(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const uid = ctx.session.id;

  // GET — lire son propre profil (depuis ride_driver_profiles)
  if (req.method === 'GET') {
    const [rideRes, profileRes, dpRes] = await Promise.all([
      fetch(
        `${ctx.sbUrl}/rest/v1/rides?driver_id=eq.${uid}&select=vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_type,trunk_size,smoking_policy,music_policy,chat_policy,ac_available,perfume_free,personal_rules&order=created_at.desc&limit=1`,
        { headers: sbHeaders(ctx.sbKey) }
      ),
      fetch(
        `${ctx.sbUrl}/rest/v1/profiles?id=eq.${uid}&select=bio,prenom,nom&limit=1`,
        { headers: sbHeaders(ctx.sbKey) }
      ),
      fetch(
        `${ctx.sbUrl}/rest/v1/ride_driver_profiles?user_id=eq.${uid}&select=vehicle_photos&limit=1`,
        { headers: sbHeaders(ctx.sbKey) }
      ),
    ]);

    const rides    = rideRes.ok    ? await rideRes.json().catch(() => [])    : [];
    const profiles = profileRes.ok ? await profileRes.json().catch(() => []) : [];
    const dprofs   = dpRes.ok      ? await dpRes.json().catch(() => [])      : [];
    const lastRide  = rides[0]    || {};
    const profile   = profiles[0] || {};
    const dprof     = dprofs[0]   || {};

    return res.status(200).json({
      success: true,
      profile: {
        vehicle_make:   lastRide.vehicle_make   || null,
        vehicle_model:  lastRide.vehicle_model  || null,
        vehicle_year:   lastRide.vehicle_year   || null,
        vehicle_color:  lastRide.vehicle_color  || null,
        vehicle_type:   lastRide.vehicle_type   || null,
        trunk_size:     lastRide.trunk_size     || null,
        smoking_policy: lastRide.smoking_policy || null,
        music_policy:   lastRide.music_policy   || null,
        chat_policy:    lastRide.chat_policy    || null,
        ac_available:   lastRide.ac_available   ?? false,
        perfume_free:   lastRide.perfume_free   ?? false,
        bio:            lastRide.personal_rules || profile.bio || null,
        vehicle_photos: Array.isArray(dprof.vehicle_photos) ? dprof.vehicle_photos : [],
      },
    });
  }

  // POST — créer ou mettre à jour ride_driver_profiles
  const {
    vehicle_make, vehicle_model, vehicle_year, vehicle_color,
    vehicle_photos, smoking_policy, music_policy, chat_policy,
    ac_available, perfume_free, bio,
  } = body;

  const smokingVal = ['non_fumeur','fumeur','exterieur'].includes(smoking_policy) ? smoking_policy : undefined;
  const musicVal   = ['silence','selon_humeur','musique'].includes(music_policy) ? music_policy : undefined;
  const chatVal    = ['silencieux','selon_humeur','bavard'].includes(chat_policy) ? chat_policy : undefined;

  const photos = Array.isArray(vehicle_photos)
    ? vehicle_photos.slice(0, 6).filter(u => typeof u === 'string' && u.startsWith('http'))
    : undefined;

  const payload = { user_id: uid };
  if (vehicle_make  !== undefined) payload.vehicle_make  = String(vehicle_make).slice(0, 60);
  if (vehicle_model !== undefined) payload.vehicle_model = String(vehicle_model).slice(0, 60);
  if (vehicle_year  !== undefined) payload.vehicle_year  = Number(vehicle_year) || null;
  if (vehicle_color !== undefined) payload.vehicle_color = String(vehicle_color).slice(0, 40);
  if (photos        !== undefined) payload.vehicle_photos = photos;
  if (smokingVal    !== undefined) payload.smoking_policy = smokingVal;
  if (musicVal      !== undefined) payload.music_policy   = musicVal;
  if (chatVal       !== undefined) payload.chat_policy    = chatVal;
  if (ac_available  !== undefined) payload.ac_available   = Boolean(ac_available);
  if (perfume_free  !== undefined) payload.perfume_free   = Boolean(perfume_free);
  if (bio           !== undefined) payload.bio            = String(bio).slice(0, 400);

  const r = await fetch(`${ctx.sbUrl}/rest/v1/ride_driver_profiles`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Sauvegarde impossible', details: data });

  const saved = Array.isArray(data) ? data[0] : data;
  return res.status(200).json({ success: true, profile: saved });
}

// ─── Créer un trajet ──────────────────────────────────────────────────────────

async function rideCreate(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const {
    start_city, end_city, departure_time,
    available_seats, vehicle_type, trunk_size,
    accepts_pets, accepts_large_luggage, accepts_extra_stops,
    non_smoker, women_only, child_seat_available, accessible,
    flexibility_minutes, is_return_trip, return_departure_time,
    is_recurring, recurrence_days,
    start_sector, end_sector,
    start_lat, start_lng, end_lat, end_lng,
    total_distance_km, cost_per_km, personal_rules,
    smoking_policy, music_policy, chat_policy, ac_available,
    stop_points,
  } = body;

  if (!start_city || !end_city || !departure_time || !available_seats) {
    return res.status(400).json({ error: 'Champs requis : start_city, end_city, departure_time, available_seats' });
  }

  const distKm = Number(total_distance_km) || estimateRouteKm(start_city, end_city) || 100;
  // Énergie du véhicule → tarif/km suggéré + plafond propre à l'énergie.
  const energyKey  = ['electrique','hybride','essence','diesel'].includes(String(body.energy_type || '').toLowerCase())
    ? String(body.energy_type).toLowerCase() : 'essence';
  const eRate      = energyRate(energyKey);
  // Si le conducteur fournit un tarif, on le plafonne au max de SON énergie (et au max global).
  // Sinon on applique le tarif suggéré de l'énergie.
  const cpk = Number(cost_per_km) > 0
    ? Math.min(Number(cost_per_km), eRate.max, RIDE_MAX_COST_PER_KM)
    : eRate.def;

  const cleanStops = Array.isArray(stop_points)
    ? stop_points.slice(0, 10).map((s, i) => ({
        order:      i + 1,
        city:       String(s.city || '').trim().slice(0, 100),
        sector:     s.sector ? String(s.sector).trim().slice(0, 100) : null,
        lat:        s.lat ? Number(s.lat) : null,
        lng:        s.lng ? Number(s.lng) : null,
        detour_km:  s.detour_km ? Number(s.detour_km) : 0,
      })).filter(s => s.city)
    : [];

  const smokingVal = ['non_fumeur','fumeur','exterieur'].includes(smoking_policy)
    ? smoking_policy
    : (non_smoker === false ? 'fumeur' : 'non_fumeur');

  // Franchise « N premiers trajets sans commission » : on fige le statut à la publication.
  // On compte les trajets déjà publiés par ce conducteur ; si < ride_free_trips → commission_free.
  let commissionFree = false;
  try {
    const rideSettingsCreate = await getRideSettings(ctx);
    const freeTripsLimit = Math.max(0, Math.floor(toNumber(rideSettingsCreate.ride_free_trips, RIDE_FREE_TRIPS_DEFAULT)));
    if (freeTripsLimit > 0) {
      const cntRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?driver_id=eq.${ctx.session.id}&select=id`, {
        headers: { ...sbHeaders(ctx.sbKey), Prefer: 'count=exact', Range: '0-0' },
      });
      // PostgREST renvoie le total dans l'en-tête Content-Range : "0-0/N" ou "* /N"
      const cr = cntRes.headers.get('content-range') || '';
      const existingCount = Number((cr.split('/')[1] || '0')) || 0;
      commissionFree = existingCount < freeTripsLimit;
    }
  } catch (_) { commissionFree = false; }

  const payload = {
    driver_id: ctx.session.id,
    start_city: String(start_city).trim(),
    start_sector: start_sector ? String(start_sector).trim() : null,
    start_lat: start_lat ? Number(start_lat) : null,
    start_lng: start_lng ? Number(start_lng) : null,
    end_city: String(end_city).trim(),
    end_sector: end_sector ? String(end_sector).trim() : null,
    end_lat: end_lat ? Number(end_lat) : null,
    end_lng: end_lng ? Number(end_lng) : null,
    departure_time: new Date(departure_time).toISOString(),
    flexibility_minutes: Number(flexibility_minutes) || 0,
    is_return_trip: Boolean(is_return_trip),
    return_departure_time: is_return_trip && return_departure_time ? new Date(return_departure_time).toISOString() : null,
    is_recurring: Boolean(is_recurring),
    recurrence_days: is_recurring && Array.isArray(recurrence_days) ? recurrence_days : null,
    vehicle_type: vehicle_type || 'berline',
    energy_type: energyKey,
    trunk_size: ['petit','moyen','grand'].includes(trunk_size) ? trunk_size : 'moyen',
    available_seats: Math.min(Math.max(Number(available_seats) || 1, 1), 8),
    total_seats: Math.min(Math.max(Number(available_seats) || 1, 1), 8),
    accepts_pets: Boolean(accepts_pets),
    accepts_large_luggage: Boolean(accepts_large_luggage),
    accepts_extra_stops: Boolean(accepts_extra_stops),
    accepts_packages: Boolean(body.accepts_packages),
    package_max_kg: body.package_max_kg ? Math.min(Number(body.package_max_kg), 50) : 10,
    package_max_dim_cm: body.package_max_dim_cm ? Math.min(Number(body.package_max_dim_cm), 200) : 60,
    non_smoker: smokingVal === 'non_fumeur',
    smoking_policy: smokingVal,
    music_policy: ['silence','selon_humeur','musique'].includes(music_policy) ? music_policy : 'selon_humeur',
    chat_policy: ['silencieux','selon_humeur','bavard'].includes(chat_policy) ? chat_policy : 'selon_humeur',
    ac_available: Boolean(ac_available),
    women_only: Boolean(women_only),
    child_seat_available: Boolean(child_seat_available),
    accessible: Boolean(accessible),
    personal_rules: personal_rules ? String(personal_rules).slice(0, 500) : null,
    cost_per_km: cpk,
    total_distance_km: distKm,
    stop_points: cleanStops,
    commission_free: commissionFree,
    status: 'publie',
  };

  // Schema fallback : si une colonne n'existe pas dans la table rides, on retire et on retente
  const optionalFields = ['commission_free', 'stop_points', 'package_max_kg', 'package_max_dim_cm', 'accepts_packages', 'smoking_policy', 'music_policy', 'chat_policy', 'ac_available', 'women_only', 'child_seat_available', 'accessible', 'personal_rules', 'cost_per_km', 'total_distance_km', 'flexibility_minutes', 'is_recurring', 'recurrence_days', 'start_sector', 'end_sector', 'start_lat', 'start_lng', 'end_lat', 'end_lng', 'return_departure_time', 'is_return_trip', 'trunk_size', 'accepts_pets', 'accepts_large_luggage', 'accepts_extra_stops'];
  let attempt = { ...payload };
  let r, data;
  let maxRetries = optionalFields.length + 1;
  while (maxRetries-- > 0) {
    r = await fetch(`${ctx.sbUrl}/rest/v1/rides`, {
      method: 'POST',
      headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
      body: JSON.stringify(attempt),
    });
    data = await r.json().catch(() => ({}));
    if (r.ok) break;
    // Détecte "column X does not exist" et retire le champ
    // On scanne plusieurs champs possibles dans la réponse Supabase
    const errStr = String(data?.message || data?.error?.message || data?.hint || data?.details || JSON.stringify(data || {}));
    // Regex permissif : capture le nom de colonne entre quotes (",',`,\")
    const patterns = [
      // "Could not find the 'accepts_packages' column of 'rides' in the schema cache"
      /could not find\s+the\s+["'`\\]+(\w+)["'`\\]+\s+column/i,
      // "column 'accepts_packages' does not exist"
      /column\s+["'`\\]+(\w+)["'`\\]+\s+(does not exist|not found|of relation)/i,
      // "column accepts_packages does not exist"
      /column\s+(\w+)\s+(does not exist|not found|of relation)/i,
      // Variantes avec ou sans "the"
      /could not find\s+["'`\\]+(\w+)["'`\\]+/i,
      /['"`](\w+)['"`]\s+(does not exist|column)/i,
      // Dernier recours
      /column\s+"?(\w+)"?\s+/i
    ];
    let foundCol = null;
    for (const re of patterns) {
      const m = errStr.match(re);
      if (m && m[1] && attempt[m[1]] !== undefined) {
        foundCol = m[1];
        break;
      }
    }
    if (foundCol) {
      delete attempt[foundCol];
      continue;
    }
    // Autre erreur : on arrête
    break;
  }
  if (!r.ok) {
    console.error('[rideCreate] Supabase error:', data);
    return res.status(400).json({
      error: 'Création trajet impossible : ' + (data?.message || data?.error?.message || data?.hint || 'erreur de schéma BDD'),
      details: data,
      hint: 'Vérifie que la table `rides` existe dans Supabase avec les bonnes colonnes. Voir SQL de création.'
    });
  }

  const ride = Array.isArray(data) ? data[0] : data;

  await fetch(`${ctx.sbUrl}/rest/v1/ride_driver_profiles`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id:        ctx.session.id,
      smoking_policy: smokingVal,
      music_policy:   payload.music_policy,
      chat_policy:    payload.chat_policy,
      ac_available:   payload.ac_available,
    }),
  }).catch(() => {});

  return res.status(200).json({ success: true, ride });
}

// ─── Recherche de trajets ─────────────────────────────────────────────────────

async function rideSearch(req, res, ctx, body) {
  const url = new URL(req.url || '/', 'https://porteaporte.site');
  const p = (k) => body[k] || url.searchParams.get(k) || '';
  const start  = p('start_city') || p('from') || p('pickup_city');
  const end    = p('end_city') || p('to') || p('dropoff_city');
  const date   = p('date');
  const seats  = Number(p('seats') || 1);
  const smokingFilter   = p('smoking_policy');
  const trunkFilter     = p('trunk_size');
  const petsFilter      = p('accepts_pets');
  const luggageFilter   = p('accepts_large_luggage');
  const acFilter        = p('ac_available');
  const musicFilter     = p('music_policy');
  const chatFilter      = p('chat_policy');
  const womenFilter     = p('women_only');
  const normCityLoose = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bsainte\b/g, 'ste')
    .replace(/[^a-z0-9]+/g, '');
  const editDistance = (a, b) => {
    if (!a || !b) return Math.max(a.length, b.length);
    if (Math.abs(a.length - b.length) > 2) return 3;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let last = i - 1;
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
        last = old;
      }
    }
    return prev[b.length];
  };
  const cityMatch = (query, value) => {
    const q = normCityLoose(query);
    const v = normCityLoose(value);
    if (!q) return true;
    if (!v) return false;
    if (v.includes(q) || q.includes(v)) return true;
    const maxDistance = Math.min(q.length, v.length) <= 6 ? 1 : 2;
    return Math.min(q.length, v.length) >= 5 && editDistance(q, v) <= maxDistance;
  };

  // ─── Helper : normalise (enlève accents, lowercase) ───
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  // On fetch tous les rides 'publie' (avec autres filtres serveur).
  // Les villes sont filtrées en JS APRÈS pour gérer:
  //  - accents (Québec vs quebec)
  //  - bidirectionnel (recherche A→B trouve aussi B→A si is_return_trip)
  //  - récurrents (recherche date X trouve trajet récurrent qui couvre ce jour)
  let filter = `status=eq.publie&available_seats=gte.${seats}`;
  if (smokingFilter)          filter += `&smoking_policy=eq.${smokingFilter}`;
  if (trunkFilter)            filter += `&trunk_size=eq.${trunkFilter}`;
  if (petsFilter === 'true')  filter += `&accepts_pets=eq.true`;
  if (luggageFilter === 'true') filter += `&accepts_large_luggage=eq.true`;
  if (acFilter === 'true')    filter += `&ac_available=eq.true`;
  if (musicFilter)            filter += `&music_policy=eq.${musicFilter}`;
  if (chatFilter)             filter += `&chat_policy=eq.${chatFilter}`;
  if (womenFilter === 'true') filter += `&women_only=eq.true`;
  const packagesFilter = p('accepts_packages');
  if (packagesFilter === 'true') filter += `&accepts_packages=eq.true`;
  filter += '&order=departure_time.asc&limit=200';

  // Liste complète des colonnes souhaitées (par ordre d'importance)
  const optionalSelectCols = ['start_sector','end_sector','vehicle_type','trunk_size','accepts_pets','accepts_large_luggage','accepts_extra_stops','accepts_packages','package_max_kg','smoking_policy','music_policy','chat_policy','ac_available','women_only','accessible','cost_per_km','total_distance_km','total_seats','energy_type','stop_points','is_return_trip','return_departure_time','is_recurring','recurrence_days','commission_free'];
  const requiredCols = 'id,start_city,end_city,departure_time,available_seats,status,driver_id';

  // Schema fallback : si une colonne manque, on la retire du SELECT et on retry
  let rides = [];
  let selectCols = [...optionalSelectCols];
  let maxRetries = optionalSelectCols.length + 1;
  while (maxRetries-- > 0) {
    const select = requiredCols + (selectCols.length ? ',' + selectCols.join(',') : '');
    const r = await fetch(`${ctx.sbUrl}/rest/v1/rides?${filter}&select=${select}`, {
      headers: sbHeaders(ctx.sbKey),
    });
    if (r.ok) {
      rides = await r.json();
      break;
    }
    // Détecte "column X does not exist" et retire
    const err = await r.json().catch(() => ({}));
    const errStr = String(err?.message || err?.error?.message || JSON.stringify(err));
    const m = errStr.match(/column\s+["'`]?rides\.(\w+)["'`]?\s+does not exist/i) ||
              errStr.match(/could not find\s+the\s+["'`]+(\w+)["'`]+\s+column/i) ||
              errStr.match(/column\s+["'`]+(\w+)["'`]+\s+does not exist/i);
    if (m && m[1] && selectCols.includes(m[1])) {
      console.warn('[rideSearch] colonne manquante retiree:', m[1]);
      selectCols = selectCols.filter(c => c !== m[1]);
      continue;
    }
    console.error('[rideSearch] erreur Supabase non recuperable:', errStr);
    break;
  }

  // ─── Filtre villes (insensible accents + bidirectionnel si is_return_trip) ───
  const nStart = norm(start);
  const nEnd   = norm(end);
  if (nStart || nEnd) {
    rides = rides.filter(ride => {
      const starts = [ride.start_city, ride.start_sector].filter(Boolean);
      const ends = [ride.end_city, ride.end_sector].filter(Boolean);
      // Direction normale : start match ride.start, end match ride.end
      const directMatch = (!nStart || starts.some(v => cityMatch(nStart, v))) &&
                          (!nEnd   || ends.some(v => cityMatch(nEnd, v)));
      // Si trajet bi-directionnel, accepte aussi le sens inverse
      const reverseMatch = ride.is_return_trip && (!nStart || ends.some(v => cityMatch(nStart, v))) &&
                          (!nEnd   || starts.some(v => cityMatch(nEnd, v)));
      return directMatch || reverseMatch;
    });
  }

  // ─── Filtre date avec gestion des trajets récurrents ───
  if (date) {
    const d = new Date(date);
    if (!isNaN(d)) {
      const targetDay = d.getDay(); // 0=dim, 1=lun, ... 6=sam
      const dayKeys = ['dim','lun','mar','mer','jeu','ven','sam'];
      const targetDayKey = dayKeys[targetDay];
      rides = rides.filter(ride => {
        // Cas 1 : trajet récurrent → match si jour de la semaine inclus
        if (ride.is_recurring && Array.isArray(ride.recurrence_days)) {
          return ride.recurrence_days.includes(targetDayKey) ||
                 ride.recurrence_days.some(k => String(k).toLowerCase().startsWith(targetDayKey));
        }
        // Cas 2 : trajet ponctuel → match si même jour
        if (!ride.departure_time) return false;
        const rd = new Date(ride.departure_time);
        return rd.toDateString() === d.toDateString();
      });
    }
  } else {
    // Pas de date → exclure les trajets ponctuels passés (mais garder les récurrents)
    const now = new Date();
    rides = rides.filter(ride => {
      if (ride.is_recurring) return true;
      if (!ride.departure_time) return true;
      return new Date(ride.departure_time) >= now;
    });
  }

  // Limit final
  rides = rides.slice(0, 50);

  if (!rides.length) return res.status(200).json({ rides: [], matching_enabled: true });

  const driverIds = [...new Set(rides.map(r => r.driver_id))];
  const [profilesRes, driverProfilesRes, reviewsRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/profiles?id=in.(${driverIds.join(',')})&select=id,prenom,driver_status,score_confiance,created_at,identity_verified,photo_url,photo_status,photo_visible_to_others`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_driver_profiles?user_id=in.(${driverIds.join(',')})&select=user_id,vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_photos,bio,nb_trajets_chauffeur`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/reviews?reviewed_id=in.(${driverIds.join(',')})&select=reviewed_id,rating`, { headers: sbHeaders(ctx.sbKey) }).catch(() => null),
  ]);

  const profiles      = profilesRes.ok ? await profilesRes.json() : [];
  const driverProfiles = driverProfilesRes.ok ? await driverProfilesRes.json() : [];
  const reviews       = (reviewsRes && reviewsRes.ok) ? await reviewsRes.json() : [];
  const profileMap     = Object.fromEntries(profiles.map(p => [p.id, p]));
  const driverProfileMap = Object.fromEntries(driverProfiles.map(p => [p.user_id, p]));

  // Agrégation des notes par chauffeur
  const ratingsByDriver = {};
  reviews.forEach(rv => {
    const id = rv.reviewed_id;
    if (!ratingsByDriver[id]) ratingsByDriver[id] = { sum: 0, n: 0 };
    if (Number(rv.rating) >= 1 && Number(rv.rating) <= 5) {
      ratingsByDriver[id].sum += Number(rv.rating);
      ratingsByDriver[id].n++;
    }
  });

  const rideSettings = await getRideSettings(ctx);

  // ─── ALGO DE MATCHING (score 0-100 + raisons humaines) ───
  const wantedDate = date ? new Date(date) : null;
  function scoreRide(ride, profile, dp, ratingInfo) {
    let score = 0;
    const reasons = [];

    // 1) Chauffeur vérifié KYC (max 20)
    if (profile.identity_verified || profile.driver_status === 'verified') {
      score += 20;
      reasons.push('✓ Identité vérifiée');
    }

    // 2) Note moyenne (max 25)
    if (ratingInfo && ratingInfo.n > 0) {
      const avg = ratingInfo.sum / ratingInfo.n;
      const ratingScore = Math.round((avg / 5) * 25);
      score += ratingScore;
      if (avg >= 4.7 && ratingInfo.n >= 3) reasons.push(`🌟 ${avg.toFixed(1)}★ (${ratingInfo.n} avis)`);
      else if (avg >= 4.3) reasons.push(`⭐ ${avg.toFixed(1)}★`);
    } else {
      // Pas d'avis = score neutre (12.5)
      score += 12;
    }

    // 3) Score de confiance interne (max 15)
    const sc = Number(profile.score_confiance || 0);
    if (sc >= 80) { score += 15; reasons.push('🛡️ Score élevé'); }
    else if (sc >= 50) { score += 10; }
    else if (sc >= 20) { score += 5; }

    // 4) Expérience (max 10)
    const nbTrajets = Number(dp.nb_trajets_chauffeur || 0);
    if (nbTrajets >= 50) { score += 10; reasons.push(`🚗 ${nbTrajets}+ trajets`); }
    else if (nbTrajets >= 10) { score += 7; reasons.push(`🚗 ${nbTrajets} trajets`); }
    else if (nbTrajets >= 3) { score += 4; }

    // 5) Proximité date demandée (max 15)
    if (wantedDate && ride.departure_time) {
      const rideTime = new Date(ride.departure_time).getTime();
      const wantedTime = wantedDate.getTime();
      const diffHours = Math.abs(rideTime - wantedTime) / (1000 * 60 * 60);
      if (diffHours <= 2) { score += 15; reasons.push('⏰ Heure idéale'); }
      else if (diffHours <= 12) { score += 10; }
      else if (diffHours <= 48) { score += 5; }
    } else {
      score += 8; // Pas de date demandée = neutre
    }

    // 6) Places disponibles vs demandées (max 5)
    const placesDispo = Number(ride.available_seats || 0);
    if (placesDispo >= seats && placesDispo <= seats + 1) {
      score += 5;
      if (placesDispo === seats) reasons.push('🎯 Pile le nb de places');
    }

    // 7) Récurrence = fiabilité (max 5)
    if (ride.is_recurring) {
      score += 5;
      reasons.push('🔁 Trajet régulier');
    }

    // 8) Accepte colis = bonus utilité (max 3)
    if (ride.accepts_packages) { score += 3; }

    // 9) Pénalité si trajet imminent (< 1h) — risque d'annulation
    if (ride.departure_time) {
      const hoursUntil = (new Date(ride.departure_time).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil < 1 && hoursUntil > 0) score -= 5;
    }

    // 10) Bonus genre (women_only matched par l'utilisateur)
    if (womenFilter && (womenFilter === 'true' || womenFilter === true) && ride.women_only) {
      score += 10;
      reasons.push('👩 Femmes uniquement');
    }

    // 11) Bonus écologique GRADUÉ — « plus c'est vert, plus il remonte »
    //     Basé sur energy_type (champ fiable), repli sur vehicle_type (texte libre).
    //     N'affecte QUE le classement — jamais le prix payé par le passager.
    const energyType = String(ride.energy_type || '').toLowerCase();
    const vtype = String(ride.vehicle_type || '').toLowerCase();
    let ecoBonus = 0;
    if (energyType === 'electrique')   ecoBonus = 10;
    else if (energyType === 'hybride') ecoBonus = 6;
    else if (vtype.includes('ev') || vtype.includes('electrique') || vtype.includes('électrique')) ecoBonus = 10;
    else if (vtype.includes('hybride')) ecoBonus = 6;
    if (ecoBonus > 0) {
      score += ecoBonus;
      reasons.push(ecoBonus >= 10 ? '⚡ 100% électrique' : '🌱 Véhicule hybride');
    }

    // 12) Compatibilité préférences (si filtre demandé ET matché)
    if (smokingFilter && smokingFilter === ride.smoking_policy) score += 3;
    if (musicFilter && musicFilter === ride.music_policy) score += 2;
    if (chatFilter && chatFilter === ride.chat_policy) score += 2;
    if (acFilter === 'true' && ride.ac_available) score += 2;
    if (petsFilter === 'true' && ride.accepts_pets) score += 2;
    if (luggageFilter === 'true' && ride.accepts_large_luggage) score += 2;
    if (trunkFilter && trunkFilter === ride.trunk_size) score += 2;

    // 13) Bonus photo de profil approuvée (humanisation)
    if (profile.photo_status === 'approved' && profile.photo_visible_to_others !== false) {
      score += 4;
      // pas de reason — visible directement sur la carte
    }

    return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 3) };
  }

  const enriched = rides.map((ride) => {
    const price = calcRidePrice({
      totalDistanceKm: ride.total_distance_km,
      passengerDistanceKm: ride.total_distance_km,
      costPerKm: ride.cost_per_km,
      seats,
      totalSeats: ride.total_seats || ride.available_seats,
      rideSettings,
      commissionFree: !!ride.commission_free,
    });
    const profile      = profileMap[ride.driver_id] || {};
    const driverProfile = driverProfileMap[ride.driver_id] || {};
    const ratingInfo   = ratingsByDriver[ride.driver_id] || { sum: 0, n: 0 };
    const matching     = scoreRide(ride, profile, driverProfile, ratingInfo);

    return {
      ...ride,
      start_lat: undefined, start_lng: undefined,
      end_lat: undefined,   end_lng: undefined,
      driver: {
        prenom:       profile.prenom || 'Chauffeur',
        verified:     profile.driver_status === 'verified' || !!profile.identity_verified,
        score:        profile.score_confiance || 0,
        avg_rating:   ratingInfo.n > 0 ? Math.round((ratingInfo.sum / ratingInfo.n) * 10) / 10 : null,
        nb_reviews:   ratingInfo.n,
        nb_trajets:   driverProfile.nb_trajets_chauffeur || 0,
        // Photo : visible seulement si approved par admin ET visibilité activée par le user
        photo_url:    (profile.photo_status === 'approved' && profile.photo_visible_to_others !== false) ? profile.photo_url : null,
        vehicle_make:  driverProfile.vehicle_make || null,
        vehicle_model: driverProfile.vehicle_model || null,
        vehicle_year:  driverProfile.vehicle_year || null,
        vehicle_color: driverProfile.vehicle_color || null,
        vehicle_photo: (driverProfile.vehicle_photos || [])[0] || null,
        bio:           driverProfile.bio || null,
      },
      match_score:       matching.score,
      match_reasons:     matching.reasons,
      estimated_price:   price.totalPassenger,
      driver_amount:     price.driverAmount,
      platform_fee:      price.platformFee,
      luggage_fee_info:  RIDE_FEE_LUGGAGE,
      group_discount: (() => {
        const cur = groupBonusPct(0);
        const next = groupBonusPct(1);
        const diff = next - cur;
        if (diff > 0) return { next_pct: Math.round(diff * 100), seats_needed: 1 };
        return null;
      })(),
    };
  });

  // ─── TRI : par défaut PERTINENCE (match_score DESC), option ?sort=date possible ───
  const sortMode = String(body.sort || (new URL(req.url || '/', 'https://porteaporte.site')).searchParams.get('sort') || 'pertinence').toLowerCase();
  if (sortMode === 'date') {
    enriched.sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
  } else if (sortMode === 'prix') {
    enriched.sort((a, b) => (a.estimated_price || 0) - (b.estimated_price || 0));
  } else {
    // Pertinence par défaut
    enriched.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
  }

  // Marquer le top 3 comme "Meilleur match"
  enriched.slice(0, 3).forEach((r, i) => {
    r.match_rank = i + 1;
    if (i === 0 && r.match_score >= 60) r.match_badge = '🏆 Meilleur match';
    else if (i === 0) r.match_badge = '⭐ Top recommandé';
  });

  return res.status(200).json({
    rides: enriched,
    matching_enabled: true,
    sort: sortMode,
    total: enriched.length
  });
}

// ─── Détail d'un trajet ───────────────────────────────────────────────────────

async function rideDetail(req, res, ctx, body) {
  const url    = new URL(req.url || '/', 'https://porteaporte.site');
  const rideId = body.ride_id || url.searchParams.get('ride_id');
  if (!rideId) return res.status(400).json({ error: 'ride_id requis' });

  const r = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${rideId}&select=*`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return res.status(404).json({ error: 'Trajet introuvable' });

  const ride = rows[0];
  if (ride.status !== 'publie' && ride.driver_id !== ctx.session?.id &&
      ctx.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Trajet non disponible' });
  }

  const stopsRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_stops?ride_id=eq.${rideId}&order=stop_order.asc`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const legacyStops = stopsRes.ok ? await stopsRes.json() : [];
  const stops = legacyStops.length ? legacyStops : (ride.stop_points || []);

  const [pRes, dpRes, reviewsRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${ride.driver_id}&select=prenom,driver_status,created_at,score_confiance,photo_url`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_driver_profiles?user_id=eq.${ride.driver_id}&select=*`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/reviews?driver_id=eq.${ride.driver_id}&select=note,created_at&order=created_at.desc&limit=5`, { headers: sbHeaders(ctx.sbKey) }),
  ]);

  const driver      = (pRes.ok ? await pRes.json() : [])[0] || {};
  const driverProfile = (dpRes.ok ? await dpRes.json() : [])[0] || {};
  const reviews     = reviewsRes.ok ? await reviewsRes.json() : [];

  // ─── Récupère les safe meeting points (lat/lng/adresse) pour pickup et dropoff ──
  let pickupPoint = null, dropoffPoint = null;
  const safePointIds = [ride.pickup_point_id, ride.dropoff_point_id].filter(Boolean);
  if (safePointIds.length) {
    try {
      const idsFilter = safePointIds.map(id => `id.eq.${id}`).join(',');
      const spRes = await fetch(`${ctx.sbUrl}/rest/v1/safe_meeting_points?or=(${idsFilter})&select=id,name,address,city,sector,lat,lng,type,hours,notes,photo_url,has_cameras,well_lit,parking_free`, {
        headers: sbHeaders(ctx.sbKey),
      });
      if (spRes.ok) {
        const pts = await spRes.json();
        pickupPoint  = pts.find(p => p.id === ride.pickup_point_id)  || null;
        dropoffPoint = pts.find(p => p.id === ride.dropoff_point_id) || null;
      }
    } catch(_) {}
  }

  const paxKm = Number(body.passenger_distance_km) || ride.total_distance_km;
  const rideSettingsDetail = await getRideSettings(ctx);
  const price = calcRidePrice({
    totalDistanceKm: ride.total_distance_km,
    passengerDistanceKm: paxKm,
    costPerKm: ride.cost_per_km,
    hasLuggage:  body.has_large_luggage,
    hasPet:      body.has_pet,
    extraStops:  body.extra_stops_count,
    detourKm:    body.requested_detour_km,
    seats:       body.seats_reserved || 1,
    totalSeats:  ride.total_seats || ride.available_seats,
    rideSettings: rideSettingsDetail,
    commissionFree: !!ride.commission_free,
  });

  const isParty = ctx.session && (ride.driver_id === ctx.session.id || ctx.profile?.role === 'admin');
  const safeRide = { ...ride };
  if (!isParty) {
    delete safeRide.start_lat; delete safeRide.start_lng;
    delete safeRide.end_lat;   delete safeRide.end_lng;
  }

  return res.status(200).json({
    ride: safeRide,
    stops,
    pickup_point:  pickupPoint,
    dropoff_point: dropoffPoint,
    driver: {
      prenom:        driver.prenom || 'Chauffeur',
      photo_url:     driver.photo_url || null,
      verified:      driver.driver_status === 'verified',
      score:         driver.score_confiance || 0,
      member_since:  driver.created_at ? new Date(driver.created_at).getFullYear() : null,
      vehicle_make:   driverProfile.vehicle_make || null,
      vehicle_model:  driverProfile.vehicle_model || null,
      vehicle_year:   driverProfile.vehicle_year || null,
      vehicle_color:  driverProfile.vehicle_color || null,
      vehicle_photos: driverProfile.vehicle_photos || [],
      smoking_policy: ride.smoking_policy || driverProfile.smoking_policy || 'non_fumeur',
      music_policy:   ride.music_policy   || driverProfile.music_policy   || 'selon_humeur',
      chat_policy:    ride.chat_policy    || driverProfile.chat_policy    || 'selon_humeur',
      ac_available:   ride.ac_available   ?? driverProfile.ac_available   ?? false,
      perfume_free:   driverProfile.perfume_free || false,
      bio:            driverProfile.bio || null,
      recent_reviews: reviews,
    },
    price_breakdown: {
      ...price,
      luggage_note: 'Les frais de bagage vont intégralement au chauffeur',
    },
  });
}

// ─── Réserver un trajet ───────────────────────────────────────────────────────

async function rideBook(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { ride_id, pickup_city, dropoff_city, seats_reserved,
          has_large_luggage, has_pet, extra_stops_count,
          requested_detour_km, passenger_distance_km, special_requests,
          pickup_sector, dropoff_sector } = body;

  if (!ride_id || !pickup_city || !dropoff_city) {
    return res.status(400).json({ error: 'ride_id, pickup_city, dropoff_city requis' });
  }

  const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=id,driver_id,available_seats,total_seats,status,cost_per_km,total_distance_km,accepts_pets,accepts_large_luggage,commission_free`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const rRows = rRes.ok ? await rRes.json() : [];
  if (!rRows.length) return res.status(404).json({ error: 'Trajet introuvable' });

  const ride = rRows[0];
  if (ride.status !== 'publie') return res.status(400).json({ error: 'Ce trajet n\'est plus disponible' });
  if (ride.driver_id === ctx.session.id) return res.status(400).json({ error: 'Vous ne pouvez pas réserver votre propre trajet' });
  if (!ride.accepts_pets && has_pet) return res.status(400).json({ error: 'Ce chauffeur n\'accepte pas les animaux' });
  if (!ride.accepts_large_luggage && has_large_luggage) return res.status(400).json({ error: 'Ce chauffeur n\'accepte pas les gros bagages' });

  const seats = Math.max(1, Number(seats_reserved) || 1);
  if (seats > ride.available_seats) return res.status(400).json({ error: `Seulement ${ride.available_seats} place(s) disponible(s)` });

  const paxKm = Number(passenger_distance_km) || ride.total_distance_km;
  const rideSettingsBook = await getRideSettings(ctx);
  const price = calcRidePrice({
    totalDistanceKm: ride.total_distance_km,
    passengerDistanceKm: paxKm,
    costPerKm: ride.cost_per_km,
    hasLuggage:  has_large_luggage,
    hasPet:      has_pet,
    extraStops:  extra_stops_count,
    detourKm:    requested_detour_km,
    seats,
    totalSeats:  ride.total_seats || ride.available_seats,
    rideSettings: rideSettingsBook,
    commissionFree: !!ride.commission_free,
  });

  const booking = {
    ride_id,
    passenger_id: ctx.session.id,
    pickup_city:  String(pickup_city).trim(),
    pickup_sector: pickup_sector ? String(pickup_sector).trim() : null,
    dropoff_city: String(dropoff_city).trim(),
    dropoff_sector: dropoff_sector ? String(dropoff_sector).trim() : null,
    seats_reserved: seats,
    has_large_luggage: Boolean(has_large_luggage),
    has_pet:           Boolean(has_pet),
    extra_stops_count: Number(extra_stops_count) || 0,
    requested_detour_km: Number(requested_detour_km) || 0,
    special_requests: special_requests ? String(special_requests).slice(0, 500) : null,
    passenger_distance_km: price.paxDistanceKm,
    base_share:    price.paxBase,
    luggage_fee:   price.luggageFee,
    pet_fee:       price.petFee,
    stop_fee:      price.stopFee,
    detour_fee:    price.detourFee,
    platform_fee:  price.platformFee,
    driver_amount: price.driverAmount,
    total_passenger: price.totalPassenger,
    status: 'en_attente',
  };

  const bRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
    body: JSON.stringify(booking),
  });
  const bData = await bRes.json().catch(() => ({}));
  if (!bRes.ok) {
    // Détecte les erreurs courantes pour donner un message utilisateur clair
    const code = bData?.code;
    const msg  = String(bData?.message || '');
    if (code === '23505' || /duplicate key/i.test(msg)) {
      // Vérifie si c'est bien le conflit ride_id+passenger_id
      if (/ride_id.*passenger_id/i.test(bData?.details || '')) {
        // Récupère la réservation existante pour donner le lien
        const existRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?ride_id=eq.${ride_id}&passenger_id=eq.${ctx.session.id}&select=id,status,created_at`, {
          headers: sbHeaders(ctx.sbKey)
        });
        const exist = existRes.ok ? (await existRes.json())[0] : null;
        return res.status(409).json({
          error: 'Tu as déjà une réservation pour ce trajet.',
          existing_booking: exist || null,
          action: 'Va dans "Mes trajets" pour voir ou annuler ta réservation existante.',
          action_url: '/dashboard-covoiturage.html'
        });
      }
    }
    if (code === '23503' || /foreign key/i.test(msg)) {
      return res.status(400).json({ error: 'Trajet ou utilisateur introuvable. Recharge la page.' });
    }
    return res.status(400).json({ error: 'Réservation impossible', details: bData });
  }

  const saved = Array.isArray(bData) ? bData[0] : bData;
  const remainingSeats = Math.max(0, Number(ride.available_seats || 0) - seats);
  const nextRideStatus = remainingSeats === 0 ? 'complet' : ride.status;

  const seatPatchRes = await fetch(
    `${ctx.sbUrl}/rest/v1/rides?id=eq.${encodeURIComponent(ride_id)}&available_seats=gte.${seats}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
      body: JSON.stringify({ available_seats: remainingSeats, status: nextRideStatus }),
    }
  );
  const seatPatchRows = seatPatchRes.ok ? await seatPatchRes.json().catch(() => []) : [];
  if (!seatPatchRes.ok || !seatPatchRows.length) {
    await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${saved.id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule_passager' }),
    }).catch(() => {});
    return res.status(409).json({ error: 'Ce trajet vient de devenir complet. Essaie un autre trajet.' });
  }

  await fetch(`${ctx.sbUrl}/rest/v1/ride_price_breakdowns`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      booking_id:     saved.id,
      cost_per_km:    price.costPerKm,
      total_cost_base: price.totalCostBase,
      pax_distance:   price.paxDistanceKm,
      pax_share_pct:  price.paxSharePct,
      pax_base:       price.paxBase,
      extras_detail:  { luggage: price.luggageFee, pet: price.petFee, stops: price.stopFee, detour: price.detourFee },
      platform_fee_per_seat: price.platformFeePerSeat,
      driver_receives: price.driverAmount,
      passenger_pays:  price.totalPassenger,
    }),
  }).catch(() => {});

  return res.status(200).json({ success: true, booking: saved, price_breakdown: price });
}

async function ridePaymentCreate(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const bookingId = body.booking_id || body.bookingId;
  if (!bookingId) return res.status(400).json({ error: 'booking_id requis' });

  const booking = await fetchRideBookingForPayment(ctx, bookingId);
  if (!booking) return res.status(404).json({ error: 'Reservation introuvable' });
  if (booking.passenger_id !== ctx.session.id && ctx.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Seul le passager peut payer cette reservation' });
  }
  if (['annule_passager', 'annule_chauffeur', 'complete'].includes(booking.status)) {
    return res.status(409).json({ error: 'Reservation annulee ou completee' });
  }

  const bookingAmountDollars = Number(booking.total_passenger || 0);
  const bookingAmountCents = Math.round(bookingAmountDollars * 100);
  if (!bookingAmountCents || Number.isNaN(bookingAmountCents) || bookingAmountCents < 50) {
    return res.status(400).json({ error: 'Montant covoiturage invalide' });
  }

  const rideRes = await fetch(
    `${ctx.sbUrl}/rest/v1/rides?id=eq.${encodeURIComponent(booking.ride_id)}&select=id,driver_id,start_city,end_city,departure_time,status`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const rideRows = rideRes.ok ? await rideRes.json().catch(() => []) : [];
  const ride = rideRows[0];
  if (!ride) return res.status(404).json({ error: 'Trajet introuvable' });

  const currency = String(body.currency || booking.payment_currency || 'cad').toLowerCase();
  if (canUseRideTestPayment(ctx, body)) {
    await markRidePaymentTestAuthorized(ctx, booking, ride, bookingAmountDollars, currency);
    return res.status(200).json({
      success: true,
      already_authorized: true,
      test_mode: true,
      no_stripe_charge: true,
      amount: bookingAmountCents,
      montant_dollars: (bookingAmountCents / 100).toFixed(2),
      currency,
      booking_id: booking.id,
      ride_id: booking.ride_id,
      status: 'test_authorized',
    });
  }

  const liveDollarTest = canUseRideLiveDollarTest(ctx, body);
  const amountCents = liveDollarTest ? 100 : bookingAmountCents;
  const amountDollars = amountCents / 100;
  const existingRef = booking.stripe_payment_intent
    ? { stripe_payment_intent: booking.stripe_payment_intent }
    : await findRideBookingIntentFromTransactions(ctx, booking.id);
  if (existingRef?.stripe_payment_intent) {
    const existing = await stripeGetPaymentIntent(existingRef.stripe_payment_intent, ctx.stripeKey);
    if (existing && existing.amount === amountCents && existing.currency === currency) {
      if (existing.status === 'requires_capture' || existing.status === 'succeeded') {
        await markRidePaymentAuthorized(ctx, booking, existing);
        return res.status(200).json({
          success: true,
          already_authorized: true,
          client_secret: existing.client_secret,
          payment_intent_id: existing.id,
          amount: amountCents,
          montant_dollars: (amountCents / 100).toFixed(2),
          currency: existing.currency,
          booking_id: booking.id,
          ride_id: booking.ride_id,
          status: existing.status,
          reused: true,
        });
      }
      if (STRIPE_OPEN.has(existing.status)) {
        await patchRideBookingPayment(ctx, booking.id, {
          stripe_payment_intent: existing.id,
          payment_status: existing.status,
          payment_currency: existing.currency,
        });
        return res.status(200).json({
          success: true,
          client_secret: existing.client_secret,
          payment_intent_id: existing.id,
          amount: amountCents,
          montant_dollars: (amountCents / 100).toFixed(2),
          currency: existing.currency,
          booking_id: booking.id,
          ride_id: booking.ride_id,
          status: existing.status,
          reused: true,
        });
      }
      if (existing.status === 'canceled') {
        await patchRideTransaction(ctx, existing.id, { statut: 'canceled' });
      }
    }
  }

  try {
    const intent = await stripeCreateRidePaymentIntent({
      stripeKey: ctx.stripeKey,
      booking,
      ride,
      session: ctx.session,
      amountCents,
      currency,
      metadata: liveDollarTest ? {
        test_mode: 'live_1cad_admin',
        no_public_discount: 'true',
        original_amount_cents: bookingAmountCents,
      } : {},
      descriptionSuffix: liveDollarTest ? ' [TEST ADMIN 1 CAD]' : '',
    });
    await insertRideTransaction(ctx, booking, ride, intent, amountDollars);
    await insertRideAudit(ctx, booking, intent, 'ride_payment_intent_created_manual_capture');
    await patchRideBookingPayment(ctx, booking.id, {
      stripe_payment_intent: intent.id,
      payment_status: intent.status,
      payment_currency: intent.currency,
    });
    return res.status(200).json({
      success: true,
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      amount: amountCents,
      montant_dollars: (amountCents / 100).toFixed(2),
      currency: intent.currency,
      booking_id: booking.id,
      ride_id: booking.ride_id,
      status: intent.status,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Erreur Stripe' });
  }
}

async function ridePaymentSync(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const bookingId = body.booking_id || body.bookingId;
  const paymentIntentId = body.payment_intent_id || body.paymentIntentId;
  if (!bookingId || !paymentIntentId) {
    return res.status(400).json({ error: 'booking_id et payment_intent_id requis' });
  }

  const booking = await fetchRideBookingForPayment(ctx, bookingId);
  if (!booking) return res.status(404).json({ error: 'Reservation introuvable' });
  if (booking.passenger_id !== ctx.session.id && ctx.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Non autorise' });
  }

  const intent = await stripeGetPaymentIntent(paymentIntentId, ctx.stripeKey);
  if (!intent) return res.status(404).json({ error: 'PaymentIntent introuvable' });
  if (intent.metadata?.booking_id && intent.metadata.booking_id !== booking.id) {
    return res.status(409).json({ error: 'PaymentIntent ne correspond pas a cette reservation' });
  }
  if (intent.metadata?.passenger_id && intent.metadata.passenger_id !== booking.passenger_id) {
    return res.status(409).json({ error: 'PaymentIntent ne correspond pas a ce passager' });
  }

  if (intent.status === 'requires_capture' || intent.status === 'succeeded') {
    await markRidePaymentAuthorized(ctx, booking, intent);
    return res.status(200).json({
      success: true,
      authorized: true,
      stripe_status: intent.status,
      payment_intent_id: intent.id,
      booking_id: booking.id,
    });
  }

  await patchRideBookingPayment(ctx, booking.id, {
    stripe_payment_intent: intent.id,
    payment_status: intent.status,
    payment_currency: intent.currency || 'cad',
  });
  await patchRideTransaction(ctx, intent.id, { statut: intent.status });
  return res.status(409).json({
    success: false,
    authorized: false,
    stripe_status: intent.status,
    error: 'Paiement non autorise par Stripe',
  });
}

// ─── Annuler une réservation ou un trajet ─────────────────────────────────────

// Rembourse OU libère l'autorisation Stripe d'une réservation selon l'état du PaymentIntent.
//  - requires_capture  → on annule l'autorisation : AUCUN argent prélevé au passager
//  - succeeded         → argent déjà capturé : remboursement complet
//  - placeholder/test  → rien à faire côté Stripe
async function refundRideBooking(ctx, booking) {
  const piId = booking.stripe_payment_intent;
  if (!piId || /pi_X{4,}/i.test(piId) || /pi_TEST/i.test(piId) || piId.length < 20) {
    return { action: 'aucun_paiement' };
  }
  if (!ctx.stripeKey) throw new Error('Stripe non configure: remboursement impossible');

  const pi = await stripeGetPaymentIntent(piId, ctx.stripeKey);
  if (!pi) throw new Error('PaymentIntent introuvable');

  if (pi.status === 'requires_capture') {
    const cancelled = await stripePostForm(
      `/v1/payment_intents/${encodeURIComponent(piId)}/cancel`,
      ctx.stripeKey,
      null,
      `ride-cancel-pi-${booking.id}`
    );
    if (!cancelled.ok) throw new Error(cancelled.error || 'Annulation autorisation Stripe impossible');
    return { action: 'autorisation_liberee' };
  }

  if (pi.status === 'succeeded') {
    const params = new URLSearchParams({ payment_intent: piId, reason: 'requested_by_customer' });
    const refund = await stripePostForm('/v1/refunds', ctx.stripeKey, params, `ride-refund-${booking.id}`);
    if (!refund.ok) throw new Error(refund.error || 'Remboursement Stripe impossible');
    return { action: 'rembourse' };
  }

  return { action: 'rien_a_rembourser_' + pi.status };
}

// Politique d'annulation passager — % configurables via impact_settings.
// Selon le délai avant départ : remboursement passager / part conducteur / part fond de sécurité.
function getPassengerCancelPolicy(settings, hoursUntilDeparture) {
  const s = settings || {};
  const freeH = Math.max(0, toNumber(s.ride_cancel_free_window_h, 24));
  const lateH = Math.max(0, toNumber(s.ride_cancel_late_window_h, 2));
  const h = Number(hoursUntilDeparture);

  if (!Number.isFinite(h) || h >= freeH) {
    return { tier: 'gratuit', refundPct: 100, driverPct: 0, fundPct: 0 };
  }
  if (h >= lateH) {
    return {
      tier: 'partiel',
      refundPct: toNumber(s.ride_cancel_partial_refund_pct, 85),
      driverPct: toNumber(s.ride_cancel_partial_driver_pct, 10),
      fundPct:   toNumber(s.ride_cancel_partial_fund_pct, 5),
    };
  }
  return {
    tier: 'tardif',
    refundPct: toNumber(s.ride_cancel_late_refund_pct, 50),
    driverPct: toNumber(s.ride_cancel_late_driver_pct, 40),
    fundPct:   toNumber(s.ride_cancel_late_fund_pct, 10),
  };
}

function normalizeCancelPolicy(policy, fallback) {
  const fb = fallback || { refundPct: 100, driverPct: 0, fundPct: 0 };
  const refundPct = Number(policy?.refundPct);
  const driverPct = Number(policy?.driverPct);
  const fundPct = Number(policy?.fundPct);
  const values = [refundPct, driverPct, fundPct];
  const total = values.reduce((sum, n) => sum + (Number.isFinite(n) ? n : NaN), 0);
  if (values.some((n) => !Number.isFinite(n) || n < 0 || n > 100) || Math.abs(total - 100) > 0.001) {
    return { ...policy, refundPct: fb.refundPct, driverPct: fb.driverPct, fundPct: fb.fundPct, policy_warning: 'invalid_split_fallback' };
  }
  return { ...policy, refundPct, driverPct, fundPct };
}

// Verse un montant au conducteur via Stripe Connect (son "portefeuille" réel).
// Retourne l'id du transfert, ou null si pas de compte actif (montant alors gardé au fond).
async function transferToDriverConnect(ctx, driverId, amountCents, currency, sourceCharge, bookingId) {
  if (!ctx.stripeKey || !driverId || !(amountCents > 0)) return { status: 'manual_review', transferId: null, reason: 'missing_context' };
  const acctRes = await fetch(
    `${ctx.sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${driverId}&select=stripe_account_id,status&limit=1`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const acct = acctRes.ok ? (await acctRes.json())[0] : null;
  if (!acct || !acct.stripe_account_id || acct.status !== 'active') {
    return { status: 'manual_review', transferId: null, reason: 'connect_inactive' };
  }
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: currency || 'cad',
    destination: acct.stripe_account_id,
    description: 'PorteaPorte dedommagement annulation ' + String(bookingId).slice(0, 8),
  });
  if (sourceCharge) params.set('source_transaction', sourceCharge);
  const tr = await stripePostForm('/v1/transfers', ctx.stripeKey, params, 'ride-comp-tr-' + bookingId);
  if (!tr.ok) return { status: 'manual_review', transferId: null, reason: tr.error || 'transfer_failed' };
  return { status: 'complete', transferId: tr.data?.id || null, reason: null };
}

// Écrit une ligne au grand livre (table transactions) — fond de sécurité ou dédommagement.
// Retourne { ok } : ok=false si l'écriture échoue (pour signaler une revue admin).
async function recordRideLedger(ctx, { userId, type, montant, description, metadata, piId, statut = 'complete' }) {
  if (!(montant > 0)) return { ok: true, skipped: true };
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transactions`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      user_id: userId || null,
      livraison_id: null,
      type,
      montant: Math.round(montant * 100) / 100,
      statut,
      description: description || type,
      stripe_payment_intent: piId || null,
      metadata: metadata || {},
    }),
  }).catch(() => null);
  return { ok: !!(r && r.ok) };
}

async function rideCancel(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { booking_id, ride_id } = body;

  if (booking_id) {
    const bRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${booking_id}&select=id,passenger_id,ride_id,seats_reserved,status,total_passenger,driver_amount,stripe_payment_intent,payment_currency`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const bRows = bRes.ok ? await bRes.json() : [];
    if (!bRows.length) return res.status(404).json({ error: 'Réservation introuvable' });

    const b = bRows[0];
    if (b.passenger_id !== ctx.session.id && ctx.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    if (['annule_passager','annule_chauffeur','complete'].includes(b.status)) {
      return res.status(400).json({ error: 'Réservation déjà annulée ou complétée' });
    }

    // Trajet : délai avant départ + conducteur + places
    const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${b.ride_id}&select=id,driver_id,departure_time,available_seats`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const ride = rRes.ok ? (await rRes.json())[0] : null;

    // Politique configurable selon le délai avant départ
    const settings  = await getRideSettings(ctx);
    const depMs      = ride?.departure_time ? new Date(ride.departure_time).getTime() : null;
    const hoursUntil = depMs ? (depMs - Date.now()) / 3600000 : Infinity;
    const rawPolicy  = getPassengerCancelPolicy(settings, hoursUntil);
    const policy     = normalizeCancelPolicy(
      rawPolicy,
      rawPolicy.tier === 'tardif'
        ? { refundPct: 50, driverPct: 40, fundPct: 10 }
        : rawPolicy.tier === 'partiel'
          ? { refundPct: 85, driverPct: 10, fundPct: 5 }
          : { refundPct: 100, driverPct: 0, fundPct: 0 }
    );

    const currency        = b.payment_currency || 'cad';
    const totalCents      = Math.round((Number(b.total_passenger) || 0) * 100);
    const driverCompCents = Math.round(totalCents * policy.driverPct / 100);
    const fundCents       = Math.round(totalCents * policy.fundPct   / 100);
    const retainedCents   = driverCompCents + fundCents;      // prélevé (pénalité)
    const refundCents     = totalCents - retainedCents;       // rendu au passager

    // Application Stripe selon l'état du paiement
    let stripeAction = 'aucun_paiement';
    const piId   = b.stripe_payment_intent;
    const isReal = piId && !/pi_X{4,}/i.test(piId) && !/pi_TEST/i.test(piId) && piId.length >= 20;
    let driverTransfer = { status: 'not_applicable', transferId: null, reason: null };

    if (isReal && !ctx.stripeKey) {
      return res.status(503).json({ error: 'Stripe non configure: annulation paiement impossible' });
    }
    if (isReal && ctx.stripeKey) {
      const pi = await stripeGetPaymentIntent(piId, ctx.stripeKey);
      if (!pi) return res.status(502).json({ error: 'PaymentIntent Stripe introuvable: annulation bloquee' });
      if (pi && pi.status === 'requires_capture') {
        if (retainedCents <= 0) {
          const cancelPi = await stripePostForm(
            `/v1/payment_intents/${encodeURIComponent(piId)}/cancel`,
            ctx.stripeKey,
            null,
            `ride-cxl-cancel-${b.id}`
          );
          if (!cancelPi.ok) return res.status(502).json({ error: cancelPi.error || 'Annulation autorisation Stripe impossible' });
          stripeAction = 'autorisation_liberee';
        } else {
          // Capture partielle : on prélève juste la pénalité, Stripe rend le reste au passager
          const capRes = await stripePostForm(
            `/v1/payment_intents/${encodeURIComponent(piId)}/capture`,
            ctx.stripeKey,
            new URLSearchParams({ amount_to_capture: String(retainedCents) }),
            `ride-cxl-cap-${b.id}`
          );
          if (!capRes.ok) return res.status(502).json({ error: capRes.error || 'Capture partielle Stripe impossible' });
          const capPi = capRes.data || {};
          stripeAction = 'capture_partielle';
          if (driverCompCents > 0 && capPi.latest_charge && ride?.driver_id) {
            driverTransfer = await transferToDriverConnect(ctx, ride.driver_id, driverCompCents, currency, capPi.latest_charge, b.id);
            if (driverTransfer.status !== 'complete') stripeAction += '_conducteur_en_attente';
          }
        }
      } else if (pi && pi.status === 'succeeded') {
        // Déjà capturé : remboursement partiel du passager
        if (refundCents > 0) {
          const refundRes = await stripePostForm(
            '/v1/refunds',
            ctx.stripeKey,
            new URLSearchParams({ payment_intent: piId, amount: String(refundCents), reason: 'requested_by_customer' }),
            `ride-cxl-refund-${b.id}`
          );
          if (!refundRes.ok) return res.status(502).json({ error: refundRes.error || 'Remboursement Stripe impossible' });
        }
        stripeAction = 'remboursement_partiel';
        if (driverCompCents > 0 && ride?.driver_id) {
          driverTransfer = await transferToDriverConnect(ctx, ride.driver_id, driverCompCents, currency, pi.latest_charge, b.id);
          if (driverTransfer.status !== 'complete') stripeAction += '_conducteur_en_attente';
        }
      } else if (pi) {
        stripeAction = 'rien_' + pi.status;
      }
    }

    // Grand livre : fond de sécurité + dédommagement conducteur
    const reviewFlags = [];
    const meta = { ride_id: b.ride_id, booking_id: b.id, tier: policy.tier, hours_until_departure: Math.round(hoursUntil * 10) / 10 };
    const fundLedger = await recordRideLedger(ctx, { userId: null,                type: 'fond_securite_covoiturage',  montant: fundCents / 100,       description: `Fond de sécurité — annulation ${policy.tier}`,        metadata: { ...meta, stripe_action: stripeAction }, piId });
    if (!fundLedger.ok) reviewFlags.push('fond_securite_covoiturage');
    const compLedger = await recordRideLedger(ctx, { userId: ride?.driver_id || null, type: 'dedommagement_covoiturage', montant: driverCompCents / 100, description: `Dédommagement annulation passager (${policy.tier})`, metadata: { ...meta, stripe_action: stripeAction, transfer_id: driverTransfer.transferId, transfer_reason: driverTransfer.reason }, piId, statut: driverTransfer.status === 'complete' ? 'complete' : 'manual_review' });
    if (!compLedger.ok) reviewFlags.push('dedommagement_covoiturage');
    if (driverTransfer.status !== 'complete' && driverTransfer.status !== 'not_applicable') reviewFlags.push('transfert_conducteur');

    // Marque la réservation annulée + libère la place
    const bookingPatch = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${booking_id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule_passager' }),
    });
    if (!bookingPatch.ok) return res.status(502).json({ error: 'Annulation Stripe faite, mais mise a jour reservation impossible: revue admin requise' });
    if (ride) {
      const seatPatch = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${b.ride_id}`, {
        method: 'PATCH',
        headers: sbHeaders(ctx.sbKey),
        body: JSON.stringify({ available_seats: (ride.available_seats || 0) + (b.seats_reserved || 1) }),
      }).catch(() => ({ ok: false }));
      if (!seatPatch.ok) return res.status(502).json({ error: 'Annulation faite, mais liberation de place impossible: revue admin requise' });
    }

    return res.status(200).json({
      success: true,
      action: 'annule_passager',
      tier: policy.tier,
      hours_until_departure: Math.round(hoursUntil * 10) / 10,
      refund: refundCents / 100,
      driver_compensation: driverCompCents / 100,
      security_fund: fundCents / 100,
      stripe_action: stripeAction,
      admin_review_required: reviewFlags.length > 0,
      review_flags: reviewFlags,
    });
  }

  if (ride_id) {
    const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=id,driver_id,status`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const rRows = rRes.ok ? await rRes.json() : [];
    if (!rRows.length) return res.status(404).json({ error: 'Trajet introuvable' });

    const ride = rRows[0];
    if (ride.driver_id !== ctx.session.id && ctx.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Récupère TOUTES les réservations non terminées (en attente, payées/autorisées, capturées)
    const bRes = await fetch(
      `${ctx.sbUrl}/rest/v1/ride_bookings?ride_id=eq.${ride_id}&status=not.in.(annule_passager,annule_chauffeur,complete)&select=id,passenger_id,status,stripe_payment_intent`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    const bookings = bRes.ok ? await bRes.json() : [];

    const refunds = [];
    for (const b of bookings) {
      let action = 'aucun_paiement';
      try {
        const r = await refundRideBooking(ctx, b);
        action = r.action;
      } catch (e) {
        return res.status(502).json({
          error: 'Annulation bloquee: remboursement ou liberation Stripe impossible',
          booking_id: b.id,
          details: e.message || 'Erreur Stripe',
        });
      }
      refunds.push({ booking_id: b.id, passenger_id: b.passenger_id, action });
    }

    const ridePatch = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule' }),
    });
    if (!ridePatch.ok) return res.status(502).json({ error: 'Remboursements faits, mais annulation trajet impossible: revue admin requise' });

    for (const b of bookings) {
      // Marque la réservation comme annulée par le chauffeur
      const bookingPatch = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${b.id}`, {
        method: 'PATCH',
        headers: sbHeaders(ctx.sbKey),
        body: JSON.stringify({ status: 'annule_chauffeur' }),
      }).catch(() => ({ ok: false }));
      if (!bookingPatch.ok) return res.status(502).json({ error: 'Remboursements faits, mais annulation reservation impossible: revue admin requise', booking_id: b.id });
    }

    return res.status(200).json({
      success: true,
      action: 'trajet_annule',
      bookings_affected: refunds.length,
      refunds,
    });
  }

  return res.status(400).json({ error: 'booking_id ou ride_id requis' });
}

// ─── Mes trajets / mes réservations ──────────────────────────────────────────

async function rideMyRides(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const ridesRes = await fetch(
    `${ctx.sbUrl}/rest/v1/rides?driver_id=eq.${ctx.session.id}&order=departure_time.desc&limit=50&select=id,start_city,end_city,departure_time,available_seats,status,total_distance_km,cost_per_km`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const myRides = ridesRes.ok ? await ridesRes.json() : [];

  const bookingsRes = await fetch(
    `${ctx.sbUrl}/rest/v1/ride_bookings?passenger_id=eq.${ctx.session.id}&order=created_at.desc&limit=50&select=id,ride_id,pickup_city,dropoff_city,seats_reserved,total_passenger,driver_amount,status,created_at`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const myBookings = bookingsRes.ok ? await bookingsRes.json() : [];

  return res.status(200).json({ my_rides: myRides, my_bookings: myBookings });
}

// ─── Admin rides ──────────────────────────────────────────────────────────────

async function rideAdmin(req, res, ctx, body) {
  if (ctx.profile?.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });

  const url   = new URL(req.url || '/', 'https://porteaporte.site');
  const limit = Number(body.limit || url.searchParams.get('limit') || 100);

  const [ridesRes, bookingsRes, reportsRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/rides?order=created_at.desc&limit=${limit}&select=*,driver_profile:profiles!driver_id(prenom)`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?order=created_at.desc&limit=${limit}&select=*,passenger_profile:profiles!passenger_id(prenom)`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_reports?order=created_at.desc&limit=50&select=*,reporter_profile:profiles!reporter_id(prenom)`, { headers: sbHeaders(ctx.sbKey) }),
  ]);

  const rides    = ridesRes.ok    ? (await ridesRes.json()).map(r => ({ ...r, driver_prenom: r.driver_profile?.prenom || null, driver_profile: undefined }))       : [];
  const bookings = bookingsRes.ok ? (await bookingsRes.json()).map(b => ({ ...b, passenger_prenom: b.passenger_profile?.prenom || null, passenger_profile: undefined })) : [];
  const reports  = reportsRes.ok  ? (await reportsRes.json()).map(r => ({ ...r, reporter_prenom: r.reporter_profile?.prenom || null, reporter_profile: undefined }))    : [];

  return res.status(200).json({ rides, bookings, reports });
}

// ─── Signalement ──────────────────────────────────────────────────────────────

async function rideReport(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { ride_id, booking_id, reported_id, reason, details } = body;
  if (!reason) return res.status(400).json({ error: 'reason requis' });

  const r = await fetch(`${ctx.sbUrl}/rest/v1/ride_reports`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      ride_id:     ride_id    || null,
      booking_id:  booking_id || null,
      reporter_id: ctx.session.id,
      reported_id: reported_id || null,
      reason:      String(reason).slice(0, 200),
      details:     details ? String(details).slice(0, 1000) : null,
      status: 'ouvert',
    }),
  });

  if (!r.ok) return res.status(400).json({ error: 'Signalement impossible' });
  return res.status(200).json({ success: true, message: 'Signalement reçu. Notre équipe va examiner.' });
}

// ─── Réservation colis ────────────────────────────────────────────────────────

async function ridePackageBook(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { ride_id, pickup_city, dropoff_city, package_weight_kg,
          package_description, pickup_point_id, dropoff_point_id,
          pickup_sector, dropoff_sector } = body;

  if (!ride_id || !pickup_city || !dropoff_city) {
    return res.status(400).json({ error: 'ride_id, pickup_city, dropoff_city requis' });
  }
  if (!package_weight_kg || Number(package_weight_kg) <= 0) {
    return res.status(400).json({ error: 'package_weight_kg requis' });
  }

  const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=id,driver_id,status,accepts_packages,package_max_kg,package_max_dim_cm,total_distance_km,cost_per_km,commission_free`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const rRows = rRes.ok ? await rRes.json() : [];
  if (!rRows.length) return res.status(404).json({ error: 'Trajet introuvable' });

  const ride = rRows[0];
  if (ride.status !== 'publie') return res.status(400).json({ error: 'Trajet non disponible' });
  if (!ride.accepts_packages)  return res.status(400).json({ error: 'Ce chauffeur n\'accepte pas de colis' });
  if (ride.driver_id === ctx.session.id) return res.status(400).json({ error: 'Vous ne pouvez pas réserver votre propre trajet' });

  const kg = Number(package_weight_kg);
  if (kg > (ride.package_max_kg || 10)) {
    return res.status(400).json({ error: `Poids maximum accepté : ${ride.package_max_kg} kg` });
  }

  const settings     = await getRideSettings(ctx);
  const packageFee   = calcPackageFee(kg, settings);
  // Frais plateforme configurable (source unique : impact_settings.ride_platform_fee)
  const platformFeePerSeat = Math.max(RIDE_PLATFORM_FEE_MIN, toNumber(settings.ride_platform_fee, RIDE_PLATFORM_FEE));
  // Franchise « N premiers trajets sans commission » figée à la publication du trajet
  const platformFee  = ride.commission_free ? 0 : Math.round(platformFeePerSeat * 100) / 100;
  const totalPays    = Math.round((packageFee + platformFee) * 100) / 100;
  const driverAmount = packageFee;

  const booking = {
    ride_id,
    passenger_id:        ctx.session.id,
    booking_type:        'package',
    pickup_city:         String(pickup_city).trim(),
    pickup_sector:       pickup_sector ? String(pickup_sector).trim() : null,
    dropoff_city:        String(dropoff_city).trim(),
    dropoff_sector:      dropoff_sector ? String(dropoff_sector).trim() : null,
    pickup_point_id:     pickup_point_id || null,
    dropoff_point_id:    dropoff_point_id || null,
    seats_reserved:      0,
    package_weight_kg:   kg,
    package_description: package_description ? String(package_description).slice(0, 300) : null,
    package_fee:         packageFee,
    platform_fee:        platformFee,
    driver_amount:       driverAmount,
    total_passenger:     totalPays,
    base_share:          0,
    luggage_fee:         0,
    pet_fee:             0,
    stop_fee:            0,
    detour_fee:          0,
    status:              'en_attente',
  };

  const bRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
    body: JSON.stringify(booking),
  });
  const bData = await bRes.json().catch(() => ({}));
  if (!bRes.ok) return res.status(400).json({ error: 'Réservation colis impossible', details: bData });

  const saved = Array.isArray(bData) ? bData[0] : bData;
  return res.status(200).json({
    success: true,
    booking: saved,
    price_breakdown: {
      package_fee:   packageFee,
      platform_fee:  platformFee,
      total_pays:    totalPays,
      driver_receives: driverAmount,
      note: `Frais de base ${RIDE_FEE_PACKAGE_BASE}$ + ${Math.max(0, kg - 5).toFixed(1)} kg sup. × ${RIDE_FEE_PACKAGE_PER_KG}$/kg`,
    },
  });
}

// ─── Points de rencontre sécuritaires ────────────────────────────────────────

async function safeMeetingPoints(req, res, ctx, body) {
  const url    = new URL(req.url || '/', 'https://porteaporte.site');
  const city   = body.city || url.searchParams.get('city') || '';
  const sector = body.sector || url.searchParams.get('sector') || '';
  const type   = body.type || url.searchParams.get('type') || '';
  const usageType = body.usage_type || body.usageType || url.searchParams.get('usage_type') || '';
  const status = body.status || url.searchParams.get('status') || '';
  const limit = Math.min(200, Math.max(1, Number(body.limit || url.searchParams.get('limit') || 100) || 100));

  let filter = `active=eq.true&order=verified.desc,name.asc&limit=${limit}`;
  if (city)   filter += `&city=ilike.*${encodeURIComponent(city)}*`;
  if (sector) filter += `&sector=ilike.*${encodeURIComponent(sector)}*`;
  if (type)   filter += `&type=eq.${type}`;

  // Schema fallback : on tente avec toutes les colonnes, on retombe sur basique si une manque
  const fullCols = 'id,name,type,address,city,sector,lat,lng,verified,hours,notes,photo_url,has_cameras,well_lit,parking_free,region,usage_type,place_category,safety_score,verification_source,status,partnership_status,winter_accessible,camera_possible,public_transit_nearby,open_evening,easy_parking,notes_public,report_count,usage_count,last_reviewed_at';
  const baseCols = 'id,name,type,address,city,lat,lng,verified';
  let points = [];
  let r = await fetch(`${ctx.sbUrl}/rest/v1/safe_meeting_points?${filter}&select=${fullCols}`, {
    headers: sbHeaders(ctx.sbKey),
  });
  if (r.ok) {
    points = await r.json();
  } else {
    // Repli si colonnes manquantes
    r = await fetch(`${ctx.sbUrl}/rest/v1/safe_meeting_points?${filter}&select=${baseCols}`, {
      headers: sbHeaders(ctx.sbKey),
    });
    points = r.ok ? await r.json() : [];
  }

  const wantedUsage = String(usageType || '').toLowerCase();
  const wantedStatus = String(status || '').toLowerCase();
  points = (Array.isArray(points) ? points : [])
    .filter((p) => {
      const pointUsage = String(p.usage_type || p.type || '').toLowerCase();
      const pointStatus = String(p.status || (p.verified ? 'verified' : 'suggested')).toLowerCase();
      if (wantedUsage && pointUsage && !['both', 'les_deux', 'les deux'].includes(pointUsage) && pointUsage !== wantedUsage) return false;
      if (wantedStatus && pointStatus !== wantedStatus) return false;
      return true;
    })
    .map((p) => ({
      ...p,
      status: p.status || (p.verified ? 'verified' : 'suggested'),
      usage_type: p.usage_type || 'both',
      safety_score: Number.isFinite(Number(p.safety_score)) ? Number(p.safety_score) : (p.verified ? 80 : 65),
      partnership_status: p.partnership_status || 'suggested_public_place',
      public_label: p.partnership_status === 'official_partner'
        ? 'Partenaire officiel'
        : (p.verified ? 'Point public verifie' : 'Point public suggere'),
      disclaimer: p.partnership_status === 'official_partner'
        ? 'Partenaire officiel PorteaPorte.'
        : 'Lieu public suggere pour faciliter la rencontre; ce lieu n est pas presente comme partenaire.'
    }))
    .sort((a, b) => (b.verified === true) - (a.verified === true) || (b.safety_score || 0) - (a.safety_score || 0) || String(a.name || '').localeCompare(String(b.name || '')));

  return res.status(200).json({
    success: true,
    points,
    disclaimer: 'Les lieux non partenaires sont des points publics suggeres. PorteaPorte ne presente pas un commerce comme partenaire sans autorisation.'
  });
}

// ─── Tableau de bord covoiturage ──────────────────────────────────────────────

async function covDashboard(req, res, ctx) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  const uid = ctx.session.id;

  const [
    ridesRes, bookingsRes,
    missionsRes, badgesRes, reportsRes, reviewsRes
  ] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/rides?driver_id=eq.${uid}&order=departure_time.desc&limit=50&select=*`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?passenger_id=eq.${uid}&order=created_at.desc&limit=50&select=*,ride:rides(driver_id,start_city,end_city,departure_time,driver:profiles!driver_id(prenom,email,telephone))`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/user_cov_missions?user_id=eq.${uid}&select=*,mission:cov_missions(*)`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/user_cov_badges?user_id=eq.${uid}&select=*,badge:cov_badges(*)`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_reports?reporter_id=eq.${uid}&order=created_at.desc&limit=20&select=*`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/cov_reviews?reviewed_id=eq.${uid}&order=created_at.desc&limit=20&select=*`, { headers: sbHeaders(ctx.sbKey) }),
  ]);

  const myRides = ridesRes.ok ? await ridesRes.json() : [];
  const rawMissions = missionsRes.ok ? await missionsRes.json() : [];
  const rawBadges   = badgesRes.ok   ? await badgesRes.json()   : [];

  const allBadgesRes = await fetch(`${ctx.sbUrl}/rest/v1/cov_badges?select=*`, { headers: sbHeaders(ctx.sbKey) });
  const allBadges    = allBadgesRes.ok ? await allBadgesRes.json() : [];
  const earnedSlugs  = rawBadges.map(b => b.badge?.slug);

  const badges = allBadges.map(b => ({
    ...b,
    earned:    earnedSlugs.includes(b.slug),
    earned_at: rawBadges.find(ub => ub.badge?.slug === b.slug)?.earned_at || null,
  }));

  const allMissionsRes = await fetch(`${ctx.sbUrl}/rest/v1/cov_missions?active=eq.true&select=*`, { headers: sbHeaders(ctx.sbKey) });
  const allMissions    = allMissionsRes.ok ? await allMissionsRes.json() : [];
  const missions = allMissions.map(m => {
    const progress = rawMissions.find(um => um.mission_id === m.id);
    return {
      ...m,
      progress:     progress?.progress || 0,
      done:         progress?.done     || false,
      completed_at: progress?.completed_at || null,
    };
  });

  const rideIds = safeIds(myRides.map(r => r.id));
  let receivedRows = [];
  if (rideIds.length) {
    // Inclut la carte animal complète si le passager voyage avec un animal
    const receivedRes = await fetch(
      `${ctx.sbUrl}/rest/v1/ride_bookings?ride_id=in.(${rideIds.join(',')})&select=*,passenger_profile:profiles!passenger_id(prenom,email,telephone,pet_name,pet_species,pet_breed,pet_size,pet_weight_kg,pet_photo_url,pet_photo_status,pet_vaccinated,pet_carrier,pet_notes)&order=created_at.desc&limit=100`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    receivedRows = receivedRes.ok ? await receivedRes.json() : [];
  }

  const receivedBookings = receivedRows.map(b => {
    const pp = b.passenger_profile || {};
    return {
      ...b,
      passenger_prenom: pp.prenom || null,
      passenger_email: pp.email || null,
      passenger_phone: pp.telephone || null,
      // Carte animal — visible seulement si la réservation indique has_pet=true et photo approuvée
      passenger_pet: b.has_pet ? {
        name: pp.pet_name,
        species: pp.pet_species,
        breed: pp.pet_breed,
        size: pp.pet_size,
        weight_kg: pp.pet_weight_kg,
        photo_url: pp.pet_photo_status === 'approved' ? pp.pet_photo_url : null,
        photo_status: pp.pet_photo_status,
        vaccinated: pp.pet_vaccinated,
        carrier: pp.pet_carrier,
        notes: pp.pet_notes
      } : null,
      passenger_profile: undefined
    };
  });

  // Enrichir my_bookings avec infos driver pour bouton "Contacter conducteur"
  const myBookingsRaw = bookingsRes.ok ? await bookingsRes.json() : [];
  const myBookings = myBookingsRaw.map(b => ({
    ...b,
    driver_prenom: b.ride?.driver?.prenom || null,
    driver_email:  b.ride?.driver?.email || null,
    driver_phone:  b.ride?.driver?.telephone || null,
    ride: undefined
  }));

  return res.status(200).json({
    my_rides:      myRides,
    my_bookings:   myBookings,
    ride_bookings: receivedBookings,
    missions,
    badges,
    reports:       reportsRes.ok    ? await reportsRes.json()    : [],
    reviews:       reviewsRes.ok    ? await reviewsRes.json()    : [],
  });
}

// ─── Onboarding covoiturage ───────────────────────────────────────────────────

async function covOnboard(req, res, ctx) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  const uid = ctx.session.id;

  const badgeRes = await fetch(`${ctx.sbUrl}/rest/v1/cov_badges?slug=eq.nouveau_covoitureur&select=id`, { headers: sbHeaders(ctx.sbKey) });
  const badges   = badgeRes.ok ? await badgeRes.json() : [];
  if (badges[0]) {
    await fetch(`${ctx.sbUrl}/rest/v1/user_cov_badges`, {
      method: 'POST',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ user_id: uid, badge_id: badges[0].id }),
    });
  }

  await covGrantXP(ctx, uid, 50, 'Inscription covoiturage');

  return res.status(200).json({ success: true, xp: 50, badge: 'nouveau_covoitureur' });
}

// ─── Progression missions covoiturage ────────────────────────────────────────

async function covProgress(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  const uid    = ctx.session.id;
  const { event, ride_id, booking_id, distance_km, passenger_count } = body;

  if (!event) return res.status(400).json({ error: 'event requis' });

  const missionsRes = await fetch(`${ctx.sbUrl}/rest/v1/cov_missions?active=eq.true&select=*`, { headers: sbHeaders(ctx.sbKey) });
  const missions    = missionsRes.ok ? await missionsRes.json() : [];

  const updates = [];

  for (const mission of missions) {
    const qualifies = await missionQualifies(mission.slug, event, { distance_km, passenger_count });
    if (!qualifies) continue;

    const progRes = await fetch(`${ctx.sbUrl}/rest/v1/user_cov_missions?user_id=eq.${uid}&mission_id=eq.${mission.id}&select=*`, { headers: sbHeaders(ctx.sbKey) });
    const progs   = progRes.ok ? await progRes.json() : [];
    const current = progs[0];

    if (current?.done) continue;

    const newProg = (current?.progress || 0) + 1;
    const done    = newProg >= mission.target;

    if (current) {
      await fetch(`${ctx.sbUrl}/rest/v1/user_cov_missions?id=eq.${current.id}`, {
        method: 'PATCH',
        headers: sbHeaders(ctx.sbKey),
        body: JSON.stringify({ progress: newProg, done, completed_at: done ? new Date().toISOString() : null }),
      });
    } else {
      await fetch(`${ctx.sbUrl}/rest/v1/user_cov_missions`, {
        method: 'POST',
        headers: sbHeaders(ctx.sbKey),
        body: JSON.stringify({ user_id: uid, mission_id: mission.id, progress: newProg, done, completed_at: done ? new Date().toISOString() : null }),
      });
    }

    if (done) {
      await covGrantXP(ctx, uid, mission.xp_reward, `Mission: ${mission.name}`);

      if (mission.badge_slug) {
        const bRes = await fetch(`${ctx.sbUrl}/rest/v1/cov_badges?slug=eq.${mission.badge_slug}&select=id`, { headers: sbHeaders(ctx.sbKey) });
        const bs   = bRes.ok ? await bRes.json() : [];
        if (bs[0]) {
          await fetch(`${ctx.sbUrl}/rest/v1/user_cov_badges`, {
            method: 'POST',
            headers: sbHeaders(ctx.sbKey),
            body: JSON.stringify({ user_id: uid, badge_id: bs[0].id }),
          });
        }
      }
      updates.push({ mission: mission.slug, xp: mission.xp_reward, badge: mission.badge_slug });
    }
  }

  // ─── Récompense « conducteur vert » (graduée selon l'énergie) ───────────────
  //   Jamais sur le prix : uniquement XP + badge. L'énergie est lue côté serveur
  //   (sur le trajet réel) pour qu'on ne puisse pas tricher en envoyant un faux event.
  if (event === 'ride_complete' && ride_id) {
    const grRes  = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=driver_id,energy_type&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    const grRows = grRes.ok ? await grRes.json() : [];
    const gRide  = grRows[0];
    // Seul le conducteur du trajet touche la récompense verte.
    if (gRide && gRide.driver_id === uid) {
      const energy      = String(gRide.energy_type || 'essence').toLowerCase();
      const GREEN_XP    = { electrique: 30, hybride: 15 };
      const GREEN_BADGE = { electrique: 'conducteur_vert_or', hybride: 'conducteur_vert_argent' };
      const bonusXp     = GREEN_XP[energy] || 0;
      if (bonusXp > 0) {
        await covGrantXP(ctx, uid, bonusXp, `Trajet vert (${energy})`);
        updates.push({ green_xp: bonusXp, energy });
      }
      const badgeSlug = GREEN_BADGE[energy];
      if (badgeSlug) {
        const bRes = await fetch(`${ctx.sbUrl}/rest/v1/cov_badges?slug=eq.${badgeSlug}&select=id`, { headers: sbHeaders(ctx.sbKey) });
        const bs   = bRes.ok ? await bRes.json() : [];
        if (bs[0]) {
          // N'insère le badge qu'une seule fois (table UNIQUE user_id+badge_id).
          const haveRes = await fetch(`${ctx.sbUrl}/rest/v1/user_cov_badges?user_id=eq.${uid}&badge_id=eq.${bs[0].id}&select=id&limit=1`, { headers: sbHeaders(ctx.sbKey) });
          const have    = haveRes.ok ? await haveRes.json() : [];
          if (!have.length) {
            await fetch(`${ctx.sbUrl}/rest/v1/user_cov_badges`, {
              method: 'POST',
              headers: sbHeaders(ctx.sbKey),
              body: JSON.stringify({ user_id: uid, badge_id: bs[0].id }),
            });
            updates.push({ green_badge: badgeSlug });
          }
        }
      }
    }
  }

  return res.status(200).json({ success: true, updates });
}

// ─── Helpers XP covoiturage ───────────────────────────────────────────────────

async function covGrantXP(ctx, uid, amount, reason) {
  await fetch(`${ctx.sbUrl}/rest/v1/cov_xp_log`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ user_id: uid, amount, reason }),
  });
  const profRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${uid}&select=cov_xp`, { headers: sbHeaders(ctx.sbKey) });
  const profs   = profRes.ok ? await profRes.json() : [];
  const current = profs[0]?.cov_xp || 0;
  const newXp   = current + amount;
  const level   = newXp >= 2000 ? 5 : newXp >= 1000 ? 4 : newXp >= 500 ? 3 : newXp >= 200 ? 2 : 1;
  await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ cov_xp: newXp, cov_level: level }),
  });
  const gXp = (profs[0]?.xp || 0) + amount;
  await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ xp: gXp }),
  });
}

function missionQualifies(slug, event, { distance_km = 0, passenger_count = 0 }) {
  switch (slug) {
    case 'premier_trajet':     return event === 'ride_complete';
    case 'cinq_trajets':       return event === 'ride_complete';
    case 'dix_trajets':        return event === 'ride_complete';
    case 'ponctualite':        return event === 'ride_complete';
    case 'ambassadeur':        return event === 'ride_complete';
    case 'trajet_complet':     return event === 'ride_full';
    case 'groupe_optimise':    return event === 'ride_full';
    case 'eco_route':          return event === 'ride_complete' && distance_km >= 50 && passenger_count >= 2;
    case 'aide_communautaire': return event === 'community_help';
    case 'route_regionale':    return event === 'ride_complete' && distance_km >= 80;
    case 'grand_explorateur':  return event === 'ride_complete' && distance_km >= 200;
    case 'premier_avis':       return event === 'review_left';
    default: return false;
  }
}

// ─── CAPTURE COVOIT : libère le paiement vers le conducteur après le trajet ─
// Endpoint: 'ride-capture-eligible'
// Usage: passe booking_id pour capturer UN booking, sinon (admin only) liste tous les éligibles
async function rideCaptureEligible(req, res, ctx, body) {
  try {
    if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
    body = body || {};

    const stripeKey = ctx.stripeKey || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

    const isAdmin = ctx.profile && ctx.profile.role === 'admin';
    const graceHours = Math.max(0, Math.min(168, Number(body.grace_hours || 4)));

    // Récupération des bookings à traiter
    let bookings = [];
    if (body.booking_id) {
      const bRes = await fetch(ctx.sbUrl + '/rest/v1/ride_bookings?id=eq.' + body.booking_id + '&select=*&limit=1', {
        headers: sbHeaders(ctx.sbKey)
      });
      const rows = bRes.ok ? await bRes.json() : [];
      const b = rows[0];
      if (!b) return res.status(404).json({ error: 'Reservation introuvable' });
      // Vérifier permission : admin OU passager OU conducteur du trajet
      let isDriver = false;
      if (!isAdmin && b.passenger_id !== ctx.session.id) {
        const rRes = await fetch(ctx.sbUrl + '/rest/v1/rides?id=eq.' + b.ride_id + '&select=driver_id&limit=1', {
          headers: sbHeaders(ctx.sbKey)
        });
        const r = rRes.ok ? (await rRes.json())[0] : null;
        isDriver = r && r.driver_id === ctx.session.id;
        if (!isDriver) return res.status(403).json({ error: 'Non autorise' });
      }
      bookings = [b];
    } else {
      if (!isAdmin) return res.status(403).json({ error: 'Admin requis pour lister tous les eligibles' });
      const url = ctx.sbUrl + '/rest/v1/ride_bookings?status=eq.confirme&paid_at=is.null&select=*&order=created_at.asc&limit=100';
      const r = await fetch(url, { headers: sbHeaders(ctx.sbKey) });
      bookings = r.ok ? await r.json() : [];
    }

    if (!bookings.length) {
      return res.status(200).json({ captured: [], skipped: [], errors: [], total: 0 });
    }

    const captured = [];
    const skipped = [];
    const errors = [];

    for (const booking of bookings) {
      try {
        const piId = booking.stripe_payment_intent;
        if (!piId) {
          skipped.push({ booking_id: booking.id, reason: 'No PaymentIntent' });
          continue;
        }

        // Placeholder PI : marque payé sans Stripe
        const isPlaceholder = /pi_X{4,}/i.test(piId) || /pi_TEST/i.test(piId) || piId.length < 20;
        if (isPlaceholder) {
          await fetch(ctx.sbUrl + '/rest/v1/ride_bookings?id=eq.' + booking.id, {
            method: 'PATCH',
            headers: sbHeaders(ctx.sbKey),
            body: JSON.stringify({ status: 'paye', paid_at: new Date().toISOString() })
          });
          captured.push({ booking_id: booking.id, amount: booking.driver_amount, transfer_id: null, note: 'placeholder' });
          continue;
        }

        // 1) Capture le PaymentIntent (si pas déjà capturé)
        let pi = null;
        const captureRes = await fetch('https://api.stripe.com/v1/payment_intents/' + piId + '/capture', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + stripeKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': 'ride-cap-' + booking.id
          }
        });
        const capData = await captureRes.json();
        if (captureRes.ok) {
          pi = capData;
        } else if (capData.error && capData.error.code === 'payment_intent_unexpected_state') {
          // Déjà capturé : récupère le PI actuel
          const getRes = await fetch('https://api.stripe.com/v1/payment_intents/' + piId, {
            headers: { 'Authorization': 'Bearer ' + stripeKey }
          });
          pi = await getRes.json();
        } else {
          errors.push({ booking_id: booking.id, error: (capData.error && capData.error.message) || 'Capture failed' });
          continue;
        }

        // 2) Transfer au conducteur via Stripe Connect (best-effort)
        let transferId = null;
        const driverAmountCents = Math.round((booking.driver_amount || 0) * 100);
        if (driverAmountCents > 0 && pi && pi.latest_charge) {
          const rideRes = await fetch(ctx.sbUrl + '/rest/v1/rides?id=eq.' + booking.ride_id + '&select=driver_id&limit=1', {
            headers: sbHeaders(ctx.sbKey)
          });
          const ride = rideRes.ok ? (await rideRes.json())[0] : null;
          if (ride && ride.driver_id) {
            const acctRes = await fetch(ctx.sbUrl + '/rest/v1/stripe_connect_accounts?user_id=eq.' + ride.driver_id + '&select=stripe_account_id,status&limit=1', {
              headers: sbHeaders(ctx.sbKey)
            });
            const acct = acctRes.ok ? (await acctRes.json())[0] : null;
            if (acct && acct.stripe_account_id && acct.status === 'active') {
              const params = new URLSearchParams({
                amount: String(driverAmountCents),
                currency: pi.currency || 'cad',
                destination: acct.stripe_account_id,
                source_transaction: pi.latest_charge,
                description: 'PorteaPorte covoit booking ' + booking.id.slice(0, 8)
              });
              const tr = await fetch('https://api.stripe.com/v1/transfers', {
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + stripeKey,
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Idempotency-Key': 'ride-tr-' + booking.id
                },
                body: params
              });
              if (tr.ok) {
                const trData = await tr.json();
                transferId = trData.id;
              }
            }
          }
        }

        // 3) Marque payé en BDD
        await fetch(ctx.sbUrl + '/rest/v1/ride_bookings?id=eq.' + booking.id, {
          method: 'PATCH',
          headers: sbHeaders(ctx.sbKey),
          body: JSON.stringify({ status: 'paye', paid_at: new Date().toISOString() })
        });

        captured.push({
          booking_id: booking.id,
          amount: booking.driver_amount,
          transfer_id: transferId,
          payment_intent: pi.id
        });
      } catch (e) {
        errors.push({ booking_id: booking.id, error: e.message });
      }
    }

    return res.status(200).json({ total: bookings.length, captured, skipped, errors });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur interne', details: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Partage Facebook : page OG (carte FB) + image PNG dynamique par trajet
// ──────────────────────────────────────────────────────────────────────────
function _ogEscapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function _ogEscapeXml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[c]));
}
async function _ogFetchRide(ctx, rideId) {
  if (!rideId) return null;
  const base = 'start_city,end_city,departure_time,available_seats,total_distance_km,cost_per_km,status';
  const extra = ',accepts_pets,accepts_large_luggage,accepts_packages,accepts_extra_stops,smoking_policy,women_only,ac_available,trunk_size';
  const tryFetch = async (cols) => {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${encodeURIComponent(rideId)}&select=${cols}&limit=1`, {
      headers: sbHeaders(ctx.sbKey),
    });
    if (!r.ok) return undefined; // colonne inexistante → on signale l'échec pour le repli
    const rows = await r.json();
    return rows[0] || null;
  };
  try {
    let row = await tryFetch(base + extra);
    if (row === undefined) row = await tryFetch(base);
    return row || null;
  } catch (_) { return null; }
}
function _ogRideFacts(ride) {
  const price = Math.max(0, Math.round((Number(ride.cost_per_km) || 0) * (Number(ride.total_distance_km) || 0)));
  let dateStr = '';
  try {
    if (ride.departure_time) {
      let raw = String(ride.departure_time).trim();
      let d = new Date(raw);
      if (isNaN(d)) {
        // Normalise les formats type "2026-05-31 23:00:00+00" ou "...T23:00:00+00"
        let norm = raw.replace(' ', 'T');
        norm = norm.replace(/([+-]\d{2})$/, '$1:00'); // ajoute les minutes au décalage si absentes
        d = new Date(norm);
      }
      if (!isNaN(d)) {
        dateStr = d.toLocaleString('fr-CA', {
          weekday: 'long', day: 'numeric', month: 'long',
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto',
        });
      }
    }
  } catch (_) {}
  return { price, dateStr, seats: Number(ride.available_seats) || 0, options: _ogRideOptions(ride) };
}

// Liste des options du trajet à afficher sous forme de pastilles (max 6).
function _ogRideOptions(ride) {
  const opts = [];
  if (ride.accepts_pets) opts.push('Animaux acceptés');
  if (ride.accepts_large_luggage) opts.push('Gros bagages');
  if (ride.trunk_size === 'grand') opts.push('Grand coffre');
  if (ride.accepts_packages) opts.push('Colis acceptés');
  if (ride.smoking_policy === 'non_fumeur') opts.push('Non-fumeur');
  if (ride.women_only) opts.push('Entre femmes');
  if (ride.ac_available) opts.push('Climatisé');
  if (ride.accepts_extra_stops) opts.push('Arrêts possibles');
  return opts.slice(0, 6);
}

// Dessine une rangée unique de pastilles d'options ; s'arrête si ça dépasse la largeur.
function _ogOptionChips(options, areaX, areaY, areaRight) {
  if (!options || !options.length) return '';
  const size = 26, padX = 22, h = 48, gapX = 14;
  let x = areaX, out = '';
  for (const label of options) {
    const tw = _ogTextWidth(label, size, false);
    const cw = Math.round(tw + padX * 2 + 28); // +28 pour le « ✓ »
    if (x + cw > areaRight) break; // une seule rangée : on tronque proprement
    out += `<rect x="${x}" y="${areaY}" width="${cw}" height="${h}" rx="${h / 2}" fill="#16243C" stroke="#33445E" stroke-width="2"/>`;
    out += _ogText('✓', x + padX, areaY + h - 15, size, '#7ee0c8', { bold: true });
    out += _ogText(label, x + padX + 28, areaY + h - 15, size, '#CBD6E8');
    x += cw + gapX;
  }
  return out;
}

// Renvoie une page HTML avec balises Open Graph dynamiques + redirection vers la vraie page.
async function rideOgPage(req, res, ctx) {
  const url = new URL(req.url || '/', 'https://porteaporte.site');
  const rideId = url.searchParams.get('id') || url.searchParams.get('ride_id') || '';
  const base = 'https://porteaporte.site';
  const targetPath = '/covoiturage-trajet.html?id=' + encodeURIComponent(rideId);

  let title = 'Covoiturage PorteàPorte';
  let desc = 'Trouve ou propose un trajet de covoiturage partout au Québec. Prix juste, partage des frais réels.';
  const ride = await _ogFetchRide(ctx, rideId);
  if (ride && ride.status === 'publie') {
    const f = _ogRideFacts(ride);
    title = `${ride.start_city} → ${ride.end_city} · ${f.price}$ /place`;
    desc = `${f.dateStr} · ${f.seats} place(s) dispo · Covoiturage PorteàPorte. Réserve ta place !`;
  }

  const ogImg = base + '/api/platform?endpoint=og-trajet-image&id=' + encodeURIComponent(rideId);
  const ogUrl = base + '/trajet/' + encodeURIComponent(rideId);
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${_ogEscapeHtml(title)}</title>
<meta name="description" content="${_ogEscapeHtml(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PorteàPorte">
<meta property="og:title" content="${_ogEscapeHtml(title)}">
<meta property="og:description" content="${_ogEscapeHtml(desc)}">
<meta property="og:url" content="${_ogEscapeHtml(ogUrl)}">
<meta property="og:image" content="${_ogEscapeHtml(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${_ogEscapeHtml(title)}">
<meta name="twitter:description" content="${_ogEscapeHtml(desc)}">
<meta name="twitter:image" content="${_ogEscapeHtml(ogImg)}">
<meta http-equiv="refresh" content="0; url=${_ogEscapeHtml(targetPath)}">
<script>location.replace(${JSON.stringify(targetPath)});</script>
</head><body style="font-family:sans-serif;background:#0A0F1E;color:#E8EDF5;text-align:center;padding:60px">
<p>Redirection vers le trajet…<br><a style="color:#5dbfff" href="${_ogEscapeHtml(targetPath)}">Cliquez ici si rien ne s'affiche.</a></p>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return res.status(200).send(html);
}

// Construit le SVG de la carte de partage (1200x630).
// Polices embarquées (les environnements serverless n'ont pas de police système :
// on convertit le texte en tracés vectoriels pour qu'il s'affiche partout).
let _ogFontReg = null;
let _ogFontBold = null;
function _ogLoadFonts() {
  if (_ogFontReg && _ogFontBold) return true;
  try {
    const opentype = require('opentype.js');
    const path = require('path');
    const dir = path.join(__dirname, 'fonts');
    if (!_ogFontReg)  _ogFontReg  = opentype.loadSync(path.join(dir, 'DejaVuSans.ttf'));
    if (!_ogFontBold) _ogFontBold = opentype.loadSync(path.join(dir, 'DejaVuSans-Bold.ttf'));
    return true;
  } catch (e) {
    return false;
  }
}
// Largeur d'un texte (pour centrer / aligner à droite) ; repli approximatif sans police.
function _ogTextWidth(text, size, bold) {
  if (_ogLoadFonts()) {
    const font = bold ? _ogFontBold : _ogFontReg;
    try { return font.getAdvanceWidth(String(text), size); } catch (_) {}
  }
  return String(text).length * size * 0.55;
}
// Génère un élément SVG pour le texte : <path> si la police est dispo, sinon <text>.
function _ogText(text, x, y, size, fill, opts) {
  const o = opts || {};
  const bold = !!o.bold;
  const anchor = o.anchor || 'start';
  const str = String(text);
  let drawX = x;
  const w = _ogTextWidth(str, size, bold);
  if (anchor === 'middle') drawX = x - w / 2;
  else if (anchor === 'end') drawX = x - w;
  if (_ogLoadFonts()) {
    const font = bold ? _ogFontBold : _ogFontReg;
    try {
      const p = font.getPath(str, drawX, y, size);
      return `<path d="${p.toPathData(2)}" fill="${fill}"/>`;
    } catch (_) {}
  }
  const fam = 'Arial, Helvetica, sans-serif';
  return `<text x="${drawX}" y="${y}" font-family="${fam}" font-size="${size}"${bold ? ' font-weight="800"' : ''} fill="${fill}">${_ogEscapeXml(str)}</text>`;
}

function _ogBuildSvg(ride) {
  const facts = ride ? _ogRideFacts(ride) : null;
  const from = ride ? String(ride.start_city || 'Départ') : 'Ton départ';
  const to = ride ? String(ride.end_city || 'Arrivée') : 'Ta destination';
  const clip = s => (s.length > 22 ? s.slice(0, 21) + '…' : s);
  const longest = Math.max(from.length, to.length);
  const citySize = longest > 18 ? 62 : (longest > 13 ? 76 : 92);

  const priceLabel = facts ? `${facts.price} $ / place` : 'Prix juste · frais réels';
  const priceW = Math.max(280, Math.round(_ogTextWidth(priceLabel, 34, true)) + 70);
  const seatsLabel = facts ? `${facts.seats} place(s) dispo` : 'Covoiturage Québec';
  const dateLine = facts ? facts.dateStr : 'Trouve ton trajet sur porteaporte.site';
  const hasOpts = !!(facts && facts.options && facts.options.length);
  const dateY = hasOpts ? 522 : 492;   // descend la date sous les pastilles si présentes
  const pillY = hasOpts ? 548 : 520;   // descend la pastille de prix en conséquence

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0A0F1E"/><stop offset="1" stop-color="#16263F"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5dbfff"/><stop offset="1" stop-color="#7ee0c8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="12" fill="url(#acc)"/>
  ${_ogText('PorteàPorte', 80, 108, 44, '#5dbfff', { bold: true })}
  ${_ogText('Covoiturage entre particuliers', 80, 148, 26, '#8A9BB0')}
  <circle cx="96" cy="290" r="15" fill="#5dbfff"/>
  <line x1="96" y1="306" x2="96" y2="376" stroke="#33445E" stroke-width="5" stroke-dasharray="6 9"/>
  <circle cx="96" cy="392" r="15" fill="none" stroke="#7ee0c8" stroke-width="6"/>
  ${_ogText(clip(from), 150, 306, citySize, '#FFFFFF', { bold: true })}
  ${_ogText(clip(to), 150, 408, citySize, '#FFFFFF', { bold: true })}
  ${hasOpts ? _ogOptionChips(facts.options, 80, 432, 1160) : ''}
  ${_ogText(dateLine, 80, dateY, 30, '#B8C4D6')}
  <rect x="80" y="${pillY}" width="${priceW}" height="62" rx="31" fill="url(#acc)"/>
  ${_ogText(priceLabel, 80 + priceW / 2, pillY + 41, 34, '#0A0F1E', { bold: true, anchor: 'middle' })}
  ${_ogText(seatsLabel, 80 + priceW + 34, pillY + 41, 30, '#8A9BB0')}
  ${_ogText('porteaporte.site', 1120, 600, 24, '#56657D', { anchor: 'end' })}
</svg>`;
}

// Renvoie l'image PNG (via sharp) ; repli SVG si sharp indisponible.
async function rideOgImage(req, res, ctx) {
  const url = new URL(req.url || '/', 'https://porteaporte.site');
  const rideId = url.searchParams.get('id') || url.searchParams.get('ride_id') || '';
  let ride = await _ogFetchRide(ctx, rideId);
  if (ride && ride.status !== 'publie') ride = null;
  const svg = _ogBuildSvg(ride);
  try {
    const sharp = require('sharp');
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
    return res.status(200).send(png);
  } catch (e) {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
    return res.status(200).send(svg);
  }
}

module.exports = {
  RIDE_COST_PER_KM, RIDE_PLATFORM_FEE, RIDE_PLATFORM_FEE_MIN, RIDE_MAX_COST_PER_KM,
  RIDE_FEE_LUGGAGE, RIDE_FEE_PET, RIDE_FEE_STOP, RIDE_FEE_PACKAGE_BASE, RIDE_FEE_PACKAGE_PER_KG,
  RIDE_FREE_TRIPS_DEFAULT,
  getRideSettings, calcPackageFee, groupBonusPct, calcRidePrice,
  rideDriverProfile, rideCreate, rideSearch, rideDetail, rideBook, ridePaymentCreate, ridePaymentSync, rideCancel,
  rideCaptureEligible,
  rideMyRides, rideAdmin, rideReport, ridePackageBook, safeMeetingPoints,
  covDashboard, covOnboard, covProgress, covGrantXP, missionQualifies,
  rideOgPage, rideOgImage,
};
