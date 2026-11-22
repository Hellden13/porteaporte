// tests/concours-fetes.test.js — Concours des Fêtes 2026 + thème des Fêtes.
'use strict';

const { test, describe, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../lib/_concours-fetes');

const ROOT = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DEBUT = '2026-12-01T05:00:00Z';
const DANS = '2026-12-15T15:00:00Z';
const vraiNow = Date.now;
afterEach(() => { Date.now = vraiNow; });

describe('participations : seulement en utilisant le service', () => {
  const base = () => ({
    livraisons: [], litiges: [], bookings: [], rides: [{ id: 'r1', driver_id: U(9) }], reports: [],
  });
  const calc = (s) => C.calculerParticipations(s, { debut: DEBUT, fin: C.CONCOURS.fin });

  test('aucun service utilisé : aucune participation', () => {
    assert.deepEqual(calc(base()), []);
  });

  test('livraison complétée et payée (capturée) : 1 participation à l\'expéditeur', () => {
    const s = base();
    s.livraisons = [{ id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: DANS }];
    const p = calc(s);
    assert.equal(p.length, 1);
    assert.deepEqual([p[0].user_id, p[0].total, p[0].livraisons], [U(1), 1, 1]);
  });

  test('livraison livrée mais pas encore capturée, ou annulée : 0', () => {
    const s = base();
    s.livraisons = [
      { id: 'l1', expediteur_id: U(1), statut: 'livre', livre_le: DANS },
      { id: 'l2', expediteur_id: U(1), statut: 'annule', livre_le: DANS },
      { id: 'l3', expediteur_id: U(1), statut: 'litige', livre_le: DANS },
    ];
    assert.deepEqual(calc(s), []);
  });

  test('litige sur une livraison (même arrivé après) : participation retirée', () => {
    const s = base();
    s.livraisons = [{ id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: DANS }, { id: 'l2', expediteur_id: U(1), statut: 'payee', livre_le: DANS }];
    assert.equal(calc(s)[0].total, 2);
    s.litiges = [{ livraison_id: 'l2' }];
    assert.equal(calc(s)[0].total, 1);
  });

  test('trajet complété et payé : 1 au passager ET 1 au conducteur', () => {
    const s = base();
    s.bookings = [{ id: 'b1', ride_id: 'r1', passenger_id: U(2), status: 'paye', payment_status: 'succeeded', paid_at: DANS }];
    const p = calc(s);
    const par = Object.fromEntries(p.map((x) => [x.user_id, x]));
    assert.equal(par[U(2)].trajets_passager, 1);
    assert.equal(par[U(9)].trajets_conducteur, 1);
    assert.equal(p.reduce((t, x) => t + x.total, 0), 2);
  });

  test('trajet pas capturé (en attente, autorisé, annulé) : 0', () => {
    const s = base();
    s.bookings = [
      { id: 'b1', ride_id: 'r1', passenger_id: U(2), status: 'driver_completed', payment_status: 'succeeded', paid_at: DANS },
      { id: 'b2', ride_id: 'r1', passenger_id: U(2), status: 'confirme', payment_status: 'requires_capture', paid_at: null },
      { id: 'b3', ride_id: 'r1', passenger_id: U(2), status: 'annule_chauffeur', payment_status: 'succeeded', paid_at: DANS },
      { id: 'b4', ride_id: 'r1', passenger_id: U(2), status: 'paye', payment_status: 'requires_capture', paid_at: DANS },
    ];
    assert.deepEqual(calc(s), []);
  });

  test('signalement (litige) sur la réservation ou le trajet : participations retirées', () => {
    const s = base();
    s.bookings = [{ id: 'b1', ride_id: 'r1', passenger_id: U(2), status: 'paye', payment_status: 'succeeded', paid_at: DANS }];
    s.reports = [{ booking_id: 'b1', ride_id: 'r1' }];
    assert.deepEqual(calc(s), []);
    s.reports = [{ booking_id: null, ride_id: 'r1' }];
    assert.deepEqual(calc(s), []);
  });

  test('avant le lancement ou après le 31 décembre 23 h 59 (Québec) : 0', () => {
    const s = base();
    s.livraisons = [
      { id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: '2026-11-30T12:00:00Z' },
      { id: 'l2', expediteur_id: U(1), statut: 'payee', livre_le: '2027-01-01T05:00:00Z' }, // 1er janv. 0 h Québec
      { id: 'l3', expediteur_id: U(1), statut: 'payee', livre_le: '2027-01-01T04:59:00Z' }, // 31 déc. 23 h 59 Québec
    ];
    const p = calc(s);
    assert.equal(p[0].total, 1);
    assert.deepEqual(p[0].refs, ['livraison:l3']);
  });
});

describe('tirage', () => {
  test('seulement après le 31 décembre 2026, 23 h 59, heure du Québec', () => {
    assert.equal(C.tirageAutorise(Date.parse('2026-12-31T23:00:00-05:00')), false);
    assert.equal(C.tirageAutorise(Date.parse('2026-12-31T23:59:59-05:00')), false);
    assert.equal(C.tirageAutorise(Date.parse('2027-01-01T00:00:00-05:00')), true);
  });

  test('pondéré : chaque participation = 1 chance (tirage déterministe)', () => {
    const p = [{ user_id: 'a', total: 1 }, { user_id: 'b', total: 3 }];
    const tire = (n) => C.tirerPondere(p, () => n).gagnant.user_id;
    assert.equal(tire(1), 'a');
    assert.deepEqual([tire(2), tire(3), tire(4)], ['b', 'b', 'b']);
    assert.equal(C.tirerPondere(p, () => 1).totalPoids, 4);
  });

  test('pondéré : sur 8000 tirages réels, 3 participations gagnent ~3 fois plus que 1', () => {
    const p = [{ user_id: 'a', total: 1 }, { user_id: 'b', total: 3 }];
    let b = 0;
    for (let i = 0; i < 8000; i++) if (C.tirerPondere(p).gagnant.user_id === 'b') b++;
    const part = b / 8000;
    assert.ok(part > 0.72 && part < 0.78, `part de b : ${part}`);
  });

  test('personne sans participation ne peut gagner ; aucune participation : pas de tirage', () => {
    assert.equal(C.tirerPondere([{ user_id: 'a', total: 0 }]), null);
    assert.equal(C.tirerPondere([]), null);
  });
});

describe('thème des Fêtes', () => {
  test('actif jusqu\'au 6 janvier 2027 inclus, coupé le 7 janvier (heure du Québec)', () => {
    assert.equal(C.themeActif({ now: Date.parse('2027-01-06T23:59:59-05:00') }), true);
    assert.equal(C.themeActif({ now: Date.parse('2027-01-07T00:00:00-05:00') }), false);
  });
  test('coupé par l\'interrupteur admin, ou si le concours n\'est pas lancé', () => {
    const now = Date.parse('2026-12-10T12:00:00Z');
    assert.equal(C.themeActif({ now, interrupteur: false }), false);
    assert.equal(C.themeActif({ now, lance: false }), false);
    assert.equal(C.themeActif({ now }), true);
  });
});

// ─── Endpoints (fausse base) ──────────────────────────────────────────────────
const handler = require('../api/platform');
before(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
});
const rep = (data, ok = true, status = ok ? 200 : 500) => ({ ok, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
function makeRes() {
  return { _status: 200, _body: null, _h: {}, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, send(b) { this._body = b; return this; }, end() { return this; }, setHeader(k, v) { this._h[k] = v; return this; } };
}
const DRAW = 'd0000000-0000-4000-8000-000000000001';

function base({ moi = U(50), role = 'admin', concours = true, gagnant = null, verrouOk = true, sourceKo = null, theme = null } = {}) {
  const ecritures = [];
  const fetchImpl = async (url, o = {}) => {
    const m = o.method || 'GET';
    if (m !== 'GET' && !url.includes('/rpc/check_rate_limit')) ecritures.push({ m, url, body: o.body ? JSON.parse(o.body) : null });
    if (url.includes('/auth/v1/user')) return rep({ id: moi });
    if (url.includes('/rpc/check_rate_limit')) return rep(true);
    if (sourceKo && url.includes(sourceKo)) return rep({}, false, 500);
    if (url.includes('/rest/v1/monthly_draws') && m === 'PATCH') return verrouOk ? rep([{ id: DRAW, status: 'completed' }]) : rep([]);
    if (url.includes('/rest/v1/monthly_draws') && m === 'POST') return rep([{ id: DRAW, created_at: DEBUT, status: 'active' }]);
    if (url.includes('/rest/v1/monthly_draws')) {
      if (url.includes('eligibility_badge_slug=eq.concours-fetes-2026') || url.includes(`id=eq.${DRAW}`)) {
        return rep(concours ? [{ id: DRAW, created_at: DEBUT, status: gagnant ? 'completed' : 'active', eligibility_badge_slug: 'concours-fetes-2026', title: 'Concours des Fêtes 2026' }] : []);
      }
      return rep([]);
    }
    if (url.includes('/rest/v1/draw_winners') && m === 'GET') return rep(gagnant ? [gagnant] : []);
    if (url.includes('/rest/v1/draw_entries') && m === 'GET') return rep([{ user_id: U(7) }]);
    if (url.includes('/rest/v1/transaction_audit_events') && m === 'GET') return rep(theme ? [{ status: theme }] : []);
    if (url.includes('/rest/v1/livraisons')) return rep([{ id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: DANS }, { id: 'l2', expediteur_id: U(1), statut: 'payee', livre_le: DANS }]);
    if (url.includes('/rest/v1/litiges')) return rep([]);
    if (url.includes('/rest/v1/ride_bookings')) return rep([{ id: 'b1', ride_id: 'r1', passenger_id: U(2), status: 'paye', payment_status: 'succeeded', paid_at: DANS }]);
    if (url.includes('/rest/v1/rides')) return rep([{ id: 'r1', driver_id: U(3) }]);
    if (url.includes('/rest/v1/ride_reports')) return rep([]);
    if (url.includes('/rest/v1/profiles?id=in.')) return rep([{ id: U(1), prenom: 'Ana', nom: 'B', email: 'ana@exemple.test', role: 'expediteur' }, { id: U(2), prenom: 'Bo', nom: 'C', email: 'bo@exemple.test', role: 'expediteur' }]);
    if (url.includes('/rest/v1/profiles')) return rep([{ id: moi, role, suspendu: false }]);
    return rep([]);
  };
  return { ecritures, fetchImpl };
}
async function appel(sb, endpoint, body = {}, { auth = true, method = 'POST' } = {}) {
  global.fetch = sb.fetchImpl;
  const res = makeRes();
  await handler({ method, url: `/api/platform?endpoint=${endpoint}`, query: { endpoint }, body: { endpoint, ...body }, headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer t' } : {}) } }, res);
  return res;
}
const types = (e) => e.map((x) => `${x.m} ${x.url.replace(/^https:\/\/fake\.supabase\.co\/rest\/v1\//, '').replace(/\?.*$/, '')}`);

describe('admin-concours-fetes', () => {
  test('membre simple : 403', async () => {
    const res = await appel(base({ role: 'expediteur' }), 'admin-concours-fetes', { mode: 'liste' });
    assert.equal(res._status, 403);
  });

  test('liste : participants calculés (2 + 1 + 1) et enregistrés dans draw_entries', async () => {
    const sb = base();
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'liste' });
    assert.equal(res._status, 200);
    const par = Object.fromEntries(res._body.participants.map((p) => [p.user_id, p.total]));
    assert.deepEqual(par, { [U(1)]: 2, [U(2)]: 1, [U(3)]: 1 });
    assert.equal(res._body.total_participations, 4);
    const up = sb.ecritures.find((e) => e.m === 'POST' && e.url.includes('/draw_entries'));
    assert.ok(up.url.includes('on_conflict=draw_id,user_id'));
    assert.deepEqual(up.body.map((l) => [l.user_id, l.entries, l.cost_coins]).sort(), [[U(1), 2, 0], [U(2), 1, 0], [U(3), 1, 0]].sort());
    // Participation retirée (litige) : remise à 0, jamais supprimée
    const zero = sb.ecritures.find((e) => e.m === 'PATCH' && e.url.includes('/draw_entries'));
    assert.deepEqual(zero.body, { entries: 0 });
    assert.ok(!sb.ecritures.some((e) => e.m === 'DELETE'));
  });

  test('une source illisible : erreur, jamais de liste incomplète', async () => {
    const res = await appel(base({ sourceKo: '/rest/v1/litiges' }), 'admin-concours-fetes', { mode: 'liste' });
    assert.equal(res._status, 502);
  });

  test('export CSV : en-tête et une ligne par participant', async () => {
    const res = await appel(base(), 'admin-concours-fetes', { mode: 'csv' });
    assert.equal(res._status, 200);
    const lignes = String(res._body).replace(/^﻿/, '').split('\n');
    assert.equal(lignes[0], 'prenom,nom,courriel,participations,livraisons,trajets_passager,trajets_conducteur');
    assert.equal(lignes.length, 4);
    assert.match(res._h['Content-Type'], /text\/csv/);
  });

  test('tirer AVANT la date limite : refusé, rien n\'est écrit', async () => {
    Date.now = () => Date.parse('2026-12-31T23:59:00-05:00');
    const sb = base();
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'tirer' });
    assert.equal(res._status, 409);
    assert.equal(res._body.code, 'trop_tot');
    assert.ok(!sb.ecritures.some((e) => /draw_winners|monthly_draws|transaction_audit_events/.test(e.url)));
  });

  test('tirer APRÈS la date : gagnant pondéré, verrou, draw_winners et journal d\'audit', async () => {
    Date.now = () => Date.parse('2027-01-02T10:00:00-05:00');
    const sb = base();
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'tirer' });
    assert.equal(res._status, 200, JSON.stringify(res._body));
    const t = types(sb.ecritures);
    const iVerrou = t.indexOf('PATCH monthly_draws');
    assert.ok(iVerrou >= 0);
    assert.match(sb.ecritures[iVerrou].url, /status=eq\.active/);
    assert.ok(t.indexOf('POST draw_winners') > iVerrou);
    const audit = sb.ecritures.find((e) => e.url.includes('/transaction_audit_events') && e.body?.event_type === 'concours_fetes_tirage');
    assert.ok(audit);
    assert.equal(audit.body.evidence.total_participations, 4);
    assert.match(audit.body.evidence.empreinte_participants, /^[0-9a-f]{64}$/);
    assert.ok([U(1), U(2), U(3)].includes(res._body.gagnant.user_id));
  });

  test('tirage déjà fait : non modifiable (409), rien n\'est réécrit', async () => {
    Date.now = () => Date.parse('2027-01-02T10:00:00-05:00');
    const sb = base({ gagnant: { id: 'w1', user_id: U(1) } });
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'tirer' });
    assert.equal(res._status, 409);
    assert.equal(res._body.code, 'deja_tire');
    assert.ok(!sb.ecritures.some((e) => /draw_winners|monthly_draws|transaction_audit_events/.test(e.url)));
  });

  test('deux clics en même temps : le verrou n\'en laisse passer qu\'un', async () => {
    Date.now = () => Date.parse('2027-01-02T10:00:00-05:00');
    const sb = base({ verrouOk: false });
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'tirer' });
    assert.equal(res._status, 409);
    assert.ok(!sb.ecritures.some((e) => e.url.includes('/draw_winners') || e.body?.event_type === 'concours_fetes_tirage'));
  });

  test('interrupteur du thème : noté au journal (aucune migration)', async () => {
    const sb = base();
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'theme', actif: false });
    assert.equal(res._status, 200);
    const e = sb.ecritures.find((x) => x.url.includes('/transaction_audit_events'));
    assert.equal(e.body.event_type, 'concours_fetes_theme');
    assert.equal(e.body.status, 'off');
  });
});

