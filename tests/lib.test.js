// tests/lib.test.js — Tests unitaires pour api/_lib.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeEnv,
  safeIds,
  normalizeText,
  normalizeCity,
  estimateRouteKm,
  driverTransportMode,
  deliveryEligibility,
  mergeUserRole,
  isEmailVerified,
  isVerifiedDriver,
  toNumber,
  missingColumn,
  hashReceptionCode,
  generateReceptionCode,
  defaultRewardMissions,
  normalizeRole,
  roleIn,
  sbHeaders,
  parseDataUrl,
} = require('../lib/_lib');

// ─── sanitizeEnv ──────────────────────────────────────────────────────────────
describe('sanitizeEnv', () => {
  test('retourne la valeur normale sans changement', () => {
    assert.equal(sanitizeEnv('hello'), 'hello');
  });

  test('supprime les espaces en début et fin', () => {
    assert.equal(sanitizeEnv('  sk_live_123  '), 'sk_live_123');
  });

  test('supprime le BOM U+FEFF en début', () => {
    assert.equal(sanitizeEnv('﻿sk_live_123'), 'sk_live_123');
  });

  test('supprime plusieurs caractères non-ASCII en début', () => {
    assert.equal(sanitizeEnv('﻿​sk_test_abc'), 'sk_test_abc');
  });

  test('retourne chaîne vide pour null/undefined', () => {
    assert.equal(sanitizeEnv(null), '');
    assert.equal(sanitizeEnv(undefined), '');
    assert.equal(sanitizeEnv(''), '');
  });
});

// ─── safeIds ─────────────────────────────────────────────────────────────────
describe('safeIds', () => {
  test('accepte les UUIDs valides', () => {
    const ids = [
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ];
    assert.deepEqual(safeIds(ids), ids);
  });

  test('rejette les IDs avec caractères SQL dangereux', () => {
    const malicious = ["' OR 1=1--", 'uuid); DROP TABLE--', '<script>'];
    assert.deepEqual(safeIds(malicious), []);
  });

  test('rejette les IDs trop longs', () => {
    const tooLong = ['a'.repeat(65)];
    assert.deepEqual(safeIds(tooLong), []);
  });

  test('filtre un tableau mixte valide/invalide', () => {
    const valid = 'abc123-def456';
    const invalid = "'; DROP TABLE users; --";
    assert.deepEqual(safeIds([valid, invalid]), [valid]);
  });

  test('retourne tableau vide pour entrée null/undefined', () => {
    assert.deepEqual(safeIds(null), []);
    assert.deepEqual(safeIds(undefined), []);
    assert.deepEqual(safeIds([]), []);
  });
});

// ─── normalizeText ────────────────────────────────────────────────────────────
describe('normalizeText', () => {
  test('convertit en minuscules', () => {
    assert.equal(normalizeText('BONJOUR'), 'bonjour');
  });

  test('supprime les accents', () => {
    assert.equal(normalizeText('Québec'), 'quebec');
    assert.equal(normalizeText('Montréal'), 'montreal');
    assert.equal(normalizeText('Île'), 'ile');
  });

  test('supprime les espaces en début/fin', () => {
    assert.equal(normalizeText('  hello  '), 'hello');
  });

  test('gère null/undefined', () => {
    assert.equal(normalizeText(null), '');
    assert.equal(normalizeText(undefined), '');
  });
});

// ─── normalizeCity ────────────────────────────────────────────────────────────
describe('normalizeCity', () => {
  test('supprime tirets et espaces', () => {
    assert.equal(normalizeCity('Trois-Rivières'), 'troisrivieres');
    assert.equal(normalizeCity('Saint-Jean'), 'saintjean');
  });

  test('ne garde que lettres et chiffres', () => {
    assert.equal(normalizeCity('Québec (QC)'), 'quebecqc');
  });
});

// ─── estimateRouteKm ─────────────────────────────────────────────────────────
describe('estimateRouteKm', () => {
  test('paire connue Québec-Montréal → distance directe', () => {
    assert.equal(estimateRouteKm('québec', 'montréal'), 233);
    assert.equal(estimateRouteKm('Quebec', 'Montreal'), 233);
  });

  test('paire inversée symétrique', () => {
    assert.equal(estimateRouteKm('montréal', 'québec'), 233);
  });

  test('même ville → 5 km', () => {
    assert.equal(estimateRouteKm('Montréal', 'Montreal'), 5);
  });

  test('paire inconnue → 200 km (fallback)', () => {
    assert.equal(estimateRouteKm('VilleInventeeA', 'VilleInventeeB'), 200);
  });

  test('valeur manquante → null', () => {
    assert.equal(estimateRouteKm('', 'Montréal'), null);
    assert.equal(estimateRouteKm('Montréal', ''), null);
    assert.equal(estimateRouteKm(null, null), null);
  });

  test('Lévis-Québec → distance directe', () => {
    assert.equal(estimateRouteKm('Lévis', 'Québec'), 3);
  });

  test('Montréal-Laval → distance directe', () => {
    assert.equal(estimateRouteKm('Montréal', 'Laval'), 14);
  });
});

