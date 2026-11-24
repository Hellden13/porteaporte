// tests/lot-adresses.test.js — Suggestions d'adresses : Google en principal, Geoapify en secours
// (décision de Denis, 24 nov. 2026). Aucun appel réseau réel : Google, Geoapify et la base sont simulés.
'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRes } = require('./aide-fausse-base');
const A = require('../lib/_adresses');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CLE_G = 'CLE-GOOGLE-SENTINELLE-123';
const CLE_A = 'CLE-GEOAPIFY-SENTINELLE-456';
const MEMBRE = '11111111-1111-4111-8111-111111111111';
const JETON = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID_G = 'ChIJ_mcdo_saint_nicolas_0001';
const ctx = (extra = {}) => ({ sbUrl: 'https://fake.supabase.co', sbKey: 'k', session: { id: MEMBRE }, profile: { id: MEMBRE }, delaiMs: 60, maintenant: Date.parse('2026-11-24T15:00:00Z'), ...extra });
const req = (ip = '203.0.113.7') => ({ headers: { 'x-forwarded-for': ip } });

// Réponses inventées, au format de Google Places (New) et de Geoapify.
const pred = (placeId, main, second, types = ['establishment', 'point_of_interest']) => ({ placePrediction: { placeId, text: { text: main + ', ' + second }, structuredFormat: { mainText: { text: main }, secondaryText: { text: second } }, types } });
const G_MCDO = { suggestions: [
  pred(ID_G, "McDonald's", 'Route Marie-Victorin, Les Chutes-de-la-Chaudière-Ouest, Lévis, QC, Canada'),
  pred('ChIJ_mcdo_rivieres_00002', "McDonald's", 'Route des Rivières, Les Chutes-de-la-Chaudière-Ouest, Lévis, QC, Canada'),
  pred('ChIJ_mcdo_olivier_000003', "McDonald's", 'Chemin Olivier, Les Chutes-de-la-Chaudière-Ouest, Lévis, QC, Canada'),
] };
const G_DETAILS = {
  id: ID_G, formattedAddress: '390 Rte Marie-Victorin, Lévis, QC G7A 2X5, Canada', types: ['restaurant', 'establishment', 'point_of_interest'],
  location: { latitude: 46.7289, longitude: -71.3108 },
  addressComponents: [
    { types: ['street_number'], longText: '390', shortText: '390' },
    { types: ['route'], longText: 'Route Marie-Victorin', shortText: 'Rte Marie-Victorin' },
    { types: ['sublocality_level_1', 'sublocality', 'political'], longText: 'Les Chutes-de-la-Chaudière-Ouest', shortText: 'Les Chutes-de-la-Chaudière-Ouest' },
    { types: ['locality', 'political'], longText: 'Lévis', shortText: 'Lévis' },
    { types: ['administrative_area_level_1', 'political'], longText: 'Québec', shortText: 'QC' },
    { types: ['postal_code'], longText: 'G7A 2X5', shortText: 'G7A 2X5' },
  ],
};
const A_AUTO = { results: [
  { name: 'Chemin du Sault', street: 'Chemin du Sault', suburb: 'Saint-Romuald', district: 'Les Chutes-de-la-Chaudière-Est', city: 'Lévis', state_code: 'QC', country_code: 'ca', result_type: 'street' },
  { name: 'Chemin du Sault', street: 'Chemin du Sault', suburb: 'Saint-Romuald', district: 'Les Chutes-de-la-Chaudière-Est', city: 'Lévis', state_code: 'QC', country_code: 'ca', result_type: 'street' },
  { name: "McDonald's", housenumber: '390', street: 'Route Marie-Victorin', suburb: 'Saint-Nicolas', city: 'Lévis', postcode: 'G7A2X5', state_code: 'QC', country_code: 'ca', result_type: 'amenity' },
] };
const A_INVERSE = { results: [{ suburb: 'Saint-Nicolas', district: 'Les Chutes-de-la-Chaudière-Ouest', city: 'Lévis', postcode: 'G7A 2X3' }] };

