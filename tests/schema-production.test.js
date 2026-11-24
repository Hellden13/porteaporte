// tests/schema-production.test.js — Le code n'écrit et ne lit que des tables / colonnes qui existent en production
// (décision de Denis, 24 nov. 2026 : on adapte le code ; schéma lu en lecture seule dans tests/schema-production.json).
'use strict';
const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { creerBase, makeRes } = require('./aide-fausse-base');
const GL = require('../lib/_grand-livre');
const { tables: T } = require('./schema-production.json');

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };

describe('grand livre : colonnes réelles de transactions', () => {
  test('la table de production est bien celle prévue', () => {
    assert.deepEqual(T.transactions, ['cree_le', 'description', 'id', 'livraison_id', 'meta', 'montant_cad', 'montant_coins', 'solde_apres', 'solde_avant', 'stripe_id', 'type', 'user_id']);
  });

  test('écriture : montant → montant_cad, stripe_payment_intent → stripe_id, metadata + statut → meta', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    const r = await GL.ecrire(CTX, { user_id: 'u1', type: 'paiement_covoiturage', montant: 12.345, statut: 'requires_capture', stripe_payment_intent: 'pi_1', metadata: { booking_id: 'b1' } });
    assert.equal(r.ok, true, JSON.stringify(db.refus || []));
    const [l] = db.tables.transactions;
    assert.equal(l.montant_cad, 12.35);
    assert.equal(l.stripe_id, 'pi_1');
    assert.deepEqual(l.meta, { booking_id: 'b1', statut: 'requires_capture' });
    for (const k of ['montant', 'statut', 'stripe_payment_intent', 'metadata', 'created_at']) assert.ok(!(k in l), k);
    assert.equal(r.data.statut, 'requires_capture');
    assert.equal(r.data.stripe_payment_intent, 'pi_1');
  });

  test('lecture et mise à jour : statut et meta fusionnés, aucune colonne inexistante', async () => {
    const db = creerBase({ transactions: [{ id: 't1', type: 'paiement_livraison', livraison_id: 'L', montant_cad: 9, stripe_id: 'pi_9', meta: { statut: 'requires_capture', a: 1 }, cree_le: '2026-11-01' }] });
    global.fetch = db.fetch;
    const { ok, rows } = await GL.lire(CTX, 'livraison_id=eq.L&type=eq.paiement_livraison&order=cree_le.desc&limit=1');
    assert.equal(ok, true);
    assert.equal(rows[0].stripe_payment_intent, 'pi_9');
    assert.equal(rows[0].montant, 9);
    assert.equal(await GL.majLignes(CTX, GL.filtre.pi('pi_9'), { statut: 'succeeded', metadata: { captured: true } }), true);
    assert.deepEqual(db.tables.transactions[0].meta, { statut: 'succeeded', a: 1, captured: true });
    assert.deepEqual(db.refus || [], []);
  });

  test('plus aucune écriture ni lecture de transactions hors du module (sauf la page admin, corrigée)', () => {
    for (const f of ['lib/_rides.js', 'api/paiement-livraison.js', 'api/capture-livraison.js', 'api/platform.js']) {
      assert.doesNotMatch(lire(f), /rest\/v1\/transactions/, f);
    }
    assert.match(lire('admin/ride-payments.html'), /\.select\('stripe_id,meta'\)\s*\.in\('stripe_id', piIds\)/);
  });
});