// ─── driverTransportMode ─────────────────────────────────────────────────────
describe('driverTransportMode', () => {
  test('voiture → car', () => {
    assert.equal(driverTransportMode({ mode_livraison: 'voiture' }), 'car');
    assert.equal(driverTransportMode({ vehicule: 'auto' }), 'car');
  });

  test('vélo → bike', () => {
    assert.equal(driverTransportMode({ mode_livraison: 'vélo' }), 'bike');
    assert.equal(driverTransportMode({ transport_mode: 'bike' }), 'bike');
  });

  test('à pied → foot', () => {
    assert.equal(driverTransportMode({ mode_livraison: 'à pied' }), 'foot');
    assert.equal(driverTransportMode({ transport_mode: 'pied' }), 'foot');
  });

  test('trottinette → scooter', () => {
    assert.equal(driverTransportMode({ transport_mode: 'trottinette' }), 'scooter');
  });

  test('profil vide → unknown', () => {
    assert.equal(driverTransportMode({}), 'unknown');
    assert.equal(driverTransportMode(null), 'unknown');
  });

  test('camion → truck', () => {
    assert.equal(driverTransportMode({ vehicule: 'camion' }), 'truck');
  });
});

// ─── deliveryEligibility ─────────────────────────────────────────────────────
describe('deliveryEligibility', () => {
  const livraisonLocale = { ville_depart: 'Montréal', ville_arrivee: 'Montréal' };
  const livraisonLongue = { ville_depart: 'Montréal', ville_arrivee: 'Québec' };

  test('admin → toujours autorisé', () => {
    const admin = { role: 'admin', suspendu: false };
    const result = deliveryEligibility(admin, livraisonLongue);
    assert.equal(result.allowed, true);
    assert.equal(result.mode, 'motor');
  });

  test('moteur → autorisé pour toutes distances', () => {
    const livreur = { role: 'livreur', suspendu: false, mode_livraison: 'voiture', ville: 'montréal' };
    assert.equal(deliveryEligibility(livreur, livraisonLongue).allowed, true);
  });

  test('à pied → refusé si ville différente', () => {
    const livreur = { role: 'livreur', suspendu: false, mode_livraison: 'à pied' };
    const result = deliveryEligibility(livreur, livraisonLongue);
    assert.equal(result.allowed, false);
  });

  test('à pied → autorisé si même ville', () => {
    const livreur = { role: 'livreur', suspendu: false, mode_livraison: 'à pied', ville: 'montréal' };
    assert.equal(deliveryEligibility(livreur, livraisonLocale).allowed, true);
  });

  test('à pied → refusé si colis trop lourd', () => {
    const livreur = { role: 'livreur', suspendu: false, mode_livraison: 'à pied', ville: 'montréal' };
    const lourd = { ville_depart: 'Montréal', ville_arrivee: 'Montréal', poids_kg: 10 };
    assert.equal(deliveryEligibility(livreur, lourd).allowed, false);
  });

  test('vélo → refusé si ville différente', () => {
    const livreur = { role: 'livreur', suspendu: false, mode_livraison: 'vélo' };
    assert.equal(deliveryEligibility(livreur, livraisonLongue).allowed, false);
  });

  test('villes manquantes → refusé', () => {
    const livreur = { role: 'livreur', suspendu: false, mode_livraison: 'voiture' };
    assert.equal(deliveryEligibility(livreur, { ville_depart: '', ville_arrivee: '' }).allowed, false);
  });
});

// ─── mergeUserRole ────────────────────────────────────────────────────────────
describe('mergeUserRole', () => {
  test('expéditeur + livreur → les deux', () => {
    assert.equal(mergeUserRole('expediteur', 'livreur'), 'les deux');
    assert.equal(mergeUserRole('livreur', 'expediteur'), 'les deux');
  });

  test('admin reste admin', () => {
    assert.equal(mergeUserRole('admin', 'livreur'), 'admin');
  });

  test('demander "les deux" → les deux', () => {
    assert.equal(mergeUserRole('expediteur', 'les deux'), 'les deux');
  });

  test('demander "both" → les deux', () => {
    assert.equal(mergeUserRole('expediteur', 'both'), 'les deux');
  });

  test('déjà "les deux" → reste les deux', () => {
    assert.equal(mergeUserRole('les deux', 'livreur'), 'les deux');
  });

  test('fallback expediteur si rôle inconnu', () => {
    assert.equal(mergeUserRole(null, 'expediteur'), 'expediteur');
  });
});