const rep = (d, ok = true, status = 200) => ({ ok, status, json: async () => d });
let appels;
let reglages;
const realFetch = global.fetch;
function installer() {
  appels = [];
  global.fetch = async (url, o = {}) => {
    const u = String(url);
    appels.push({ url: u, o });
    if (u.includes('/rpc/check_rate_limit')) {
      const b = JSON.parse(o.body);
      if (reglages.rpcErreur) throw new Error('base injoignable');
      return rep(!(reglages.refuse || []).some((p) => b.p_key.includes(p)));
    }
    if (u.startsWith('https://places.googleapis.com/v1/places:autocomplete')) {
      if (reglages.googleSilence) return new Promise(() => {});
      if (reglages.googleErreur) return rep({ error: { message: 'API key not valid ' + CLE_G } }, false, 500);
      return rep(reglages.googleAuto || G_MCDO);
    }
    if (u.startsWith('https://places.googleapis.com/v1/places/')) {
      if (reglages.googleDetailsErreur) return rep({}, false, 500);
      return rep(G_DETAILS);
    }
    if (u.startsWith('https://api.geoapify.com/v1/geocode/autocomplete')) return reglages.geoErreur ? rep({}, false, 401) : rep(A_AUTO);
    if (u.startsWith('https://api.geoapify.com/v1/geocode/reverse')) return reglages.inverseErreur ? rep({}, false, 500) : rep(A_INVERSE);
    throw new Error('appel inattendu ' + u);
  };
}
beforeEach(() => {
  reglages = {};
  process.env.GOOGLE_PLACES_API_KEY = CLE_G;
  process.env.GEOAPIFY_API_KEY = CLE_A;
  installer();
});
afterEach(() => { global.fetch = realFetch; delete process.env.GOOGLE_PLACES_API_KEY; delete process.env.GEOAPIFY_API_KEY; });

async function sugg(body, c = ctx(), r = req()) { const res = makeRes(); await A.suggestions(r, res, c, body); return res; }
async function det(body, c = ctx(), r = req()) { const res = makeRes(); await A.details(r, res, c, body); return res; }
const vers = (debut) => appels.filter((a) => a.url.startsWith(debut));
const G = 'https://places.googleapis.com';
const GEO = 'https://api.geoapify.com';