describe('membre et public', () => {
  test('membre : « X participations » calculées pour lui seul', async () => {
    const res = await appel(base({ moi: U(1), role: 'expediteur' }), 'concours-fetes-moi');
    assert.equal(res._status, 200);
    assert.equal(res._body.participations, 2);
    assert.equal(res._body.detail.livraisons, 2);
  });

  test('membre sans service utilisé : 0 participation', async () => {
    const res = await appel(base({ moi: U(44), role: 'expediteur' }), 'concours-fetes-moi');
    assert.equal(res._body.participations, 0);
  });

  test('public : thème et date, aucune donnée personnelle ; coupé par l\'interrupteur', async () => {
    Date.now = () => Date.parse('2026-12-10T12:00:00Z');
    let res = await appel(base(), 'concours-fetes-public', {}, { auth: false, method: 'GET' });
    assert.equal(res._status, 200);
    assert.equal(res._body.theme_actif, true);
    assert.doesNotMatch(JSON.stringify(res._body), /@|user_id|exemple/);
    res = await appel(base({ theme: 'off' }), 'concours-fetes-public', {}, { auth: false, method: 'GET' });
    assert.equal(res._body.theme_actif, false);
  });

  test('public : le 7 janvier 2027, thème coupé automatiquement', async () => {
    Date.now = () => Date.parse('2027-01-07T00:00:01-05:00');
    const res = await appel(base(), 'concours-fetes-public', {}, { auth: false, method: 'GET' });
    assert.equal(res._body.theme_actif, false);
  });
});

