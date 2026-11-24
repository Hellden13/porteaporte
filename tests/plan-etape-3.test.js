// tests/plan-etape-3.test.js — Plan du site, étape 3 : tableau de bord membre à 6 onglets (décision de Denis, 24 nov. 2026)
// Une seule adresse (/dashboard.html?onglet=…&vue=…), contenu des anciennes pages réutilisé tel quel,
// les 10 anciennes adresses renvoient vers le bon onglet en gardant la requête et l'ancre.
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const SCRIPT = lire('js/onglets-membre.js');

const ANCIENNES = {
  'dashboard-covoiturage.html': ['covoiturage', '/dashboard.html?onglet=covoiturage'],
  'dashboard-expediteur.html': ['envois', '/dashboard.html?onglet=envois'],
  'dashboard-destinataire.html': ['recus', '/dashboard.html?onglet=envois&vue=recus'],
  'dashboard-livreur.html': ['livrer', '/dashboard.html?onglet=livrer'],
  'historique-paiements.html': ['paiements', '/dashboard.html?onglet=paiements'],
  'conducteur-paiements.html': ['versements', '/dashboard.html?onglet=paiements&vue=versements'],
  'profile.html': ['profil', '/dashboard.html?onglet=compte'],
  'compte.html': ['securite', '/dashboard.html?onglet=compte&vue=securite'],
  'badges.html': ['badges', '/dashboard.html?onglet=compte&vue=badges'],
  'parrainage.html': ['parrainage', '/dashboard.html?onglet=compte&vue=parrainage'],
};
const MEMBRES = ['accueil', 'covoiturage', 'envois', 'recus', 'livrer', 'paiements', 'versements', 'profil', 'securite', 'badges', 'parrainage'];

// ─── Petit DOM factice (assez pour le script) ──────────────────────────────
function element(tag) {
  const e = {
    tagName: tag.toUpperCase(), children: [], attrs: {}, hidden: false, className: '', id: '', textContent: '', innerHTML: '', parentNode: null, onclick: null,
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; },
    get firstChild() { return this.children[0] || null; },
    getBoundingClientRect() { return { top: 0 }; },
    querySelectorAll(sel) { return tous(this).filter((x) => correspond(x, sel)); },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } },
  };
  e.classList = { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } };
  return e;
}
function tous(r) { const out = []; (function m(n) { for (const c of n.children) { out.push(c); m(c); } })(r); return out; }
function correspond(x, sel) {
  return sel.split(',').some((s0) => {
    const s = s0.trim().split(' ').pop();
    if (s === 'button') return x.tagName === 'BUTTON';
    if (s === 'a') return x.tagName === 'A';
    const m = /^(\w+)?\[([\w-]+)="([^"]*)"\]$/.exec(s);
    if (m) return (!m[1] || x.tagName === m[1].toUpperCase()) && x.getAttribute(m[2]) === m[3];
    return false;
  });
}

function charger({ chemin = '/dashboard.html', recherche = '', ancre = '', html = {}, fenetre = {}, page = null, entete = true, stockage = {} } = {}) {
  const remplacee = [];
  const ecrit = [];
  const recup = [];
  const doc = element('html');
  Object.entries(html).forEach(([k, v]) => doc.setAttribute(k, v));
  const head = element('head');
  const body = element('body');
  let header = null;
  if (entete) { header = element('header'); body.appendChild(header); body.appendChild(element('main')); }
  const document = {
    documentElement: doc, head, body, readyState: 'complete',
    createElement: element,
    getElementById(id) { return [head, body].flatMap(tous).find((x) => x.id === id) || null; },
    querySelector(sel) { if (sel.startsWith('body > header')) return header; return tous(body).find((x) => correspond(x, sel)) || null; },
    addEventListener() {},
    open() { ecrit.push('open'); }, write(t) { ecrit.push(t); }, close() { ecrit.push('close'); },
  };
  const window = {
    ...fenetre,
    document,
    location: { pathname: chemin, search: recherche, hash: ancre, replace(u) { remplacee.push(u); }, reload() {} },
    fetch: (u, o) => { recup.push([u, o]); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(page || '<html>page</html>') }); },
    localStorage: { getItem: (k) => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = String(v); } },
    URLSearchParams,
  };
  window.window = window;
  vm.runInNewContext(SCRIPT, window);
  return { window, document, remplacee, ecrit, recup, body, header, stockage };
}
const attendre = () => new Promise((r) => setImmediate(r));