describe('Google en principal : sessions, français, Canada, priorité Lévis/Québec', () => {
  test('la recherche part chez Google avec la clé en en-tête, le jeton de session, fr, CA et le biais Lévis/Québec', async () => {
    const r = await sugg({ q: 'mcdonald saint-nicolas', session: JETON });
    assert.equal(r._status, 200);
    assert.equal(r._body.fournisseur, 'google');
    assert.equal(r._body.attribution, 'Google Maps');
    const [a] = vers(G);
    assert.equal(a.o.headers['X-Goog-Api-Key'], CLE_G);
    assert.ok(!a.url.includes(CLE_G), 'la clé ne va jamais dans l’URL Google');
    const b = JSON.parse(a.o.body);
    assert.equal(b.sessionToken, JETON);
    assert.equal(b.languageCode, 'fr');
    assert.deepEqual(b.includedRegionCodes, ['ca']);
    assert.deepEqual(b.locationBias.circle.center, { latitude: 46.75, longitude: -71.19 });
    assert.equal(vers(GEO).length, 0, 'pas de secours quand Google répond');
  });

  test('le choix ferme la session : détails avec le MÊME jeton, champs Essentials seulement, position gardée au serveur', async () => {
    const r = await det({ id: ID_G, session: JETON });
    assert.equal(r._status, 200);
    const d = vers(G + '/v1/places/')[0];
    assert.ok(d.url.includes('sessionToken=' + JETON));
    assert.equal(d.o.headers['X-Goog-FieldMask'], 'id,formattedAddress,addressComponents,location,types');
    assert.ok(!/displayName|rating|reviews|opening/.test(d.o.headers['X-Goog-FieldMask']));
    const a = r._body.adresse;
    assert.equal(a.ligne1, '390 Route Marie-Victorin');
    assert.equal(a.ville, 'Lévis');
    assert.equal(a.code_postal, 'G7A 2X5');
    assert.equal(a.secteur, 'Saint-Nicolas', 'secteur précis, pas l’arrondissement');
    assert.equal(a.etablissement, true);
    assert.equal(a._position, undefined);
    assert.ok(!JSON.stringify(r._body).includes('46.72'), 'aucune coordonnée renvoyée au navigateur');
  });

  test('sans secteur précis (Geoapify en panne), l’arrondissement n’est jamais affiché comme secteur', async () => {
    reglages.inverseErreur = true;
    const r = await det({ id: ID_G, session: JETON });
    assert.equal(r._status, 200);
    assert.equal(r._body.adresse.secteur, '');
    assert.equal(r._body.adresse.ville, 'Lévis');
  });

  test('un secteur d’une autre ville n’est pas pris', async () => {
    global.fetch = ((f) => async (u, o) => (String(u).includes('/geocode/reverse') ? rep({ results: [{ suburb: 'Lauzon', city: 'Québec' }] }) : f(u, o)))(global.fetch);
    const r = await det({ id: ID_G, session: JETON });
    assert.equal(r._body.adresse.secteur, '');
  });
});

describe('Geoapify en secours si Google ne répond pas', () => {
  test('Google en erreur → Geoapify, avec sa propre mention', async () => {
    reglages.googleErreur = true;
    const r = await sugg({ q: 'chemin du sault', session: JETON });
    assert.equal(r._body.fournisseur, 'geoapify');
    assert.equal(r._body.attribution, 'Geoapify · © OpenStreetMap');
    assert.ok(r._body.suggestions.length >= 1);
    assert.ok(!JSON.stringify(r._body).includes(CLE_G), 'le message d’erreur de Google (avec la clé) ne sort jamais');
  });

  test('Google muet → Geoapify après le délai, sans attendre indéfiniment', async () => {
    reglages.googleSilence = true;
    const t0 = Date.now();
    const r = await sugg({ q: 'chemin du sault', session: JETON });
    assert.equal(r._body.fournisseur, 'geoapify');
    assert.ok(Date.now() - t0 < 1500);
  });

  test('sans clé Google → Geoapify ; sans aucune clé → aucune suggestion, texte libre', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    assert.equal((await sugg({ q: 'chemin du sault', session: JETON }))._body.fournisseur, 'geoapify');
    delete process.env.GEOAPIFY_API_KEY;
    const r = await sugg({ q: 'chemin du sault', session: JETON });
    assert.equal(r._status, 200);
    assert.deepEqual(r._body.suggestions, []);
    assert.equal(r._body.texte_libre, true);
  });

  test('Google et Geoapify en panne → 200, aucune suggestion, texte libre (jamais d’erreur bloquante)', async () => {
    reglages.googleErreur = true; reglages.geoErreur = true;
    const r = await sugg({ q: 'chemin du sault', session: JETON });
    assert.equal(r._status, 200);
    assert.equal(r._body.indisponible, true);
    assert.equal(r._body.texte_libre, true);
  });

  test('la clé Geoapify part dans l’URL de Geoapify seulement, jamais dans la réponse', async () => {
    reglages.googleErreur = true;
    const r = await sugg({ q: 'chemin du sault', session: JETON });
    assert.ok(vers(GEO)[0].url.includes('apiKey=' + CLE_A));
    assert.ok(!JSON.stringify(r._body).includes(CLE_A));
  });

  test('détails Google en panne → 503 texte libre, sans clé dans la réponse', async () => {
    reglages.googleDetailsErreur = true;
    const r = await det({ id: ID_G, session: JETON });
    assert.equal(r._status, 503);
    assert.equal(r._body.texte_libre, true);
    assert.ok(!JSON.stringify(r._body).includes(CLE_G));
  });
});

