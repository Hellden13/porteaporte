// tests/notifier-chemin-reel.test.js — Vrai chemin serveur → /api/notifier, avec la vraie vérification du secret.
// Bug du 22 nov. 2026 : sur Vercel, INTERNAL_API_SECRET finit par un saut de ligne (\r\n). fetch retire ce blanc
// de l'en-tête, le notifier comparait avec la valeur brute → « Secret interne requis », aucun courriel.
// Ici : un vrai serveur HTTP local (processus séparé) fait tourner api/notifier.js tel quel; l'appel part du vrai
// code (endpoint verification-reminder, alertAdmin, courriels covoiturage) par un vrai fetch. Seul Resend est
// intercepté dans le serveur (rien n'est envoyé) et Supabase est simulé côté appelant.
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SECRET = crypto.randomBytes(32).toString('hex');
const SECRET_VERCEL = SECRET + '\r\n'; // même forme que la valeur enregistrée sur Vercel
const ADMIN = '99999999-9999-4999-8999-999999999999';
const MEMBRE = '11111111-1111-4111-8111-111111111111';

let enfant, origine, journal;
const fetchReel = global.fetch;
const envois = () => (fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const viderJournal = () => fs.writeFileSync(journal, '');
const rep = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

// Côté appelant : le notifier local est joint pour vrai; Supabase est simulé; tout le reste est refusé.
function brancherFetch() {
  global.fetch = async (url, o = {}) => {
    const u = new URL(String(url));
    if (u.origin === origine) return fetchReel(url, o);
    if (u.hostname === 'fake.supabase.co') {
      const m = o.method || 'GET';
      if (u.pathname === '/auth/v1/user') return rep({ id: ADMIN });
      if (u.pathname === '/rest/v1/profiles' && u.search.includes(ADMIN)) return rep([{ id: ADMIN, role: 'admin', suspendu: false }]);
      if (u.pathname === '/rest/v1/profiles') return rep([{ id: MEMBRE, email: 'julie@example.com', prenom: 'Julie', driver_status: 'not_started' }]);
      if (u.pathname === '/rest/v1/transaction_audit_events' && m === 'GET') return rep([]);
      if (u.pathname === '/rest/v1/transaction_audit_events' && m === 'POST') return rep([{ id: 'marque-1' }], 201);
      return rep([]);
    }
    throw new Error('Réseau bloqué dans le test : ' + u.hostname);
  };
}

before(async () => {
  journal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notif-')), 'resend.jsonl');
  viderJournal();
  enfant = spawn(process.execPath, [path.join(__dirname, 'aides', 'notifier-serveur.js')], {
    env: {
      PATH: process.env.PATH,
      NOTIF_JOURNAL: journal,
      INTERNAL_API_SECRET: SECRET_VERCEL,
      RESEND_API_KEY: 're_faux',
      ADMIN_EMAIL: 'denis@example.com',
      FROM_EMAIL: 'envoi@example.com',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((ok, ko) => {
    let out = '';
    enfant.stdout.on('data', (c) => { out += c; const m = out.match(/PORT (\d+)/); if (m) ok(Number(m[1])); });
    enfant.on('exit', (c) => ko(new Error('serveur notifier arrêté : ' + c)));
    setTimeout(() => ko(new Error('serveur notifier : délai dépassé')), 10000);
  });
  origine = `http://127.0.0.1:${port}`;
  process.env.PUBLIC_SITE_ORIGIN = origine;
  process.env.VERCEL_URL = 'deploiement-protege.vercel.app'; // ne doit JAMAIS servir d'adresse au notifier
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = SECRET_VERCEL;
  brancherFetch();
});

after(() => {
  global.fetch = fetchReel;
  if (enfant) enfant.kill();
});

function makeRes() {
  return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() { return this; } };
}

describe('serveur → notifier : vrai chemin, vrai contrôle du secret', () => {
  test('bouton « Relancer » (endpoint verification-reminder) : 200 et UN courriel prêt pour Resend, Reply-To admin', async () => {
    viderJournal();
    const platform = require('../api/platform');
    const res = makeRes();
    await platform({ method: 'POST', url: '/api/platform', body: { endpoint: 'verification-reminder', user_id: MEMBRE }, headers: { authorization: 'Bearer t', 'content-type': 'application/json' } }, res);
    assert.equal(res._status, 200, JSON.stringify(res._body));
    const e = envois();
    assert.equal(e.length, 1);
    assert.equal(e[0].to, 'julie@example.com');
    assert.equal(e[0].reply_to, 'denis@example.com');
    assert.equal(e[0].subject, "Julie, un trajet Lévis ↔ Québec t'attend sur PorteàPorte");
  });

  test('alerte admin (alertAdmin → callNotifier, ex. blocage après 5 codes) : arrive', async () => {
    viderJournal();
    const { alertAdmin } = require('../lib/_lib');
    const r = await alertAdmin('Livraison bloquée', 'Test du chemin', { severity: 'critical' });
    assert.equal(r.ok, true, JSON.stringify(r.data));
    const e = envois();
    assert.equal(e.length, 1);
    assert.equal(e[0].to, 'denis@example.com');
  });

  test('courriels covoiturage : adresse du site (jamais VERCEL_URL) et secret accepté', async () => {
    viderJournal();
    const { rideNotifierUrl, postRideNotifier } = require('../lib/_rides');
    assert.equal(rideNotifierUrl(), `${origine}/api/notifier`);
    const r = await postRideNotifier('ride_booking_confirmed', { passenger_email: 'p@example.com', ride_from: 'Lévis', ride_to: 'Québec' });
    assert.equal(r.status, 200, await r.text());
    assert.equal(envois().length, 1);
  });

  test('mauvais secret : le notifier refuse (403), rien ne part', async () => {
    viderJournal();
    process.env.INTERNAL_API_SECRET = crypto.randomBytes(32).toString('hex');
    try {
      const { callNotifier } = require('../lib/_lib');
      const r = await callNotifier('verification_rappel', { email: 'julie@example.com', prenom: 'Julie' });
      assert.equal(r.status, 403);
      assert.match(r.data.error, /Secret interne requis/);
      assert.equal(envois().length, 0);
    } finally { process.env.INTERNAL_API_SECRET = SECRET_VERCEL; }
  });

  test('aucun secret côté appelant : refus, rien ne part', async () => {
    viderJournal();
    delete process.env.INTERNAL_API_SECRET;
    try {
      const { callNotifier } = require('../lib/_lib');
      const r = await callNotifier('admin_critical_alert', { subject: 'x' });
      assert.equal(r.status, 403);
      assert.equal(envois().length, 0);
    } finally { process.env.INTERNAL_API_SECRET = SECRET_VERCEL; }
  });

  test('secret avec BOM au début côté appelant : accepté aussi', async () => {
    viderJournal();
    process.env.INTERNAL_API_SECRET = '﻿' + SECRET + '\n';
    try {
      const { callNotifier } = require('../lib/_lib');
      const r = await callNotifier('verification_rappel', { email: 'julie@example.com', prenom: 'Julie' });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(envois().length, 1);
    } finally { process.env.INTERNAL_API_SECRET = SECRET_VERCEL; }
  });
});

describe('appel interne reçu par api/platform (push-send) : même règle', () => {
  async function pushInterne(entete) {
    const appels = [];
    const avant = global.fetch;
    global.fetch = async (url, o) => { appels.push(String(url)); return avant(url, o); };
    try {
      const platform = require('../api/platform');
      const res = makeRes();
      await platform({ method: 'POST', url: '/api/platform', body: { endpoint: 'push-send', user_id: MEMBRE, title: 't', body: 'b' }, headers: { 'content-type': 'application/json', 'x-internal-notifier-secret': entete } }, res);
      return { res, appels };
    } finally { global.fetch = avant; }
  }
  test('secret Vercel avec \\r\\n, en-tête nettoyé par fetch : reconnu comme interne (pas de session demandée)', async () => {
    const { res, appels } = await pushInterne(SECRET);
    assert.notEqual(res._status, 401);
    assert.ok(!appels.some((u) => u.includes('/auth/v1/user')));
  });
  test('mauvais en-tête : pas interne (401, session exigée)', async () => {
    const { res } = await pushInterne(crypto.randomBytes(32).toString('hex'));
    assert.equal(res._status, 401);
  });
});

describe('garde-fou : une seule façon de lire le secret interne', () => {
  const fichiers = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? fichiers(p) : (p.endsWith('.js') ? [p] : []);
  });
  const racine = path.join(__dirname, '..');
  const code = [...fichiers(path.join(racine, 'api')), ...fichiers(path.join(racine, 'lib'))]
    .map((f) => ({ f: path.relative(racine, f), s: fs.readFileSync(f, 'utf8') }));

  test('process.env.INTERNAL_API_SECRET n\'est lu que dans lib/_lib.js (internalSecret et jeton des liens)', () => {
    const hors = code.filter(({ f, s }) => f !== path.join('lib', '_lib.js') && /process\.env\.INTERNAL_API_SECRET/.test(s)).map(({ f }) => f);
    assert.deepEqual(hors, []);
    const lib = code.find(({ f }) => f === path.join('lib', '_lib.js')).s;
    assert.equal((lib.match(/process\.env\.INTERNAL_API_SECRET/g) || []).length, 2);
  });

  test('l\'en-tête x-internal-notifier-secret n\'est construit que par internalHeaders()', () => {
    const construit = code.filter(({ s }) => /\[\s*'x-internal-notifier-secret'\s*\]\s*=|'x-internal-notifier-secret'\s*:/.test(s)).map(({ f }) => f);
    assert.deepEqual(construit, [path.join('lib', '_lib.js')]);
  });

  test('aucun appel au notifier par VERCEL_URL', () => {
    const fautifs = code.filter(({ s }) => /VERCEL_URL[^\n]*\n?[^\n]*api\/notifier|api\/notifier[^\n]*VERCEL_URL/.test(s)).map(({ f }) => f);
    assert.deepEqual(fautifs, []);
  });
});
