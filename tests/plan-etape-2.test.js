// tests/plan-etape-2.test.js — Admin : « À faire maintenant » en tête, puis 6 sections (plan du site, étape 2).
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { construireAFaire } = require('../lib/_admin-a-faire');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const h = lire('admin/dashboard-admin.html');
const SECTIONS = ['👥 Membres', '🚗 Trajets et livraisons', '💰 Argent', '❤️ Communauté', '📊 Chiffres', '⚙️ Système'];
const menu = h.slice(h.indexOf('<aside class="sidebar">'), h.indexOf('</aside>'));
const mobile = h.slice(h.indexOf('<nav class="mobile-admin-nav"'), h.indexOf('</nav>', h.indexOf('<nav class="mobile-admin-nav"')));
const NOW = Date.parse('2026-11-25T12:00:00Z');

describe('menu admin', () => {
  test('« À faire maintenant » en premier, puis exactement 6 sections dans cet ordre', () => {
    const premier = menu.indexOf('<a href="#a-faire"');
    assert.ok(premier > 0 && premier < menu.indexOf('class="sidebar-label admin-section"'));
    const labels = [...menu.matchAll(/class="sidebar-label admin-section"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
    assert.deepEqual(labels, SECTIONS);
    assert.equal((menu.match(/class="sidebar-label/g) || []).length, 6, 'aucune autre rubrique');
  });
  test('menu cellulaire : la même structure (À faire + 6 sections dépliables)', () => {
    assert.ok(mobile.indexOf('href="#a-faire"') > 0 && mobile.indexOf('href="#a-faire"') < mobile.indexOf('<details'));
    assert.deepEqual([...mobile.matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) => m[1].trim()), SECTIONS);
  });
  test('chaque page admin est atteignable depuis les 2 menus', () => {
    const pages = fs.readdirSync(path.join(__dirname, '..', 'admin')).filter((f) => f.endsWith('.html') && !['login.html', 'dashboard-admin.html'].includes(f));
    for (const p of pages) {
      const lienPage = new RegExp(`href="/admin/${p.replace('.html', '')}(\\.html)?"`);
      assert.match(menu, lienPage, 'menu : ' + p);
      assert.match(mobile, lienPage, 'cellulaire : ' + p);
    }
  });
  test('chaque section de la page est atteignable depuis le menu', () => {
    for (const m of h.matchAll(/<div id="(section-[a-z]+)" class="(section|stats-grid)"/g)) assert.ok(menu.includes(`href="#${m[1]}"`), m[1]);
  });
  test('la liste « À faire maintenant » est le premier bloc de la page', () => {
    assert.ok(h.indexOf('<section id="a-faire"') > 0 && h.indexOf('<section id="a-faire"') < h.indexOf('<div id="section-stats"'));
  });
});

describe('« À faire maintenant » : preuves, conversations signalées, photos', () => {
  test('preuves déposées non révisées', () => {
    const r = construireAFaire({ preuves: [{ id: 'p1', livraison_id: 'L1', status: 'submitted', created_at: '2026-11-24' }, { id: 'p2', livraison_id: 'L2', status: 'test' }] }, NOW);
    assert.deepEqual(r.items.preuves, [{ id: 'p1', livraison_id: 'L1', depuis: '2026-11-24' }]);
    assert.equal(r.total, 1);
  });
  test('conversation signalée : covoiturage (reason « messagerie: ») et livraison (journal)', () => {
    const r = construireAFaire({
      reports: [{ id: 'r1', status: 'ouvert', reason: 'messagerie:harcelement', created_at: 'x' }, { id: 'r2', status: 'ouvert', reason: 'retard' }],
      signalementsLivraison: [{ id: 'e1', status: 'ouvert', evidence: { sorte: 'livraison', raison: 'insultes' }, created_at: 'y' }, { id: 'e2', status: 'ouvert', evidence: { sorte: 'covoiturage' } }],
    }, NOW);
    assert.deepEqual(r.items.signalements.map((x) => [x.id, x.source, x.motif]), [['r1', 'messagerie', 'harcelement'], ['r2', 'covoiturage', 'retard'], ['e1', 'messagerie', 'insultes']]);
  });
  test('photos de profil en attente', () => {
    const r = construireAFaire({ photos: [{ id: 'u1', prenom: 'Léa', photo_status: 'pending', photo_submitted_at: 'z' }, { id: 'u2', photo_status: 'approved' }] }, NOW);
    assert.deepEqual(r.items.photos, [{ id: 'u1', nom: 'Léa', depuis: 'z' }]);
  });
  test('le serveur lit les 3 nouvelles sources (colonnes de production)', () => {
    const s = lire('lib/_admin-a-faire.js');
    assert.match(s, /delivery_proofs\?select=id,livraison_id,status,created_at&status=eq\.submitted/);
    assert.match(s, /event_type=eq\.messages_signales&status=eq\.ouvert/);
    assert.match(s, /profiles\?select=id,prenom,nom,photo_status,photo_submitted_at&photo_status=eq\.pending/);
  });
  test('affichage : le plus urgent d’abord, chaque ligne avec son bouton', () => {
    const a = h.indexOf('function renderAFaire');
    const ordre = ['Preuves de livraison à réviser', 'Signalements ouverts', 'Organismes et livreurs', 'Photos de profil à modérer', 'Livraisons bloquées', 'Réservations covoiturage', 'Non démarré'].map((t) => h.indexOf(t, a));
    assert.ok(ordre.every((x, i) => x > 0 && (i === 0 || x > ordre[i - 1])), JSON.stringify(ordre));
    assert.match(h, /onclick="viewDeliveryProof\('\$\{afId\(x\.livraison_id\)\}'\)">Voir la preuve<\/button>/);
    assert.match(h, /href="\/admin\/signalements-messages\.html">Lire et décider<\/a>/);
    assert.match(h, /href="\/admin\/photos-moderation\.html">Modérer<\/a>/);
  });
});