describe('fausse base des tests : schéma de production strict', () => {
  test('colonne inexistante en écriture → 400 comme PostgREST ; table inexistante → 404', async () => {
    const db = creerBase();
    let r = await db.fetch(`${CTX.sbUrl}/rest/v1/transactions`, { method: 'POST', body: JSON.stringify({ montant: 1 }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).message, /Could not find the 'montant' column of 'transactions'/);
    r = await db.fetch(`${CTX.sbUrl}/rest/v1/manquements?select=id&order=created_at.desc`, {});
    assert.equal(r.status, 400);
    r = await db.fetch(`${CTX.sbUrl}/rest/v1/gps_updates?select=id`, {});
    assert.equal(r.status, 404);
  });
});

// ─── Balayage du code (lectures, filtres, tris et écritures littérales) ─────────────────────────
const EXCLUS = /^(node_modules|\.git|_archived|save|tests|outils-internes|docs|scripts|supabase|backups|files|_video-work)(\/|$)/;
function fichiers() {
  const out = [];
  (function marcher(dir) {
    for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
      const rel = dir ? dir + '/' + e.name : e.name;
      if (EXCLUS.test(rel) || e.name.startsWith('.')) continue;
      if (e.isDirectory()) marcher(rel);
      else if (/\.(js|html)$/.test(rel)) out.push(rel);
    }
  })('');
  return out;
}
function colonnesSelect(sel) {
  const out = []; let prof = 0; let cur = '';
  for (const ch of sel) {
    if (ch === '(') { prof++; continue; }
    if (ch === ')') { prof--; continue; }
    if (prof) continue;
    if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean).map((x) => (x.includes(':') ? x.split(':').pop() : x).split('!')[0].split('->')[0].trim())
    .filter((x) => x && x !== '*' && !T[x] && !/[${}]/.test(x) && x !== 'count');
}
function balayer() {
  const fautes = [];
  const verifier = (f, ligne, table, cols) => {
    if (!T[table]) { fautes.push(`${f}:${ligne} table ${table}`); return; }
    for (const c of cols) if (c && !T[table].includes(c)) fautes.push(`${f}:${ligne} ${table}.${c}`);
  };
  for (const f of fichiers()) {
    const s = lire(f);
    const ligneDe = (i) => s.slice(0, i).split('\n').length;
    for (const m of s.matchAll(/rest\/v1\/(?!rpc\/)([a-z_0-9]+)([^`'"\s]*)/g)) {
      const q = m[2].replace(/\$\{[^}]*\}/g, '');
      const cols = [];
      const sel = q.match(/select=([^&]*)/);
      if (sel) cols.push(...colonnesSelect(sel[1]));
      for (const x of q.matchAll(/[?&]([a-z_0-9]+)=(?:eq|neq|in|is|gt|gte|lt|lte|like|ilike|not)\./g)) cols.push(x[1]);
      for (const x of q.matchAll(/order=([a-z_0-9]+)/g)) cols.push(x[1]);
      verifier(f, ligneDe(m.index), m[1], cols);
    }
    for (const m of s.matchAll(/\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)((?:\s*\.\w+\([^()]*(?:\([^()]*\)[^()]*)*\))*)/g)) {
      const chaine = m[2]; const cols = [];
      for (const x of chaine.matchAll(/\.select\(\s*['"`]([^'"`]*)['"`]/g)) cols.push(...colonnesSelect(x[1]));
      for (const x of chaine.matchAll(/\.(?:eq|neq|in|is|gt|gte|lt|lte|order|like|ilike)\(\s*['"]([a-z_0-9]+)['"]/g)) cols.push(x[1]);
      for (const x of chaine.matchAll(/\.(?:insert|update|upsert)\(\s*\{([^{}]*)\}/g)) for (const k of x[1].matchAll(/(?:^|,)\s*([a-z_][a-z_0-9]*)\s*:/g)) cols.push(k[1]);
      verifier(f, ligneDe(m.index), m[1], cols);
    }
  }
  return fautes;
}

describe('balayage du code contre le schéma de production', () => {
  test('aucune table ni colonne inexistante lue, filtrée, triée ou écrite', () => {
    assert.deepEqual(balayer(), []);
  });
  test('le balayage attrape bien une colonne inexistante', () => {
    const ancien = T.transactions;
    try {
      T.transactions = ancien.filter((c) => c !== 'stripe_id');
      assert.ok(balayer().some((x) => /transactions\.stripe_id/.test(x)));
    } finally { T.transactions = ancien; }
  });
});

describe('corrections ciblées', () => {
  test('lieu de rencontre du trajet écrit dans pickup_safe_label / dropoff_safe_label (colonnes réelles)', () => {
    const r = lire('lib/_rides.js');
    assert.match(r, /pickup_safe_label: \(start_meeting_point \|\| body\.pickup_safe_label\)/);
    assert.match(r, /dropoff_safe_label: \(end_meeting_point \|\| body\.dropoff_safe_label\)/);
    assert.match(r, /patch\.pickup_safe_label = mp/);
    assert.doesNotMatch(r, /\bstart_meeting_point: \(|patch\.start_meeting_point/);
  });
  test('abonnement push enregistré sans colonne created_at', async () => {
    const { pushSubscribe } = require('../lib/_push');
    const db = creerBase();
    global.fetch = db.fetch;
    const res = makeRes();
    await pushSubscribe({ method: 'POST' }, res, { ...CTX, session: { id: 'u1' } }, { subscription: { endpoint: 'https://push.exemple/1', keys: { p256dh: 'p', auth: 'a' } } });
    assert.equal(res._status, 200, JSON.stringify(db.refus || []));
    assert.equal(db.tables.push_subscriptions[0].endpoint, 'https://push.exemple/1');
  });
  test('envois push : abonnement reconstruit depuis endpoint / p256dh / auth', () => {
    for (const f of ['api/platform.js', 'lib/_admin-push-broadcast.js']) {
      assert.match(lire(f), /push_subscriptions\?select=id,user_id,endpoint,p256dh,auth/, f);
      assert.doesNotMatch(lire(f), /row\.subscription/, f);
    }
  });
  test('notifications : notif_type / title / body', () => {
    for (const f of ['lib/_connect.js', 'api/stripe-webhook.js', 'api/platform.js']) assert.match(lire(f), /notif_type: /, f);
  });
  test('message de rendez-vous et demande de suppression gardés au journal', () => {
    assert.match(lire('lib/_rides.js'), /event_type: 'ride_meetup_message'/);
    assert.match(lire('lib/_rides.js'), /event_type=eq\.ride_meetup_message&user_id=eq\.\$\{uid\}/);
    assert.match(lire('api/platform.js'), /event_type: 'suppression_compte_demandee'/);
  });
  test('ménage : plus de table gps_updates', () => {
    assert.doesNotMatch(lire('api/cron-cleanup.js'), /rest\/v1\/gps_updates/);
  });
  test('migration propre gardée pour prod-v2, jamais dans les migrations appliquées', () => {
    const f = 'supabase/prod-v2-plus-tard/20261125090000_grand_livre_colonnes.sql.NE-PAS-APPLIQUER';
    assert.match(lire(f), /alter table public\.transactions add column if not exists statut text;/);
    assert.ok(!fs.readdirSync(path.join(RACINE, 'supabase/migrations')).some((x) => /grand_livre/.test(x)));
  });
  test('comparatif à 360 px : libellé au-dessus du curseur, nom non coupé', () => {
    const h = lire('comparatif.html');
    assert.match(h, /@media \(max-width: 560px\) \{\s*\.sim-row \{ grid-template-columns: 1fr;/);
    assert.match(h, /body > header > a:first-child \{ flex: 1 1 auto; min-width: 0; white-space: nowrap; \}/);
  });
});
