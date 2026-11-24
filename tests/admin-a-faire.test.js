// tests/admin-a-faire.test.js — Écran « À faire maintenant » du tableau de bord admin (lot 1, morceau 2).
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { construireAFaire } = require('../lib/_admin-a-faire');

const NOW = Date.parse('2026-11-21T12:00:00Z');
const ilYa = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('construireAFaire — règles', () => {
  test('rien en base : total 0', () => {
    const r = construireAFaire({}, NOW);
    assert.equal(r.total, 0);
    assert.deepEqual(Object.keys(r.items).sort(), ['livraisons', 'photos', 'preuves', 'relancer', 'reservations', 'signalements', 'validations']);
  });

  test('relancer : même règle que le bouton Relancer (livreur ou les deux, Non démarré, non suspendu)', () => {
    const r = construireAFaire({ profiles: [
      { id: U(1), role: 'livreur', driver_status: 'not_started', prenom: 'Ana' },
      { id: U(2), role: 'les deux', driver_status: 'not_started', prenom: 'Bo' },
      { id: U(3), role: 'expediteur', driver_status: 'not_started' },
      { id: U(4), role: 'livreur', driver_status: 'not_started', suspendu: true },
      { id: U(5), role: 'livreur', driver_status: 'verified' },
    ] }, NOW);
    assert.deepEqual(r.items.relancer.map((p) => p.id), [U(1), U(2)]);
    assert.equal(r.items.relancer[0].nom, 'Ana');
  });

  test('livraisons : seulement après 48 h, à capturer ou bloquée, jamais une livraison terminée', () => {
    const r = construireAFaire({ livraisons: [
      { id: U(1), statut: 'livre', updated_at: ilYa(49) },
      { id: U(2), statut: 'livre', updated_at: ilYa(47) },
      { id: U(3), statut: 'en_route', updated_at: ilYa(72) },
      { id: U(4), statut: 'payee', updated_at: ilYa(200) },
      { id: U(5), statut: 'annule', updated_at: ilYa(200) },
      { id: U(6), statut: 'litige', updated_at: null, cree_le: ilYa(50) },
      { id: U(7), statut: 'en_route', updated_at: ilYa(1), cree_le: ilYa(500) },
      { id: U(8), statut: 'ramasse' },
    ] }, NOW);
    assert.deepEqual(r.items.livraisons.map((l) => [l.id, l.type]), [
      [U(1), 'a_capturer'], [U(3), 'bloquee'], [U(6), 'bloquee'],
    ]);
  });

  test('réservations : seulement en attente', () => {
    const r = construireAFaire({ bookings: [
      { id: U(1), status: 'en_attente', passenger_profile: { prenom: 'Lu' } },
      { id: U(2), status: 'confirme' },
      { id: U(3), status: 'annule_passager' },
    ] }, NOW);
    assert.deepEqual(r.items.reservations.map((b) => b.id), [U(1)]);
    assert.equal(r.items.reservations[0].passager, 'Lu');
  });

  test('signalements : covoiturage ouverts et manquements signalés seulement', () => {
    const r = construireAFaire({
      reports: [{ id: U(1), status: 'ouvert', reason: 'retard' }, { id: U(2), status: 'resolu' }],
      manquements: [{ id: U(3), statut: 'signale', categorie: 'colis_abime' }, { id: U(4), statut: 'valide' }],
    }, NOW);
    assert.deepEqual(r.items.signalements.map((s) => [s.id, s.source, s.motif]), [
      [U(1), 'covoiturage', 'retard'], [U(3), 'manquement', 'colis_abime'],
    ]);
  });

  test('validations : organismes en attente et livreurs à valider (non suspendus)', () => {
    const r = construireAFaire({
      applications: [{ id: U(1), status: 'pending', organisation_name: 'Banque alimentaire' }, { id: U(2), status: 'approved' }],
      profiles: [
        { id: U(3), role: 'livreur', driver_status: 'pending_review', prenom: 'Zoé' },
        { id: U(4), role: 'livreur', driver_status: 'pending_review', suspendu: true },
      ],
    }, NOW);
    assert.deepEqual(r.items.validations.map((v) => [v.id, v.type]), [[U(1), 'organisme'], [U(3), 'livreur']]);
    assert.equal(r.total, 2);
  });
});

