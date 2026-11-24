// tests/flottants-cellulaire.test.js — Boutons flottants sur cellulaire (vus sur Brave Android, 24 nov. 2026).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fl = lire('js/flottants.js');
const sos = lire('js/sos-button.js');

test('icônes lisibles : plus de marge intérieure qui écrase l’icône, icône de 26 px', () => {
  assert.ok(fl.includes("'.pap-launcher-btn,#pia-launch{padding:0!important;"));
  assert.ok(fl.includes("'.pap-launcher-btn svg,#pia-launch svg{max-width:none!important;flex:none!important;width:26px!important;height:26px!important}'"));
  assert.ok(!/#pia-launch svg\{width:22px/.test(fl), 'ancienne petite taille retirée');
});

test('boutons plus grands sur cellulaire (58 px), empilés sans se toucher', () => {
  assert.ok(fl.includes("'#pia-launch{width:58px!important;height:58px!important;"));
  assert.ok(fl.includes("'.pap-launcher-btn{width:58px!important;height:58px!important;"));
  // Aide : bas 12 + 58 = 70 ; Menu commence à 78.
  assert.match(fl, /#pia-launch\{width:58px[^']*bottom:12px/);
  assert.match(fl, /\.pap-launcher-btn\{width:58px[^']*bottom:78px/);
});

test('libellés clairs : « Menu » et « Aide » visibles, aria-label et title', () => {
  assert.ok(fl.includes(`'.pap-launcher-btn::after{content:"Menu"}'`));
  assert.ok(fl.includes(`'#pia-launch::after{content:"Aide"}'`));
  const al = lire('js/app-launcher.js');
  assert.ok(al.includes("btn.setAttribute('aria-label', 'Menu');") && al.includes("btn.title = 'Menu';"));
  const sw = lire('js/support-widget.js');
  assert.ok(sw.includes("button.setAttribute('aria-label', 'Aide (Pia)');") && sw.includes("button.title = 'Aide';"));
});

test('SOS : un seul bouton, même si le script est chargé deux fois', () => {
  assert.ok(sos.includes("if (document.querySelector('.pap-sos-fab')) return;"));
  const i = sos.indexOf("if (document.querySelector('.pap-sos-fab')) return;");
  assert.ok(i > 0 && i < sos.indexOf('    buildUI();'), 'la garde passe avant la construction');
  for (const f of fs.readdirSync(path.join(__dirname, '..')).filter((x) => x.endsWith('.html'))) {
    assert.ok((lire(f).match(/sos-button\.js/g) || []).length <= 1, f);
  }
});

test('SOS : le bouton « Niveau » ne se cache plus derrière (il monte au-dessus), et le SOS reste rouge', () => {
  assert.ok(sos.includes("document.body.classList.add('pap-avec-sos');"));
  assert.ok(fl.includes("'body.pap-avec-sos .pp-layer-pill{bottom:72px!important}'"));
  assert.ok(sos.includes("'.pap-sos-fab{background:linear-gradient(135deg,#ff3b3b,#c81e1e)!important;color:#fff!important}'"));
});

test('toutes les pages avec ces boutons chargent la correction (js/flottants.js)', () => {
  const sans = fs.readdirSync(path.join(__dirname, '..')).filter((x) => x.endsWith('.html'))
    .filter((f) => /app-launcher\.js|support-widget\.js|sos-button\.js/.test(lire(f)) && !lire(f).includes('/js/flottants.js'));
  assert.deepEqual(sans, []);
});
