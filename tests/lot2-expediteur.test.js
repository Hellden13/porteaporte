'use strict';
// Lot 2 (26 nov. 2026) — expediteur.html : exemples de prix locaux calculés avec les VRAIS tarifs ;
// « Mon tableau de bord » au lieu de « Dashboard » partout où le public et les membres le voient.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeDeliveryPrice } = require('../lib/_lib');
const { distanceLivraison } = require('../lib/_distance');
const { prixMinimumTotal } = require('../js/repartition');

const lire = (f) => fs.readFileSync(f, 'utf8');
const exp = lire('expediteur.html');
const tableau = exp.slice(exp.indexOf('<section id="tarifs">'), exp.indexOf('</section>', exp.indexOf('<section id="tarifs">')));
const FMT = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });

// Même calcul que l'endpoint price-estimate (api/platform.js) : distance → computeDeliveryPrice → total avec frais.
function prixSuggere(depart, arrivee, type, taille, poids) {
  const km = distanceLivraison({ ville_depart: depart, ville_arrivee: arrivee }).km;
  const info = computeDeliveryPrice({ distance_km: km, weight_kg: poids, size: taille, type, urgency: 'flexible' });
  return prixMinimumTotal(info.price_cad);
}

test('expéditeur : chaque prix d’exemple = le vrai tarif du code (même calcul que price-estimate)', () => {
  const cellules = [...tableau.matchAll(/data-prix-exemple="([^"]+)">([^<]+)</g)];
  assert.equal(cellules.length, 4);
  for (const [, cle, affiche] of cellules) {
    const [a, b, type, taille, poids] = cle.split('|');
    const attendu = FMT.format(prixSuggere(a, b, type, taille, Number(poids)));
    assert.equal(affiche.replace(/\s/g, ' '), attendu.replace(/\s/g, ' '), `${cle} : page ${affiche}, tarif ${attendu}`);
  }
});

test('expéditeur : exemples locaux du service actif (Lévis, Québec, Sainte-Foy), plus Montréal/Laval', () => {
  assert.match(tableau, /Lévis → Québec centre-ville/);
  assert.match(tableau, /Lévis → Sainte-Foy/);
  assert.doesNotMatch(tableau, /Montréal|Montreal|Laval/);
});

test('expéditeur : plus de prix de concurrents ni de % d’économie invérifiables dans le tableau', () => {
  assert.doesNotMatch(tableau, /UPS|FedEx|Purolator|savings-badge|—\d+ %/);
  assert.match(tableau, /frais de service inclus, livraison flexible/);
});

test('à ne pas toucher (décision de Denis en attente) : protection « Plus » 5,99 $ et « © 2026 PorteàPorte inc. »', () => {
  assert.match(exp, /<div class="price">5,99 \$<span>\/envoi<\/span><\/div>/);
  assert.match(exp, /© 2026 PorteàPorte inc\. — Livraison collaborative au Québec/);
});

test('« Mon tableau de bord » : le lien de navigation une fois connecté (toutes les pages)', () => {
  const a = lire('js/auth-state.js');
  assert.match(a, /a\.textContent = 'Mon tableau de bord';/);
  assert.doesNotMatch(a, /📊 Dashboard/);
});

test('plus aucun « Dashboard » visible sur les pages publiques et membres (admin et API exclues)', () => {
  const fichiers = fs.readdirSync('.').filter((f) => f.endsWith('.html'))
    .concat(fs.readdirSync('covoiturage').filter((f) => f.endsWith('.html')).map((f) => path.join('covoiturage', f)))
    .concat(fs.readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => path.join('js', f)));
  const restes = [];
  for (const f of fichiers) {
    const s = lire(f);
    for (const m of s.matchAll(/>([^<>]*\b[Dd]ashboard\b[^<>]*)</g)) {
      const t = m[1].trim();
      if (t && !/[{};=]|\.html|\/api\//.test(t)) restes.push(`${f} : ${t}`);
    }
    for (const m of s.matchAll(/(textContent|innerText|title|alt|aria-label|placeholder)\s*[=:]\s*['"`]([^'"`]*[Dd]ashboard[^'"`]*)['"`]/g)) restes.push(`${f} : ${m[2]}`);
    for (const m of s.matchAll(/<title>([^<]*[Dd]ashboard[^<]*)<\/title>/g)) restes.push(`${f} : ${m[1]}`);
  }
  assert.deepEqual(restes, []);
});
