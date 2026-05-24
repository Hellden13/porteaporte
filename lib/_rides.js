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

// ─── Helpers internes ─────────────────────────────────────────────────────────

async function getRideSettings(ctx) {
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_settings?id=eq.default&select=ride_platform_pct,ride_fee_luggage,ride_fee_pet,ride_fee_stop,ride_fee_package_base,ride_fee_package_per_kg&limit=1`, { headers: sbHeaders(ctx.sbKey) });
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

function calcRidePrice({ totalDistanceKm, passengerDistanceKm, costPerKm, hasLuggage, hasPet, extraStops, detourKm, seats, confirmedPassengers, rideSettings }) {
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
  const paxBaseRaw    = totalCostBase * paxSharePct * nSeats;

  const bonus    = groupBonusPct(confirmedPassengers);
  const paxBase  = Math.round(paxBaseRaw * (1 - bonus) * 100) / 100;

  const luggageFee = hasLuggage ? feeLuggage : 0;
  const petFee     = hasPet     ? feePet     : 0;
  const stopFee    = (Number(extraStops) || 0) * feeStop;
  const detourFee  = (Number(detourKm)  || 0) * cpk;

  const commissionBase = paxBase + petFee + stopFee + detourFee;
  const platformFee    = Math.round(platformFeePerSeat * nSeats * 100) / 100;
  const driverAmount   = Math.round((commissionBase + luggageFee) * 100) / 100;
  const totalPassenger = Math.round((commissionBase + platformFee + luggageFee) * 100) / 100;

  const maxAllowed = Math.round(paxKm * RIDE_MAX_COST_PER_KM * 100) / 100;
  const overLimit  = totalPassenger > maxAllowed + platformFee;

  return {
    costPerKm: cpk,
    totalDistanceKm: totalKm,
    totalCostBase: Math.round(totalCostBase * 100) / 100,
    paxDistanceKm: paxKm,
    paxSharePct: Math.round(paxSharePct * 10000) / 100,
    paxBase:       Math.round(paxBase * 100) / 100,
    luggageFee, petFee, stopFee, detourFee,
    platformFee, driverAmount, totalPassenger,
    overLimit, maxAllowed,
  };
}

// ─── Profil chauffeur ─────────────────────────────────────────────────────────

async function rideDriverProfile(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const uid = ctx.session.id;

  // GET — lire son propre profil (depuis ride_driver_profiles)
  if (req.method === 'GET') {
    const [rideRes, profileRes] = await Promise.all([
      fetch(
        `${ctx.sbUrl}/rest/v1/rides?driver_id=eq.${uid}&select=vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_type,trunk_size,smoking_policy,music_policy,chat_policy,ac_available,perfume_free,personal_rules&order=created_at.desc&limit=1`,
        { headers: sbHeaders(ctx.sbKey) }
      ),
      fetch(
        `${ctx.sbUrl}/rest/v1/profiles?id=eq.${uid}&select=bio,prenom,nom&limit=1`,
        { headers: sbHeaders(ctx.sbKey) }
      ),
    ]);

    const rides    = rideRes.ok    ? await rideRes.json().catch(() => [])    : [];
    const profiles = profileRes.ok ? await profileRes.json().catch(() => []) : [];
    const lastRide  = rides[0]    || {};
    const profile   = profiles[0] || {};

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
  const cpk    = Math.min(Number(cost_per_km) || RIDE_COST_PER_KM, RIDE_MAX_COST_PER_KM);

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
    trunk_size: ['petit','moyen','grand'].includes(trunk_size) ? trunk_size : 'moyen',
    available_seats: Math.min(Math.max(Number(available_seats) || 1, 1), 8),
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
    status: 'publie',
  };

  // Schema fallback : si une colonne n'existe pas dans la table rides, on retire et on retente
  const optionalFields = ['stop_points', 'package_max_kg', 'package_max_dim_cm', 'accepts_packages', 'smoking_policy', 'music_policy', 'chat_policy', 'ac_available', 'women_only', 'child_seat_available', 'accessible', 'personal_rules', 'cost_per_km', 'total_distance_km', 'flexibility_minutes', 'is_recurring', 'recurrence_days', 'start_sector', 'end_sector', 'start_lat', 'start_lng', 'end_lat', 'end_lng', 'return_departure_time', 'is_return_trip', 'trunk_size', 'accepts_pets', 'accepts_large_luggage', 'accepts_extra_stops'];
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
      /column\s+["'`\\]*(\w+)["'`\\]*\s+(does not exist|not found|of relation)/i,
      /could not find\s+["'`\\]*the?\s*(\w+)["'`\\]*\s+column/i,
      /["'`\\]+(\w+)["'`\\]+\s+does not exist/i,
      /column\s+"?(\w+)"?\s+/i  // dernier recours
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
  const start  = p('start_city');
  const end    = p('end_city');
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

  let filter = `status=eq.publie&available_seats=gte.${seats}`;
  if (start) filter += `&start_city=ilike.*${encodeURIComponent(start)}*`;
  if (end)   filter += `&end_city=ilike.*${encodeURIComponent(end)}*`;
  if (date) {
    const d = new Date(date);
    if (!isNaN(d)) {
      const from = new Date(d); from.setHours(0,0,0,0);
      const to   = new Date(d); to.setHours(23,59,59,999);
      filter += `&departure_time=gte.${from.toISOString()}&departure_time=lte.${to.toISOString()}`;
    }
  }
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
  filter += '&order=departure_time.asc&limit=50';

  const select = 'id,start_city,start_sector,end_city,end_sector,departure_time,available_seats,vehicle_type,trunk_size,accepts_pets,accepts_large_luggage,accepts_extra_stops,accepts_packages,package_max_kg,smoking_policy,music_policy,chat_policy,ac_available,women_only,accessible,cost_per_km,total_distance_km,status,driver_id,stop_points';

  const r = await fetch(`${ctx.sbUrl}/rest/v1/rides?${filter}&select=${select}`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const rides = r.ok ? await r.json() : [];

  if (!rides.length) return res.status(200).json({ rides: [] });

  const driverIds = [...new Set(rides.map(r => r.driver_id))];
  const [profilesRes, driverProfilesRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/profiles?id=in.(${driverIds.join(',')})&select=id,prenom,driver_status,score_confiance`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_driver_profiles?user_id=in.(${driverIds.join(',')})&select=user_id,vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_photos,bio`, { headers: sbHeaders(ctx.sbKey) }),
  ]);

  const profiles      = profilesRes.ok ? await profilesRes.json() : [];
  const driverProfiles = driverProfilesRes.ok ? await driverProfilesRes.json() : [];
  const profileMap     = Object.fromEntries(profiles.map(p => [p.id, p]));
  const driverProfileMap = Object.fromEntries(driverProfiles.map(p => [p.user_id, p]));

  const rideSettings = await getRideSettings(ctx);
  const enriched = rides.map((ride) => {
    const price = calcRidePrice({
      totalDistanceKm: ride.total_distance_km,
      passengerDistanceKm: ride.total_distance_km,
      costPerKm: ride.cost_per_km,
      seats,
      rideSettings,
    });
    const profile      = profileMap[ride.driver_id] || {};
    const driverProfile = driverProfileMap[ride.driver_id] || {};

    return {
      ...ride,
      start_lat: undefined, start_lng: undefined,
      end_lat: undefined,   end_lng: undefined,
      driver: {
        prenom:       profile.prenom || 'Chauffeur',
        verified:     profile.driver_status === 'verified',
        score:        profile.score_confiance || 0,
        vehicle_make:  driverProfile.vehicle_make || null,
        vehicle_model: driverProfile.vehicle_model || null,
        vehicle_year:  driverProfile.vehicle_year || null,
        vehicle_color: driverProfile.vehicle_color || null,
        vehicle_photo: (driverProfile.vehicle_photos || [])[0] || null,
        bio:           driverProfile.bio || null,
      },
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

  return res.status(200).json({ rides: enriched });
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
    rideSettings: rideSettingsDetail,
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

  const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=id,driver_id,available_seats,status,cost_per_km,total_distance_km,accepts_pets,accepts_large_luggage`, {
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
    rideSettings: rideSettingsBook,
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
  if (!bRes.ok) return res.status(400).json({ error: 'Réservation impossible', details: bData });

  const saved = Array.isArray(bData) ? bData[0] : bData;

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
      platform_fee_per_seat: RIDE_PLATFORM_FEE,
      driver_receives: price.driverAmount,
      passenger_pays:  price.totalPassenger,
    }),
  }).catch(() => {});

  await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ available_seats: ride.available_seats - seats }),
  }).catch(() => {});

  return res.status(200).json({ success: true, booking: saved, price_breakdown: price });
}

// ─── Annuler une réservation ou un trajet ─────────────────────────────────────

async function rideCancel(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { booking_id, ride_id } = body;

  if (booking_id) {
    const bRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${booking_id}&select=id,passenger_id,ride_id,seats_reserved,status`, {
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

    await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${booking_id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule_passager' }),
    });

    const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${b.ride_id}&select=available_seats`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const rRows = rRes.ok ? await rRes.json() : [];
    if (rRows.length) {
      await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${b.ride_id}`, {
        method: 'PATCH',
        headers: sbHeaders(ctx.sbKey),
        body: JSON.stringify({ available_seats: (rRows[0].available_seats || 0) + b.seats_reserved }),
      }).catch(() => {});
    }

    return res.status(200).json({ success: true, action: 'annule_passager' });
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

    await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule' }),
    });

    await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?ride_id=eq.${ride_id}&status=eq.en_attente`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule_chauffeur' }),
    }).catch(() => {});

    return res.status(200).json({ success: true, action: 'trajet_annule' });
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

  const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=id,driver_id,status,accepts_packages,package_max_kg,package_max_dim_cm,total_distance_km,cost_per_km`, {
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
  const platformFee  = Math.round(RIDE_PLATFORM_FEE * 100) / 100;
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
  const type   = body.type || url.searchParams.get('type') || '';

  let filter = 'active=eq.true&order=verified.desc,name.asc&limit=50';
  if (city) filter += `&city=ilike.*${encodeURIComponent(city)}*`;
  if (type) filter += `&type=eq.${type}`;

  const r = await fetch(`${ctx.sbUrl}/rest/v1/safe_meeting_points?${filter}&select=id,name,type,address,city,lat,lng,verified`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const points = r.ok ? await r.json() : [];
  return res.status(200).json({ points });
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
    const receivedRes = await fetch(
      `${ctx.sbUrl}/rest/v1/ride_bookings?ride_id=in.(${rideIds.join(',')})&select=*,passenger_profile:profiles!passenger_id(prenom,email,telephone)&order=created_at.desc&limit=100`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    receivedRows = receivedRes.ok ? await receivedRes.json() : [];
  }

  const receivedBookings = receivedRows.map(b => ({
    ...b,
    passenger_prenom: b.passenger_profile?.prenom || null,
    passenger_email: b.passenger_profile?.email || null,
    passenger_phone: b.passenger_profile?.telephone || null,
    passenger_profile: undefined
  }));

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

module.exports = {
  RIDE_COST_PER_KM, RIDE_PLATFORM_FEE, RIDE_PLATFORM_FEE_MIN, RIDE_MAX_COST_PER_KM,
  RIDE_FEE_LUGGAGE, RIDE_FEE_PET, RIDE_FEE_STOP, RIDE_FEE_PACKAGE_BASE, RIDE_FEE_PACKAGE_PER_KG,
  getRideSettings, calcPackageFee, groupBonusPct, calcRidePrice,
  rideDriverProfile, rideCreate, rideSearch, rideDetail, rideBook, rideCancel,
  rideMyRides, rideAdmin, rideReport, ridePackageBook, safeMeetingPoints,
  covDashboard, covOnboard, covProgress, covGrantXP, missionQualifies,
};
