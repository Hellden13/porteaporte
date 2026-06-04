// tests/rides.test.js — Tests unitaires pour api/_rides.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  calcRidePrice,
  calcPackageFee,
  groupBonusPct,
  missionQualifies,
  RIDE_COST_PER_KM,
  RIDE_PLATFORM_FEE,
  RIDE_FEE_LUGGAGE,
  RIDE_FEE_PET,
  RIDE_FEE_PACKAGE_BASE,
  RIDE_FEE_PACKAGE_PER_KG,
} = require('../lib/_rides');

// ─── Constantes ───────────────────────────────────────────────────────────────
describe('Constantes tarifaires', () => {
  test('RIDE_COST_PER_KM est positif', () => {
    assert.ok(RIDE_COST_PER_KM > 0);
  });
  test('RIDE_PLATFORM_FEE est positif', () => {
    assert.ok(RIDE_PLATFORM_FEE > 0);
  });
  test('RIDE_FEE_LUGGAGE est positif', () => {
    assert.ok(RIDE_FEE_LUGGAGE > 0);
  });
  test('RIDE_FEE_PET est positif', () => {
    assert.ok(RIDE_FEE_PET > 0);
  });
});

// ─── groupBonusPct ────────────────────────────────────────────────────────────
describe('groupBonusPct', () => {
  test('0-1 passager → pas de bonus', () => {
    assert.equal(groupBonusPct(0), 0);
    assert.equal(groupBonusPct(1), 0);
  });

  test('2 passagers → 5% de réduction', () => {
    assert.equal(groupBonusPct(2), 0.05);
  });

  test('3 passagers → 10% de réduction', () => {
    assert.equal(groupBonusPct(3), 0.10);
  });

  test('4+ passagers → 15% de réduction', () => {
    assert.equal(groupBonusPct(4), 0.15);
    assert.equal(groupBonusPct(10), 0.15);
  });
});

// ─── calcPackageFee ───────────────────────────────────────────────────────────
describe('calcPackageFee', () => {
  test('colis ≤5 kg → frais de base uniquement', () => {
    const fee = calcPackageFee(3, {});
    assert.equal(fee, RIDE_FEE_PACKAGE_BASE);
  });

  test('colis ≤5 kg (exactement 5 kg) → frais de base uniquement', () => {
    const fee = calcPackageFee(5, {});
    assert.equal(fee, RIDE_FEE_PACKAGE_BASE);
  });

  test('colis 6 kg → base + 1 kg sup.', () => {
    const fee = calcPackageFee(6, {});
    const expected = RIDE_FEE_PACKAGE_BASE + RIDE_FEE_PACKAGE_PER_KG;
    assert.equal(fee, Math.round(expected * 100) / 100);
  });

  test('colis 10 kg → base + 5 kg sup.', () => {
    const fee = calcPackageFee(10, {});
    const expected = RIDE_FEE_PACKAGE_BASE + 5 * RIDE_FEE_PACKAGE_PER_KG;
    assert.equal(fee, Math.round(expected * 100) / 100);
  });

  test('poids négatif → frais de base uniquement', () => {
    const fee = calcPackageFee(-1, {});
    assert.equal(fee, RIDE_FEE_PACKAGE_BASE);
  });

  test('settings custom surchargent les défauts', () => {
    const fee = calcPackageFee(3, { ride_fee_package_base: 10, ride_fee_package_per_kg: 2 });
    assert.equal(fee, 10); // 3 kg ≤ 5, pas de supplément
  });
});

