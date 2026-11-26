'use strict';
// Point 9 (Denis, 26 nov. 2026) : les codes ne doivent jamais se retrouver à partir de l'identifiant
// de la livraison (que le livreur voit), ni à partir de ce qui est lisible en base.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const C = require('../lib/_codes-livraison');
const { hashReceptionCode } = require('../lib/_lib');
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
const ID = 'aaaaaaaa-0000-4000-8000-0000000000aa';

test('codes au hasard : deux créations pour le même identifiant donnent des codes différents, jamais l’ancien code dérivé', async () => {
  const vus = new Set();
  for (let i = 0; i < 5; i++) {
    const db = creerBase({ livraisons: [{ id: ID, statut: 'publie' }] });
    global.fetch = db.fetch;
    const c = await C.creerCodes(CTX, ID);
    assert.match(c.ramassage, /^\d{6}$/);
    assert.match(c.reception, /^\d{6}$/);
    assert.notEqual(c.ramassage, c.reception);
    vus.add(c.reception);
  }
  assert.ok(vus.size >= 4, 'au hasard');
  assert.ok(!vus.has(C.codesLivraison(ID).reception));
});

test('hachage en base À CLÉ : le recalculer depuis l’identifiant (même en essayant les 900 000 codes) ne marche pas', async () => {
  const db = creerBase({ livraisons: [{ id: ID, statut: 'publie' }] });
  global.fetch = db.fetch;
  const c = await C.creerCodes(CTX, ID);
  const h = db.tables.livraisons[0].recipient_confirmation_hash;
  assert.ok(h.startsWith('h2$'));
  // Ce qu'un livreur pouvait faire avant : SHA-256(code|id) pour chaque code. Aucun ne correspond plus.
  let trouve = null;
  for (let n = 100000; n < 1000000 && !trouve; n++) if (hashReceptionCode(String(n), ID) === h) trouve = n;
  assert.equal(trouve, null);
  // Avec un autre secret (ou sans), le bon code ne correspond pas non plus.
  const avant = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = 'un-autre-secret-de-test-assez-long';
  try { assert.equal(C.codeCorrespond('reception', c.reception, ID, h), false); } finally { process.env.INTERNAL_API_SECRET = avant; }
  assert.equal(C.codeCorrespond('reception', c.reception, ID, h), true);
  assert.equal(C.codeCorrespond('ramassage', c.reception, ID, h), false, 'un code ne vaut que pour sa sorte');
});

test('copie chiffrée : illisible sans le secret, réaffichée seulement si elle correspond au hachage', async () => {
  const db = creerBase({ livraisons: [{ id: ID, statut: 'publie' }] });
  global.fetch = db.fetch;
  const c = await C.creerCodes(CTX, ID);
  const ev = db.tables.transaction_audit_events.find((e) => e.event_type === C.CODES_CHIFFRES_EVENT);
  assert.equal(ev.user_id, null, 'aucun membre ne peut lire cette ligne (règle « user_id = moi »)');
  assert.ok(!JSON.stringify(ev.evidence).includes(c.reception) && !JSON.stringify(ev.evidence).includes(c.ramassage));
  assert.deepEqual(await C.lireCodes(CTX, db.tables.livraisons[0]), c);
  const avant = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = 'un-autre-secret-de-test-assez-long';
  try { assert.equal(C.dechiffrer(ev.evidence.reception), null); } finally { process.env.INTERNAL_API_SECRET = avant; }
});

test('code de ramassage : 5 essais faux au maximum, puis bloqué même avec le bon code (avant : aucune limite)', async () => {
  const db = creerBase({ livraisons: [{ id: ID, statut: 'confirme', expediteur_id: 'e' }] });
  global.fetch = db.fetch;
  const c = await C.creerCodes(CTX, ID);
  const liv = db.tables.livraisons[0];
  const essai = (code) => C.verifierCodeRamassage({ sbUrl: CTX.sbUrl, sbKey: CTX.sbKey, livraison: liv, code, req: { headers: {} }, acteurId: 'l' });
  const faux = c.ramassage === '111111' ? '222222' : '111111';
  for (let i = 1; i <= 5; i++) {
    const r = await essai(faux);
    assert.equal(r.ok, false);
    assert.equal(r.body.essais_restants, 5 - i);
  }
  const bloque = await essai(c.ramassage);
  assert.equal(bloque.status, 423);
  assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === C.PICKUP_BLOQUE_EVENT).length, 1);
});