describe('aucune participation sans service : protections des tirages génériques', () => {
  test('draw-enter (PorteCoins) refusé sur le concours, aucun débit', async () => {
    const sb = base({ moi: U(1), role: 'expediteur' });
    const res = await appel(sb, 'draw-enter', { draw_id: DRAW, entries: 5 });
    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'concours_service_seulement');
    assert.ok(!sb.ecritures.some((e) => /porte_coins_transactions|draw_entries/.test(e.url)));
  });

  for (const mode of ['run_draw', 'delete_draw', 'update_draw', 'update_draw_status', 'duplicate_draw']) {
    test(`admin-rewards « ${mode} » refusé sur le concours`, async () => {
      const sb = base();
      const res = await appel(sb, 'admin-rewards', { mode, id: DRAW, status: 'completed' });
      assert.equal(res._status, 409);
      assert.ok(!sb.ecritures.some((e) => /monthly_draws|draw_winners/.test(e.url)));
    });
  }

  test('aucun formulaire de participation gratuite (règlement et pages)', () => {
    const regl = lire('concours-fetes-reglement.html');
    assert.doesNotMatch(regl, /<form|<input/i);
    for (const s of ['Organisateur', 'Admissibilité', 'Durée', 'Prix', 'Façon de participer', 'Tirage', 'Réclamation du prix']) assert.match(regl, new RegExp(s));
    assert.equal((regl.match(/TEXTE À ÉCRIRE PAR DENIS/g) || []).length, 7);
    assert.doesNotMatch(lire('js/fetes.js'), /<form|draw-enter/);
  });
});

