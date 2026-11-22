// tests/prix-distance.test.js — Test complet du 22 nov. 2026, points 9 à 12 (prix et argent).
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

before(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const { distanceLivraison } = require('../lib/_distance');
const { gainLivreurCents } = require('../lib/_gain-livreur');
const platform = require('../api/platform');

const rep = (data, ok = true, status = ok ? 200 : 500) => ({ ok, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
const makeRes = () => ({ _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() { return this; } });
const EXP = '11111111-1111-4111-8111-111111111111';

async function appel(body, token) {
  global.fetch = async (url, o = {}) => {
    if (url.includes('/auth/v1/user')) return rep({ id: EXP, email: 'e@courriel-capture.ca', email_confirmed_at: '2026-01-01' });
    if (url.includes('/rest/v1/profiles')) return rep([{ id: EXP, role: 'expediteur', suspendu: false, email_verified: true }]);
    if (url.includes('/rest/v1/livraisons') && (o.method || 'GET') === 'POST') return rep([{ id: 'aaaaaaaa-0000-4000-8000-000000000001', ...JSON.parse(o.body) }], true, 201);
    return rep([]);
  };
  const res = makeRes();
  await platform({ method: 'POST', url: '/api/platform', query: {}, body, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer t' } : {}) } }, res);
  return res;
}

describe('10. distance', () => {
  test('Saint-Nicolas (G7A) → Place Laurier (G1V) : environ 17 km par les ponts (avant : 3 km)', () => {
    const d = distanceLivraison({ ville_depart: 'Lévis', ville_arrivee: 'Québec', cp_depart: 'G7A 2Y4', cp_arrivee: 'G1V 2L8' });
    assert.ok(d.km >= 14 && d.km <= 22, `${d.km} km`);
    assert.match(d.methode, /par les ponts/);
  });
  test('sans code postal : Lévis → Québec n\'est plus 3 km', () => {
    assert.ok(distanceLivraison({ ville_depart: 'Lévis', ville_arrivee: 'Québec' }).km >= 15);
    assert.ok(distanceLivraison({ ville_depart: 'Québec', ville_arrivee: 'Lévis' }).km >= 15);
  });
  test('même rive : pas de détour par les ponts', () => {
    const d = distanceLivraison({ ville_depart: 'Québec', ville_arrivee: 'Québec', cp_depart: 'G1R', cp_arrivee: 'G1V' });
    assert.doesNotMatch(d.methode, /ponts/);
    assert.ok(d.km >= 4 && d.km <= 12, `${d.km} km`);
  });
  test('trajets connus inchangés (Québec–Montréal 233 km), code postal mal formé ignoré', () => {
    assert.equal(distanceLivraison({ ville_depart: 'Montréal', ville_arrivee: 'Québec' }).km, 233);
    assert.equal(distanceLivraison({ ville_depart: 'Montréal', ville_arrivee: 'Québec', cp_depart: '12345', cp_arrivee: 'xx' }).km, 233);
  });
});

describe('9. le prix du formulaire = la règle du serveur', () => {
  const cas = [
    { ville_depart: 'Lévis', ville_arrivee: 'Québec', code_postal_depart: 'G7A 1A1', code_postal_arrivee: 'G1V 2L8', poids_kg: 0.2, taille_colis: 'petit', type_colis: 'document' },
    { ville_depart: 'Lévis', ville_arrivee: 'Québec', poids_kg: 1, taille_colis: 'moyen', type_colis: 'colis' },
    { ville_depart: 'Québec', ville_arrivee: 'Québec', code_postal_depart: 'G1R', code_postal_arrivee: 'G2N', poids_kg: 12, taille_colis: 'gros', type_colis: 'electronique' },
    { ville_depart: 'Québec', ville_arrivee: 'Montréal', poids_kg: 3, taille_colis: 'xl', type_colis: 'meuble' },
  ];
  for (const c of cas) {
    test(`suggéré accepté, minimum − 0,01 $ refusé : ${c.ville_depart} → ${c.ville_arrivee} (${c.type_colis})`, async () => {
      const est = await appel({ endpoint: 'price-estimate', ...c });
      assert.equal(est._status, 200);
      const { suggested_price_cad: sug, min_price_cad: min } = est._body;
      assert.ok(sug >= min && min > 0);
      const base = { endpoint: 'create-livraison', ...c, adresse_depart: '1 rue A', adresse_arrivee: '2 rue B' };
      const ok = await appel({ ...base, prix_base: sug, prix_total: sug + 2 }, true);
      assert.equal(ok._status, 200, JSON.stringify(ok._body));
      const non = await appel({ ...base, prix_base: min - 0.01, prix_total: min + 2 }, true);
      assert.equal(non._status, 400);
      assert.equal(non._body.min_price_cad, min, 'le serveur calcule le même minimum que le formulaire');
    });
  }
  test('formulaire : envoie les codes postaux, se remplit sans attendre le poids, affiche le minimum', () => {
    const html = fs.readFileSync('create-mission.html', 'utf8');
    assert.match(html, /code_postal_depart: el\('pickup-postal'\)\?\.value/);
    assert.match(html, /code_postal_depart:el\('pickup-postal'\)\.value\.trim\(\)/);
    assert.match(html, /const poids = parseFloat\(el\('weight'\)\?\.value\) \|\| 1;/);
    assert.doesNotMatch(html, /if \(!ville_depart \|\| !ville_arrivee \|\| !poids\)/);
    assert.match(html, /el\('price-min'\)\.textContent = prixMinimum\.toFixed\(2\)/);
    assert.match(html, /baseInput\.value = Number\(out\.suggested_price_cad\)\.toFixed\(2\)/);
    assert.match(html, /const platFee=base>0\?Math\.max\(2\.00,base\*\.15\):0;/);
  });
});

describe('11. gain du livreur', () => {
  function gainNavigateur() {
    const win = {};
    vm.runInNewContext(fs.readFileSync('js/gain-livreur.js', 'utf8'), { window: win, Math, Number });
    return win.PAPGain;
  }
  test('le navigateur et le paiement réel calculent exactement le même gain', () => {
    const G = gainNavigateur();
    for (const c of [0, 1, 999, 1000, 1001, 2345, 99999]) {
      for (const f of [0, 3, 10, 25]) {
        for (const r of [0, 20]) {
          assert.deepEqual({ ...G.cents(c, { fidelitePct: f, sauvetagePct: r }) }, gainLivreurCents(c, { fidelitePct: f, sauvetagePct: r }), `${c} ${f} ${r}`);
        }
      }
    }
  });
  test('10,00 $ payés : « 6,00 $ » (60 %, la règle du paiement réel)', () => {
    assert.equal(gainNavigateur().texte(10), '6,00 $');
    assert.equal(gainLivreurCents(1000).netCents, 600);
    assert.equal(gainLivreurCents(1000, { fidelitePct: 50 }).pct, 70, 'fidélité plafonnée à +10');
  });
  test('le paiement réel utilise la règle unique', () => {
    const src = fs.readFileSync('api/capture-livraison.js', 'utf8');
    assert.match(src, /gainLivreurCents\(grossCents, \{ fidelitePct: loyaltyBonus, sauvetagePct: rescuePct \}\)/);
  });
  test('les écrans du livreur affichent « Tu gagnes » et la vraie part', () => {
    const dl = fs.readFileSync('dashboard-livreur.html', 'utf8');
    assert.equal((dl.match(/Tu gagnes : \$\{gainTexte\(m\.prix_total\)\}/g) || []).length, 2);
    assert.equal((dl.match(/Tu gagnes : \$\{gainTexte\(row\.prix_total\)\}/g) || []).length, 2);
    assert.doesNotMatch(dl, /<span class="mission-price">\$\{money\(m\.prix_total\)\}<\/span>/);
    assert.match(dl, /`Toi \(\$\{basePct\} % du prix payé\)`/);
    assert.match(dl, /return window\.PAPGain\.cents\(10000, \{ fidelitePct: Number\(profile\?\.loyalty_bonus_pct\) \|\| 0 \}\)\.pct;/);
    const bm = fs.readFileSync('browse-missions.html', 'utf8');
    assert.match(bm, /Tu gagnes : \$\{window\.PAPGain\.texte\(m\.prix_total \|\| 0\)\}/);
    assert.doesNotMatch(bm, /<div class="price">\$\{money\(m\.prix_total\)\}<\/div>/);
  });
});

describe('12. page de paiement d\'une livraison déjà créée', () => {
  const html = fs.readFileSync('paiement.html', 'utf8');
  test('le colis n\'est pas redemandé : étape masquée, résumé avec le type choisi', () => {
    const lock = html.slice(html.indexOf('function lockMissionFields()'), html.indexOf('function libelleTypeColis'));
    assert.match(lock, /document\.getElementById\('etape-colis'\)/);
    assert.match(lock, /etape\.hidden = true/);
    assert.match(html, /<div class="step-block" id="etape-colis">[\s\S]*id="mode-prix"/, 'le mode de prix est dans l\'étape masquée');
    assert.match(html, /afficherRecapColis\(livraison\);/);
    assert.match(html, /\[hidden\]\{display:none!important\}/);
  });
  test('« document » reste « Document »', () => {
    const win = {};
    const f = html.slice(html.indexOf('function libelleTypeColis'), html.indexOf('function afficherRecapColis'));
    vm.runInNewContext(f + ';out = libelleTypeColis("document");', win);
    assert.equal(win.out, 'Document');
  });
  test('téléphone pas redemandé pour une livraison déjà créée', () => {
    assert.match(html, /if \(getParam\('livraison_id'\) \|\| getParam\('id'\)\) \{\s*const bloc = document\.getElementById\('bloc-tel'\);\s*if \(bloc\) bloc\.hidden = true;/);
  });
});
