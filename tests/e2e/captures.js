// tests/e2e/captures.js — Captures d'écran LOCALES (accueil avec la bannière des Fêtes, page du membre).
// Base Supabase locale, faux Stripe, Chrome sans interface avec la production rendue injoignable.
// Lancer : node tests/e2e/captures.js <dossier de sortie>
'use strict';
const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { demarrer } = require('./serveur-local');

const ROOT = path.join(__dirname, '..', '..');
const SORTIE = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'captures-fetes'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BLOQUER = ['miqrircrfpzkmvvacgwt.supabase.co', 'porteaporte.site', '*.stripe.com', 'js.stripe.com', 'challenges.cloudflare.com', '*.resend.com'];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const st = JSON.parse(execSync('supabase status -o json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(st.API_URL)) throw new Error('base locale seulement');
  const SB = st.API_URL; const ANON = st.ANON_KEY; const SVC = st.SERVICE_ROLE_KEY;
  const S = await demarrer({ supabaseUrl: SB, anonKey: ANON, serviceKey: SVC, configNavigateurLocale: true });
  const j = async (m, url, { token, key, body, prefer } = {}) => {
    const h = { 'content-type': 'application/json' };
    if (key) h.apikey = key; if (token) h.authorization = 'Bearer ' + token; if (prefer) h.prefer = prefer;
    const r = await fetch(url, { method: m, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch (_) { d = t; }
    return { status: r.status, d };
  };
  const svc = (m, p, body, prefer) => j(m, SB + p, { key: SVC, token: SVC, body, prefer });
  const api = (e, body, token) => j('POST', `${S.adresse}/api/platform?endpoint=${e}`, { token, body: { endpoint: e, ...body } });

  const marque = 'capt-' + crypto.randomBytes(3).toString('hex');
  const comptes = {}; const rides = []; let drawId = null;
  const creer = async (nom, role, extra = {}) => {
    const email = `${marque}-${nom}@exemple.test`; const mdp = crypto.randomBytes(18).toString('base64url') + 'Aa1!';
    const ins = await j('POST', `${SB}/auth/v1/signup`, { key: ANON, body: { email, password: mdp, data: { prenom: nom, nom: 'Exemple', role } } });
    const id = ins.d?.user?.id || ins.d?.id;
    await svc('PUT', `/auth/v1/admin/users/${id}`, { email_confirm: true });
    const p = await svc('GET', `/rest/v1/profiles?id=eq.${id}&select=id`);
    if (!p.d?.length) await svc('POST', '/rest/v1/profiles', { id, email, prenom: nom, nom: 'Exemple', role });
    await svc('PATCH', `/rest/v1/profiles?id=eq.${id}`, { role, prenom: nom, nom: 'Exemple', ...extra });
    const c = await j('POST', `${SB}/auth/v1/token?grant_type=password`, { key: ANON, body: { email, password: mdp } });
    comptes[nom] = { id, session: c.d };
  };
  let chrome; let profil;
  try {
    await creer('Camille', 'les deux', { driver_status: 'verified' });
    await creer('Julie', 'expediteur');
    await creer('Admin', 'admin');
    const l = await api('admin-concours-fetes', { mode: 'lancer' }, comptes.Admin.session.access_token);
    drawId = l.d?.concours?.id;
    // Deux trajets payés de Julie (passagère) avec Camille (conductrice) → 2 participations chacune.
    for (let k = 0; k < 2; k++) {
      const dep = new Date(Date.now() + (2 + k) * 86400000).toISOString();
      const r = await api('ride-create', { start_city: 'Lévis', end_city: 'Québec', departure_time: dep, available_seats: 3, total_distance_km: 30 }, comptes.Camille.session.access_token);
      rides.push(r.d.ride.id);
      const b = await api('ride-book', { ride_id: r.d.ride.id, pickup_city: 'Lévis', dropoff_city: 'Québec', seats_reserved: 1 }, comptes.Julie.session.access_token);
      const bid = b.d.booking?.id || b.d.booking_id;
      await svc('PATCH', `/rest/v1/ride_bookings?id=eq.${bid}`, { status: 'paye', payment_status: 'succeeded', paid_at: new Date().toISOString() });
    }
    const moi = await api('concours-fetes-moi', {}, comptes.Julie.session.access_token);
    console.log('participations de Julie :', moi.d?.participations);

    profil = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-capt-'));
    const port = 9300 + Math.floor(Math.random() * 500);
    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, '--no-first-run', '--hide-scrollbars',
      `--host-resolver-rules=${BLOQUER.map((h) => `MAP ${h} 127.0.0.1:9`).join(', ')}`, 'about:blank'], { stdio: 'ignore' });
    let ws;
    for (let i = 0; i < 50 && !ws; i++) {
      await attendre(200);
      try { const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = t.find((x) => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (_) {}
    }
    const sock = new WebSocket(ws);
    await new Promise((ok) => sock.addEventListener('open', ok));
    let n = 0; const att = new Map();
    sock.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && att.has(m.id)) { att.get(m.id)(m); att.delete(m.id); } });
    const cdp = (method, params = {}) => new Promise((ok) => { const id = ++n; att.set(id, ok); sock.send(JSON.stringify({ id, method, params })); });
    const aller = async (url, w, h, mobile) => {
      await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
      await cdp('Page.navigate', { url }); await attendre(4500);
      // Ferme la fenêtre des témoins (« Essentiels seulement ») pour voir la page.
      await cdp('Runtime.evaluate', { expression: "(() => { const b = [...document.querySelectorAll('button')].find((x) => /Essentiels seulement/.test(x.textContent)); if (b) b.click(); })()" });
      await attendre(600);
    };
    const capturer = async (nom) => {
      const r = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SORTIE, nom), Buffer.from(r.result.data, 'base64'));
      console.log('capture :', path.join(SORTIE, nom));
    };
    await cdp('Page.enable');
    await aller(S.adresse + '/', 1280, 860); await capturer('1-accueil-ordinateur.png');
    await aller(S.adresse + '/', 390, 844, true); await capturer('2-accueil-telephone.png');
    await aller(S.adresse + '/covoiturage.html', 1280, 860); await capturer('3-covoiturage-banniere.png');
    // Page du membre : session locale de Julie dans le stockage du navigateur.
    const cle = 'sb-' + new URL(SB).hostname.split('.')[0] + '-auth-token';
    await cdp('Runtime.evaluate', { expression: `localStorage.setItem(${JSON.stringify(cle)}, ${JSON.stringify(JSON.stringify(comptes.Julie.session))})` });
    await aller(S.adresse + '/dashboard.html', 1280, 900); await capturer('4-membre-participations.png');
    await aller(S.adresse + '/concours-fetes-reglement.html', 1280, 900); await capturer('5-reglement.png');
    sock.close();
    console.log('appels bloqués côté serveur :', JSON.stringify(S.bloques));
  } finally {
    if (chrome) { chrome.kill(); await attendre(800); }
    try { if (profil) fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (_) { /* dossier temporaire : sans importance */ }
    // Nettoyage de la base LOCALE.
    for (const c of Object.values(comptes)) {
      for (const t of ['ride_bookings?passenger_id', 'rides?driver_id', 'transactions?user_id', 'transaction_audit_events?user_id', 'transaction_audit_events?actor_id', 'ride_driver_profiles?user_id', 'draw_entries?user_id', 'notifications?user_id']) await svc('DELETE', `/rest/v1/${t}=eq.${c.id}`);
    }
    if (drawId) { await svc('DELETE', `/rest/v1/draw_entries?draw_id=eq.${drawId}`); await svc('DELETE', `/rest/v1/monthly_draws?id=eq.${drawId}`); }
    for (const c of Object.values(comptes)) { await svc('DELETE', `/rest/v1/profiles?id=eq.${c.id}`); await svc('DELETE', `/auth/v1/admin/users/${c.id}`); }
    await S.fermer();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
