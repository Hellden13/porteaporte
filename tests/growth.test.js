// tests/growth.test.js — Tests unitaires pour api/_growth.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { computeLevel, generateReferralCode } = require('../api/_growth');

// ─── computeLevel ─────────────────────────────────────────────────────────────
describe('computeLevel', () => {
  test('0 XP → Niveau 1 (Nouveau)', () => {
    const result = computeLevel(0);
    assert.equal(result.current.level, 1);
    assert.equal(result.current.name, 'Nouveau');
    assert.ok(result.next, 'doit avoir un niveau suivant');
  });

  test('199 XP → encore Niveau 1', () => {
    const result = computeLevel(199);
    assert.equal(result.current.level, 1);
  });

  test('200 XP → Niveau 2 (Fiable)', () => {
    const result = computeLevel(200);
    assert.equal(result.current.level, 2);
    assert.equal(result.current.name, 'Fiable');
  });

  test('500 XP → Niveau 3 (Habitué)', () => {
    const result = computeLevel(500);
    assert.equal(result.current.level, 3);
    assert.equal(result.current.name, 'Habitué');
  });

  test('1000 XP → Niveau 4 (Ambassadeur)', () => {
    const result = computeLevel(1000);
    assert.equal(result.current.level, 4);
    assert.equal(result.current.name, 'Ambassadeur');
  });

  test('2000 XP → Niveau 5 (Capitaine régional)', () => {
    const result = computeLevel(2000);
    assert.equal(result.current.level, 5);
    assert.equal(result.current.name, 'Capitaine régional');
    assert.equal(result.next, null, 'niveau max → pas de niveau suivant');
  });

  test('3000 XP → toujours Niveau 5', () => {
    const result = computeLevel(3000);
    assert.equal(result.current.level, 5);
  });

  test('retourne le XP exact dans la réponse', () => {
    const xp = 742;
    const result = computeLevel(xp);
    assert.equal(result.xp, xp);
  });

  test('progress est entre 0 et 100', () => {
    for (const xp of [0, 100, 200, 350, 500, 750, 1000, 1500, 2000, 5000]) {
      const result = computeLevel(xp);
      assert.ok(result.progress >= 0, `progress >= 0 pour XP=${xp}`);
      assert.ok(result.progress <= 100, `progress <= 100 pour XP=${xp}`);
    }
  });

  test('progress = 0 au début d\'un niveau', () => {
    // Niveau 2 commence à 200 XP
    const result = computeLevel(200);
    assert.equal(result.progress, 0);
  });

  test('progress = 100 au niveau max', () => {
    const result = computeLevel(2000);
    assert.equal(result.progress, 100);
  });

  test('progress ~ 50% au milieu d\'un niveau', () => {
    // Niveau 1 : 0-200 XP, milieu = 100 XP → progress = 50%
    const result = computeLevel(100);
    assert.equal(result.progress, 50);
  });

  test('current contient icon et benefit', () => {
    const result = computeLevel(500);
    assert.ok(result.current.icon, 'doit avoir une icône');
    assert.ok(result.current.benefit, 'doit avoir un avantage');
  });
});

// ─── generateReferralCode ─────────────────────────────────────────────────────
describe('generateReferralCode', () => {
  test('produit un code de 7 caractères', async () => {
    const code = await generateReferralCode('user-123');
    assert.equal(code.length, 7);
  });

  test('ne contient que des caractères alphanumériques majuscules valides', async () => {
    // Charset : ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (sans I, O, 0, 1)
    const code = await generateReferralCode('user-123');
    assert.match(code, /^[A-HJ-NP-Z2-9]{7}$/);
  });

  test('ne contient pas I, O, 0, 1 (ambiguïté visuelle)', async () => {
    // Tester plusieurs codes pour s'assurer de l'exclusion
    for (let i = 0; i < 20; i++) {
      const code = await generateReferralCode('user-' + i);
      assert.ok(!/[IO01]/.test(code), `Code ${code} ne devrait pas contenir I, O, 0, 1`);
    }
  });

  test('génère des codes différents', async () => {
    const codes = new Set();
    for (let i = 0; i < 10; i++) {
      codes.add(await generateReferralCode('user-' + i));
    }
    assert.ok(codes.size > 1, 'Les codes devraient être variés');
  });
});
