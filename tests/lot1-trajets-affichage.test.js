'use strict';
// Lot 1 (26 nov. 2026) — trouvé en visitant le site public :
// prochain départ réel des trajets récurrents, heures des arrêts selon la distance,
// affirmations vraies seulement, libellés clairs, prix fr-CA, types de véhicule, tutoiement.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const rides = require('../lib/_rides');
const lire = (f) => fs.readFileSync(f, 'utf8');
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk_test_fake123' };
const heureQc = (iso) => new Date(iso).toLocaleString('fr-CA', { timeZone: 'America/Toronto', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// ── 1. Prochain départ d'un trajet récurrent ────────────────────────────
const RECURRENT = { departure_time: '2026-06-07T16:00:00+00:00', is_recurring: true, recurrence_days: ['mar', 'jeu', 'sam'] }; // créé le dim. 7 juin, 12 h
const JEUDI_10H = Date.parse('2026-11-26T15:00:00Z');

test('récurrent : la prochaine occurrence future, jamais la date de création passée', () => {
  const t = rides.prochainDepart(RECURRENT, { maintenant: JEUDI_10H });
  assert.equal(heureQc(t), 'jeudi 26 novembre à 12 h 00');
  assert.ok(Date.parse(t) > JEUDI_10H);
});

test('récurrent : même heure du Québec malgré le changement d’heure (12 h en juin → 12 h en novembre)', () => {
  assert.match(heureQc(rides.prochainDepart(RECURRENT, { maintenant: JEUDI_10H })), /12 h 00$/);
  assert.equal(rides.instantQuebec('2026-07-01', 12, 0), Date.parse('2026-07-01T16:00:00Z'));
  assert.equal(rides.instantQuebec('2026-12-01', 12, 0), Date.parse('2026-12-01T17:00:00Z'));
});

test('récurrent : passé midi jeudi → samedi ; une date annulée par le conducteur est sautée', () => {
  assert.equal(heureQc(rides.prochainDepart(RECURRENT, { maintenant: Date.parse('2026-11-26T18:00:00Z') })), 'samedi 28 novembre à 12 h 00');
  assert.equal(heureQc(rides.prochainDepart(RECURRENT, { maintenant: JEUDI_10H, annulees: new Set(['2026-11-26']) })), 'samedi 28 novembre à 12 h 00');
});

test('récurrent : jour cherché → l’occurrence de ce jour-là seulement si le trajet roule ce jour', () => {
  assert.equal(heureQc(rides.prochainDepart(RECURRENT, { maintenant: JEUDI_10H, jour: '2026-12-01' })), 'mardi 1 décembre à 12 h 00');
  assert.equal(rides.prochainDepart(RECURRENT, { maintenant: JEUDI_10H, jour: '2026-11-30' }), null, 'lundi : ne roule pas');
});

test('récurrent qui commence plus tard : pas d’occurrence avant sa première date', () => {
  const futur = { departure_time: '2027-01-05T17:00:00Z', is_recurring: true, recurrence_days: ['mar'] };
  assert.equal(rides.prochainDepart(futur, { maintenant: JEUDI_10H }), '2027-01-05T17:00:00.000Z');
});

test('ponctuel : la date ne change pas ; récurrent sans jour : aucune date', () => {
  assert.equal(rides.prochainDepart({ departure_time: '2026-06-07T16:00:00Z' }), '2026-06-07T16:00:00.000Z');
  assert.equal(rides.prochainDepart({ departure_time: '2026-06-07T16:00:00Z', is_recurring: true, recurrence_days: [] }), null);
});

test('réservation refusée pour un trajet ponctuel déjà parti (jamais une date passée)', async () => {
  const db = creerBase({ rides: [{ id: 'r9', driver_id: 'd9', start_city: 'Québec', end_city: 'Montréal', departure_time: '2026-06-07T16:00:00Z', is_recurring: false, available_seats: 3, total_seats: 3, status: 'publie', cost_per_km: 0.3, total_distance_km: 250 }] });
  global.fetch = db.fetch;
  const res = makeRes();
  await rides.rideBook({ headers: {} }, res, { ...CTX, session: { id: 'p9' }, profile: { role: 'expediteur' } }, { ride_id: 'r9', pickup_city: 'Québec', dropoff_city: 'Montréal', seats: 1 });
  assert.equal(res._status, 409);
  assert.equal(res._body.code, 'trajet_passe');
  assert.equal((db.tables.ride_bookings || []).length, 0, 'aucune réservation créée');
});

test('serveur : la recherche et la fiche du trajet renvoient next_departure_time', () => {
  const src = lire('lib/_rides.js');
  assert.match(src, /next_departure_time: prochainDepart\(r, \{ jour: jourRecherche, annulees: annuleesParTrajet\.get\(r\.id\) \}\)/);
  assert.match(src, /safeRide\.next_departure_time = prochainDepart\(ride, \{ annulees: annuleesDetail \}\)/);
});

test('page et liste affichent la prochaine occurrence', () => {
  const page = lire('covoiturage-trajet.html');
  assert.match(page, /departure_time: rideData\.ride\.next_departure_time \|\| rideData\.ride\.departure_time/);
  assert.match(page, /'Prochain départ : '/);
  assert.match(lire('covoiturage.html'), /ride\.next_departure_time[\s\S]{0,200}' · prochain : '/);
});

// ── 2. Heures des arrêts selon la distance ──────────────────────────────
test('arrêt Longueuil sur Québec → Montréal (265 km) : presque à l’arrivée, pas 15 min après le départ', () => {
  const { etapes, arrivee_minutes } = rides.etapesTrajet({ start_city: 'Québec', end_city: 'Montréal', total_distance_km: 265 }, [{ city: 'Longueil' }]);
  assert.equal(etapes[0].estimation, 'distance', '« Longueil » reconnu (Longueuil)');
  assert.ok(etapes[0].km_depuis_depart > 240 && etapes[0].km_depuis_depart < 265, `km ${etapes[0].km_depuis_depart}`);
  assert.ok(etapes[0].minutes_depuis_depart > 150, `min ${etapes[0].minutes_depuis_depart}`);
  assert.ok(arrivee_minutes > etapes[0].minutes_depuis_depart, 'arrivée après le dernier arrêt');
  assert.equal(arrivee_minutes, Math.round(265 / 80 * 60));
});

test('arrêts dans l’ordre ; ville inconnue → au prorata (jamais 15 min fixes)', () => {
  const { etapes } = rides.etapesTrajet({ start_city: 'Québec', end_city: 'Montréal', total_distance_km: 265 }, [{ city: 'Drummondville' }, { city: 'Hameau Inconnu' }]);
  assert.equal(etapes[0].estimation, 'distance');
  assert.equal(etapes[1].estimation, 'prorata');
  assert.ok(etapes[1].km_depuis_depart > etapes[0].km_depuis_depart);
  assert.ok(etapes[0].minutes_depuis_depart > 60);
});

test('page : heure de l’arrêt = départ + minutes calculées (plus de +15 min par arrêt)', () => {
  const page = lire('covoiturage-trajet.html');
  assert.doesNotMatch(page, /\(idx \+ 1\) \* 15 \* 60 \* 1000/);
  assert.match(page, /Number\(s\.minutes_depuis_depart\) \* 60000/);
  assert.doesNotMatch(page, /Math\.round\(distKm \* 1\.0\)/);
  assert.match(lire('lib/_rides.js'), /stops: parcours\.etapes,/);
});

// ── 3. Aucune statistique ni promesse fausse ────────────────────────────
test('covoiturage : image d’en-tête sans « des milliers de trajets » ni « KYC obligatoire » ; aperçus de partage aussi', () => {
  const h = lire('covoiturage.html');
  assert.match(h, /src="\/assets\/photos\/hero-covoiturage-confiance-v2\.webp"/);
  assert.doesNotMatch(h, /hero-covoiturage-confiance\.(webp|png)/);
  assert.doesNotMatch(h, /hero-covoiturage-colis\.webp/, 'bannière vouvoyée retirée');
  assert.match(h, /og:image" content="https:\/\/porteaporte\.site\/assets\/photos\/og-covoiturage-confiance-v2\.jpg"/);
  assert.doesNotMatch(lire('index.html'), /og:image" content="[^"]*hero-covoiturage-confiance\.png"/);
  assert.ok(fs.existsSync('assets/photos/hero-covoiturage-confiance-v2.webp'));
  assert.ok(fs.existsSync('assets/photos/og-covoiturage-confiance-v2.jpg'));
});

test('covoiturage : plus de « Email et identité validés avant de publier » (publier n’exige qu’une connexion)', () => {
  const h = lire('covoiturage.html');
  assert.doesNotMatch(h, /identité validés avant de publier/);
  assert.doesNotMatch(h, /milliers de trajets|KYC obligatoire/i);
  assert.match(h, /identité a été vérifiée par PorteàPorte affichent le badge ✅ Vérifié/);
  // Le badge suit bien la vérification réelle côté serveur.
  assert.match(lire('lib/_rides.js'), /verified:\s+driver\.driver_status === 'verified'/);
});

// ── 4 à 6. Libellés, prix, véhicules ────────────────────────────────────
test('« Musique : … » et « Jasette : … » (plus deux « Selon l’humeur » identiques)', () => {
  const liste = lire('covoiturage.html');
  assert.match(liste, /selon_humeur: '🎶 Musique : selon l\\'humeur'/);
  assert.match(liste, /selon_humeur: '🙂 Jasette : selon l\\'humeur'/);
  const page = lire('covoiturage-trajet.html');
  assert.match(page, /'Musique : selon l’humeur'/);
  assert.match(page, /'Jasette : selon l’humeur'/);
  assert.doesNotMatch(page, /'(Musique|Conversation) selon humeur'/);
});

test('prix au format fr-CA sur la page du trajet (25,53 $, jamais 25.53 $)', () => {
  const page = lire('covoiturage-trajet.html');
  assert.doesNotMatch(page, /toFixed\(2\) \+ ' \$/);
  assert.match(page, /new Intl\.NumberFormat\('fr-CA', \{ style: 'currency', currency: 'CAD' \}\)/);
  const fmt = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
  assert.match(fmt.format(25.53), /^25,53\s\$$/);
});

test('types de véhicule en français à l’affichage (valeurs en base inchangées), texte échappé', () => {
  for (const f of ['covoiturage.html', 'covoiturage-trajet.html']) {
    const h = lire(f);
    assert.match(h, /suv: 'VUS'/, f);
    assert.match(h, /berline: 'Berline'/, f);
    assert.match(h, /electrique: 'Électrique'/, f);
  }
  assert.doesNotMatch(lire('covoiturage.html'), /\|\| r\.vehicle_type \|\| 'Véhicule'/, 'plus de valeur brute « suv »');
  assert.match(lire('covoiturage.html'), /const vehicleStr = escTexte\(/);
  assert.match(lire('covoiturage-trajet.html'), /'<strong>' \+ esc\(marque\) \+ '<\/strong>'/);
});

// ── 7. Tutoiement ───────────────────────────────────────────────────────
test('tutoiement uniforme sur covoiturage.html et expediteur.html', () => {
  for (const f of ['covoiturage.html', 'expediteur.html']) {
    const texte = lire(f).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
    const vous = texte.match(/\b(vous|votre|vos|Publiez|Partagez|partagez|économisez|Partez|Envoyez|Suivez|Créez|payez|Réservez|Trouvez|Rejoignez)\b/g);
    assert.equal(vous, null, `${f} : ${vous && vous.join(', ')}`);
  }
});

// ── 8. transparence.html : Supabase chargé avant usage ──────────────────
test('transparence : librairie Supabase puis supabase-config.js AVANT le script de la page (plus de « CDN non charge »)', () => {
  const h = lire('transparence.html');
  const cdn = h.indexOf('cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  const conf = h.indexOf('<script src="/js/supabase-config.js"></script>');
  const usage = h.indexOf('window.getSupabaseClient()');
  assert.ok(cdn > 0 && conf > cdn && usage > conf, `ordre : cdn ${cdn} < config ${conf} < usage ${usage}`);
  assert.equal(h.split('/js/supabase-config.js').length - 1, 1, 'une seule fois');
  assert.match(h, /fetch\('\/api\/impact-public'\)/, 'les données publiques viennent de l’API');
});

// ── 9. Bouton « Niveau » : retiré (décision de Denis, 26 nov. 2026 : il ne changeait rien) ──
test('« Niveau » retiré : plus de script, plus de pilule, plus de styles', () => {
  assert.ok(!fs.existsSync('js/layer-mode.js'));
  const pages = fs.readdirSync('.').filter((f) => f.endsWith('.html'));
  for (const f of pages) assert.ok(!lire(f).includes('/js/layer-mode.js'), f);
  assert.ok(!lire('js/flottants.js').includes('pp-layer'));
});


// ── 10. Bandeau pâle (voile sur l'image d'en-tête) ──────────────────────
test('covoiturage : le voile de l’image d’en-tête ne rend plus le texte pâle', () => {
  const h = lire('covoiturage.html');
  assert.doesNotMatch(h, /rgba\(10,12,16,0\) 40%, rgba\(10,12,16,0\.95\) 100%/);
  assert.match(h, /rgba\(10,12,16,0\) 94%, rgba\(10,12,16,0\.35\) 100%/);
});

// ── 11. Émojis ──────────────────────────────────────────────────────────
test('émojis : 🧳 pour le coffre, plus de 🧽 ni de 🤵‍✈️', () => {
  const page = lire('covoiturage-trajet.html');
  assert.doesNotMatch(page, /&#129533;|🧽|&#129333;|🤵/);
  assert.match(page, /<div class="mi-icon">🧳<\/div>/);
  assert.match(page, /<h2>🚗 Ton conducteur<\/h2>/);
});

// ── Décisions du 26 nov. 2026 : cache, affirmation vraie, note au format québécois ──
test('cache : chaque page charge flottants.js et auth-state.js avec ?v=20261126 (nouvelle version tout de suite)', () => {
  const pages = [];
  const parcourir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = `${d}/${e.name}`; if (e.isDirectory()) parcourir(p); else if (p.endsWith('.html')) pages.push(p); } };
  parcourir('.');
  for (const f of pages) {
    const h = lire(f);
    assert.doesNotMatch(h, /src="\/js\/(flottants|auth-state)\.js"/, f);
    for (const m of h.matchAll(/src="\/js\/(flottants|auth-state)\.js([^"]*)"/g)) assert.equal(m[2], '?v=20261126', f);
  }
});

test('index.html : l’aperçu de partage ne promet plus un « conducteur vérifié »', () => {
  const h = lire('index.html');
  const og = h.match(/<meta property="og:description" content="([^"]+)"/)[1];
  assert.doesNotMatch(og, /vérifié/);
  assert.match(og, /Évaluations après le trajet\./);
});

test('note affichée « 5,0 ★ » (virgule et espace), plus jamais « 5.0★ »', () => {
  for (const f of ['lib/_rides.js', 'membre-envois.html', 'membre-livrer.html']) {
    assert.doesNotMatch(lire(f), /toFixed\(1\)\}?★|toFixed\(1\) \+ '★'/, f);
  }
  assert.match(lire('lib/_rides.js'), /reasons\.push\(`🌟 \$\{avg\.toFixed\(1\)\.replace\('\.', ','\)\} ★ \(\$\{ratingInfo\.n\} avis\)`\)/);
});