describe('endpoint admin-a-faire', () => {
  const handler = require('../api/platform');
  before(() => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  });

  function makeRes() {
    return { _status: 200, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; }, end() { return this; }, setHeader() {} };
  }
  function call(fetchImpl) {
    global.fetch = fetchImpl;
    const req = { method: 'POST', url: '/api/platform', body: { endpoint: 'admin-a-faire' }, headers: { 'content-type': 'application/json', authorization: 'Bearer tok' } };
    const res = makeRes();
    return handler(req, res).then(() => res);
  }
  const ok = (data) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
  const ko = () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}), text: async () => '' });
  function fetchAvec(role, { echec = null, ecritures = [] } = {}) {
    return async (url, opts = {}) => {
      // Le limiteur de requêtes du routeur (rpc/check_rate_limit) n'est pas une écriture de ce lot.
      if (opts.method && opts.method !== 'GET' && !url.includes('/rpc/check_rate_limit')) ecritures.push(url);
      if (url.includes('/auth/v1/user')) return ok({ id: 'u1' });
      if (echec && url.includes(echec)) return ko();
      if (url.includes('/rest/v1/profiles?select=id,prenom,nom,email,role,driver_status')) {
        return ok([{ id: U(9), role: 'livreur', driver_status: 'not_started', prenom: 'Max' }]);
      }
      if (url.includes('/rest/v1/profiles')) return ok([{ id: 'u1', role, suspendu: false }]);
      if (url.includes('/rest/v1/ride_bookings')) return ok([{ id: U(8), status: 'en_attente' }]);
      return ok([]);
    };
  }

  test('non-admin : 403', async () => {
    const res = await call(fetchAvec('livreur'));
    assert.equal(res._status, 403);
  });

  test('admin : liste des actions, aucune écriture en base', async () => {
    const ecritures = [];
    const res = await call(fetchAvec('admin', { ecritures }));
    assert.equal(res._status, 200);
    assert.equal(res._body.total, 2);
    assert.deepEqual(res._body.items.relancer.map((p) => p.id), [U(9)]);
    assert.deepEqual(res._body.items.reservations.map((b) => b.id), [U(8)]);
    assert.deepEqual(res._body.erreurs, []);
    assert.deepEqual(ecritures, []);
  });

  test('une source illisible est signalée (jamais « rien à faire » en silence)', async () => {
    const res = await call(fetchAvec('admin', { echec: '/rest/v1/manquements' }));
    assert.equal(res._status, 200);
    assert.deepEqual(res._body.erreurs, ['manquements']);
  });
});

