// tests/aide-fausse-base.js — Petite base PostgREST en mémoire pour les tests (aucun appel réseau).
// Comprend : eq., in.(…), not.is.null, gt., gte., evidence->>cle=eq., PATCH conditionnel, DELETE,
// Prefer return=representation, et quelques fonctions RPC (grant_badge_v2, grant_xp, grant_points_impact…).
'use strict';

function rep(data, ok = true, status = ok ? 200 : 500, entetes = {}) {
  return { ok, status, headers: { get: (k) => entetes[String(k).toLowerCase()] ?? null }, json: async () => data, text: async () => JSON.stringify(data) };
}

function valeur(ligne, cle) {
  if (cle.includes('->>')) {
    const [col, sous] = cle.split('->>');
    const o = ligne[col];
    return o && typeof o === 'object' ? (o[sous] == null ? null : String(o[sous])) : null;
  }
  return ligne[cle];
}

function filtres(url) {
  const q = url.split('?')[1] || '';
  const out = [];
  for (const morceau of q.split('&')) {
    if (!morceau) continue;
    const i = morceau.indexOf('=');
    const cle = decodeURIComponent(morceau.slice(0, i));
    const v = decodeURIComponent(morceau.slice(i + 1));
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(cle)) continue;
    out.push([cle, v]);
  }
  return out;
}

function correspond(ligne, [cle, v]) {
  if (cle === 'or') {
    // or=(a.eq.x,b.eq.y) : au moins une condition vraie
    return v.replace(/^\(|\)$/g, '').split(',').some((c) => {
      const m = c.match(/^([a-z_]+)\.(eq\..*)$/);
      return m ? correspond(ligne, [m[1], m[2]]) : true;
    });
  }
  const x = valeur(ligne, cle);
  if (v.startsWith('eq.')) return String(x) === v.slice(3);
  if (v.startsWith('neq.')) return String(x) !== v.slice(4);
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(x));
  if (v === 'not.is.null') return x != null;
  if (v === 'is.null') return x == null;
  if (v.startsWith('gt.')) return Number(x) > Number(v.slice(3));
  if (v.startsWith('gte.')) return String(x) >= v.slice(4);
  if (v.startsWith('lt.')) return String(x) < v.slice(3);
  return true;
}