describe('adresses : une seule page, onglet + vue', () => {
  test('chaque page a son adresse, et l\'adresse revient à la même page', () => {
    const { window } = charger({ chemin: '/rien.html', entete: false });
    const O = window.PAP_ONGLETS;
    assert.deepEqual([...O.ONGLETS.map((o) => o.nom)], ['Accueil', 'Covoiturage', 'Mes envois', 'Livrer', 'Paiements', 'Compte']);
    for (const p of MEMBRES) {
      const a = O.adresse(p, '', '');
      assert.equal(O.resoudre(a.split('?')[1]), p, a);
    }
    assert.equal(O.resoudre(''), 'accueil');
    assert.equal(O.resoudre('?onglet=nimporte'), 'accueil');
    assert.equal(O.resoudre('?onglet=compte&vue=inconnue'), 'profil');
    assert.equal(O.resoudre('?onglet=accueil&vue=badges'), 'accueil', 'une vue d\'un autre onglet est ignorée');
  });
  test('la requête et l\'ancre sont gardées, onglet/vue remplacés', () => {
    const { window } = charger({ chemin: '/rien.html', entete: false });
    assert.equal(window.PAP_ONGLETS.adresse('livrer', '?tab=paiements&onglet=x', '#a'), '/dashboard.html?onglet=livrer&tab=paiements#a');
    assert.equal(window.PAP_ONGLETS.adresse('versements', '?stripe=success', ''), '/dashboard.html?onglet=paiements&vue=versements&stripe=success');
  });
});

describe('les 10 anciennes adresses renvoient vers le bon onglet', () => {
  for (const [f, [page, url]] of Object.entries(ANCIENNES)) {
    test(f, () => {
      const h = lire(f);
      assert.match(h, new RegExp(`<html lang="fr-CA" data-pap-vers="${page}">`));
      assert.match(h, /<script src="\/js\/onglets-membre\.js"><\/script>/);
      assert.ok(h.includes(`url=${url.replace(/&/g, '&amp;')}"`), 'repli sans JavaScript');
      assert.ok(h.length < 1500, 'petite page de renvoi seulement');
      const t = charger({ chemin: '/' + f, recherche: '?mission=5', ancre: '#x', html: { 'data-pap-vers': page } });
      assert.deepEqual(t.remplacee, [url + (url.includes('?') ? '&' : '?') + 'mission=5#x']);
    });
  }
});

describe('coquille dashboard.html', () => {
  test('charge la page de l\'onglet et la met à la place (une seule page à la fois)', async () => {
    const h = lire('dashboard.html');
    assert.match(h, /<html lang="fr-CA" data-pap-coquille>/);
    assert.match(h, /<script src="\/js\/onglets-membre\.js"><\/script>/);
    assert.ok(h.length < 2500, 'aucun contenu propre : rien ne peut entrer en conflit avec la page chargée');
    const t = charger({ html: { 'data-pap-coquille': '' }, recherche: '?onglet=compte&vue=badges&x=1', page: '<!DOCTYPE html><p>badges</p>' });
    await attendre(); await attendre();
    assert.equal(t.recup[0][0], '/membre-badges.html');
    assert.equal(t.recup[0][1].headers.accept, 'text/html', 'passe par le cache hors ligne des pages');
    assert.equal(t.window.__PAP_PAGE, 'badges');
    assert.deepEqual(t.ecrit, ['open', '<!DOCTYPE html><p>badges</p>', 'close']);
    assert.deepEqual(t.remplacee, []);
  });
  test('onglet inconnu → Accueil', async () => {
    const t = charger({ html: { 'data-pap-coquille': '' }, recherche: '?onglet=../../x' });
    await attendre();
    assert.equal(t.recup[0][0], '/membre-accueil.html');
  });
});