describe('connexion, limites par membre et par IP', () => {
  test('sans session → 401, aucun appel externe', async () => {
    const r = await sugg({ q: 'place laurier', session: JETON }, ctx({ session: null }));
    assert.equal(r._status, 401);
    assert.equal(vers(G).length + vers(GEO).length, 0);
    assert.equal((await det({ id: ID_G, session: JETON }, ctx({ session: null })))._status, 401);
  });

  test('jeton de session absent ou bizarre → 400, aucun appel', async () => {
    for (const s of [undefined, '', 'court', 'a b c d e f g h i j k l', 'x'.repeat(80), { a: 1 }]) {
      assert.equal((await sugg({ q: 'place laurier', session: s }))._status, 400, String(s));
    }
    assert.equal((await det({ id: 'ChIJ<script>', session: JETON }))._status, 400);
    assert.equal(vers(G).length, 0);
  });

  test('moins de 3 lettres → rien, aucun appel externe', async () => {
    const r = await sugg({ q: ' a ', session: JETON });
    assert.deepEqual(r._body.suggestions, []);
    assert.equal(vers(G).length, 0);
  });

  test('limite du membre atteinte → 429 texte libre, Google pas appelé', async () => {
    reglages.refuse = [`adresses:suggestions:membre:${MEMBRE}`];
    const r = await sugg({ q: 'place laurier', session: JETON });
    assert.equal(r._status, 429);
    assert.equal(r._body.texte_libre, true);
    assert.equal(vers(G).length, 0);
  });

  test('limite de l’IP atteinte → 429, même pour un autre membre', async () => {
    reglages.refuse = ['adresses:suggestions:ip:198.51.100.9'];
    const r = await sugg({ q: 'place laurier', session: JETON }, ctx({ session: { id: 'autre-membre' } }), req('198.51.100.9, 10.0.0.1'));
    assert.equal(r._status, 429);
    assert.equal(vers(G).length, 0);
  });

  test('limites séparées pour les détails', async () => {
    reglages.refuse = ['adresses:details:membre:'];
    assert.equal((await det({ id: ID_G, session: JETON }))._status, 429);
    assert.equal((await sugg({ q: 'place laurier', session: JETON }))._status, 200);
  });

  test('valeurs des limites : 60 et 120 recherches / 10 min ; 20 et 40 choix / 10 min', () => {
    assert.deepEqual(A.LIMITES.suggestions, { membre: [60, 600], ip: [120, 600] });
    assert.deepEqual(A.LIMITES.details, { membre: [20, 600], ip: [40, 600] });
  });
});