// ─── calcRidePrice ────────────────────────────────────────────────────────────
describe('calcRidePrice', () => {
  const base = {
    totalDistanceKm: 100,
    passengerDistanceKm: 100,
    costPerKm: RIDE_COST_PER_KM,
    seats: 1,
  };

  test('calcul de base sans extras', () => {
    const price = calcRidePrice(base);
    const expectedBase = 100 * RIDE_COST_PER_KM; // 35.00
    assert.equal(price.totalCostBase, Math.round(expectedBase * 100) / 100);
    assert.equal(price.platformFee, RIDE_PLATFORM_FEE);
    assert.ok(price.totalPassenger > price.driverAmount, 'le passager paie plus que le chauffeur reçoit');
  });

  test('frais bagages ajoutés si hasLuggage=true', () => {
    const avec = calcRidePrice({ ...base, hasLuggage: true });
    const sans = calcRidePrice({ ...base, hasLuggage: false });
    assert.equal(avec.luggageFee, RIDE_FEE_LUGGAGE);
    assert.equal(sans.luggageFee, 0);
    // Le passager paie les bagages mais le chauffeur aussi les reçoit
    assert.ok(avec.totalPassenger > sans.totalPassenger);
    assert.ok(avec.driverAmount > sans.driverAmount, 'chauffeur reçoit les frais bagages');
  });

  test('frais animal ajoutés si hasPet=true', () => {
    const avec = calcRidePrice({ ...base, hasPet: true });
    const sans = calcRidePrice(base);
    assert.equal(avec.petFee, RIDE_FEE_PET);
    assert.equal(sans.petFee, 0);
  });

  test('2 sièges → platform fee doublé', () => {
    const un = calcRidePrice({ ...base, seats: 1 });
    const deux = calcRidePrice({ ...base, seats: 2 });
    assert.equal(deux.platformFee, Math.round(RIDE_PLATFORM_FEE * 2 * 100) / 100);
    assert.ok(deux.totalPassenger > un.totalPassenger);
  });

  test('bonus groupe 2 passagers → prix base réduit', () => {
    const sans = calcRidePrice({ ...base, confirmedPassengers: 0 });
    const avec = calcRidePrice({ ...base, confirmedPassengers: 2 });
    // paxBase doit être réduit de 5%
    assert.ok(avec.paxBase < sans.paxBase, 'prix de base réduit avec groupe');
  });

  test('distance passager partielle (< trajet total)', () => {
    const partielle = calcRidePrice({
      ...base,
      totalDistanceKm: 200,
      passengerDistanceKm: 100,
    });
    const totale = calcRidePrice({ ...base, totalDistanceKm: 100 });
    // Même distance parcourue → prix similaires
    assert.ok(
      Math.abs(partielle.paxBase - totale.paxBase) < 1,
      'même distance passager → prix proches'
    );
  });

  test('overLimit = true si prix dépasse le plafond', () => {
    // costPerKm très élevé devrait déclencher overLimit
    const cher = calcRidePrice({
      totalDistanceKm: 100,
      passengerDistanceKm: 100,
      costPerKm: 10, // bien au-dessus du max
      seats: 1,
    });
    assert.equal(cher.overLimit, true);
  });

  test('costPerKm = 0 → utilise le tarif par défaut (fallback via ||)', () => {
    // La formule utilise `Number(costPerKm) || RIDE_COST_PER_KM`
    // costPerKm=0 est falsy → fallback sur RIDE_COST_PER_KM
    const price = calcRidePrice({ ...base, costPerKm: 0 });
    assert.equal(price.costPerKm, RIDE_COST_PER_KM);
    assert.ok(price.totalCostBase > 0, 'le fallback tarifaire est appliqué');
  });

  test('les valeurs sont arrondies à 2 décimales', () => {
    const price = calcRidePrice({ ...base, totalDistanceKm: 33, costPerKm: 0.35 });
    const isRounded = (n) => Math.abs(n - Math.round(n * 100) / 100) < 0.001;
    assert.ok(isRounded(price.totalCostBase), 'totalCostBase doit être arrondi');
    assert.ok(isRounded(price.totalPassenger), 'totalPassenger doit être arrondi');
    assert.ok(isRounded(price.driverAmount), 'driverAmount doit être arrondi');
  });

  test('franchise commissionFree=true → platformFee = 0', () => {
    const free = calcRidePrice({ ...base, commissionFree: true });
    const paid = calcRidePrice({ ...base, commissionFree: false });
    assert.equal(free.platformFee, 0, 'aucune commission quand commissionFree=true');
    assert.equal(free.commissionFree, true);
    // Le passager paie moins (économie = la commission)
    assert.ok(free.totalPassenger < paid.totalPassenger, 'le passager paie moins sans commission');
    // Le chauffeur garde la même part
    assert.equal(free.driverAmount, paid.driverAmount, 'le chauffeur garde sa part entière');
    // Le total passager = part chauffeur (plus de frais plateforme) quand pas de bagage
    assert.equal(free.totalPassenger, free.driverAmount, 'sans commission, total = part chauffeur');
  });

  test('franchise sur 2 sièges → platformFee reste 0', () => {
    const free = calcRidePrice({ ...base, seats: 2, commissionFree: true });
    assert.equal(free.platformFee, 0);
  });

  test('par défaut (commissionFree absent) → commission normale', () => {
    const price = calcRidePrice(base);
    assert.equal(price.platformFee, RIDE_PLATFORM_FEE);
    assert.equal(price.commissionFree, false);
  });
});

// ─── missionQualifies ─────────────────────────────────────────────────────────
describe('missionQualifies', () => {
  test('premier_trajet se qualifie pour ride_complete', () => {
    assert.equal(missionQualifies('premier_trajet', 'ride_complete', {}), true);
  });

  test('premier_trajet ne se qualifie PAS pour ride_full', () => {
    assert.equal(missionQualifies('premier_trajet', 'ride_full', {}), false);
  });

  test('trajet_complet se qualifie pour ride_full', () => {
    assert.equal(missionQualifies('trajet_complet', 'ride_full', {}), true);
  });

  test('eco_route nécessite distance >= 50 km et >= 2 passagers', () => {
    assert.equal(missionQualifies('eco_route', 'ride_complete', { distance_km: 50, passenger_count: 2 }), true);
    assert.equal(missionQualifies('eco_route', 'ride_complete', { distance_km: 49, passenger_count: 2 }), false);
    assert.equal(missionQualifies('eco_route', 'ride_complete', { distance_km: 50, passenger_count: 1 }), false);
  });

  test('route_regionale nécessite distance >= 80 km', () => {
    assert.equal(missionQualifies('route_regionale', 'ride_complete', { distance_km: 80 }), true);
    assert.equal(missionQualifies('route_regionale', 'ride_complete', { distance_km: 79 }), false);
  });

  test('grand_explorateur nécessite distance >= 200 km', () => {
    assert.equal(missionQualifies('grand_explorateur', 'ride_complete', { distance_km: 200 }), true);
    assert.equal(missionQualifies('grand_explorateur', 'ride_complete', { distance_km: 199 }), false);
  });

  test('premier_avis se qualifie pour review_left', () => {
    assert.equal(missionQualifies('premier_avis', 'review_left', {}), true);
  });

  test('aide_communautaire se qualifie pour community_help', () => {
    assert.equal(missionQualifies('aide_communautaire', 'community_help', {}), true);
  });

  test('slug inconnu → false', () => {
    assert.equal(missionQualifies('mission_inexistante', 'ride_complete', {}), false);
  });
});
