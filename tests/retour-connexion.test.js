// tests/retour-connexion.test.js — Après la connexion, on revient au même onglet du tableau de bord
// (décision de Denis, 24 nov. 2026 : Livrer, Profil, Sécurité… et vérifier tous les onglets).
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const MEMBRES = ['accueil', 'covoiturage', 'envois', 'recus', 'livrer', 'paiements', 'versements', 'profil', 'securite', 'badges', 'parrainage'];
const AVEC_RETOUR = /location\.href = '\/login\.html\?next=' \+ encodeURIComponent\((window\.)?location\.pathname \+ (window\.)?location\.search\)/;

describe('aucune page de l\'espace membre n\'envoie à la connexion sans adresse de retour', () => {
  for (const k of MEMBRES) {
    test(`membre-${k}.html`, () => {
      const h = lire(`membre-${k}.html`);
      assert.doesNotMatch(h, /location\.(href\s*=|replace\()\s*['"]\/login\.html['"]/, 'renvoi sans ?next=');
      assert.doesNotMatch(h, /login\.html\?redirect=\/dashboard\.html['"]/, 'retour à l\'Accueil au lieu de l\'onglet');
    });
  }
  test('Livrer, Profil, Historique des paiements, Accueil : retour à l\'adresse en cours', () => {
    for (const k of ['livrer', 'profil', 'paiements']) assert.match(lire(`membre-${k}.html`), /if \(!data\?\.session\) \{ window\.location\.href = '\/login\.html\?next=' \+ encodeURIComponent\(location\.pathname \+ location\.search\); return; \}/, k);
    assert.equal((lire('membre-accueil.html').match(new RegExp(AVEC_RETOUR, 'g')) || []).length, 3);
  });
  test('garde partagée (Sécurité, Mes envois) : pas de session → retour à la même page', () => {
    const js = lire('js/auth-complete.js');
    assert.match(js, /window\.location\.href = '\/login\.html\?next=' \+ encodeURIComponent\(window\.location\.pathname \+ window\.location\.search\);/);
    assert.ok(lire('membre-securite.html').includes('/js/auth-complete.js') && lire('membre-envois.html').includes('/js/auth-complete.js'));
  });
  test('messagerie covoiturage / livraison : retour à la même page', () => {
    const js = lire('js/ride-chat.js');
    assert.doesNotMatch(js, /location\.href = '\/login\.html'/);
    assert.equal((js.match(new RegExp(AVEC_RETOUR, 'g')) || []).length, 3);
  });
});

// La page de connexion accepte bien l'adresse d'un onglet (même fonction que sur le site).
function fonction(src, nom) {
  const i = src.indexOf(`function ${nom}(`);
  assert.ok(i >= 0, nom);
  let p = src.indexOf('{', i), n = 0, j = p;
  for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}' && --n === 0) break; }
  return src.slice(i, j + 1);
}
function destination(recherche, stockage = {}) {
  const ctx = { window: { location: { search: recherche, origin: 'https://porteaporte.site' } }, URL, URLSearchParams,
    sessionStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = v; }, removeItem: (k) => { delete stockage[k]; } } };
  vm.runInNewContext(fonction(lire('login.html'), 'getSafeNextUrl') + '\nr = getSafeNextUrl();', ctx);
  return ctx.r;
}

describe('page de connexion : retour à l\'onglet', () => {
  test('?next= d\'un onglet → même onglet, même vue', () => {
    for (const u of ['/dashboard.html?onglet=livrer', '/dashboard.html?onglet=compte&vue=securite', '/dashboard.html?onglet=paiements&vue=versements']) {
      assert.equal(destination('?next=' + encodeURIComponent(u)), u);
      assert.equal(destination('?expiree=1&redirect=' + encodeURIComponent(u)), u);
    }
  });
  test('autre site ou admin refusés (inchangé)', () => {
    assert.equal(destination('?next=' + encodeURIComponent('https://exemple.com/x')), '');
    assert.equal(destination('?next=%2Fadmin%2Findex.html'), '');
  });
  test('message neutre après la connexion', () => {
    assert.match(lire('login.html'), /'Connexion réussie ! Retour à ta page\.\.\.'/);
  });
  test('connexion Google : l\'adresse est gardée pour la session, role-choice.html y retourne puis l\'efface', () => {
    const h = lire('login.html');
    assert.match(h, /const n = getSafeNextUrl\(\); if \(n\) sessionStorage\.setItem\('pap_next', n\); else sessionStorage\.removeItem\('pap_next'\);/);
    const r = lire('role-choice.html');
    assert.equal((r.match(/if \(!raw\) \{ try \{ raw = sessionStorage\.getItem\('pap_next'\) \|\| ''; sessionStorage\.removeItem\('pap_next'\); \} catch \(_\) \{\} \}/g) || []).length, 2);
    // la même vérification d'origine s'applique ensuite (adresse d'un autre site refusée)
    assert.equal((r.match(/u\.origin === window\.location\.origin && p && p !== '\/login\.html'/g) || []).length, 2);
  });
  test('role-choice : la destination gardée est utilisée une seule fois', () => {
    const src = lire('role-choice.html');
    const st = { pap_next: '/dashboard.html?onglet=livrer' };
    const ctx = { window: { location: { search: '', origin: 'https://porteaporte.site' } }, URL, URLSearchParams,
      sessionStorage: { getItem: (k) => (k in st ? st[k] : null), removeItem: (k) => { delete st[k]; } } };
    vm.runInNewContext(fonction(src, 'preferredDestination') + '\nr1 = preferredDestination([]); r2 = preferredDestination([]);', ctx);
    assert.equal(ctx.r1, '/dashboard.html?onglet=livrer');
    assert.equal(ctx.r2, '/dashboard.html');
    st.pap_next = 'https://exemple.com/x';
    vm.runInNewContext(fonction(src, 'preferredDestination') + '\nr3 = preferredDestination([]);', ctx);
    assert.equal(ctx.r3, '/dashboard.html');
  });
});
