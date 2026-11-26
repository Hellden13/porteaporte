'use strict';
// Lot 3 (décisions de Denis, 26 nov. 2026) :
// 14. Protection colis : maximum 250 $ ; plan « Plus » (5,99 $ / 1 000 $) retiré partout, refusé côté serveur,
//     code gardé derrière un interrupteur désactivé ; livraisons existantes intactes.
// 15. Pied de page : « © 2026 PorteàPorte » (sans « inc. »).
// Pages vérifiées : celles qui sont déployées (save/, _archived/, outils-internes/ sont exclus par .vercelignore).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../lib/_protection');
const lire = (f) => fs.readFileSync(f, 'utf8');

function pagesPubliques() {
  const out = [];
  const parcourir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '_archived', 'save', 'tests', 'outils-internes', 'supabase'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p); else if (p.endsWith('.html')) out.push(p);
    }
  };
  parcourir('.');
  return out;
}

test('interrupteur « Plus » désactivé ; plafond 250 $', () => {
  assert.equal(P.PROTECTION_PLUS_ACTIVE, false);
  assert.equal(P.PLAFOND_PROTECTION_CAD, 250);
});

test('« Plus » reconnu sous toutes ses formes, les autres plans non', () => {
  for (const v of ['plus', 'PLUS', ' Plus - 5,99 $ - couverture max 1 000 $', '5.99', '5,99', 'Protection Plus']) assert.equal(P.estPlanPlus(v), true, v);
  for (const v of ['none', 'base', 'standard', 'Standard - 2,99 $ - couverture max 250 $', '', null, undefined, 'plusieurs']) assert.equal(P.estPlanPlus(v), false, String(v));
  assert.equal(P.refusPlanProtection('standard'), null);
  assert.equal(P.refusPlanProtection('plus').body.code, 'protection_plus_indisponible');
});

test('serveur : create-livraison appelle le refus AVANT l’insertion', () => {
  const src = lire('api/platform.js');
  const i = src.indexOf('const refusProtection = refusPlanProtection(payload.assurance_plan);');
  assert.ok(i > 0);
  assert.ok(i < src.indexOf('`${ctx.sbUrl}/rest/v1/livraisons`,', i), 'avant l’insertion');
});

test('code promo « protection offerte » : Standard (250 $) tant que « Plus » est désactivé', () => {
  const src = lire('lib/_promos.js');
  assert.match(src, /: \{ type: 'insurance_upgrade', amount: 0, label: 'Protection Standard offerte', insurance_level: 'standard' \}/);
  const cm = lire('create-mission.html');
  assert.doesNotMatch(cm, /INSURANCE_PLANS\.plus|value="plus"|5\.99/);
  assert.match(cm, /\(INSURANCE_PLANS\[d\.insurance_level\]\|\|INSURANCE_PLANS\.standard\)\.premium/);
});

test('aucune page n’offre plus « Plus » (5,99 $ / 1 000 $)', () => {
  const restes = [];
  for (const f of pagesPubliques()) {
    const h = lire(f);
    if (/5,99 \$|5\.99 CAD|value="5\.99"|value="plus"|couverture max(imale)? (de )?1 ?000|jusqu'à 1 000 \$|Protection Plus|Assurance Plus|niveau Plus|Plus 5,99/.test(h)) restes.push(f);
  }
  assert.deepEqual(restes, []);
});

test('pages de protection : plafond 250 $ annoncé', () => {
  const a = lire('assurance.html');
  assert.match(a, /Protection disponible de 0 \$ à 2,99 \$ par envoi/);
  assert.match(a, /Plafond de 0 \$ à 250 \$/);
  assert.doesNotMatch(a, /cap-plus|level-card plus/);
  assert.match(lire('faq.html'), /Standard 2,99 \$, jusqu'à 250 \$/);
  assert.doesNotMatch(lire('cgv.html'), /Protection Plus/);
  assert.doesNotMatch(lire('paiement.html'), /5,99|1 000/);
});

test('pied de page « © 2026 PorteàPorte » partout, plus aucun « PorteàPorte inc. »', () => {
  const restes = pagesPubliques().filter((f) => /PorteàPorte inc|PorteaPorte inc/i.test(lire(f)));
  assert.deepEqual(restes, []);
  for (const f of ['expediteur.html', 'devenir-livreur.html', 'assurance.html']) assert.match(lire(f), /© 2026 PorteàPorte — Livraison collaborative au Québec/, f);
});