describe('page admin — bloc « À faire maintenant »', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'admin', 'dashboard-admin.html'), 'utf8');

  test('le bloc est en haut, avant les statistiques et le reste de la page', () => {
    const i = html.indexOf('id="a-faire"');
    assert.ok(i > 0);
    assert.ok(i < html.indexOf('id="moderation-hero"'));
    assert.ok(i < html.indexOf('id="section-stats"'));
  });

  // Exécute le vrai code du bloc avec un faux document.
  function chargerBloc(fetchResult) {
    const debut = html.indexOf('  // ── À FAIRE MAINTENANT (lot 1)');
    const fin = html.indexOf('  // ── INIT ─');
    assert.ok(debut > 0 && fin > debut);
    const els = {};
    const el = (id) => (els[id] ||= { id, innerHTML: '', textContent: '', style: {} });
    const ctx = {
      document: { getElementById: el },
      AUTH_API: { getUser: () => ({ session: { access_token: 't' } }) },
      apiUrl: (p) => p,
      fetch: async () => fetchResult,
      Date, Number, String, Math, JSON,
    };
    vm.createContext(ctx);
    vm.runInContext(html.slice(debut, fin), ctx);
    return { ctx, els };
  }

  test('rien à faire : « Rien à faire pour l\'instant »', async () => {
    const { ctx, els } = chargerBloc({ ok: true, json: async () => ({ items: {}, erreurs: [] }) });
    await ctx.loadAFaire();
    assert.match(els['a-faire-liste'].innerHTML, /Rien à faire pour l'instant/);
  });

  test('source illisible : jamais « Rien à faire »', async () => {
    const { ctx, els } = chargerBloc({ ok: true, json: async () => ({ items: {}, erreurs: ['manquements'] }) });
    await ctx.loadAFaire();
    assert.doesNotMatch(els['a-faire-liste'].innerHTML, /Rien à faire/);
    assert.match(els['a-faire-erreur'].textContent, /manquements/);
  });

  test('chaque élément a son bouton (actions existantes réutilisées)', async () => {
    const items = {
      relancer: [{ id: U(1), nom: 'Ana' }],
      livraisons: [{ id: U(2), type: 'a_capturer', statut: 'livre', trajet: 'A → B' }, { id: U(3), type: 'bloquee', statut: 'en_route', trajet: 'C → D' }],
      reservations: [{ id: U(4) }],
      signalements: [{ id: U(5), source: 'covoiturage', motif: 'x' }, { id: U(6), source: 'manquement', motif: 'y' }],
      validations: [{ id: U(7), type: 'organisme', nom: 'O' }, { id: U(8), type: 'livreur', nom: 'L' }],
    };
    const { ctx, els } = chargerBloc({ ok: true, json: async () => ({ items, erreurs: [] }) });
    await ctx.loadAFaire();
    const out = els['a-faire-liste'].innerHTML;
    assert.equal((out.match(/class="af-ligne"/g) || []).length, 8);
    assert.equal((out.match(/class="af-ligne">.*?<\/div><div class="af-boutons">(<button|<a )/g) || []).length, 8);
    assert.match(out, new RegExp(`sendVerifReminder\\('${U(1)}'\\)`));
    assert.match(out, new RegExp(`adminCaptureLegacy\\('${U(2)}'\\)`));
    assert.match(out, /href="#section-livraisons"/);
    assert.match(out, /href="#section-covoiturage"/);
    assert.match(out, /href="\/admin\/manquements.html"/);
    assert.match(out, new RegExp(`updateImpactApplication\\('${U(7)}','approved'\\)`));
    assert.match(out, new RegExp(`setDriverStatus\\('${U(8)}','verified'\\)`));
    assert.equal(els['a-faire-total'].textContent, '(8)');
    assert.doesNotMatch(out, /Rien à faire/);
  });

  test('noms saisis par les membres échappés, identifiant douteux écarté', async () => {
    const items = {
      relancer: [{ id: U(1), nom: '<img src=x onerror=alert(1)>' }, { id: "x');alert(1);//", nom: 'pirate' }],
    };
    const { ctx, els } = chargerBloc({ ok: true, json: async () => ({ items, erreurs: [] }) });
    await ctx.loadAFaire();
    const out = els['a-faire-liste'].innerHTML;
    assert.doesNotMatch(out, /<img/);
    assert.match(out, /&lt;img/);
    assert.doesNotMatch(out, /pirate|alert\(1\);/);
  });

  test('Relancer : date du dernier envoi sous le nom (JJ/MM, heure du Québec), rien si jamais relancé', async () => {
    const items = {
      relancer: [
        { id: U(1), nom: 'Julie', email: 'j@example.com', derniere_relance: '2026-11-16T02:00:00Z' },
        { id: U(2), nom: 'Ana', derniere_relance: null },
        { id: U(3), nom: 'Zoé', derniere_relance: '<script>' },
      ],
    };
    const { ctx, els } = chargerBloc({ ok: true, json: async () => ({ items, erreurs: [] }) });
    const tzAvant = process.env.TZ;
    process.env.TZ = 'UTC'; // à 2 h UTC le 16/11, il est encore le 15/11 au Québec
    try { await ctx.loadAFaire(); } finally { if (tzAvant === undefined) delete process.env.TZ; else process.env.TZ = tzAvant; }
    const lignes = els['a-faire-liste'].innerHTML.split('class="af-ligne"').slice(1);
    assert.match(lignes[0], /<div class="af-texte">Julie<small class="af-relance">Dernier envoi « Relancer » : 15\/11<\/small><small>j@example\.com/);
    assert.doesNotMatch(lignes[1], /Dernier envoi/);
    assert.doesNotMatch(lignes[2], /Dernier envoi|<script>/);
  });

  test('erreur de l\'API : message clair', async () => {
    const { ctx, els } = chargerBloc({ ok: false, json: async () => ({ error: 'Admin requis' }) });
    await ctx.loadAFaire();
    assert.match(els['a-faire-liste'].innerHTML, /indisponible : Admin requis/);
  });
});
