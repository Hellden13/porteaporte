// tests/plan-du-site.test.js — Plan du site, étape 1 (ménage) et règle de marque (décisions de Denis, 24 nov. 2026).
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(RACINE, f));
const EXCLUS = /^(node_modules|\.git|_archived|save|tests|outils-internes|docs|supabase\/migrations|supabase\/prod-v2-plus-tard|_video-work|scripts|backups|files)(\/|$)/;

function fichiers(exts) {
  const out = [];
  (function marcher(dir) {
    for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
      const rel = dir ? dir + '/' + e.name : e.name;
      if (EXCLUS.test(rel) || e.name.startsWith('.')) continue;
      if (e.isDirectory()) marcher(rel);
      else if (exts.some((x) => rel.endsWith(x))) out.push(rel);
    }
  })('');
  return out;
}
const PAGES = fichiers(['.html']);
const SOURCES = fichiers(['.html', '.js', '.css', '.json', '.webmanifest']);
const vercel = JSON.parse(lire('vercel.json'));
const redirections = new Map(vercel.redirects.map((r) => [r.source, r.destination]));
const reecritures = new Set((vercel.rewrites || []).map((r) => r.source));

describe('règle de marque', () => {
  // Formes interdites (le domaine porteaporte.site, en minuscules, et les noms techniques PORTEAPORTE_… restent permis).
  const INTERDIT = /(?<![A-Za-z_])(PorteaPorte|PorteÀPorte|Porte à Porte|PorteAPorte|Porteaporte|Porte-a-Porte|Porte-à-Porte|Porte&agrave;Porte|PORTE-A-PORTE|PORTE À PORTE)(?![A-Za-z])|PORTEAPORTE(?!_)/;
  test('aucune forme interdite dans les pages, scripts, courriels et modèles Supabase', () => {
    const fautes = [];
    for (const f of [...SOURCES, ...fichiers(['.html']).filter((x) => x.startsWith('supabase/email-templates/'))]) {
      const m = lire(f).match(INTERDIT);
      if (m) fautes.push(`${f} : « ${m[0]} »`);
    }
    for (const f of fs.readdirSync(path.join(RACINE, 'supabase/email-templates'))) {
      const m = lire('supabase/email-templates/' + f).match(INTERDIT);
      if (m) fautes.push(`supabase/email-templates/${f} : « ${m[0]} »`);
    }
    assert.deepEqual(fautes, []);
  });
  test('le test attrape bien chaque forme interdite', () => {
    for (const x of ['PorteaPorte', 'PorteÀPorte', 'Porte à Porte', 'PORTEAPORTE -', 'Porte-à-Porte', 'Porteaporte !']) assert.match(x, INTERDIT, x);
    for (const x of ['PorteàPorte', 'PORTEÀPORTE', 'porteaporte.site', 'window.PORTEAPORTE_SUPABASE_URL', 'isPorteaporte', 'is_porteaporte']) assert.doesNotMatch(x, INTERDIT, x);
  });
  test('le « à » n’est plus coloré à part', () => {
    for (const f of SOURCES.filter((x) => /\.(html|js)$/.test(x))) assert.doesNotMatch(lire(f), /Porte\s*<span[^>]*>\s*(à|&agrave;)\s*<\/span>\s*Porte/, f);
  });
  test('titres d’onglet : « Nom de la page — PorteàPorte »', () => {
    const fautes = [];
    for (const f of PAGES.filter((x) => !x.startsWith('admin/') && x !== 'index.html')) {
      const t = (lire(f).match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      if (t && !/ — PorteàPorte$/.test(t.trim())) fautes.push(`${f} : ${t.trim()}`);
    }
    assert.deepEqual(fautes, []);
  });
  test('couleurs : le cyan rejoint le bleu ; --brand-bleu remplace --brand-lime (ancien nom gardé en alias)', () => {
    const css = lire('assets/brand-uniform.css');
    assert.match(css, /--brand-bleu: #5dbfff;/);
    assert.match(css, /--brand-lime: var\(--brand-bleu\);/);
    assert.match(css, /--brand-cyan: var\(--brand-bleu\);/);
    for (const f of SOURCES.filter((x) => !x.endsWith('.json'))) {
      assert.doesNotMatch(lire(f), /#00d9ff\b|rgba\(\s*0\s*,\s*217\s*,\s*255/i, f);
      if (f !== 'assets/brand-uniform.css') assert.doesNotMatch(lire(f), /var\(--brand-lime\)/, f);
    }
  });
});

describe('ménage : pages retirées, redirections, aucun lien cassé', () => {
  const RETIREES = {
    'demo.html': '/index.html', 'test-login.html': '/login.html', 'admin/partenaire.html': '/partenaire.html', 'conditions.html': '/cgu.html',
    'connexion.html': '/login.html', 'legal.html': '/cgu.html', 'messagerie.html': '/message-livraison.html', 'onboarding-livreur.html': '/livreur.html',
    'onboarding-expediteur.html': '/dashboard-expediteur.html', 'dashboard-marchand.html': '/dashboard.html', 'heros.html': '/index.html',
    'abonnements.html': '/index.html', 'covoiturage/inscription.html': '/signup.html', 'track.html': '/suivi.html', 'calculateur.html': '/calculateur-prix.html',
    'conducteurs.html': '/covoiturage-info.html', 'livraison.html': '/expediteur.html', 'impact.html': '/transparence.html',
    'logo-export.html': '/404.html', 'assets/design-system.html': '/404.html', 'admin/generate-pwa-icons.html': '/404.html',
  };
  test('chaque page retirée a disparu et redirige au bon endroit', () => {
    for (const [p, d] of Object.entries(RETIREES)) {
      assert.ok(!existe(p), p + ' existe encore');
      assert.equal(redirections.get('/' + p), d, p);
    }
    for (const s of ['/calculateur', '/conducteurs', '/livraison', '/impact']) assert.ok(redirections.has(s) && !reecritures.has(s), s);
  });
  test('outils internes : gardés dans outils-internes/, jamais publiés', () => {
    for (const f of ['logo-export.html', 'design-system.html', 'generate-pwa-icons.html', 'logo-old.svg', 'logo-stripe.svg']) assert.ok(existe('outils-internes/' + f), f);
    assert.match(lire('.vercelignore'), /^outils-internes\/$/m);
    assert.equal(redirections.get('/outils-internes/(.*)'), '/404.html');
  });
  test('aucun lien interne cassé (pages, scripts, courriels), et aucun lien vers une page retirée', () => {
    const retirees = new Set(Object.keys(RETIREES).map((p) => '/' + p));
    const cible = (u) => {
      const p = u.split(/[?#]/)[0];
      if (retirees.has(p)) return false; // un lien vise la page finale, pas la redirection
      if (!p || p === '/' || /\$\{|'\s*\+/.test(p)) return true;
      if (redirections.has(p) || reecritures.has(p)) return true;
      if (existe(p.slice(1))) return true;
      if (existe(p.slice(1) + '/index.html')) return true;
      return false;
    };
    const casses = [];
    const LIEN = /(?:href=|location\.href\s*=\s*|location\.replace\(|url:\s*|https:\/\/porteaporte\.site)["'`]?(\/[A-Za-z0-9_\-/.]*\.html)/g;
    for (const f of SOURCES.filter((x) => /\.(html|js)$/.test(x))) {
      for (const m of lire(f).matchAll(LIEN)) if (!cible(m[1])) casses.push(`${f} → ${m[1]}`);
    }
    for (const f of ['api/notifier.js', 'lib/_push.js']) for (const m of lire(f).matchAll(/porteaporte\.site(\/[A-Za-z0-9_\-/]+\.html)/g)) if (!cible(m[1])) casses.push(`${f} → ${m[1]}`);
    assert.deepEqual([...new Set(casses)], []);
  });
});

describe('liens ajoutés et doublons', () => {
  test('vote communautaire relié depuis la transparence', () => {
    assert.match(lire('transparence.html'), /<a class="btn" href="\/vote-communautaire\.html">Voter<\/a>/);
  });
  test('« Conversations signalées » dans le menu admin', () => {
    assert.match(lire('admin/dashboard-admin.html'), /<a href="\/admin\/signalements-messages\.html" class="nav-link"><span class="icon">🚩<\/span> Conversations signalées<\/a>/);
  });
  test('vérification d’identité et dossier livreur : 2 étapes, 2 titres distincts', () => {
    assert.match(lire('kyc.html'), /<title>Vérification d’identité — PorteàPorte<\/title>/);
    assert.match(lire('livreur.html'), /<title>Dossier livreur — PorteàPorte<\/title>/);
  });
  test('un seul comparatif à 2 onglets (livraison, covoiturage)', () => {
    for (const [f, actif] of [['comparatif.html', 'Livraison'], ['comparatif-covoiturage.html', 'Covoiturage']]) {
      const h = lire(f);
      assert.match(h, /<div class="comparatif-onglets" role="navigation"/);
      assert.ok(h.includes('href="/comparatif.html"') && h.includes('href="/comparatif-covoiturage.html"'), f);
      assert.match(h, new RegExp('aria-current="page"[^>]*>[^<]*' + actif), f);
    }
  });
  test('règlements : la page générale liste les 3 règlements particuliers', () => {
    const h = lire('reglements-concours.html');
    for (const p of ['/concours-reglement.html', '/concours-fetes-reglement.html', '/reglements-tirage.html']) assert.ok(h.includes(`href="${p}"`), p);
  });
});