const SCHEMA = require('./schema-production.json').tables;
// PAP_REFUS=fichier : note chaque refus (même avalé par le code testé) pour le balayage du schéma.
function noterRefus(table, colonne, m) {
  if (!process.env.PAP_REFUS) return;
  const pile = (new Error().stack || '').split('\n').find((l) => /\/(lib|api)\//.test(l)) || '';
  require('node:fs').appendFileSync(process.env.PAP_REFUS, JSON.stringify({ table, colonne, m, ou: pile.trim() }) + '\n');
}
// select=a,b:c,rel(x,y),autre:rel!fk(z) → colonnes simples seulement (les ressources liées sont ignorées)
function colonnesLues(sel) {
  const out = []; let prof = 0; let cur = '';
  for (const ch of sel) {
    if (ch === '(') { prof++; continue; }
    if (ch === ')') { prof--; continue; }
    if (prof) continue;
    if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean).map((x) => (x.includes(':') ? x.split(':').pop() : x).split('!')[0].split('->')[0].split('::')[0])
    .filter((x) => x && x !== '*' && !SCHEMA[x] && !/^count$/.test(x));
}

function creerBase(tables = {}) {
  const db = { tables: { transaction_audit_events: [], ...JSON.parse(JSON.stringify(tables)) }, rpc: [], stripe: [], courriels: [], seq: 0, badges: new Set() };
  const t = (nom) => (db.tables[nom] = db.tables[nom] || []);

  async function fetchFaux(url, o = {}) {
    const m = (o.method || 'GET').toUpperCase();
    let body = o.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { /* formulaire Stripe */ } }
    const prefer = String((o.headers && (o.headers.Prefer || o.headers.prefer)) || '');
    if (url.startsWith('https://api.stripe.com')) {
      db.stripe.push({ url, m, body: typeof o.body === 'string' ? o.body : null });
      if (db.stripeReponse) return db.stripeReponse(url, m, o.body);
      return rep({ id: 'tr_test' });
    }
    if (url.includes('/api/notifier')) { db.courriels.push(body); return rep({ success: true }); }
    if (url.includes('/storage/v1/object/sign/')) return rep({ signedURL: '/object/sign/' + url.split('/storage/v1/object/sign/')[1] + '?token=t' });
    if (url.includes('/storage/v1/object/')) {
      db.stockage = db.stockage || [];
      db.stockage.push({ m, chemin: url.split('/storage/v1/object/')[1], body: m === 'DELETE' ? body : null });
      return rep({ Key: url.split('/storage/v1/object/')[1] });
    }
    const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/);
    if (rpc) {
      const fn = rpc[1];
      db.rpc.push({ fn, body });
      if (fn === 'grant_badge_v2' || fn === 'grant_badge') {
        const cle = `${body.p_user_id}:${body.p_badge_slug}`;
        const badge = (db.tables.badges || []).find((b) => b.slug === body.p_badge_slug);
        if (!badge || badge.active === false) return rep(fn === 'grant_badge' ? false : 'inactive');
        if (db.badges.has(cle)) return rep(fn === 'grant_badge' ? false : 'already_owned');
        db.badges.add(cle);
        t('user_badges').push({ user_id: body.p_user_id, badge_id: badge.id, badges: { slug: badge.slug } });
        if (badge.points_reward > 0) t('porte_coins_transactions').push({ user_id: body.p_user_id, amount: badge.points_reward, reason: 'badge_unlock:' + badge.slug });
        if (badge.xp_reward > 0) t('xp_transactions').push({ user_id: body.p_user_id, amount: badge.xp_reward, reason: 'badge_unlock:' + badge.slug });
        return rep(fn === 'grant_badge' ? true : 'granted');
      }
      if (fn === 'grant_xp') { t('xp_transactions').push({ user_id: body.p_user_id, amount: body.p_amount, reason: body.p_reason }); return rep(1); }
      if (fn === 'grant_points_impact') { t('porte_coins_transactions').push({ user_id: body.p_user_id, amount: body.p_amount, reason: body.p_reason }); return rep(null); }
      if (fn === 'award_claim_free_milestone') { t('porte_coins_transactions').push({ user_id: body.p_driver_id, amount: body.p_points, reason: 'claim_free_milestone' }); return rep(true); }
      if (fn === 'check_rate_limit') return rep(true);
      return rep(null);
    }
    const tab = url.match(/\/rest\/v1\/([a-z_0-9]+)/);
    if (!tab) return rep({}, false, 404);
    const nom = tab[1];
    if (db.illisible && db.illisible.includes(nom)) return rep({ message: 'illisible' }, false, 500);
    // Schéma de PRODUCTION par défaut (tests/schema-production.json, lu le 24 nov. 2026) : comme PostgREST,
    // une table inconnue donne 404 et une colonne inconnue 400. db.colonnes = { table: [colonnes] } peut le préciser.
    if (db.schemaProduction !== false && !SCHEMA[nom] && !(db.colonnes && db.colonnes[nom])) {
      db.refus = db.refus || []; db.refus.push({ table: nom, colonne: null, m }); noterRefus(nom, null, m);
      return rep({ code: 'PGRST205', message: `Could not find the table 'public.${nom}' in the schema cache` }, false, 404);
    }
    const cols = (db.colonnes && db.colonnes[nom]) || (db.schemaProduction !== false && SCHEMA[nom]);
    if (cols) {
      const sel = decodeURIComponent((url.match(/[?&]select=([^&]*)/) || [])[1] || '');
      const lues = sel && sel !== '*' ? colonnesLues(sel) : [];
      const ecrites = (m === 'PATCH' || m === 'POST') && body && typeof body === 'object' ? (Array.isArray(body) ? body : [body]).flatMap((b) => Object.keys(b)) : [];
      const filtrees = filtres(url).map(([c]) => c.split('->')[0]).filter((c) => c !== 'or' && c !== 'and');
      const triees = [...url.matchAll(/[?&]order=([a-z_0-9]+)/g)].map((x) => x[1]);
      const inconnue = [...lues, ...ecrites, ...filtrees, ...triees].find((c) => !cols.includes(c));
      if (inconnue) { db.refus = db.refus || []; db.refus.push({ table: nom, colonne: inconnue, m }); noterRefus(nom, inconnue, m); return rep(ecrites.includes(inconnue) ? { code: 'PGRST204', message: `Could not find the '${inconnue}' column of '${nom}' in the schema cache` } : { code: '42703', message: `column ${nom}.${inconnue} does not exist` }, false, 400); }
    }
    const f = filtres(url);
    const lignes = t(nom);
    if (m === 'GET') {
      const res = lignes.filter((l) => f.every((x) => correspond(l, x)));
      const tri = (url.match(/order=([a-z_]+)\.asc/) || [])[1];
      if (tri) res.sort((a, b) => (String(a[tri]) < String(b[tri]) ? -1 : String(a[tri]) > String(b[tri]) ? 1 : (a.id < b.id ? -1 : 1)));
      const triDesc = (url.match(/order=([a-z_]+)\.desc/) || [])[1];
      if (triDesc) res.sort((a, b) => (String(a[triDesc]) > String(b[triDesc]) ? -1 : String(a[triDesc]) < String(b[triDesc]) ? 1 : (a.id > b.id ? -1 : 1)));
      const lim = Number((url.match(/[?&]limit=(\d+)/) || [])[1]);
      if (lim > 0) res.splice(lim);
      return rep(res.map((x) => ({ ...x })), true, 200, { 'content-range': `0-${Math.max(0, res.length - 1)}/${res.length}` });
    }
    if (m === 'POST') {
      const items = Array.isArray(body) ? body : [body];
      const crees = items.map((it) => {
        db.seq += 1;
        // Horodatage par défaut sous le vrai nom de colonne de la table (created_at ou cree_le)
        const quand = new Date(Date.UTC(2026, 10, 22, 12, 0, db.seq)).toISOString();
        const colDate = SCHEMA[nom] && !SCHEMA[nom].includes('created_at') && SCHEMA[nom].includes('cree_le') ? 'cree_le' : 'created_at';
        const l = { id: it.id || `id-${String(db.seq).padStart(6, '0')}`, [colDate]: quand, ...it };
        lignes.push(l);
        return l;
      });
      return rep(prefer.includes('return=representation') ? crees : (prefer.includes('return=minimal') ? null : crees), true, 201);
    }
    if (m === 'PATCH') {
      const vises = lignes.filter((l) => f.every((x) => correspond(l, x)));
      vises.forEach((l) => Object.assign(l, body));
      return rep(prefer.includes('return=minimal') ? null : vises.map((x) => ({ ...x })));
    }
    if (m === 'DELETE') {
      const reste = lignes.filter((l) => !f.every((x) => correspond(l, x)));
      db.tables[nom] = reste;
      return rep(null, true, 204);
    }
    return rep({}, false, 405);
  }
  db.fetch = fetchFaux;
  return db;
}

function makeRes() {
  return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() { return this; } };
}

// Pour les anciens tests de publication de trajet : un véhicule enregistré (auto, 4 places)
// est exigé à la publication depuis la branche vehicules-debut-journee.
const VEHICULE_TEST = { id: 'veh-evt', event_type: 'vehicule_enregistre', created_at: '2026-11-01T00:00:00Z', evidence: { vehicule_id: 'veh-test', type: 'auto', numero: 'ABC 123', capacite: { taille_max: 'gros', poids_max_kg: 100, places: 4 } } };
function avecVehicule(fetchFn) {
  return async (url, o) => (String(url).includes('event_type=in.(vehicule_enregistre') ? rep([VEHICULE_TEST]) : fetchFn(url, o));
}

module.exports = { creerBase, rep, makeRes, avecVehicule, VEHICULE_TEST };