describe('quota journalier respecté', () => {
  test('quota Google atteint → Geoapify (Google pas appelé)', async () => {
    reglages.refuse = ['adresses:google_suggestions:'];
    const r = await sugg({ q: 'place laurier', session: JETON });
    assert.equal(r._body.fournisseur, 'geoapify');
    assert.equal(vers(G).length, 0);
  });

  test('quota des détails atteint → 503 texte libre, Google pas appelé', async () => {
    reglages.refuse = ['adresses:google_details:'];
    const r = await det({ id: ID_G, session: JETON });
    assert.equal(r._status, 503);
    assert.equal(vers(G).length, 0);
  });

  test('base injoignable → AUCUN appel payant (on ne devine pas le quota)', async () => {
    reglages.rpcErreur = true;
    const r = await sugg({ q: 'place laurier', session: JETON });
    assert.equal(vers(G).length + vers(GEO).length, 0);
    assert.equal(r._status, 429, 'les limites ne peuvent pas être vérifiées non plus : texte libre');
    assert.equal(r._body.texte_libre, true);
  });

  test('le compteur du jour porte la date de la journée et vaut 330 / 330 / 2500 par défaut', async () => {
    await sugg({ q: 'place laurier', session: JETON });
    const cle = appels.filter((a) => a.url.includes('check_rate_limit')).map((a) => JSON.parse(a.o.body)).find((b) => b.p_key.includes('google_suggestions'));
    assert.equal(cle.p_key, 'adresses:google_suggestions:2026-11-24');
    assert.equal(cle.p_max, 330);
    assert.deepEqual(A.quotas(), { google_suggestions: 330, google_details: 330, geoapify: 2500 });
  });

  test('quota réglable par Vercel, et 0 coupe le service', async () => {
    process.env.ADRESSES_GOOGLE_SUGGESTIONS_JOUR = '0';
    try {
      const r = await sugg({ q: 'place laurier', session: JETON });
      assert.equal(r._body.fournisseur, 'geoapify');
      assert.equal(vers(G).length, 0);
    } finally { delete process.env.ADRESSES_GOOGLE_SUGGESTIONS_JOUR; }
  });

  test('la journée commence à 03:00 UTC, l’heure du ménage de rate_limits (le compteur n’est jamais effacé en cours de journée)', () => {
    assert.equal(A.journee(Date.parse('2026-11-25T02:59:00Z')), '2026-11-24');
    assert.equal(A.journee(Date.parse('2026-11-25T03:00:00Z')), '2026-11-25');
    const cron = JSON.parse(lire('vercel.json')).crons.find((c) => c.path === '/api/cron-cleanup');
    assert.equal(cron.schedule, `0 ${A.DEBUT_JOURNEE_UTC_H} * * *`);
  });
});