// ─── isEmailVerified ─────────────────────────────────────────────────────────
describe('isEmailVerified', () => {
  test('vérifié via profile.email_verified', () => {
    assert.equal(isEmailVerified({}, { email_verified: true }), true);
  });

  test('vérifié via session.email_confirmed_at', () => {
    assert.equal(isEmailVerified({ email_confirmed_at: '2024-01-01' }, {}), true);
  });

  test('non vérifié si rien', () => {
    assert.equal(isEmailVerified({}, {}), false);
    assert.equal(isEmailVerified(null, null), false);
  });
});

// ─── isVerifiedDriver ─────────────────────────────────────────────────────────
describe('isVerifiedDriver', () => {
  test('livreur vérifié + email confirmé → true', () => {
    const session = { email_confirmed_at: '2024-01-01' };
    const profile = { role: 'livreur', suspendu: false, driver_status: 'verified', email_verified: true };
    assert.equal(isVerifiedDriver(session, profile), true);
  });

  test('livreur suspendu → false', () => {
    const session = { email_confirmed_at: '2024-01-01' };
    const profile = { role: 'livreur', suspendu: true, driver_status: 'verified', email_verified: true };
    assert.equal(isVerifiedDriver(session, profile), false);
  });

  test('driver_status != verified → false', () => {
    const session = { email_confirmed_at: '2024-01-01' };
    const profile = { role: 'livreur', suspendu: false, driver_status: 'pending', email_verified: true };
    assert.equal(isVerifiedDriver(session, profile), false);
  });

  test('admin non suspendu → toujours true', () => {
    assert.equal(isVerifiedDriver({}, { role: 'admin', suspendu: false }), true);
  });

  test('admin suspendu → false', () => {
    assert.equal(isVerifiedDriver({}, { role: 'admin', suspendu: true }), false);
  });
});

// ─── toNumber ────────────────────────────────────────────────────────────────
describe('toNumber', () => {
  test('convertit une string numérique', () => {
    assert.equal(toNumber('42'), 42);
    assert.equal(toNumber('3.14'), 3.14);
  });

  test('retourne fallback pour NaN', () => {
    assert.equal(toNumber('abc', 0), 0);
    assert.equal(toNumber(undefined, 99), 99);
  });

  test('null coerce en 0 (Number(null) === 0) → retourne 0, pas le fallback', () => {
    // Number(null) = 0, qui est un nombre fini → toNumber retourne 0, pas le fallback
    assert.equal(toNumber(null, -1), 0);
  });

  test('retourne null par défaut pour invalide', () => {
    assert.equal(toNumber('abc'), null);
  });

  test('0 est un nombre valide', () => {
    assert.equal(toNumber(0, -1), 0);
    assert.equal(toNumber('0', -1), 0);
  });
});

// ─── missingColumn ────────────────────────────────────────────────────────────
describe('missingColumn', () => {
  test('extrait le nom de colonne manquante', () => {
    assert.equal(
      missingColumn("Could not find the 'transport_mode' column"),
      'transport_mode'
    );
  });

  test('retourne null si pas de colonne manquante', () => {
    assert.equal(missingColumn('Some other error'), null);
    assert.equal(missingColumn(null), null);
  });

  test('fonctionne avec un objet error', () => {
    assert.equal(
      missingColumn({ message: "Could not find the 'driver_status' column" }),
      'driver_status'
    );
  });
});

// ─── hashReceptionCode ────────────────────────────────────────────────────────
describe('hashReceptionCode', () => {
  test('déterministe — même entrée → même hash', () => {
    const h1 = hashReceptionCode('123456', 'livraison-abc');
    const h2 = hashReceptionCode('123456', 'livraison-abc');
    assert.equal(h1, h2);
  });

  test('hash différent si code différent', () => {
    const h1 = hashReceptionCode('123456', 'livraison-abc');
    const h2 = hashReceptionCode('654321', 'livraison-abc');
    assert.notEqual(h1, h2);
  });

  test('hash différent si livraisonId différent', () => {
    const h1 = hashReceptionCode('123456', 'livraison-abc');
    const h2 = hashReceptionCode('123456', 'livraison-xyz');
    assert.notEqual(h1, h2);
  });

  test('produit un hash hexadécimal de 64 caractères (SHA-256)', () => {
    const h = hashReceptionCode('999999', 'test-id');
    assert.match(h, /^[0-9a-f]{64}$/);
  });
});