// ─── Navigateur : js/fetes.js avec un faux document ──────────────────────────
function fauxDocument() {
  const tous = [];
  const el = (tag) => {
    const e = { tag, children: [], attrs: {}, style: { setProperty() {} }, className: '', textContent: '', id: '',
      classList: { set: new Set(), add(c) { this.set.add(c); } },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { this.children.push(c); tous.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); tous.push(c); return c; } };
    return e;
  };
  const body = el('body'); const head = el('head');
  return {
    tous, body, head, readyState: 'complete',
    createElement: el,
    getElementById: (id) => tous.find((x) => x.id === id) || null,
    querySelector: (sel) => tous.find((x) => sel.startsWith('.') && x.className === sel.slice(1)) || null,
    addEventListener() {},
  };
}
async function executerFetes({ now, accueil = true, info = { theme_actif: true, concours_ouvert: true }, reduit = false }) {
  const doc = fauxDocument();
  let appels = 0;
  const ctx = {
    document: { ...doc, currentScript: { getAttribute: (k) => (k === 'data-fetes' && accueil ? 'accueil' : null) } },
    window: { __fetesNow: () => now, matchMedia: () => ({ matches: reduit }) },
    fetch: async () => { appels += 1; return { ok: true, json: async () => info }; },
    setInterval: () => 0, Date, Math, Promise,
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(lire('js/fetes.js'), ctx);
  await new Promise((r) => setTimeout(r, 5));
  const banniere = doc.tous.find((x) => x.className === 'fetes-banniere');
  const neige = doc.tous.find((x) => x.className === 'fetes-neige');
  return { banniere, neige, appels, texte: banniere ? banniere.children.map((c) => c.textContent).join(' ') : '', body: doc.body };
}

describe('js/fetes.js (navigateur)', () => {
  test('décembre : bannière avec le texte demandé, lien règlement, compte à rebours et flocons sur l\'accueil', async () => {
    const r = await executerFetes({ now: Date.parse('2026-12-20T12:00:00-05:00') });
    assert.match(r.texte, /🎄 Concours des Fêtes : chaque livraison ou trajet = 1 chance de gagner une carte-cadeau de 100 \$ !/);
    assert.match(r.texte, /Règlement/);
    assert.match(r.texte, /J-11/);
    assert.ok(r.neige);
    assert.ok(r.body.classList.set.has('theme-fetes'));
  });

  test('autre page : bannière sans flocons', async () => {
    const r = await executerFetes({ now: Date.parse('2026-12-20T12:00:00-05:00'), accueil: false });
    assert.ok(r.banniere);
    assert.ok(!r.neige);
  });

  test('« réduire les animations » : pas de flocons', async () => {
    const r = await executerFetes({ now: Date.parse('2026-12-20T12:00:00-05:00'), reduit: true });
    assert.ok(r.banniere);
    assert.ok(!r.neige);
  });

  test('après le 31 décembre : bannière « concours terminé », plus de compte à rebours', async () => {
    const r = await executerFetes({ now: Date.parse('2027-01-03T12:00:00-05:00') });
    assert.match(r.texte, /terminé/);
    assert.doesNotMatch(r.texte, /J-|⏳/);
  });

  test('7 janvier 2027 : rien du tout, même si le serveur dit « actif »', async () => {
    const r = await executerFetes({ now: Date.parse('2027-01-07T00:00:00-05:00') });
    assert.ok(!r.banniere && !r.neige);
    assert.equal(r.appels, 0, 'le script s\'arrête avant même d\'appeler le serveur');
  });

  test('thème coupé par l\'admin : rien', async () => {
    const r = await executerFetes({ now: Date.parse('2026-12-20T12:00:00-05:00'), info: { theme_actif: false } });
    assert.ok(!r.banniere);
  });

  test('chargé sur l\'accueil (avec flocons), covoiturage et livraison ; pas de musique', () => {
    assert.match(lire('index.html'), /<script src="\/js\/fetes\.js" data-fetes="accueil" defer><\/script>/);
    for (const f of ['covoiturage.html', 'covoiturage-trajet.html', 'covoiturage-publier.html', 'livraison.html']) {
      assert.match(lire(f), /<script src="\/js\/fetes\.js" defer><\/script>/, f);
    }
    assert.doesNotMatch(lire('js/fetes.js'), /<audio|new Audio|\.mp3|\.ogg/i);
    assert.ok(fs.statSync(path.join(ROOT, 'js/fetes.js')).size < 8000, 'script léger');
  });
});

describe('tableau de bord du membre', () => {
  test('« Tu as X participations au tirage des Fêtes »', () => {
    const html = lire('dashboard.html');
    const i = html.indexOf('  function texteParticipationsFetes(');
    const j = html.indexOf('  async function loadConcoursFetes(');
    const ctx = { Number };
    vm.createContext(ctx);
    vm.runInContext(html.slice(i, j), ctx);
    assert.equal(ctx.texteParticipationsFetes({ participations: 3, detail: { livraisons: 2, trajets_passager: 1 } }).titre, '🎄 Tu as 3 participations au tirage des Fêtes');
    assert.equal(ctx.texteParticipationsFetes({ participations: 1 }).titre, '🎄 Tu as 1 participation au tirage des Fêtes');
    assert.match(html, /endpoint=concours-fetes-moi/);
  });
});