describe('nettoyage des suggestions', () => {
  test('trois McDonald’s différents restent séparés, avec la rue ; l’arrondissement disparaît', () => {
    const s = A.suggestionsGoogle(G_MCDO);
    assert.equal(s.length, 3);
    assert.equal(s[0].secondaire, 'Route Marie-Victorin · Lévis');
    assert.ok(s.every((x) => !/Chutes|QC|Canada/.test(x.secondaire)));
  });

  test('doublons du même endroit retirés (Hôtel-Dieu ×3), nom anglais traduit', () => {
    const s = A.suggestionsGoogle({ suggestions: [
      pred('ChIJ_hd_1_000000001', 'Hôpital Hôtel-Dieu de Lévis', 'Rue Wolfe, Lévis, QC, Canada'),
      pred('ChIJ_hd_2_000000002', 'Hôtel-Dieu de Lévis Emergency Room', 'Rue Wolfe, Lévis, QC, Canada'),
      pred('ChIJ_hd_3_000000003', 'Hôtel dieu dé Lévis', 'Rue Wolfe, Lévis, QC, Canada'),
    ] });
    assert.equal(s.length, 1);
    assert.equal(s[0].principal, 'Hôpital Hôtel-Dieu de Lévis');
    assert.equal(A.nettoyerNom('Hôtel-Dieu de Lévis Emergency Room'), 'Hôtel-Dieu de Lévis Urgence');
  });

  test('lieux inutiles retirés (point photo, guichet), 5 suggestions au plus', () => {
    const liste = [pred('ChIJ_photo_000000001', 'Château Frontenac photography spot', 'Québec, QC, Canada'), pred('ChIJ_atm_00000000001', 'Guichet Desjardins', 'Rue Wolfe, Lévis, QC, Canada', ['atm', 'establishment'])];
    for (let i = 0; i < 8; i++) liste.push(pred('ChIJ_lieu_' + String(i).padStart(10, '0'), 'Lieu ' + i, `Rue ${i}, Lévis, QC, Canada`));
    const s = A.suggestionsGoogle({ suggestions: liste });
    assert.equal(s.length, 5);
    assert.ok(s.every((x) => !/photo|Guichet/i.test(x.principal)));
    // Une cathédrale classée aussi « atm » par Google reste là : seul un lieu qui n'est QU'un guichet est retiré.
    const c = A.suggestionsGoogle({ suggestions: [pred('ChIJ_cathedrale_0001', 'Cathédrale Saint-Germain', 'Rue Saint Germain Ouest, Rimouski, QC, Canada', ['atm', 'church', 'establishment', 'finance', 'place_of_worship', 'point_of_interest'])] });
    assert.equal(c.length, 1);
  });

  test('noms en français et propres', () => {
    assert.equal(A.nettoyerNom('PLACE LAURIER'), 'Place Laurier');
    assert.equal(A.nettoyerNom('Aéroport international Jean-Lesage de Québec (YQB) (YQB)'), 'Aéroport international Jean-Lesage de Québec (YQB)');
    assert.equal(A.nettoyerNom('Costco Wholesale'), 'Costco');
    assert.equal(A.nettoyerNom('Costco Gas Station'), 'Costco Station-service');
    assert.equal(A.nettoyerNom('Galeries de la Capitale - Bus terminal'), 'Galeries de la Capitale - Terminus d’autobus');
    assert.equal(A.nettoyerNom('Université Laval'), 'Université Laval', 'un nom déjà français ne bouge pas');
  });

  test('province retirée sans perdre la ville de Québec', () => {
    assert.deepEqual(A.decouperSecondaire('Québec, QC, Canada'), { rue: '', secteur: '', ville: 'Québec' });
    assert.deepEqual(A.decouperSecondaire('Boulevard Laurier, Québec, QC, Canada'), { rue: 'Boulevard Laurier', secteur: '', ville: 'Québec' });
    assert.deepEqual(A.decouperSecondaire('Saint-Jean-sur-Richelieu, Québec, Canada'), { rue: '', secteur: '', ville: 'Saint-Jean-sur-Richelieu' });
    assert.equal(A.decouperSecondaire('Rue Wolfe, Charny, Lévis, QC, Canada').secteur, 'Charny');
    assert.deepEqual(A.decouperSecondaire('Rue de la Concorde, Lévis, Saint-Romuald, QC, Canada'), { rue: 'Rue de la Concorde', secteur: 'Saint-Romuald', ville: 'Lévis' });
    assert.equal(A.decouperSecondaire("6e Avenue de l'Aéroport, Québec, QC, Canada").rue, "6e Avenue de l'Aéroport");
    assert.equal(A.decouperSecondaire('édifice, Rimouski, QC, Canada').secteur, '', 'pas de « secteur » en minuscules');
  });

  test('Geoapify : segments de la même rue fusionnés, secteur affiché « Saint-Romuald, Lévis », détails inclus', () => {
    const s = A.suggestionsGeoapify(A_AUTO);
    assert.equal(s.length, 2);
    assert.equal(s[0].secondaire, 'Saint-Romuald, Lévis');
    assert.equal(s[1].secondaire, '390 Route Marie-Victorin · Saint-Nicolas, Lévis');
    assert.equal(s[1].details.code_postal, 'G7A 2X5');
    assert.equal(s[1].details.etablissement, true);
    assert.equal(s[1].id, null);
    const b = A.suggestionsGeoapify({ results: [
      { name: "Hôpital de l'Enfant-Jésus", housenumber: '1401', street: '18e Rue', suburb: 'Maizerets', city: 'Québec', country_code: 'ca', result_type: 'amenity' },
      { name: "Hôpital de l'Enfant-Jésus", street: '18e Rue', suburb: 'Maizerets', city: 'Québec', country_code: 'ca', result_type: 'amenity' },
      { name: 'de la Traverse / du Rail', street: 'Rue de la Traverse', suburb: 'Charny', city: 'Lévis', country_code: 'ca', result_type: 'amenity' },
      { name: 'Pub La Traverse', housenumber: '5955', street: 'Rue Saint-Laurent', suburb: 'Lévis (quartier)', city: 'Lévis', country_code: 'ca', result_type: 'amenity' },
    ] });
    assert.deepEqual(b.map((x) => x.principal), ["Hôpital de l'Enfant-Jésus", 'Pub La Traverse'], 'même hôpital fusionné, arrêt d’autobus retiré');
    assert.equal(b[1].secondaire, '5955 Rue Saint-Laurent · Lévis');
  });

  test('code postal mis en forme', () => {
    assert.equal(A.formatCodePostal('g7a2x5'), 'G7A 2X5');
    assert.equal(A.formatCodePostal(''), '');
  });
});