describe('pages membre-*.html (contenu des anciennes pages, tel quel)', () => {
  test('chacune charge le script des onglets en premier', () => {
    for (const p of MEMBRES) {
      const h = lire(`membre-${p}.html`);
      const tete = h.slice(0, h.indexOf('</head>'));
      const premier = (tete.match(/<script[^>]*>/) || [''])[0];
      assert.equal(premier, '<script src="/js/onglets-membre.js">', p);
    }
  });
  test('ouverte directement → passe par la coquille en gardant requête et ancre', () => {
    const t = charger({ chemin: '/membre-recus.html', recherche: '?code=AB', ancre: '#z' });
    assert.deepEqual(t.remplacee, ['/dashboard.html?onglet=envois&vue=recus&code=AB#z']);
  });
  test('dans la coquille : 6 tuiles sous l\'en-tête, onglet actif marqué, vues de l\'onglet', () => {
    const t = charger({ fenetre: { __PAP_PAGE: 'securite' }, stockage: { pap_onglet_livrer: '1' } });
    const barre = t.body.children[1];
    assert.equal(barre.id, 'pap-onglets', 'juste après l\'en-tête de la page');
    const tuiles = barre.children;
    assert.deepEqual(tuiles.map((a) => a.getAttribute('data-onglet')), ['accueil', 'covoiturage', 'envois', 'livrer', 'paiements', 'compte']);
    assert.deepEqual(tuiles.map((a) => a.href), ['accueil', 'covoiturage', 'envois', 'livrer', 'paiements', 'compte'].map((o) => '/dashboard.html?onglet=' + o));
    assert.deepEqual(tuiles.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.getAttribute('data-onglet')), ['compte']);
    assert.ok(tuiles.every((a) => !a.hidden));
    const vues = t.body.children[2];
    assert.equal(vues.id, 'pap-vues');
    assert.deepEqual(vues.children.map((a) => a.textContent), ['Profil', 'Sécurité', 'Badges', 'Parrainage']);
    assert.deepEqual(vues.children.map((a) => a.getAttribute('aria-current')), [null, 'page', null, null]);
    assert.ok(t.body.classList.contains('pap-avec-onglets'));
    assert.ok(t.document.getElementById('pap-onglets-style'));
  });
  test('tuiles en 2 rangées de 3 au cellulaire, 6 sur une rangée à l\'ordinateur, grandes zones de toucher', () => {
    assert.match(SCRIPT, /\.pap-ong\{display:grid;grid-template-columns:repeat\(3,1fr\)/);
    assert.match(SCRIPT, /@media \(min-width:769px\)\{\.pap-ong\{grid-template-columns:repeat\(6,1fr\)/);
    assert.match(SCRIPT, /min-height:58px/);
    assert.match(SCRIPT, /\.pap-vues\{display:flex;flex-wrap:wrap;/, 'les 4 vues du Compte restent visibles à 360 px');
  });
  test('Covoiturage : « Je conduis », « Je voyage », « Avis » ouvrent les sections existantes', () => {
    const vu = [];
    const t = charger({ fenetre: { __PAP_PAGE: 'covoiturage', showSection: (s) => vu.push(s) } });
    const b = t.body.children[2].children;
    assert.deepEqual(b.map((x) => x.textContent), ['Je conduis', 'Je voyage', 'Avis']);
    b[1].onclick();
    assert.deepEqual(vu, ['reservations']);
    assert.deepEqual(b.map((x) => x.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  });
  test('« Livrer » caché aux non-livreurs, montré aux livreurs (même règle que la page livreur)', async () => {
    const db = (profil) => ({
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
      from: (tbl) => ({ select: (c) => ({ eq: (k, v) => ({ maybeSingle: () => { assert.equal(tbl, 'profiles'); assert.equal(c, 'role,est_livreur'); return Promise.resolve({ data: profil }); } }) }) }),
    });
    const tuile = (t) => t.body.children[1].children.find((a) => a.getAttribute('data-onglet') === 'livrer');
    let t = charger({ fenetre: { __PAP_PAGE: 'accueil', getSupabaseClient: () => db({ role: 'expediteur', est_livreur: false }) } });
    assert.equal(tuile(t).hidden, true, 'caché par défaut tant qu\'on ne sait pas');
    await attendre(); await attendre(); await attendre();
    assert.equal(tuile(t).hidden, true);
    assert.equal(t.stockage.pap_onglet_livrer, '0');
    t = charger({ fenetre: { __PAP_PAGE: 'accueil', getSupabaseClient: () => db({ role: 'expediteur', est_livreur: true }) } });
    await attendre(); await attendre(); await attendre();
    assert.equal(tuile(t).hidden, false);
    assert.equal(t.stockage.pap_onglet_livrer, '1');
    t = charger({ fenetre: { __PAP_PAGE: 'livrer' } });
    assert.equal(tuile(t).hidden, false, 'toujours visible quand on est dessus');
  });
  test('rien à faire hors du tableau de bord (page sans onglet)', () => {
    const t = charger({ chemin: '/index.html' });
    assert.equal(t.document.getElementById('pap-onglets'), null);
    assert.deepEqual(t.remplacee, []);
  });
});

describe('liens du site et petites corrections', () => {
  test('plus aucun lien vers les anciennes adresses (sauf leurs propres renvois)', () => {
    const EXCLUS = /^(node_modules|\.git|_archived|save|tests|outils-internes|docs|scripts|supabase|backups|files|_video-work)(\/|$)/;
    const noms = Object.keys(ANCIENNES).map((f) => f.replace(/[.-]/g, (c) => '\\' + c)).join('|');
    const re = new RegExp(`(?:^|[^\\w./-]|porteaporte\\.site|\\})/?(?:${noms})(?![\\w-])`);
    const fautes = [];
    (function marcher(dir) {
      for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
        const rel = dir ? dir + '/' + e.name : e.name;
        if (EXCLUS.test(rel) || e.name.startsWith('.')) continue;
        if (e.isDirectory()) marcher(rel);
        else if (/\.(js|html)$/.test(rel) && !ANCIENNES[rel] && rel !== 'js/onglets-membre.js') {
          lire(rel).split('\n').forEach((l, i) => { if (re.test(l)) fautes.push(`${rel}:${i + 1}`); });
        }
      }
    })('');
    assert.deepEqual(fautes, []);
    assert.doesNotMatch(lire('manifest.json'), new RegExp(noms));
  });
  test('retour après connexion : l\'onglet est gardé (adresse encodée)', () => {
    assert.doesNotMatch(lire('membre-covoiturage.html'), /login\.html\?redirect=\/dashboard/);
    assert.match(lire('membre-covoiturage.html'), /login\.html\?redirect=' \+ encodeURIComponent\('\/dashboard\.html\?onglet=covoiturage'\)/);
    assert.match(lire('membre-versements.html'), /login\.html\?redirect=" \+ encodeURIComponent\("\/dashboard\.html\?onglet=paiements&vue=versements"\)/);
    for (const f of ['membre-accueil.html', 'membre-profil.html', 'membre-recus.html']) assert.match(lire(f), /encodeURIComponent\((window\.)?location\.pathname \+ (window\.)?location\.search\)/, f);
    assert.match(lire('membre-livrer.html'), /history\.replaceState\(\{\}, '', location\.pathname \+ '\?onglet=livrer'\)/);
  });
  test('tutoriel : le rôle vient de la page hébergée', () => {
    const o = lire('js/onboarding.js');
    assert.match(o, /if \(page === 'livrer'\) return 'livreur';/);
    assert.match(o, /if \(page === 'envois'\) return 'expediteur';/);
    assert.match(o, /if \(page === 'recus'\) return 'destinataire';/);
  });
  test('cache hors ligne : coquille et pages précachées, nouvelle version', () => {
    const sw = lire('sw.js');
    assert.match(sw, /'pap-v113'/);
    for (const u of ['/dashboard.html', '/js/onglets-membre.js', '/membre-envois.html', '/membre-livrer.html']) assert.ok(sw.includes(`'${u}'`), u);
    assert.doesNotMatch(sw, /dashboard-livreur\.html|dashboard-expediteur\.html/);
  });
  test('plan du site : retirées du sitemap (pages membres, non indexées)', () => {
    const s = lire('sitemap.xml');
    assert.doesNotMatch(s, /badges\.html|parrainage\.html/);
  });
  test('barres internes des pages : aucun libellé « Accueil » (pas de confusion avec l\'onglet Accueil)', () => {
    for (const k of MEMBRES) {
      const h = lire(`membre-${k}.html`).replace(/<title>[\s\S]*?<\/title>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.doesNotMatch(h, />[^<>]*\bAccueil\b[^<>]*</, k);
    }
    const c = lire('membre-covoiturage.html');
    assert.match(c, /<div class="mob-tab active" onclick="showSection\('overview'\)"><span class="ico">📊<\/span>Résumé<\/div>/);
    assert.doesNotMatch(c, /showSection\('overview'\)"><span class="[a-z-]+">🏠/);
    assert.match(lire('membre-recus.html'), /href="\/index\.html">← Le site<\/a>/);
  });
});
