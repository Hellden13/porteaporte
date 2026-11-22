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

describe('participations par le service (sans comptes membres : aucune participation d\'inscription)', () => {
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

  // Litiges : suspendue pendant, rendue si refusé ou réglé en faveur du membre, retirée si réglé contre lui.
  const uneLiv = () => { const s = base(); s.livraisons = [{ id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: DANS }]; return s; };
  const etatLiv = (litiges) => { const s = uneLiv(); s.litiges = litiges; const p = calc(s)[0]; return p ? [p.total, p.suspendues] : [0, 0]; };

  test('livraison : litige ouvert ou en analyse → participation SUSPENDUE', () => {
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'ouvert', plaignant_id: U(5) }]), [0, 1]);
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'en_analyse', plaignant_id: U(1) }]), [0, 1]);
  });

  test('livraison : litige refusé → la participation REVIENT', () => {
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'rejete', plaignant_id: U(5) }]), [1, 0]);
  });

  test('livraison : réglé en faveur du membre (il était le plaignant) → REVIENT', () => {
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'resolu', plaignant_id: U(1) }]), [1, 0]);
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'rembourse', plaignant_id: U(1) }]), [1, 0]);
  });

  test('livraison : réglé CONTRE le membre → RETIRÉE', () => {
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'resolu', plaignant_id: U(5) }]), [0, 0]);
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'rembourse', plaignant_id: U(5) }]), [0, 0]);
  });

  test('livraison : un litige réglé contre lui l\'emporte sur un autre encore ouvert', () => {
    assert.deepEqual(etatLiv([{ livraison_id: 'l1', statut: 'ouvert', plaignant_id: U(5) }, { livraison_id: 'l1', statut: 'resolu', plaignant_id: U(6) }]), [0, 0]);
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

  const unTrajet = (reports) => {
    const s = base();
    s.bookings = [{ id: 'b1', ride_id: 'r1', passenger_id: U(2), status: 'paye', payment_status: 'succeeded', paid_at: DANS }];
    s.reports = reports;
    const par = Object.fromEntries(calc(s).map((x) => [x.user_id, [x.total, x.suspendues]]));
    return { passager: par[U(2)] || [0, 0], conducteur: par[U(9)] || [0, 0] };
  };

  test('covoiturage : signalement ouvert ou en traitement → passager et conducteur SUSPENDUS', () => {
    assert.deepEqual(unTrajet([{ booking_id: 'b1', ride_id: 'r1', status: 'ouvert', reporter_id: U(2), reported_id: U(9) }]), { passager: [0, 1], conducteur: [0, 1] });
    assert.deepEqual(unTrajet([{ booking_id: null, ride_id: 'r1', status: 'en_traitement' }]), { passager: [0, 1], conducteur: [0, 1] });
  });

  test('covoiturage : signalement refusé (fermé) → tout REVIENT', () => {
    assert.deepEqual(unTrajet([{ booking_id: 'b1', ride_id: 'r1', status: 'ferme', reporter_id: U(2), reported_id: U(9) }]), { passager: [1, 0], conducteur: [1, 0] });
  });

  test('covoiturage : réglé contre le conducteur signalé → RETIRÉE pour lui seulement, le passager la garde', () => {
    assert.deepEqual(unTrajet([{ booking_id: 'b1', ride_id: 'r1', status: 'resolu', reporter_id: U(2), reported_id: U(9) }]), { passager: [1, 0], conducteur: [0, 0] });
  });

  test('covoiturage : réglé contre le passager signalé → RETIRÉE pour lui seulement', () => {
    assert.deepEqual(unTrajet([{ booking_id: 'b1', ride_id: 'r1', status: 'resolu', reporter_id: U(9), reported_id: U(2) }]), { passager: [0, 0], conducteur: [1, 0] });
  });

  test('suspendue : ne compte pas au tirage', () => {
    assert.equal(C.tirerPondere([{ user_id: 'a', total: 0, suspendues: 3 }]), null);
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

function base({ moi = U(50), role = 'admin', concours = true, gagnant = null, verrouOk = true, sourceKo = null, theme = null, profils = [], comptes = [], session = {}, profilMoi = {} } = {}) {
  const ecritures = [];
  const fetchImpl = async (url, o = {}) => {
    const m = o.method || 'GET';
    if (m !== 'GET' && !url.includes('/rpc/check_rate_limit')) ecritures.push({ m, url, body: o.body ? JSON.parse(o.body) : null });
    if (url.includes('/auth/v1/user')) return rep({ id: moi, ...session });
    if (sourceKo && url.includes(sourceKo)) return rep({}, false, 500);
    if (url.includes('/auth/v1/admin/users')) return rep({ users: comptes });
    if (url.includes('/rest/v1/profiles?select=id,prenom,nom,email,role,suspendu,email_verified,created_at')) return rep(profils);
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
    if (url.includes('/rest/v1/profiles')) return rep([{ id: moi, role, suspendu: false, ...profilMoi }]);
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
    assert.equal(lignes[0], 'prenom,nom,courriel,participations,inscription,suspendues_litige,livraisons,trajets_passager,trajets_conducteur');
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
    for (const s of ['1. Organisateur', '2. Durée', '3. Admissibilité', '4. Prix', '5. Façons de participer', '6. Tirage', '7. Réclamation du prix', '8. Conditions générales']) assert.match(regl, new RegExp(s));
    assert.doesNotMatch(regl, /TEXTE À ÉCRIRE PAR DENIS/);
    assert.doesNotMatch(lire('js/fetes.js'), /<form|draw-enter/);
  });
});

// ─── Navigateur : js/fetes.js avec un faux document ──────────────────────────
function fauxDocument() {
  const tous = [];
  const el = (tag, className = '') => {
    const e = { tag, children: [], attrs: {}, style: { setProperty(k, v) { this[k] = v; } }, className, textContent: '', id: '',
      classList: { set: new Set(className ? [className] : []), add(c) { this.set.add(c); } },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { this.children.push(c); tous.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); tous.push(c); return c; },
      querySelector(sel) { return this.children.find((x) => sel.startsWith('.') && x.className === sel.slice(1)) || null; } };
    return e;
  };
  const body = el('body'); const head = el('head');
  // Éléments de l'accueil (index.html) : section d'accueil, fil, logo, bouton « Trouver un trajet ».
  const hero = el('section', 'hero'); const fil = el('ul', 'hero-thread'); const marque = el('a', 'brand'); const bouton = el('a', 'btn');
  tous.push(hero, fil, marque, bouton);
  hero.children.push(el('div', 'contenu-existant')); // la section d'accueil a déjà du contenu
  return {
    tous, body, head, hero, fil, marque, bouton, readyState: 'complete',
    createElement: (t) => el(t),
    getElementById: (id) => tous.find((x) => x.id === id) || null,
    querySelector: (sel) => {
      if (sel === '.hero-actions a[href="/covoiturage.html"]') return bouton;
      return tous.find((x) => sel.startsWith('.') && x.className === sel.slice(1)) || null;
    },
    addEventListener() {},
  };
}
async function executerFetes({ now, accueil = true, info = { theme_actif: true, concours_ouvert: true }, reduit = false }) {
  const doc = fauxDocument();
  let appels = 0;
  const ctx = {
    document: { ...doc, currentScript: { getAttribute: (k) => (k === 'data-fetes' && accueil ? 'accueil' : null) } },
    window: { __fetesNow: () => now, matchMedia: () => ({ matches: reduit }), innerWidth: 1280 },
    fetch: async () => { appels += 1; return { ok: true, json: async () => info }; },
    setInterval: () => 0, Date, Math, Promise,
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(lire('js/fetes.js'), ctx);
  await new Promise((r) => setTimeout(r, 5));
  const banniere = doc.tous.find((x) => x.className === 'fetes-banniere');
  const neige = doc.tous.find((x) => x.className === 'fetes-neige');
  return { banniere, neige, appels, doc, texte: banniere ? banniere.children.map((c) => c.textContent).join(' ') : '', body: doc.body };
}

describe('js/fetes.js (navigateur)', () => {
  test('décembre : bannière avec le texte demandé, lien règlement, compte à rebours et flocons sur l\'accueil', async () => {
    const r = await executerFetes({ now: Date.parse('2026-12-20T12:00:00-05:00') });
    assert.match(r.texte, /^🎄 Concours des Fêtes : inscris-toi et gagne une carte-cadeau Super C de 100 \$ ! Chaque livraison ou trajet = 1 chance de plus\. /);
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
    assert.ok(fs.statSync(path.join(ROOT, 'js/fetes.js')).size < 12000, 'script léger (aucune image)');
    assert.doesNotMatch(lire('js/fetes.js'), /\.(png|jpe?g|gif|webp|svg)['"]/i, 'aucune image');
  });
});

describe('accueil : on sent les Fêtes', () => {
  const DEC = Date.parse('2026-12-20T12:00:00-05:00');

  test('vrais flocons ❄ (tailles variées, chute douce), moins nombreux mais visibles', async () => {
    const r = await executerFetes({ now: DEC });
    const flocons = r.neige.children;
    assert.ok(flocons.length >= 8 && flocons.length <= 16, `${flocons.length} flocons`);
    assert.ok(flocons.every((f) => f.textContent === '❄'));
    const tailles = new Set(flocons.map((f) => f.style.fontSize));
    assert.ok(tailles.size > 3, 'tailles variées');
    assert.ok(flocons.every((f) => parseFloat(f.style.animationDuration) >= 14), 'chute douce');
  });

  test('guirlande de lumières en haut de la section d\'accueil, ligne de vœux, sapin près du logo, bouton rouge', async () => {
    const r = await executerFetes({ now: DEC });
    const g = r.doc.hero.children.find((x) => x.className === 'fetes-guirlande');
    assert.ok(g && g.children.length >= 15, 'guirlande');
    assert.equal(r.doc.hero.children[0], g, 'en haut de la section');
    const voeux = r.doc.fil.children.find((x) => x.className === 'fetes-voeux');
    assert.equal(voeux.textContent, '🎁 Joyeuses Fêtes de la part de l\'équipe PorteàPorte !');
    assert.ok(r.doc.marque.children.some((x) => x.className === 'fetes-sapin'));
    assert.ok(r.doc.bouton.classList.set.has('fetes-rouge'));
  });

  test('« réduire les animations » : pas de flocons, guirlande sans scintillement (CSS)', async () => {
    const r = await executerFetes({ now: DEC, reduit: true });
    assert.ok(!r.neige);
    assert.match(lire('js/fetes.js'), /prefers-reduced-motion: reduce\)\{\.fetes-guirlande b\{animation:none\}/);
  });

  test('interrupteur admin coupé ou 7 janvier : aucune décoration, bouton de couleur normale', async () => {
    for (const r of [await executerFetes({ now: DEC, info: { theme_actif: false } }), await executerFetes({ now: Date.parse('2027-01-07T00:00:00-05:00') })]) {
      assert.equal(r.doc.hero.children.length, 1);
      assert.equal(r.doc.fil.children.length, 0);
      assert.equal(r.doc.marque.children.length, 0);
      assert.ok(!r.doc.bouton.classList.set.has('fetes-rouge'));
    }
  });

  test('autres pages : bannière seulement, pas de décorations d\'accueil', async () => {
    const r = await executerFetes({ now: DEC, accueil: false });
    assert.ok(r.banniere);
    assert.equal(r.doc.hero.children.length, 1);
    assert.ok(!r.doc.bouton.classList.set.has('fetes-rouge'));
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
    assert.match(ctx.texteParticipationsFetes({ participations: 1, suspendues: 1 }).sous, /1 participation en attente : un litige est en cours/);
    assert.match(html, /endpoint=concours-fetes-moi/);
  });
});

describe('page du membre : compteur « Trajets covoit »', () => {
  test('compte les trajets faits comme passager ET comme conducteur', () => {
    const html = lire('dashboard.html');
    const i = html.indexOf('  const STATUTS_TRAJET_FAIT');
    const j = html.indexOf('  async function loadCovTripsStat(');
    const ctx = { String };
    vm.createContext(ctx);
    vm.runInContext(html.slice(i, j) + '\nthis.compterTrajetsCovoit = compterTrajetsCovoit;', ctx);
    const resa = [{ status: 'paye' }, { status: 'paye' }, { status: 'annule_passager' }, { status: 'confirme' }, { status: 'completed' }];
    assert.equal(ctx.compterTrajetsCovoit(resa, []), 3, 'passager seulement');
    assert.equal(ctx.compterTrajetsCovoit([], [{ status: 'termine' }, { status: 'publie' }]), 1, 'conducteur seulement');
    assert.equal(ctx.compterTrajetsCovoit(resa, [{ status: 'termine' }]), 4);
    assert.match(html, /id="statCovTrips"/);
    assert.match(html, /loadConcoursFetes\(session\),\s*\n\s*loadCovTripsStat\(session, profile\),/, 'appelé au chargement');
  });
});

// ─── Participation d'inscription (Denis, 22 nov. 2026 ; règlement art. 5 a) ────────────────────────────
describe('participation d\'inscription : 1 par compte, courriel vérifié, non suspendu', () => {
  const AVANT = '2026-09-01T12:00:00Z'; // inscrit bien avant le lancement
  const m = (n, extra = {}) => ({ id: U(n), email: `membre${n}@gmail.com`, role: 'expediteur', suspendu: false, created_at: AVANT, email_confirmed_at: AVANT, ...extra });
  const calc = (membres, service = {}) => C.calculerParticipations(
    { livraisons: [], litiges: [], bookings: [], rides: [], reports: [], ...service, membres },
    { debut: DEBUT, fin: C.CONCOURS.fin });
  const de = (r, n) => r.find((p) => p.user_id === U(n));

  test('membre au courriel vérifié, sans aucun service : 1 participation (inscrit avant le lancement)', () => {
    const p = de(calc([m(1)]), 1);
    assert.equal(p.total, 1);
    assert.equal(p.inscription, 1);
    assert.equal(p.livraisons + p.trajets_passager + p.trajets_conducteur, 0);
  });

  test('une seule par compte, même si le compte apparaît deux fois', () => {
    const r = calc([m(1), m(1), { ...m(1), email: 'autre@gmail.com' }]);
    assert.equal(r.length, 1);
    assert.equal(de(r, 1).total, 1);
    assert.equal(de(r, 1).inscription, 1);
  });

  test('courriel non vérifié : 0', () => {
    assert.equal(de(calc([m(1, { email_confirmed_at: null, email_verified: false })]), 1), undefined);
    assert.equal(de(calc([m(1, { email_confirmed_at: null })]), 1), undefined);
  });

  test('courriel vérifié par le drapeau du profil seulement (sans date) : 1', () => {
    assert.equal(de(calc([m(1, { email_confirmed_at: null, email_verified: true })]), 1).total, 1);
  });

  test('compte suspendu (ou archivé) : 0 ; bloqué dans Supabase Auth : 0 ; débloqué : 1', () => {
    assert.equal(de(calc([m(1, { suspendu: true })]), 1), undefined);
    assert.equal(de(calc([m(1, { banned_until: '2099-01-01T00:00:00Z' })]), 1), undefined);
    assert.equal(de(calc([m(1, { banned_until: '2020-01-01T00:00:00Z' })]), 1).total, 1);
  });

  test('admin (l\'Organisateur, règlement art. 3) : 0', () => {
    assert.equal(de(calc([m(1, { role: 'admin' })]), 1), undefined);
  });

  test('comptes de test : 0 ; vraies adresses (même avec « + ») : 1', () => {
    for (const email of ['audit-test@porteaporte.site', 'test123@gmail.com', 'capt-ab12-julie@exemple.test', 'x@example.com', 'demo.denis@gmail.com',
      'compte-fictif@hotmail.com', 'e2e-pass@porteaporte.site', 'julie@monsite.local', 'sans-arobase', '']) {
      assert.equal(C.estCompteTest(email), true, email);
      assert.equal(de(calc([m(1, { email })]), 1), undefined, email);
    }
    for (const email of ['celeste.tremblay@gmail.com', 'denis+porte@gmail.com', 'contestant@videotron.ca', 'attestation@sympatico.ca', 'julie.roy@exemple-transport.ca']) {
      assert.equal(C.estCompteTest(email), false, email);
      assert.equal(de(calc([m(1, { email })]), 1).total, 1, email);
    }
  });

  test('nouveaux membres jusqu\'au 31 décembre 2026, 23 h 59 (Québec) ; après : 0', () => {
    assert.equal(de(calc([m(1, { created_at: '2026-12-31T23:59:00-05:00', email_confirmed_at: '2026-12-31T23:59:30-05:00' })]), 1).total, 1);
    assert.equal(de(calc([m(1, { created_at: '2027-01-01T00:00:01-05:00', email_confirmed_at: '2027-01-01T00:01:00-05:00' })]), 1), undefined);
    // Inscrit à temps, mais courriel vérifié trop tard : 0
    assert.equal(de(calc([m(1, { created_at: '2026-12-31T23:00:00-05:00', email_confirmed_at: '2027-01-01T00:05:00-05:00' })]), 1), undefined);
    assert.equal(de(calc([m(1, { created_at: null })]), 1), undefined);
    // Compte créé après la fin, courriel vérifié par le drapeau du profil (sans date) : 0
    assert.equal(de(calc([m(1, { created_at: '2027-01-01T00:00:01-05:00', email_confirmed_at: null, email_verified: true })]), 1), undefined);
  });

  test('cumul : 1 pour l\'inscription + les participations du service', () => {
    const r = calc([m(1), m(2), m(3)], {
      livraisons: [{ id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: DANS }, { id: 'l2', expediteur_id: U(1), statut: 'payee', livre_le: DANS }],
      bookings: [{ id: 'b1', ride_id: 'r1', passenger_id: U(2), status: 'paye', payment_status: 'succeeded', paid_at: DANS }],
      rides: [{ id: 'r1', driver_id: U(3) }],
    });
    assert.deepEqual([1, 2, 3].map((n) => [de(r, n).total, de(r, n).inscription]), [[3, 1], [2, 1], [2, 1]]);
  });

  test('litige : retire une participation du service, jamais celle de l\'inscription', () => {
    const r = calc([m(1)], {
      livraisons: [{ id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: DANS }],
      litiges: [{ livraison_id: 'l1', statut: 'resolu', plaignant_id: U(77) }],
    });
    assert.equal(de(r, 1).total, 1);
    assert.equal(de(r, 1).inscription, 1);
  });

  test('membre non admissible garde quand même ses participations du service', () => {
    const r = calc([m(1, { email_confirmed_at: null })], { livraisons: [{ id: 'l1', expediteur_id: U(1), statut: 'payee', livre_le: DANS }] });
    assert.deepEqual([de(r, 1).total, de(r, 1).inscription, de(r, 1).livraisons], [1, 0, 1]);
  });

  test('tirage : un membre avec SEULEMENT l\'inscription peut gagner (1 chance)', () => {
    const r = calc([m(1)], { livraisons: [{ id: 'l1', expediteur_id: U(2), statut: 'payee', livre_le: DANS }] });
    const t = C.tirerPondere(r, () => 1); // 1re chance dans l'ordre des identifiants : U(1)
    assert.equal(t.gagnant.user_id, U(1));
    assert.equal(t.totalPoids, 2);
  });
});

describe('participation d\'inscription : endpoints', () => {
  const OK = '2026-09-01T12:00:00Z';
  const profils = [
    { id: U(1), prenom: 'Ana', nom: 'B', email: 'ana@gmail.com', role: 'expediteur', suspendu: false, created_at: OK },
    { id: U(4), prenom: 'Dom', nom: 'E', email: 'dom@gmail.com', role: 'expediteur', suspendu: false, created_at: OK },
    { id: U(5), prenom: 'Non', nom: 'Verifie', email: 'nv@gmail.com', role: 'expediteur', suspendu: false, created_at: OK },
    { id: U(6), prenom: 'Sus', nom: 'Pendu', email: 'sp@gmail.com', role: 'expediteur', suspendu: true, created_at: OK },
    { id: U(7), prenom: 'Te', nom: 'St', email: 'audit-test@porteaporte.site', role: 'expediteur', suspendu: false, created_at: OK },
    { id: U(50), prenom: 'Denis', nom: 'Admin', email: 'denis@gmail.com', role: 'admin', suspendu: false, created_at: OK },
  ];
  const comptes = profils.map((p) => ({ id: p.id, email: p.email, created_at: OK, email_confirmed_at: p.id === U(5) ? null : OK }));

  test('admin : colonne « inscription » séparée ; seuls les admissibles la reçoivent', async () => {
    const sb = base({ profils, comptes });
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'liste' });
    assert.equal(res._status, 200);
    const par = Object.fromEntries(res._body.participants.map((p) => [p.user_id, [p.total, p.inscription]]));
    assert.deepEqual(par, { [U(1)]: [3, 1], [U(2)]: [1, 0], [U(3)]: [1, 0], [U(4)]: [1, 1] });
    assert.equal(res._body.total_participations, 6);
    assert.equal(res._body.participants.find((p) => p.user_id === U(4)).prenom, 'Dom');
    const up = sb.ecritures.find((e) => e.m === 'POST' && e.url.includes('/draw_entries'));
    assert.deepEqual(up.body.find((l) => l.user_id === U(4)), { draw_id: DRAW, user_id: U(4), entries: 1, cost_coins: 0 });
  });

  test('export CSV : colonne « inscription »', async () => {
    const res = await appel(base({ profils, comptes }), 'admin-concours-fetes', { mode: 'csv' });
    const lignes = String(res._body).replace(/^﻿/, '').split('\n');
    assert.equal(lignes[0].split(',')[4], 'inscription');
    assert.ok(lignes.includes('Dom,E,dom@gmail.com,1,1,0,0,0,0'));
    assert.ok(lignes.includes('Ana,B,ana@gmail.com,3,1,0,2,0,0'));
  });

  test('liste des comptes (Auth) ou des profils illisible : erreur, jamais de liste incomplète ni de tirage', async () => {
    for (const ko of ['/auth/v1/admin/users', '/rest/v1/profiles?select=id,prenom']) {
      Date.now = () => Date.parse('2027-01-02T10:00:00-05:00');
      const sb = base({ profils, comptes, sourceKo: ko });
      for (const mode of ['liste', 'csv', 'tirer']) {
        const res = await appel(sb, 'admin-concours-fetes', { mode });
        assert.equal(res._status, 502, `${ko} ${mode}`);
      }
      assert.ok(!sb.ecritures.some((e) => /draw_entries|draw_winners|monthly_draws/.test(e.url)), ko);
    }
  });

  test('réponse Auth mal formée (pas de liste de comptes) : erreur, rien d\'enregistré', async () => {
    const sb = base({ profils, comptes });
    const brut = sb.fetchImpl;
    sb.fetchImpl = async (url, o) => (url.includes('/auth/v1/admin/users') ? rep({ message: 'inattendu' }) : brut(url, o));
    const res = await appel(sb, 'admin-concours-fetes', { mode: 'liste' });
    assert.equal(res._status, 502);
    assert.ok(!sb.ecritures.some((e) => /draw_entries/.test(e.url)));
  });

  test('membre au courriel vérifié : 1 pour l\'inscription + 2 grâce au service', async () => {
    const res = await appel(base({ moi: U(1), role: 'expediteur', session: { email: 'ana@gmail.com', created_at: OK, email_confirmed_at: OK } }), 'concours-fetes-moi');
    assert.equal(res._status, 200);
    assert.deepEqual([res._body.participations, res._body.inscription, res._body.service], [3, 1, 2]);
  });

  test('membre sans service, courriel vérifié : 1 (inscription seulement)', async () => {
    const res = await appel(base({ moi: U(44), role: 'expediteur', session: { email: 'zoe@gmail.com', created_at: OK, email_confirmed_at: OK } }), 'concours-fetes-moi');
    assert.deepEqual([res._body.participations, res._body.inscription, res._body.service], [1, 1, 0]);
  });

  test('membre : courriel non vérifié = 0 d\'inscription ; compte suspendu = refusé', async () => {
    const nv = await appel(base({ moi: U(44), role: 'expediteur', session: { email: 'zoe@gmail.com', created_at: OK, email_confirmed_at: null } }), 'concours-fetes-moi');
    assert.deepEqual([nv._body.participations, nv._body.inscription], [0, 0]);
    const sp = await appel(base({ moi: U(44), role: 'expediteur', profilMoi: { suspendu: true }, session: { email: 'zoe@gmail.com', created_at: OK, email_confirmed_at: OK } }), 'concours-fetes-moi');
    assert.equal(sp._status, 403); // compte suspendu : refusé dès l'entrée (aucune participation)
  });

  test('concours pas encore lancé : rien (ni inscription ni service)', async () => {
    const res = await appel(base({ concours: false, moi: U(1), role: 'expediteur', session: { email: 'ana@gmail.com', created_at: OK, email_confirmed_at: OK } }), 'concours-fetes-moi');
    assert.deepEqual([res._body.lance, res._body.participations], [false, 0]);
  });

  test('aucune participation par lettre, aucun formulaire ; règlement : texte de Denis, informations remplies', () => {
    const regl = lire('concours-fetes-reglement.html');
    assert.doesNotMatch(regl, /<form|<input|par la poste|par lettre/i);
    assert.match(regl, /AUCUN ACHAT REQUIS\.<\/strong> L'inscription à PorteàPorte est gratuite\./);
    // Aucun crochet ni surlignage « à remplir » ne reste sur la page.
    assert.doesNotMatch(regl.replace(/<!--[\s\S]*?-->/g, ''), /[\[\]]/);
    assert.doesNotMatch(regl, /a-ecrire|TEXTE À ÉCRIRE|#f5d061/);
    assert.match(regl, /\(porteaporte\.site\), 1469, rue Fréchette, Lévis \(Québec\) G7A 4N5 \(l'« Organisateur »\)\./);
    assert.equal((regl.match(/Lévis \(Québec\)/g) || []).length, 1, 'pas de doublon « Lévis (Québec) »');
    assert.match(regl, /Le concours commence le <span id="date-lancement">à venir<\/span> et se termine le 31 décembre 2026 à 23 h 59, heure du Québec\./);
    assert.match(regl, /Le tirage au sort aura lieu le mardi 5 janvier 2027 à 13 h, à Lévis, parmi toutes les participations validées\./);
    assert.match(regl, /<li>répondre dans les 7 jours suivant le premier contact\.<\/li>/);
    assert.match(regl, /<script src="\/js\/reglement-fetes\.js" defer><\/script>/);
    assert.match(regl, /une carte-cadeau d'épicerie Super C d'une valeur de 100 \$\. Le prix doit être accepté tel quel\./);
    assert.match(regl, /Super C n'est ni commanditaire ni organisateur de ce concours\./);
    assert.match(regl, /reçoit automatiquement une \(1\) participation\. Limite d'une \(1\) participation par personne par ce moyen\. Aucun achat ni utilisation du service n'est requis\./);
    assert.match(regl, /répondre correctement, sans aide, à une question d'habileté mathématique ;/);
    assert.match(regl, /Ce règlement est disponible sur porteaporte\.site\.<\/p>/);
  });
});

describe('tableau de bord du membre : « 1 participation pour ton inscription + X »', () => {
  const html = lire('dashboard.html');
  const ctx = { Number, Math };
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('  function texteParticipationsFetes('), html.indexOf('  async function loadConcoursFetes(')), ctx);

  test('inscription + service', () => {
    const t = ctx.texteParticipationsFetes({ participations: 3, inscription: 1, detail: { trajets_passager: 2 } });
    assert.equal(t.titre, '🎄 Tu as 3 participations au tirage des Fêtes');
    assert.ok(t.sous.startsWith('1 participation pour ton inscription + 2 grâce à tes livraisons et trajets (2 trajets comme passager).'), t.sous);
  });
  test('inscription seulement', () => {
    const t = ctx.texteParticipationsFetes({ participations: 1, inscription: 1 });
    assert.equal(t.titre, '🎄 Tu as 1 participation au tirage des Fêtes');
    assert.ok(t.sous.startsWith('1 participation pour ton inscription + 0 grâce à tes livraisons et trajets.'), t.sous);
  });
  test('courriel pas encore vérifié : on l\'invite à le vérifier', () => {
    const t = ctx.texteParticipationsFetes({ participations: 0, inscription: 0 });
    assert.match(t.sous, /^0 grâce à tes livraisons et trajets\. Vérifie ton courriel pour recevoir ta participation d'inscription\./);
  });
});

describe('règlement : date du lancement automatique', () => {
  async function page(reponse) {
    const el = { id: 'date-lancement', textContent: '' }; // vide : c'est le script qui doit écrire
    const ctx = {
      document: { getElementById: (id) => (id === 'date-lancement' ? el : null) },
      window: {}, Intl, Date, isFinite,
      fetch: async (url) => { assert.equal(url, '/api/platform?endpoint=concours-fetes-public'); if (reponse instanceof Error) throw reponse; return reponse; },
    };
    vm.createContext(ctx);
    vm.runInContext(lire('js/reglement-fetes.js'), ctx);
    await new Promise((r) => setTimeout(r, 5));
    page.api = ctx.window.PAPReglementFetes;
    return el.textContent;
  }
  const ok = (d) => ({ ok: true, json: async () => d });

  test('lancé : date du clic « Lancer le concours », format « 23 novembre 2026 » (heure du Québec)', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'UTC'; // le serveur ou le navigateur peut être dans un autre fuseau
    try {
      assert.equal(await page(ok({ lance_le: '2026-11-24T04:30:00Z' })), '23 novembre 2026');
    } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
    assert.equal(await page(ok({ lance_le: '2026-11-23T15:00:00Z' })), '23 novembre 2026');
    // 23 h 30 le 23 nov. au Québec = 24 nov. en UTC : c'est la date du Québec qui compte.
    assert.equal(await page(ok({ lance_le: '2026-11-24T04:30:00Z' })), '23 novembre 2026');
    assert.equal(await page(ok({ lance_le: '2026-12-01T17:00:00Z' })), '1er décembre 2026');
  });

  test('pas encore lancé, réponse en erreur ou réseau coupé : « à venir »', async () => {
    assert.equal(await page(ok({ lance_le: null })), 'à venir');
    assert.equal(await page({ ok: false, json: async () => ({}) }), 'à venir');
    assert.equal(await page(new Error('réseau')), 'à venir');
    assert.equal(await page(ok({ lance_le: 'nimporte' })), 'à venir');
    assert.equal(page.api.dateLongue('nimporte'), null);
    assert.equal(page.api.dateLongue(''), null);
  });

  test('API publique : lance_le = date de création du concours, null tant qu\'il n\'est pas lancé', async () => {
    Date.now = () => Date.parse('2026-12-10T12:00:00-05:00');
    const lance = await appel(base(), 'concours-fetes-public', {}, { auth: false, method: 'GET' });
    assert.equal(lance._body.lance_le, DEBUT);
    const pas = await appel(base({ concours: false }), 'concours-fetes-public', {}, { auth: false, method: 'GET' });
    assert.equal(pas._body.lance_le, null);
    // Concours annulé : pas de date de lancement affichée.
    const sb = base();
    const brut = sb.fetchImpl;
    sb.fetchImpl = async (url, o) => (url.includes('/rest/v1/monthly_draws')
      ? rep([{ id: DRAW, created_at: DEBUT, status: 'cancelled', eligibility_badge_slug: 'concours-fetes-2026' }]) : brut(url, o));
    const annule = await appel(sb, 'concours-fetes-public', {}, { auth: false, method: 'GET' });
    assert.equal(annule._body.lance_le, null);
  });
});

// ─── Bug du 22 nov. 2026 : lancé dans l'admin, mais le public disait « non lancé » (cache de 5 min) ─────
describe('lancement par l\'admin → endpoint public (même source, cache ≤ 60 s)', () => {
  // Petite base en mémoire partagée : ce que l'admin écrit, le public le relit.
  function baseMemoire() {
    const draws = []; const audit = [];
    const fetchImpl = async (url, o = {}) => {
      const m = o.method || 'GET';
      if (url.includes('/auth/v1/user')) return rep({ id: U(50) });
      if (url.includes('/rpc/check_rate_limit')) return rep(true);
      if (url.includes('/rest/v1/profiles')) return rep([{ id: U(50), role: 'admin', suspendu: false }]);
      if (url.includes('/rest/v1/monthly_draws') && m === 'POST') {
        const ligne = { id: DRAW, created_at: new Date(Date.now()).toISOString(), ...JSON.parse(o.body) };
        draws.push(ligne); return rep([ligne], true, 201);
      }
      if (url.includes('/rest/v1/monthly_draws')) {
        return rep(url.includes('eligibility_badge_slug=eq.concours-fetes-2026') ? draws.filter((d) => d.eligibility_badge_slug === 'concours-fetes-2026') : []);
      }
      if (url.includes('/rest/v1/transaction_audit_events') && m === 'POST') { audit.push(JSON.parse(o.body)); return rep([], true, 201); }
      if (url.includes('/rest/v1/transaction_audit_events')) return rep(audit.filter((e) => url.includes(`event_type=eq.${e.event_type}`)).reverse());
      return rep([]);
    };
    return { draws, audit, fetchImpl, ecritures: [] };
  }
  const publicGet = (sb) => appel(sb, 'concours-fetes-public', {}, { auth: false, method: 'GET' });

  test('avant le lancement : non lancé ; après le clic « Lancer » : ouvert, thème actif, date du clic', async () => {
    Date.now = () => Date.parse('2026-11-22T11:29:34-05:00');
    const sb = baseMemoire();
    const avant = await publicGet(sb);
    assert.deepEqual([avant._body.concours_ouvert, avant._body.theme_actif, avant._body.lance_le], [false, false, null]);
    const l = await appel(sb, 'admin-concours-fetes', { mode: 'lancer' });
    assert.equal(l._status, 200);
    const apres = await publicGet(sb);
    assert.equal(apres._status, 200);
    assert.equal(apres._body.concours_ouvert, true);
    assert.equal(apres._body.theme_actif, true);
    assert.equal(apres._body.lance_le, '2026-11-22T16:29:34.000Z');
    // Seulement des champs publics.
    assert.deepEqual(Object.keys(apres._body).sort(), ['concours_ouvert', 'fin', 'fin_theme', 'lance_le', 'prix', 'reglement', 'theme_actif']);
  });

  test('« Lancer » une 2e fois : rien n\'est recréé, la date de lancement ne change pas', async () => {
    Date.now = () => Date.parse('2026-11-22T11:29:34-05:00');
    const sb = baseMemoire();
    await appel(sb, 'admin-concours-fetes', { mode: 'lancer' });
    Date.now = () => Date.parse('2026-11-25T09:00:00-05:00');
    const re = await appel(sb, 'admin-concours-fetes', { mode: 'lancer' });
    assert.equal(re._body.deja, true);
    assert.equal(sb.draws.length, 1);
    assert.equal((await publicGet(sb))._body.lance_le, '2026-11-22T16:29:34.000Z');
  });

  test('interrupteur du thème coupé par l\'admin : le public le voit aussi', async () => {
    Date.now = () => Date.parse('2026-12-10T12:00:00-05:00');
    const sb = baseMemoire();
    await appel(sb, 'admin-concours-fetes', { mode: 'lancer' });
    await appel(sb, 'admin-concours-fetes', { mode: 'theme', actif: false });
    const r = await publicGet(sb);
    assert.deepEqual([r._body.concours_ouvert, r._body.theme_actif], [true, false]);
  });

  test('cache : 60 s au maximum au CDN, rien dans le navigateur', async () => {
    const r = await publicGet(baseMemoire());
    const cc = r._h['Cache-Control'];
    assert.equal(cc, C.CACHE_PUBLIC);
    const s = Number((cc.match(/s-maxage=(\d+)/) || [])[1]);
    const navigateur = Number((cc.match(/(?:^|[ ,])max-age=(\d+)/) || [])[1]);
    assert.ok(s > 0 && s <= 60, `s-maxage=${s}`);
    assert.equal(navigateur, 0);
    assert.doesNotMatch(cc, /stale-while-revalidate|stale-if-error/);
  });
});