// ─── generateReceptionCode ────────────────────────────────────────────────────
describe('generateReceptionCode', () => {
  test('produit un code de 6 chiffres', () => {
    const code = generateReceptionCode();
    assert.match(code, /^\d{6}$/);
  });

  test('génère des codes différents', () => {
    const codes = new Set();
    for (let i = 0; i < 10; i++) codes.add(generateReceptionCode());
    // très peu probable qu'on obtienne 10 fois le même code
    assert.ok(codes.size > 1, 'Les codes devraient être variés');
  });
});

// ─── defaultRewardMissions ────────────────────────────────────────────────────
describe('defaultRewardMissions', () => {
  test('retourne exactement 3 missions', () => {
    const missions = defaultRewardMissions();
    assert.equal(missions.length, 3);
  });

  test('chaque mission a les champs requis', () => {
    for (const m of defaultRewardMissions()) {
      assert.ok(m.id, 'mission doit avoir un id');
      assert.ok(m.title, 'mission doit avoir un title');
      assert.ok(m.reward_coins > 0, 'reward_coins doit être positif');
      assert.equal(m.status, 'active');
    }
  });

  test('la deadline est dans le futur', () => {
    const now = new Date();
    for (const m of defaultRewardMissions()) {
      assert.ok(new Date(m.deadline) > now, 'deadline doit être future');
    }
  });
});

// ─── roleIn ──────────────────────────────────────────────────────────────────
describe('roleIn', () => {
  test('normalise les variantes du role double', () => {
    assert.equal(normalizeRole('both'), 'les deux');
    assert.equal(normalizeRole('les_deux'), 'les deux');
    assert.equal(normalizeRole('livreur-expediteur'), 'les deux');
  });

  test('accepte les roles normalises', () => {
    assert.equal(roleIn({ role: 'both', suspendu: false }, ['les deux']), true);
    assert.equal(roleIn({ role: 'expéditeur', suspendu: false }, ['expediteur']), true);
    assert.equal(roleIn({ role: 'les_deux', suspendu: true }, ['les deux']), false);
  });

  test('accepte un rôle autorisé', () => {
    assert.equal(roleIn({ role: 'admin', suspendu: false }, ['admin', 'livreur']), true);
  });

  test('refuse si rôle non dans la liste', () => {
    assert.equal(roleIn({ role: 'expediteur', suspendu: false }, ['livreur']), false);
  });

  test('refuse si suspendu', () => {
    assert.equal(roleIn({ role: 'admin', suspendu: true }, ['admin']), false);
  });

  test('refuse si profile null (retourne falsy)', () => {
    // profile && ... avec profile=null retourne null (falsy), pas false strict
    assert.ok(!roleIn(null, ['admin']), 'doit être falsy');
  });
});

// ─── sbHeaders ────────────────────────────────────────────────────────────────
describe('sbHeaders', () => {
  test('inclut apikey et Authorization', () => {
    const h = sbHeaders('my-secret-key');
    assert.equal(h.apikey, 'my-secret-key');
    assert.equal(h.Authorization, 'Bearer my-secret-key');
  });

  test('prefer par défaut = return=representation', () => {
    const h = sbHeaders('key');
    assert.equal(h.Prefer, 'return=representation');
  });

  test('prefer personnalisable', () => {
    const h = sbHeaders('key', 'return=minimal');
    assert.equal(h.Prefer, 'return=minimal');
  });
});

// ─── parseDataUrl ─────────────────────────────────────────────────────────────
describe('parseDataUrl', () => {
  test('parse un data URL JPEG valide', () => {
    const data = 'data:image/jpeg;base64,' + Buffer.from('test').toString('base64');
    const result = parseDataUrl(data);
    assert.ok(result);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.ext, 'jpg');
    assert.ok(result.buffer instanceof Buffer);
  });

  test('parse un data URL PNG valide', () => {
    const data = 'data:image/png;base64,' + Buffer.from('test').toString('base64');
    const result = parseDataUrl(data);
    assert.ok(result);
    assert.equal(result.ext, 'png');
  });

  test('retourne null pour URL invalide', () => {
    assert.equal(parseDataUrl('https://example.com/img.jpg'), null);
    assert.equal(parseDataUrl('not-a-data-url'), null);
    assert.equal(parseDataUrl(null), null);
  });

  test('normalise image/jpg → image/jpeg', () => {
    const data = 'data:image/jpg;base64,' + Buffer.from('x').toString('base64');
    const result = parseDataUrl(data);
    assert.equal(result.mimeType, 'image/jpeg');
  });
});
