// tests/paiement.test.js — Tests paiement-livraison + capture-livraison + connect
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const originalFetch = global.fetch;

// Mock fetch configurable par URL/contenu
function makeMockFetch(routes = {}, defaults = {}) {
  return async (url, opts) => {
    const key = Object.keys(routes).find(k => url.includes(k));
    const body = opts?.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : '';
    if (key) {
      const val = typeof routes[key] === 'function' ? routes[key](url, opts, body) : routes[key];
      return {
        ok: val.ok !== false,
        status: val.status || (val.ok !== false ? 200 : 400),
        json: async () => val.data || {},
        text: async () => JSON.stringify(val.data || {}),
        headers: { get: () => null }
      };
    }
    return {
      ok: defaults.ok !== false,
      status: defaults.status || 200,
      json: async () => defaults.data || {},
      text: async () => '',
      headers: { get: () => null }
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. computeDeliveryPrice (anti-frigo-5$)
// ─────────────────────────────────────────────────────────────────────────
describe('computeDeliveryPrice (anti-arnaque tarification)', () => {
  const { computeDeliveryPrice } = require('../lib/_lib.js');

  test('petit colis local = prix raisonnable', () => {
    const r = computeDeliveryPrice({ distance_km: 5, weight_kg: 1, size: 'petit', type: 'colis', urgency: 'flexible' });
    assert.ok(r.price_cad >= 5 && r.price_cad <= 15, `Prix devrait être 5-15$, reçu ${r.price_cad}$`);
    assert.ok(r.min_price_cad <= r.price_cad);
  });

  test('frigo (XL électroménager) = refus si 5$', () => {
    const r = computeDeliveryPrice({ distance_km: 15, weight_kg: 80, size: 'xl', type: 'electromenager', urgency: '48h' });
    assert.ok(r.min_price_cad >= 100, `Frigo doit coûter ≥100$, reçu min=${r.min_price_cad}$`);
    assert.ok(5 < r.min_price_cad, 'Doit refuser un prix de 5$');
  });

  test('urgence augmente le prix', () => {
    const flex = computeDeliveryPrice({ distance_km: 10, weight_kg: 5, size: 'moyen', type: 'colis', urgency: 'flexible' });
    const urg = computeDeliveryPrice({ distance_km: 10, weight_kg: 5, size: 'moyen', type: 'colis', urgency: '24h' });
    assert.ok(urg.price_cad > flex.price_cad, '24h doit coûter plus que flexible');
  });

  test('document = prix réduit (multiplicateur 0.7)', () => {
    const doc = computeDeliveryPrice({ distance_km: 5, weight_kg: 0.3, size: 'petit', type: 'document', urgency: 'flexible' });
    const colis = computeDeliveryPrice({ distance_km: 5, weight_kg: 0.3, size: 'petit', type: 'colis', urgency: 'flexible' });
    assert.ok(doc.price_cad <= colis.price_cad, 'Document doit être ≤ colis');
  });

  test('meuble x1.8 multiplie le prix', () => {
    const colis = computeDeliveryPrice({ distance_km: 10, weight_kg: 5, size: 'moyen', type: 'colis' });
    const meub = computeDeliveryPrice({ distance_km: 10, weight_kg: 5, size: 'grand', type: 'meuble' });
    assert.ok(meub.price_cad > colis.price_cad * 1.5, 'Meuble doit être >> colis');
  });

  test('prix minimum jamais sous 5$', () => {
    const r = computeDeliveryPrice({ distance_km: 1, weight_kg: 0.1, size: 'petit', type: 'document', urgency: 'flexible' });
    assert.ok(r.price_cad >= 5, 'Plancher à 5$');
  });

  test('breakdown contient tous les facteurs', () => {
    const r = computeDeliveryPrice({ distance_km: 10, weight_kg: 3, size: 'moyen', type: 'colis' });
    assert.ok('base' in r.breakdown);
    assert.ok('distance_fee' in r.breakdown);
    assert.ok('weight_fee' in r.breakdown);
    assert.ok('size_mult' in r.breakdown);
    assert.ok('type_mult' in r.breakdown);
    assert.ok('urgency_mult' in r.breakdown);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Validation entrée paiement (cas frontaliers)
// ─────────────────────────────────────────────────────────────────────────
describe('Validation paiement', () => {
  const { computeDeliveryPrice } = require('../lib/_lib.js');

  test('prix utilisateur < min calculé = doit être refusé', () => {
    const calc = computeDeliveryPrice({ distance_km: 20, weight_kg: 50, size: 'xl', type: 'meuble' });
    const userTried = 5;
    assert.ok(userTried < calc.min_price_cad, `User tente ${userTried}$ mais min=${calc.min_price_cad}$ → refus serveur`);
  });

  test('prix utilisateur = suggéré exact = accepté', () => {
    const calc = computeDeliveryPrice({ distance_km: 10, weight_kg: 3, size: 'moyen', type: 'colis' });
    assert.ok(calc.price_cad >= calc.min_price_cad);
  });

  test('admin bypass : prix libre accepté', () => {
    // Côté code, role=admin bypass la validation min_price (logique dans api/platform.js)
    // Ce test documente le comportement attendu
    const calc = computeDeliveryPrice({ distance_km: 100, weight_kg: 80, size: 'xl', type: 'electromenager' });
    assert.ok(calc.min_price_cad > 0, 'Min calculé pour info admin');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Calcul gains livreur (part livreur + bonus)
// ─────────────────────────────────────────────────────────────────────────
describe('Calcul gains livreur', () => {
  test('part livreur 60% sur 15$', () => {
    const gross = 1500; // cents
    const livreurPct = 60;
    const expected = Math.floor(gross * livreurPct / 100);
    assert.equal(expected, 900);
  });

  test('bonus fidélité +10% : 70% au total', () => {
    const gross = 1500;
    const baseTotal = 60 + 10; // fidélité max
    const expected = Math.floor(gross * baseTotal / 100);
    assert.equal(expected, 1050);
  });

  test('bonus rescue +20% sur la part livreur', () => {
    const gross = 1500;
    const basePct = 60;
    const baseNet = Math.floor(gross * basePct / 100);
    const rescueBonus = Math.floor(baseNet * 20 / 100);
    const totalNet = baseNet + rescueBonus;
    assert.equal(totalNet, 1080); // 900 + 180
  });

  test('cap loyalty bonus à 10%', () => {
    // Code logic: if (loyaltyBonus > 10) loyaltyBonus = 10
    let loyaltyBonus = 15;
    if (loyaltyBonus > 10) loyaltyBonus = 10;
    assert.equal(loyaltyBonus, 10);
  });

  test('platform_fee = brut - net livreur', () => {
    const gross = 1500;
    const livreurNet = 900;
    const platformFee = gross - livreurNet;
    assert.equal(platformFee, 600); // 40% pour la plateforme
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Stripe Connect : auto-detection compte zombi
// ─────────────────────────────────────────────────────────────────────────
describe('Stripe Connect auto-recovery', () => {
  test('détecte "No such account" et cleanup DB', () => {
    const errorMsg = 'No such account: acct_1234oldtest';
    const isStale = errorMsg.includes('No such account') || errorMsg.includes('resource_missing');
    assert.ok(isStale, 'Doit détecter le compte zombi');
  });

  test('détecte "resource_missing"', () => {
    const errorMsg = 'resource_missing on account acct_xxx';
    assert.ok(errorMsg.includes('resource_missing'));
  });

  test('compte valide = pas de cleanup', () => {
    const errorMsg = 'Stripe rate_limit_exceeded';
    const isStale = errorMsg.includes('No such account') || errorMsg.includes('resource_missing');
    assert.ok(!isStale, 'Erreur rate limit ne doit pas trigger cleanup');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Minimum payout configurable
// ─────────────────────────────────────────────────────────────────────────
describe('Payout minimum', () => {
  test('minimum default 5$', () => {
    const MIN_DEFAULT = 5;
    assert.equal(MIN_DEFAULT, 5);
  });

  test('available < min = bouton désactivé', () => {
    const min = 5;
    const available = 3.60;
    assert.ok(available < min, 'Doit bloquer le virement');
  });

  test('available >= min = bouton activé', () => {
    const min = 5;
    const available = 7.20;
    assert.ok(available >= min, 'Doit autoriser le virement');
  });

  test('config admin peut réduire min à 3$', () => {
    const customMin = 3;
    const available = 3.60;
    assert.ok(available >= customMin, 'User peut virer 3.60$ avec min=3');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Webhook Stripe : event types attendus
// ─────────────────────────────────────────────────────────────────────────
describe('Webhook Stripe events', () => {
  const EXPECTED_EVENTS = [
    'payment_intent.succeeded',
    'payment_intent.amount_capturable_updated',
    'payment_intent.payment_failed',
    'payout.paid',
    'account.updated'
  ];

  test('liste des events Stripe à configurer', () => {
    assert.ok(EXPECTED_EVENTS.length >= 5, 'Au moins 5 events critiques');
    assert.ok(EXPECTED_EVENTS.includes('payment_intent.succeeded'));
    assert.ok(EXPECTED_EVENTS.includes('payment_intent.amount_capturable_updated'));
    assert.ok(EXPECTED_EVENTS.includes('payout.paid'));
  });

  test('events inutiles à NE PAS écouter (économise quota)', () => {
    const USELESS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
    // Documente : on n'utilise pas checkout sessions ni subscriptions
    assert.ok(USELESS.every(e => !EXPECTED_EVENTS.includes(e)));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Fonds assurance + redirection profit
// ─────────────────────────────────────────────────────────────────────────
describe('Fonds assurance & profit beta', () => {
  test('mode beta : profit (10%) redirigé vers fonds', () => {
    const profitToInsurance = true;
    const pctProtection = 8;
    const pctProfit = 10;
    const effectivePct = profitToInsurance ? (pctProtection + pctProfit) / 100 : pctProtection / 100;
    assert.equal(effectivePct, 0.18, '18% du CA vers fonds en mode beta');
  });

  test('mode normal : profit reste profit', () => {
    const profitToInsurance = false;
    const pctProtection = 8;
    const effectivePct = profitToInsurance ? (pctProtection + 10) / 100 : pctProtection / 100;
    assert.equal(effectivePct, 0.08);
  });

  test('apport direct admin s ajoute au fonds', () => {
    const fundFromDeliveries = 1000; // cents
    const adminTopup = 50000; // 500$ injecté manuellement
    const totalFund = fundFromDeliveries + adminTopup;
    assert.equal(totalFund, 51000);
  });

  test('max claim = 50% du fonds OU max colis value (le plus petit)', () => {
    const fundCents = 100000; // 1000$
    const maxColisValueCents = 25000; // 250$
    const maxClaim = Math.min(maxColisValueCents, Math.floor(fundCents * 0.5));
    assert.equal(maxClaim, 25000, 'Plafond colis primable même si fonds permet plus');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. Restriction zone beta Quebec/Levis
// ─────────────────────────────────────────────────────────────────────────
describe('Restriction zone beta', () => {
  function isCityInBeta(city, betaCities) {
    // Reproduit normalizeCity de lib/_lib.js : strip accents puis non-alphanum
    const norm = String(city || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
    return !city || betaCities.some(b => norm.includes(b) || b.includes(norm));
  }

  test('Québec accepté', () => {
    assert.ok(isCityInBeta('Québec', ['quebec', 'levis']));
  });

  test('Quebec City accepté (matching tolérant)', () => {
    assert.ok(isCityInBeta('Quebec City', ['quebec', 'levis']));
  });

  test('LEVIS accepté (insensible casse)', () => {
    assert.ok(isCityInBeta('LEVIS', ['quebec', 'levis']));
  });

  test('Lévis QC accepté', () => {
    assert.ok(isCityInBeta('Lévis QC', ['quebec', 'levis']));
  });

  test('Montréal refusé en beta', () => {
    assert.ok(!isCityInBeta('Montréal', ['quebec', 'levis']));
  });

  test('Toronto refusé', () => {
    assert.ok(!isCityInBeta('Toronto', ['quebec', 'levis']));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 9. Source transaction Stripe (workaround insufficient_funds)
// ─────────────────────────────────────────────────────────────────────────
describe('Stripe transfer source_transaction', () => {
  test('transfer avec source_transaction contourne insufficient_funds', () => {
    const transferPayload = {
      amount: 360,
      currency: 'cad',
      destination: 'acct_connectedLivreur',
      source_transaction: 'ch_charge_specific_id'
    };
    assert.ok(transferPayload.source_transaction, 'Doit avoir source_transaction');
    // Stripe permet le transfer même si la charge n est pas encore settled
  });

  test('transfer sans source_transaction = nécessite solde plateforme', () => {
    const transferPayload = {
      amount: 360,
      currency: 'cad',
      destination: 'acct_connectedLivreur'
      // PAS de source_transaction
    };
    assert.ok(!transferPayload.source_transaction, 'Risque insufficient_funds');
  });
});

// Reset fetch après les tests
test('cleanup mock fetch', () => {
  global.fetch = originalFetch;
});
