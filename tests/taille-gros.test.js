'use strict';
// Décision de Denis (26 nov. 2026) : « gros » (la valeur des formulaires) est tarifé exactement comme « grand »
// (plancher 18 $, ×1,35). Avant, « gros » était inconnu du calcul et coûtait MOINS que « moyen ».
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});
const { computeDeliveryPrice } = require('../lib/_lib');
const { prixMinimumTotal } = require('../js/repartition');
const CT = require('../lib/_commande-telephone');

const prix = (size) => computeDeliveryPrice({ distance_km: 20, weight_kg: 10, size, type: 'colis', urgency: 'flexible' });

test('gros = grand > moyen sur 20 km et 10 kg', () => {
  const g = prix('gros'), gr = prix('grand'), m = prix('moyen');
  assert.deepEqual(g, gr);
  assert.ok(g.price_cad > m.price_cad, `${g.price_cad} > ${m.price_cad}`);
  assert.equal(g.breakdown.floor, 18);
  assert.equal(g.breakdown.size_mult, 1.35);
});

test('aucun autre prix ne change (petit, moyen, grand, xl, document)', () => {
  const attendu = { petit: [8, 1], moyen: [10, 1.15], grand: [18, 1.35], xl: [35, 1.8], document: [6, 0.85] };
  for (const [t, [plancher, mult]] of Object.entries(attendu)) {
    assert.equal(prix(t).breakdown.floor, plancher, t);
    assert.equal(prix(t).breakdown.size_mult, mult, t);
  }
});

test('même prix « gros » partout : price-estimate, formulaire de création (minimum serveur), commande téléphonique', async () => {
  global.fetch = creerBase({}).fetch;
  const platform = require('../api/platform');
  const res = makeRes();
  await platform({ method: 'POST', url: '/api/platform?endpoint=price-estimate', query: { endpoint: 'price-estimate' }, body: { endpoint: 'price-estimate', ville_depart: 'Lévis', ville_arrivee: 'Québec', poids_kg: 10, taille_colis: 'gros', type_colis: 'colis', deadline: 'flexible' }, headers: { 'x-forwarded-for': '203.0.113.11' } }, res);
  assert.equal(res._status, 200);
  const { distanceLivraison } = require('../lib/_distance');
  const km = distanceLivraison({ ville_depart: 'Lévis', ville_arrivee: 'Québec' }).km;
  const ref = computeDeliveryPrice({ distance_km: km, weight_kg: 10, size: 'grand', type: 'colis', urgency: 'flexible' });
  assert.equal(res._body.suggested_total_cad, prixMinimumTotal(ref.price_cad), 'price-estimate « gros » = « grand »');
  assert.equal(res._body.min_total_cad, prixMinimumTotal(ref.min_price_cad), 'minimum vérifié à la création = « grand »');
  const v = CT.validerPrix({ epicerie_ville: 'Lévis', ville_livraison: 'Québec', poids_kg: 10, taille: 'gros', type: 'colis', protection: 'none' });
  assert.equal(CT.prixCommande(v.valeurs).livraison, res._body.suggested_total_cad, 'commande téléphonique = price-estimate');
  // Le formulaire de création envoie bien « gros » à price-estimate.
  assert.match(fs.readFileSync('create-mission.html', 'utf8'), /<option value="gros">/);
});