describe('navigateur : clé jamais exposée, mention Google, gros caractères, texte libre', () => {
  const js = lire('js/adresses.js');
  test('le navigateur ne parle qu’au serveur PorteàPorte', () => {
    assert.ok(!/googleapis|geoapify\.com|X-Goog|apiKey|nominatim/i.test(js));
    assert.ok(js.includes("'/api/platform?endpoint='"));
    for (const p of ['create-mission.html', 'covoiturage-publier.html']) {
      const h = lire(p);
      assert.ok(!/nominatim|GOOGLE_PLACES|places\.googleapis|geoapify\.com/i.test(h), p);
      assert.ok(h.includes('<script src="/js/adresses.js"></script>'), p);
    }
  });

  test('mention du fournisseur sous les suggestions (« Suggestions : Google Maps »)', () => {
    assert.ok(js.includes("'Suggestions : ' + d.attribution"));
    const i = js.indexOf('boite.appendChild(liste)');
    assert.ok(i > 0 && js.indexOf('boite.appendChild(attrib)') > i, 'la mention vient après la liste');
  });

  test('gros caractères et grandes zones (cellulaire, aînés)', () => {
    assert.match(js, /\.adr-opt\{[^}]*min-height:60px/);
    assert.match(js, /\.adr-opt\{[^}]*font-size:18px/);
    assert.match(js, /\.adr-champ\{font-size:18px!important;min-height:52px\}/);
  });

  test('le texte libre est toujours accepté : choix « Garder ce que j’ai écrit », aucune obligation de choisir', () => {
    assert.ok(js.includes('Garder ce que j’ai écrit'));
    assert.ok(!/setCustomValidity|\.required\s*=|pattern/.test(js));
  });

  test('les suggestions sont écrites en texte, jamais en HTML (pas d’injection)', () => {
    assert.ok(!/innerHTML\s*=\s*[^'"]/.test(js.replace("liste.innerHTML = ''", '')));
  });

  test('un nouveau jeton par recherche, oublié après le choix', () => {
    assert.ok(js.includes('if (!session) session = nouveauJeton();'));
    assert.ok(js.includes('session = null; // la session d’autocomplétion se termine avec le choix'));
  });

  test('les 3 formulaires sont branchés : départ, destination, lieux d’embarquement, adresses de livraison', () => {
    const pub = lire('covoiturage-publier.html');
    for (const id of ["'start_city', 'start_sector'", "'end_city', 'end_sector'", "'meeting-point-label-' + cote"]) assert.ok(pub.includes(id), id);
    assert.ok(pub.includes('lieuPublic: true'));
    const liv = lire('create-mission.html');
    assert.ok(liv.includes("brancherAdresse('pickup-address',   'pickup-city',   'pickup-postal')"));
    assert.ok(liv.includes("brancherAdresse('delivery-address', 'delivery-city', 'delivery-postal')"));
  });

  test('les points d’accès passent après la vérification de session', () => {
    const p = lire('api/platform.js');
    const garde = p.indexOf("if (!session) return res.status(401).json({ error: 'Session requise' });");
    assert.ok(garde > 0 && p.indexOf("endpoint === 'adresse-suggestions'") > garde && p.indexOf("endpoint === 'adresse-details'") > garde);
  });
});
