// tests/test-complet-ui.test.js — Test complet du 22 nov. 2026 : vérifications des pages (points 5 et suivants).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const lire = (f) => fs.readFileSync(f, 'utf8');
const fonction = (src, nom) => {
  const i = src.indexOf(`function ${nom}(`);
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  return src.slice(i, src.indexOf('\n    }\n', i) + 6);
};

test('5. pickup sans caméra : photo téléversée à la place, message clair, aucune fenêtre d\'alerte', () => {
  const html = lire('dashboard-livreur.html');
  assert.match(html, /<input type="file" accept="image\/\*" capture="user" id="selfie-file-\$\{row\.id\}" onchange="selfieDepuisFichier\('\$\{row\.id\}', this\)"/);
  assert.match(html, /Téléverser une photo à la place/);
  const start = fonction(html, 'startSelfie');
  assert.match(start, /!navigator\.mediaDevices \|\| typeof navigator\.mediaDevices\.getUserMedia !== 'function'/);
  assert.match(start, /NotAllowedError/);
  assert.match(start, /selfieSansCamera\(id/);
  assert.doesNotMatch(start, /alert\(/);
  const fichier = fonction(html, 'selfieDepuisFichier');
  assert.match(fichier, /selfieData\[id\] = dataUrl/);
  assert.match(fichier, /\^image\\\//);
});

// ─── Covoiturage (13 à 18) ───────────────────────────────────────────────────
test('13. fiche trajet : texte clair sur les cartes sombres (titre, arrêts, conducteur, score, arrêt choisi)', () => {
  const html = lire('covoiturage-trajet.html');
  assert.match(html, /\.card \.route-cities \.city, \.card \.tl-stop-name, \.card \.driver-name, \.card \.sr-val,[\s\S]*?\{ color: #F3F6FA; \}/);
  assert.match(html, /\.card \.meeting-card\.selected \{ background: #E9E6FF;/);
  assert.match(html, /\.card \.meeting-card\.selected \.mc-name \{ color: #10131A; \}/);
  assert.doesNotMatch(html, /\.card \.pb-row\.total[^{]*\{ color: #F3F6FA/, 'le total reste foncé sur fond blanc');
});

test('14. prénom du conducteur (jamais « Chauffeur ») et « Nouveau » sans avis', () => {
  const rech = lire('covoiturage.html');
  const fiche = lire('covoiturage-trajet.html');
  assert.doesNotMatch(rech + fiche, /'Chauffeur'/);
  assert.doesNotMatch(rech, /d\.score \/ 20/, 'plus de 5.0★ tiré du score interne');
  assert.match(rech, /d\.nb_reviews > 0 && d\.avg_rating/);
  assert.match(rech, />Nouveau<\/span>/);
  assert.match(fiche, /class="note-nouveau">Nouveau<\/span>/);
  const { prenomDe } = require('../lib/_rides');
  assert.equal(prenomDe('julie tremblay'), 'Julie');
  assert.equal(prenomDe('  '), '');
});

test('14. le prénom manquant au profil est pris dans l\'inscription (Auth), pas le nom de famille', async () => {
  const { completerPrenoms } = require('../lib/_rides');
  const appels = [];
  global.fetch = async (url) => { appels.push(url); return { ok: true, json: async () => ({ user_metadata: { prenom: 'julie', nom: 'Morneau' } }) }; };
  const p = await completerPrenoms({ sbUrl: 'https://x', sbKey: 'k' }, [{ id: 'a', prenom: '' }, { id: 'b', prenom: 'Marc' }]);
  assert.equal(p[0].prenom, 'Julie');
  assert.equal(p[1].prenom, 'Marc');
  assert.equal(appels.length, 1, 'Auth lu seulement pour le profil sans prénom');
});

test('15. « Où veux-tu débarquer ? » ne propose pas l\'arrêt de départ', () => {
  const html = lire('covoiturage-trajet.html');
  assert.match(html, /renderCards\('dropoff-cards', 'pax-dropoff', visibleStops\.length - 1, \(s\) => !s\.isStart\);/);
  assert.match(html, /visibleStops\.filter\(\(s\) => debarquement \? !s\.isStart : !s\.isEnd\)/);
  assert.match(html, /if \(garder && !garder\(s\)\) return '';/);
});

test('16. bagages refusés : aucun supplément bagage affiché', () => {
  assert.match(lire('covoiturage.html'), /\$\{r\.luggage_fee_info && r\.accepts_large_luggage \?/);
  assert.match(lire('covoiturage-trajet.html'), /r\.accepts_large_luggage \? '<div class="pb-note">Les frais de bagage sont versés/);
});

test('17. impossible de terminer ou valider un trajet avant son heure de départ', async () => {
  const { avantDepart } = require('../lib/_rides');
  const t0 = Date.parse('2026-11-25T13:00:00Z');
  assert.equal(avantDepart({ departure_time: '2026-11-25T13:00:00Z' }, t0 - 60000), true);
  assert.equal(avantDepart({ departure_time: '2026-11-25T13:00:00Z' }, t0 + 60000), false);
  assert.equal(avantDepart({}, t0), false);
  const src = lire('lib/_rides.js');
  const driver = src.slice(src.indexOf('async function rideDriverComplete'), src.indexOf('async function rideComplete('));
  assert.match(driver, /if \(avantDepart\(booking\.ride\)\) return res\.status\(400\)/);
  const complete = src.slice(src.indexOf('async function rideComplete('), src.indexOf('async function rideComplete(') + 6000);
  assert.match(complete, /if \(avantDepart\(ride\)\) \{/);
  assert.match(complete, /if \(!isAdminOrCron && avantDepart\(booking\.ride\)\) return res\.status\(400\)/);
});

test('18. vue d\'ensemble : réservations reçues comptées, statuts en français', () => {
  const html = lire('dashboard-covoiturage.html');
  assert.match(html, /\[\.\.\.bookings, \.\.\.\(dashData\.ride_bookings \|\| \[\]\)\]/);
  assert.match(html, /const STATUTS_CONFIRMES = \['confirme', 'paye', 'paid', 'driver_completed'\];/);
  for (const code of ['paye', 'driver_completed']) assert.match(html, new RegExp(`${code}: \\['`));
  assert.doesNotMatch(html, /\$\{b\.pickup_city\|\|'\?'\} → \$\{b\.dropoff_city\|\|'\?'\}/);
  const f = html.slice(html.indexOf('function villeArret'), html.indexOf('function statusChip'));
  const villeArret = new Function(f + '; return villeArret;')();
  assert.equal(villeArret('depart', { ride: { start_city: 'Lévis' } }), 'Lévis');
  assert.equal(villeArret('arrivee', {}), 'Arrivée');
  const statusChip = new Function(html.slice(html.indexOf('function statusChip'), html.indexOf('// ── OVERVIEW ──')) + '; return statusChip;')();
  assert.match(statusChip('driver_completed'), /Terminé — attente du passager/);
  assert.doesNotMatch(statusChip('nouveau_statut'), /nouveau_statut/);
});

test('17. API : « Valider trajet » avant le départ → 400 et rien n\'est modifié', async () => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  const platform = require('../api/platform');
  const CH = '66666666-6666-4666-8666-666666666666';
  const B = 'b0000000-0000-4000-8000-000000000001';
  const R = 'a0000000-0000-4000-8000-000000000009';
  for (const endpoint of ['ride-driver-complete', 'ride-complete']) {
    const patches = [];
    global.fetch = async (url, o = {}) => {
      const rep = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d), headers: { get: () => null } });
      if ((o.method || 'GET') === 'PATCH') { patches.push(url); return rep([]); }
      if (url.includes('/auth/v1/user')) return rep({ id: CH });
      if (url.includes('/rpc/check_rate_limit')) return rep(true);
      if (url.includes('/rest/v1/profiles')) return rep([{ id: CH, role: 'conducteur', suspendu: false }]);
      if (url.includes('/rest/v1/ride_bookings')) return rep([{ id: B, ride_id: R, passenger_id: 'p', status: 'confirme' }]);
      if (url.includes('/rest/v1/rides')) return rep([{ id: R, driver_id: CH, departure_time: new Date(Date.now() + 3600000).toISOString() }]);
      return rep([]);
    };
    const res = { _s: 200, _b: null, status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; }, setHeader() { return this; }, end() { return this; } };
    await platform({ method: 'POST', url: '/api/platform', query: {}, body: { endpoint, booking_id: B, actor: 'driver', code: '' }, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } }, res);
    assert.equal(res._s, 400, endpoint + ' ' + JSON.stringify(res._b));
    assert.equal(res._b.code, 'avant_depart');
    assert.deepEqual(patches, [], endpoint);
  }
});

// ─── Points 20 à 26 ──────────────────────────────────────────────────────────
test('20. après l\'inscription : écran « Courriel envoyé à … — clique sur le lien, puis reviens ici »', () => {
  const html = lire('signup.html');
  assert.match(html, /Courriel envoyé à <span id="courriel-envoye-adresse"/);
  assert.match(html, /clique sur le lien<\/strong>[\s\S]*puis reviens ici/);
  assert.match(html, /document\.getElementById\('courriel-envoye-adresse'\)\.textContent = adresse;/);
  assert.equal((html.match(/ecranCourrielEnvoye\(email, redirectSuffix\);/g) || []).length, 2);
  assert.match(html, /db\.auth\.resend\(\{ type: 'signup'/);
});

test('21. neige des Fêtes nettement plus lente sur cellulaire', () => {
  const js = lire('js/fetes.js');
  assert.match(js, /var duree = petit \? \(34 \+ Math\.random\(\) \* 16\) : \(16 \+ Math\.random\(\) \* 10\);/);
  for (const f of ['index.html', 'covoiturage.html', 'expediteur.html']) assert.match(lire(f), /fetes\.js\?v=tc2211/, f);
});

test('22. accents : plus de « Creer », « Reserver », « disponibilites », « Deconnexion »… dans le texte des pages', () => {
  const fs2 = require('node:fs');
  const MAUVAIS = /\b(Creer|Reserver|disponibilites|protegees|masquees|Deconnexion|Ponctualite|Fiabilite|resultats|limitee|declaree|speciales)\b/;
  const trouves = [];
  for (const d of ['.', 'admin', 'covoiturage']) {
    for (const f of fs2.readdirSync(d).filter((x) => x.endsWith('.html') && !/backup|corrupted/.test(x))) {
      const sansScripts = lire(`${d}/${f}`).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
      const textes = sansScripts.split(/<[^>]*>/).join(' ');
      if (MAUVAIS.test(textes)) trouves.push(`${d}/${f}: ${textes.match(MAUVAIS)[0]}`);
    }
  }
  assert.deepEqual(trouves, [], trouves.join('\n'));
  // Les clés internes ne doivent PAS avoir été accentuées (comparaisons de rôles).
  assert.match(lire('lib/_lib.js'), /'livreur expediteur', 'expediteur livreur'/);
  assert.match(lire('login.html'), /'livreur expediteur', 'expediteur livreur'/);
});

test('23. boutons flottants rangés : place réservée en bas, aucun empilement, petits sur cellulaire', () => {
  const js = lire('js/flottants.js');
  assert.match(js, /body\{padding-bottom:max\(var\(--pap-reserve-bas,92px\)/);
  assert.match(js, /\.pap-launcher-btn\{right:21px!important;bottom:88px!important\}/, 'menu au-dessus de la bulle, plus superposé');
  assert.match(js, /#pap-gps-status\{left:50%!important/);
  assert.match(js, /\.pp-layer-pill > :not\(\.pp-layer-chevron\)\{display:none!important\}/);
  for (const f of ['dashboard-livreur.html', 'dashboard.html', 'covoiturage-trajet.html', 'index.html']) {
    const h = lire(f);
    assert.ok(h.indexOf('/js/flottants.js') > 0, f);
  }
});

test('24. livreur : prénom (jamais le nom), carte sans débordement, menu cellulaire sur une rangée', () => {
  const html = lire('dashboard-livreur.html');
  assert.doesNotMatch(html, /greetName'\)\.textContent = p\.nom/);
  assert.match(html, /const prenomAccueil = String\(p\.prenom/);
  assert.match(html, /grid-template-columns: minmax\(0, 1\.6fr\) minmax\(0, 1fr\);/);
  assert.match(html, /\.delivery-actions \{ display: flex; gap: 6px; flex-wrap: wrap; \}/);
  assert.match(html, /\.topbar-right \{ width: 100%; flex-wrap: nowrap;[^}]*overflow-x: auto;/);
});

test('25. livraisons de test : cachées aux livreurs par un drapeau admin, jamais supprimées', async () => {
  const t = require('../lib/_livraisons-test');
  const rep = (d, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => d });
  const ev = [];
  global.fetch = async (url, o = {}) => {
    if ((o.method || 'GET') === 'DELETE') throw new Error('aucune suppression permise');
    if (url.includes('/rest/v1/livraisons')) return rep([{ id: 'L1', code: 'PP-OLD1', expediteur_id: 'e', statut: 'confirme' }]);
    if ((o.method || 'GET') === 'POST') { const b = JSON.parse(o.body); ev.push({ ...b, created_at: new Date(Date.now() + ev.length).toISOString() }); return rep([b]); }
    return rep(ev.map((e) => ({ livraison_id: e.livraison_id, event_type: e.event_type, created_at: e.created_at })));
  };
  const ctx = { sbUrl: 'https://x', sbKey: 'k', session: { id: 'a' }, profile: { role: 'admin' } };
  const res = () => ({ _s: 200, _b: null, status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; }, setHeader() { return this; } });
  const nonAdmin = res();
  await t.adminLivraisonTest({}, nonAdmin, { ...ctx, profile: { role: 'livreur' } }, { code: 'PP-OLD1' });
  assert.equal(nonAdmin._s, 403);
  const r1 = res(); await t.adminLivraisonTest({}, r1, ctx, { code: 'PP-OLD1', raison: 'test septembre' });
  assert.equal(r1._s, 200);
  assert.deepEqual(await t.idsLivraisonsTest(ctx), ['L1']);
  const r2 = res(); await t.adminLivraisonTest({}, r2, ctx, { livraison_id: 'L1', test: false });
  assert.deepEqual(await t.idsLivraisonsTest(ctx), [], 'réversible');
  const src = lire('api/platform.js');
  assert.equal((src.match(/const cachees = new Set\(await idsLivraisonsTest\(ctx\)\)/g) || []).length, 2, 'les 2 listes du livreur filtrent');
});

test('26. nouveau membre : tableau de bord unifié, plus de bannière « Essayer »', () => {
  for (const f of ['dashboard-livreur.html', 'dashboard-expediteur.html', 'dashboard-covoiturage.html', 'dashboard-destinataire.html']) {
    assert.doesNotMatch(lire(f), /pap-redirect-banner|Essayer →/, f);
  }
  assert.match(lire('signup.html'), /emailRedirectTo: window\.location\.origin \+ '\/dashboard\.html' \+ redirectSuffix/);
  assert.match(lire('signup.html'), /window\.location\.href = nextUrl \|\| '\/dashboard\.html';/);
  assert.match(lire('login.html'), /const dest = '\/dashboard\.html';/);
  assert.match(lire('role-choice.html'), /window\.location\.href = nextUrl \|\| '\/dashboard\.html';/);
});