test('livraisons en cours d’avant : hachage mis à niveau AVEC LE MÊME CODE (rien ne casse) ; livraisons finies intactes', async () => {
  const ancien = C.codesLivraison(ID);
  const ID2 = 'bbbbbbbb-0000-4000-8000-0000000000bb';
  const ID3 = 'cccccccc-0000-4000-8000-0000000000cc';
  const db = creerBase({ livraisons: [
    { id: ID, statut: 'confirme', recipient_confirmation_hash: hashReceptionCode(ancien.reception, ID), pickup_code_hash: hashReceptionCode(ancien.ramassage, ID) },
    { id: ID2, statut: 'publie', recipient_confirmation_hash: hashReceptionCode('654321', ID2), pickup_code_hash: null }, // vieux code au hasard
    { id: ID3, statut: 'livre', recipient_confirmation_hash: hashReceptionCode(C.codesLivraison(ID3).reception, ID3) },
  ] });
  global.fetch = db.fetch;
  const r = await C.mettreAJourHachages(CTX);
  assert.equal(r.mis_a_jour, 1);
  assert.equal(r.inconnus, 1);
  assert.deepEqual(r.inconnus_liste, [{ id: 'bbbbbbbb', cree_le: null, statut: 'publie', prix_total: null }], 'sans donnée personnelle');
  const [a, b, c] = db.tables.livraisons;
  assert.ok(a.recipient_confirmation_hash.startsWith('h2$') && a.pickup_code_hash.startsWith('h2$'));
  assert.ok(C.codeCorrespond('reception', ancien.reception, ID, a.recipient_confirmation_hash), 'même code de réception');
  assert.ok(C.codeCorrespond('ramassage', ancien.ramassage, ID, a.pickup_code_hash), 'même code de ramassage');
  assert.deepEqual(await C.lireCodes(CTX, a), ancien, 'toujours réaffiché à l’expéditeur');
  assert.equal(b.recipient_confirmation_hash, hashReceptionCode('654321', ID2), 'inconnu : laissé tel quel');
  assert.ok(!c.recipient_confirmation_hash.startsWith('h2$'), 'livraison finie : pas touchée');
  assert.equal((await C.mettreAJourHachages(CTX)).mis_a_jour, 0, 'idempotent');
});

test('branché partout : création, ramassage, codes de l’expéditeur, courriel d’assignation, messagerie, cron', () => {
  const fs = require('node:fs');
  const p = fs.readFileSync('api/platform.js', 'utf8');
  assert.match(p, /const codes = livraison\?\.id \? await creerCodes\(ctx, livraison\.id\) : null;/);
  assert.match(p, /const vPickup = await verifierCodeRamassage\(/);
  assert.match(p, /const c = await lireCodes\(ctx, livraison\);/);
  assert.match(p, /const codesAssign = await lireCodes\(ctx, livraison\);/);
  assert.doesNotMatch(p, /codesLivraison\(|hashReceptionCode\(pickup_code/);
  assert.match(fs.readFileSync('lib/_messagerie-livraison.js', 'utf8'), /await lireCodes\(ctx, c\.l\)/);
  assert.match(fs.readFileSync('api/cron-cleanup.js', 'utf8'), /if \(tache === 'codes-hachages'\) \{[\s\S]*results\.codes_hachages = await mettreAJourHachages\(\{ sbUrl, sbKey \}\);/);
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.ok(v.crons.some((c) => c.path === '/api/cron-codes-hachages'));
  assert.ok(v.rewrites.some((r) => r.source === '/api/cron-codes-hachages' && r.destination === '/api/cron-cleanup?tache=codes-hachages'));
});
