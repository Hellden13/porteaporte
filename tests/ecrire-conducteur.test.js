'use strict';
// Page d'un trajet : « Écrire au conducteur » (messagerie masquée) bien visible ;
// le partage (Facebook, Messenger…) est secondaire et dit clairement « Partager ce trajet ».
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (f) => fs.readFileSync(f, 'utf8');
const trajet = read('covoiturage-trajet.html');
const carteTrajet = trajet.slice(trajet.indexOf('id="card-trajet"'), trajet.indexOf('&#128506;&#65039; Itinéraire'));

test('trajet : le bouton principal « 💬 Écrire au conducteur » vient avant le partage', () => {
  const ecrire = carteTrajet.indexOf('💬 Écrire au conducteur');
  const partage = carteTrajet.indexOf('class="share-menu"');
  assert.ok(ecrire > 0, 'bouton Écrire absent de la carte du trajet');
  assert.ok(partage > ecrire, 'le partage doit venir après Écrire');
  assert.match(carteTrajet, /class="btn-ecrire" data-ecrire onclick="ecrireAuConducteur\(this\)"/);
});

test('trajet : les boutons de partage sont regroupés dans « Partager ce trajet » et disent qu’ils partagent', () => {
  const menu = carteTrajet.slice(carteTrajet.indexOf('<details class="share-menu"'), carteTrajet.indexOf('</details>'));
  assert.match(menu, /<summary class="share-toggle">[\s\S]*Partager ce trajet<\/summary>/);
  for (const fn of ['openShareCard()', 'shareThisRideFb()', 'shareThisRideMessenger()', 'shareThisRideWhatsApp()', 'shareThisRideCopy()']) {
    assert.ok(menu.includes(`onclick="${fn}"`), `${fn} hors du menu de partage`);
    assert.equal(trajet.split(`onclick="${fn}"`).length - 1, 1, `${fn} en double hors du menu`);
  }
  assert.match(menu, />Partager par Messenger</);
  assert.doesNotMatch(trajet, />\s*💬 Messenger\s*</, 'ancien bouton « 💬 Messenger » ambigu');
  assert.doesNotMatch(trajet, />\s*💬 WhatsApp\s*</);
});

test('trajet : pas connecté → connexion puis retour sur ce trajet avec la messagerie ouverte (?ecrire=1)', () => {
  const fn = trajet.slice(trajet.indexOf('async function ecrireAuConducteur'), trajet.indexOf('// ── Partage du trajet'));
  assert.match(fn, /if \(!currentUser\)[\s\S]*searchParams\.set\('ecrire', '1'\)[\s\S]*'\/login\.html\?next=' \+ encodeURIComponent\(retour\.pathname \+ retour\.search\)/);
  assert.match(trajet, /params\.get\('ecrire'\) === '1'[\s\S]{0,400}ecrireAuConducteur\(premierVisible\('\[data-ecrire\]'\) \|\| btnChat\)/);
  assert.match(trajet, /searchParams\.delete\('ecrire'\)/, 'le paramètre est retiré (pas de réouverture au rechargement)');
});

test('trajet : la messagerie s’ouvre seulement avec une demande de place (règle du serveur), sinon on explique', () => {
  const fn = trajet.slice(trajet.indexOf('async function ecrireAuConducteur'), trajet.indexOf('// ── Partage du trajet'));
  assert.match(fn, /from\('ride_bookings'\)\.select\('id'\)\.eq\('ride_id', ecrireCible\.rideId\)\.eq\('passenger_id', currentUser\.id\)/);
  assert.match(fn, /window\.RideChat\.open\(\{ ride_id: ecrireCible\.rideId, other_user_id: ecrireCible\.driverId/);
  assert.match(fn, /dès que ta demande de place est envoyée/);
  assert.match(fn, /\/dashboard\.html\?onglet=covoiturage/, 'le conducteur écrit à ses passagers depuis son tableau de bord');
  // Le serveur exige toujours une réservation : rien n'a été élargi.
  assert.match(read('lib/_messagerie.js'), /if \(!reservations\.length\) return \{ erreur: 403, message: 'Vous ne participez pas à ce trajet' \}/);
});

test('trajet : bouton Écrire aussi dans la carte du conducteur, visible même sans connexion', () => {
  const bloc = trajet.slice(trajet.indexOf("actionsWrap.innerHTML = '';"), trajet.indexOf('// Bouton Évaluer'));
  assert.match(bloc, /if \(driverIdForBadge\) \{/);
  assert.doesNotMatch(bloc, /if \(currentUser && driverIdForBadge && driverIdForBadge !== currentUser\.id\)/);
  assert.match(bloc, /'💬 Écrire à ' \+ \(prenom \|\| 'ton conducteur'\)/);
  assert.match(bloc, /'💬 Écrire à mes passagers'/);
});

test('cellulaire : un bouton « Écrire » en haut, avant le prix et la réservation (colonne affichée en premier)', () => {
  const debut = trajet.indexOf('<div id="sidebar-real"');
  const mobile = trajet.indexOf('class="card ecrire-mobile" data-ecrire-zone', debut);
  assert.ok(mobile > debut && mobile < trajet.indexOf('class="card price-card"'), 'bloc Écrire avant la carte du prix');
  assert.match(trajet, /\.sidebar \{ order: -1; \}/);
  assert.match(trajet, /\.ecrire-mobile \{ display:none; \}\s*@media \(max-width: 820px\) \{\s*\.ecrire-mobile \{ display:block;/);
});

test('aucun moyen de contacter un membre hors du site sur les pages de trajet, de livraison et de messages', () => {
  for (const page of ['covoiturage-trajet.html', 'membre-covoiturage.html', 'membre-envois.html', 'membre-livrer.html', 'message-livraison.html', 'suivi-livraison.html']) {
    const html = read(page);
    assert.doesNotMatch(html, /m\.me\/|messenger\.com\/t\//i, `${page} : lien Messenger direct`);
    assert.doesNotMatch(html, /wa\.me\/\d/, `${page} : WhatsApp vers un numéro`);
    // mailto:/tel: seulement vers le support, jamais vers un membre (valeur dynamique).
    for (const m of html.matchAll(/(?:mailto|tel):([^"'`\s<]*)/g)) {
      assert.match(m[1], /^(support|contact|aide|securite|bonjour)@porteaporte\.site/, `${page} : ${m[0]}`);
    }
  }
});

test('tableau de bord : boutons de messagerie explicites (à qui on écrit)', () => {
  const envois = read('membre-envois.html');
  assert.equal((envois.match(/💬 Écrire au livreur<\/a>/g) || []).length, 2);
  assert.doesNotMatch(envois, />💬 Livreur<|>💬 Message</);
  const cov = read('membre-covoiturage.html');
  assert.match(cov, />💬 Écrire au conducteur<\/button>/);
  assert.match(cov, />💬 Écrire au passager<\/button>/);
  assert.match(cov, /\['en_attente','confirme','driver_completed','paye'\]\.includes/);
  const livrer = read('membre-livrer.html');
  assert.match(livrer, /💬 Écrire au destinataire/);
  assert.match(livrer, /💬 Écrire à l’expéditeur/);
});
