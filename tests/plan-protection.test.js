'use strict';
// Correctif du 26 nov. 2026 (approuvé par Denis) : la base de production n'accepte dans assurance_plan que
// basique / standard / premium / vehicule. Le code envoyait none / base / standard, l'insertion échouait, et
// insertWithSchemaFallback retirait EN SILENCE description, type, poids, valeur, date, puis le plan.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { creerBase, rep, makeRes, CONTRAINTES } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
  process.env.SITE_URL = 'https://porteaporte.site';
});

const P = require('../lib/_protection');
const R = require('../js/repartition');
const { insertWithSchemaFallback, sbHeaders } = require('../lib/_lib');
const EXP = '44444444-4444-4444-8444-444444444444';
const PROFILS = [{ id: EXP, role: 'expediteur', email: 'e@courriel-capture.ca', prenom: 'Exp', email_verified: true, est_expediteur: true }];

function base() {
  const db = creerBase({ profiles: PROFILS, livraisons: [] });
  const f = db.fetch;
  global.fetch = async (url, o = {}) => {
    if (String(url).includes('/auth/v1/user')) {
      const t = String((o.headers && (o.headers.Authorization || o.headers.authorization)) || '').replace('Bearer ', '');
      return t === EXP ? rep({ id: EXP, email: 'e@courriel-capture.ca', email_confirmed_at: '2026-01-01T00:00:00Z' }) : rep({}, false, 401);
    }
    return f(url, o);
  };
  return db;
}
async function creer(body) {
  const platform = require('../api/platform');
  const res = makeRes();
  await platform({ method: 'POST', url: '/api/platform?endpoint=create-livraison', query: { endpoint: 'create-livraison' }, body: { endpoint: 'create-livraison', ...body }, headers: { authorization: 'Bearer ' + EXP, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.21' } }, res);
  return res;
}
const NORMAL = { ville_depart: 'Lévis', ville_arrivee: 'Québec', adresse_depart: '1 rue A, Lévis', adresse_arrivee: '2 rue B, Québec', prix_total: 40, type_colis: 'colis', taille_colis: 'moyen', poids_kg: 4, valeur_declaree: 80, date_souhaitee: '2026-12-01', description: 'TEST — boîte de livres' };

test('ce que les formulaires envoient → plan réel', () => {
  const cas = {
    none: 'none', '': 'none', undefined: 'none', 'Aucune protection - 0 $ - couverture 0 $': 'none', 0: 'none',
    base: 'base', basique: 'base', 'Base - 1 $ - couverture max 50 $': 'base', 'Base - 1 CAD - couverture max 50 CAD': 'base', 1: 'base',
    standard: 'standard', 'Standard - 2,99 $ - couverture max 250 $': 'standard', '2.99': 'standard',
    plus: 'plus', '5.99': 'plus',
  };
  for (const [entree, attendu] of Object.entries(cas)) assert.equal(P.normaliserPlan(entree === 'undefined' ? undefined : entree), attendu, String(entree));
});

test('colonnes écrites : toujours acceptées par la contrainte de production, prime dans assurance_prix', () => {
  const ok = CONTRAINTES.livraisons.enum.assurance_plan;
  assert.deepEqual(P.colonnesPlan('none'), { assurance_plan: 'basique', assurance_prix: 0 });
  assert.deepEqual(P.colonnesPlan('base'), { assurance_plan: 'basique', assurance_prix: 1 });
  assert.deepEqual(P.colonnesPlan('standard'), { assurance_plan: 'standard', assurance_prix: 2.99 });
  for (const plan of ['none', 'base', 'standard', 'plus']) assert.ok(ok.includes(P.colonnesPlan(plan).assurance_plan), plan);
});

test('plan réel à la lecture : journal d’abord, sinon prime ; « basique » seul = aucune', () => {
  assert.equal(R.planProtectionReel({ assurance_plan: 'basique', assurance_prix: 0 }), 'none', 'les 14 anciennes livraisons');
  assert.equal(R.planProtectionReel({ assurance_plan: 'basique', assurance_prix: 1 }), 'base');
  assert.equal(R.planProtectionReel({ assurance_plan: 'standard', assurance_prix: 2.99 }), 'standard');
  assert.equal(R.planProtectionReel({ assurance_plan: 'basique', assurance_prix: 0 }, 'base'), 'base', 'le journal l’emporte');
  assert.equal(R.planProtectionReel({ assurance_plan: 'base' }), 'base', 'base prod-v2 (bons noms)');
  assert.equal(R.primeProtectionCents(R.planProtectionReel({ assurance_plan: 'basique', assurance_prix: 1 })), 100, 'la prime Base va au fonds');
});

for (const [plan, attendu] of [['none', ['basique', 0, 'none']], ['base', ['basique', 1, 'base']], ['standard', ['standard', 2.99, 'standard']], ['Base - 1 $ - couverture max 50 $', ['basique', 1, 'base']]]) {
  test(`création normale (plan « ${plan} ») : description, type, poids, valeur, date et plan GARDÉS`, async () => {
    const db = base();
    const r = await creer({ ...NORMAL, assurance_plan: plan });
    assert.equal(r._status, 200, JSON.stringify(r._body));
    const l = db.tables.livraisons[0];
    assert.equal(l.description, 'TEST — boîte de livres');
    assert.equal(l.type_colis, 'colis');
    assert.equal(l.taille_colis, 'moyen');
    assert.equal(l.poids_kg, 4);
    assert.equal(l.valeur_declaree, 80);
    assert.equal(l.date_souhaitee, '2026-12-01');
    assert.equal(l.assurance_plan, attendu[0]);
    assert.equal(l.assurance_prix, attendu[1]);
    const ev = db.tables.transaction_audit_events.find((e) => e.event_type === 'plan_protection' && e.livraison_id === l.id);
    assert.equal(ev.evidence.plan, attendu[2], 'plan réel noté au journal');
    assert.equal(R.planProtectionReel(l, ev.evidence.plan), attendu[2]);
    assert.ok(!(db.refus || []).some((x) => x.contrainte), 'aucune contrainte violée');
  });
}

test('une valeur refusée par la base est SIGNALÉE (plus aucune colonne retirée en silence)', async () => {
  const db = base();
  const r = await creer({ ...NORMAL, taille_colis: 'enorme' });
  assert.equal(r._status, 400);
  assert.equal(db.tables.livraisons.length, 0, 'rien de créé à moitié');
  // insertWithSchemaFallback : une colonne qui N'EXISTE PAS est encore retirée ; une contrainte, non.
  const db2 = creerBase({});
  global.fetch = db2.fetch;
  const ok = await insertWithSchemaFallback('https://fake.supabase.co/rest/v1/livraisons', sbHeaders('k'), { expediteur_id: EXP, nom_destinataire: 'x', description: 'gardée' }, ['description']);
  assert.equal(ok.ok, true);
  assert.equal(db2.tables.livraisons[0].description, 'gardée');
  const ko = await insertWithSchemaFallback('https://fake.supabase.co/rest/v1/livraisons', sbHeaders('k'), { expediteur_id: EXP, assurance_plan: 'base', description: 'gardée' }, ['description', 'assurance_plan']);
  assert.equal(ko.ok, false);
  assert.equal(ko.data.code, '23514');
  assert.equal(db2.tables.livraisons.length, 1, 'pas de deuxième ligne sans description');
});

test('commande téléphonique : plan traduit et noté, ligne acceptée par la contrainte', () => {
  const src = require('node:fs').readFileSync('lib/_commande-telephone.js', 'utf8');
  assert.match(src, /\.\.\.colonnesPlan\(v\.protection\)/);
  assert.match(src, /await noterPlan\(ctx, livraison\.id, v\.protection, ctx\.session\.id\);/);
});
