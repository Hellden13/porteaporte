// tests/dialogues.test.js — Test complet du 22 nov. 2026, point 6 :
// plus aucune fenêtre bloquante du navigateur (alert, confirm, prompt) sur le site.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const racine = path.resolve(__dirname, '..');
const DOSSIERS = ['.', 'admin', 'covoiturage', 'js'];
const IGNORE = /backup|corrupted|^dialogues\.js$|^sw\.js$/;

function fichiers() {
  const out = [];
  for (const d of DOSSIERS) {
    for (const f of fs.readdirSync(path.join(racine, d))) {
      if (!/\.(html|js)$/.test(f) || IGNORE.test(f)) continue;
      if (d === '.' && f.endsWith('.js')) continue;
      out.push(path.join(d, f));
    }
  }
  return out;
}

// Retire les commentaires et le contenu des chaînes pour ne garder que le code.
function codeSeulement(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
}

const APPEL_NATIF = /(^|[^\w.$])(window\.)?(alert|confirm|prompt)\s*\(/;

test('aucun window.alert / confirm / prompt dans les pages et scripts du site', () => {
  const trouves = [];
  for (const f of fichiers()) {
    const src = fs.readFileSync(path.join(racine, f), 'utf8');
    const morceaux = f.endsWith('.html')
      ? [...src.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => !/\bsrc\s*=|ld\+json/i.test(m[1])).map((m) => m[2])
        .concat([...src.matchAll(/\son\w+\s*=\s*"([^"]*)"/g)].map((m) => m[1]))
      : [src];
    for (const m of morceaux) {
      codeSeulement(m).split('\n').forEach((ligne) => {
        if (APPEL_NATIF.test(ligne)) trouves.push(`${f}: ${ligne.trim().slice(0, 120)}`);
      });
    }
  }
  assert.deepEqual(trouves, [], trouves.join('\n'));
});

test('chaque page qui ouvre une fenêtre charge /js/dialogues.js avant ses scripts', () => {
  const manque = [];
  for (const f of fichiers().filter((x) => x.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(racine, f), 'utf8');
    if (!/PAPDialog\./.test(src) && !/src="\/js\/(auth-state|cancel-livraison|ride-chat|admin-alert-bell)\.js"/.test(src)) continue;
    const i = src.indexOf('src="/js/dialogues.js"');
    // Premier script qui s'en sert (code intégré ou script partagé) : dialogues.js doit être chargé avant.
    const usages = [...src.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((m) => /PAPDialog\./.test(m[2]) || /src="\/js\/(auth-state|cancel-livraison|ride-chat|admin-alert-bell)\.js"/.test(m[1]))
      .map((m) => m.index);
    if (i < 0 || (usages.length && i > Math.min(...usages))) manque.push(f);
  }
  assert.deepEqual(manque, [], manque.join('\n'));
});

// Mini-DOM pour exécuter js/dialogues.js et vérifier qu'il ne bloque pas.
function miniDom() {
  const ecouteurs = {};
  function el(tag) {
    return {
      tagName: tag, children: [], style: {}, attrs: {}, listeners: {}, textContent: '', value: '', className: '', id: '',
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; },
      focus() { doc.activeElement = this; },
      click() { (this.listeners.click || []).forEach((f) => f({ target: this })); },
    };
  }
  const doc = {
    head: el('head'), body: el('body'), activeElement: null,
    createElement: el,
    getElementById: () => null,
    addEventListener(t, f) { (ecouteurs[t] = ecouteurs[t] || []).push(f); },
    removeEventListener(t, f) { ecouteurs[t] = (ecouteurs[t] || []).filter((x) => x !== f); },
  };
  doc.documentElement = doc.body;
  const trouver = (n, pred) => (pred(n) ? n : n.children.map((c) => trouver(c, pred)).find(Boolean));
  return { doc, trouver, ecouteurs };
}

function charger() {
  const { doc, trouver, ecouteurs } = miniDom();
  const natifs = [];
  const win = { document: doc, alert: () => natifs.push('alert'), confirm: () => natifs.push('confirm'), prompt: () => natifs.push('prompt') };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(path.join(racine, 'js/dialogues.js'), 'utf8'), { window: win, document: doc, Date, Promise, String });
  return { P: win.PAPDialog, doc, trouver, natifs, ecouteurs };
}
const attendre = () => new Promise((r) => setImmediate(r));

test('PAPDialog.confirm : non bloquant, OK = true, Annuler = false, jamais de fenêtre native', async () => {
  const { P, doc, trouver, natifs } = charger();
  let fini = false;
  const p = P.confirm('Supprimer ?').then((v) => { fini = true; return v; });
  await attendre();
  assert.equal(fini, false, 'la page continue pendant que la fenêtre est ouverte');
  trouver(doc.body, (n) => n.tagName === 'button' && n.className === 'ok').click();
  assert.equal(await p, true);
  const p2 = P.confirm('Encore ?');
  await attendre();
  trouver(doc.body, (n) => n.tagName === 'button' && n.textContent === 'Annuler').click();
  assert.equal(await p2, false);
  assert.deepEqual(natifs, []);
  assert.equal(doc.body.children.length, 0, 'fenêtre retirée de la page');
});

test('PAPDialog.prompt : renvoie le texte saisi, ou null si annulé', async () => {
  const { P, doc, trouver } = charger();
  const p = P.prompt('Code ?', '12');
  await attendre();
  const champ = trouver(doc.body, (n) => n.tagName === 'input');
  assert.equal(champ.value, '12');
  champ.value = '123456';
  trouver(doc.body, (n) => n.tagName === 'button' && n.className === 'ok').click();
  assert.equal(await p, '123456');
  const p2 = P.prompt('Code ?');
  await attendre();
  trouver(doc.body, (n) => n.tagName === 'button' && n.textContent === 'Annuler').click();
  assert.equal(await p2, null);
});

test('PAPDialog.alert : le texte est inséré comme texte (pas de HTML), une fenêtre à la fois', async () => {
  const { P, doc, trouver } = charger();
  const a = P.alert('<img src=x onerror=1>');
  const b = P.alert('deuxième');
  await attendre();
  assert.equal(doc.body.children.length, 1, 'une seule fenêtre ouverte');
  assert.ok(trouver(doc.body, (n) => n.tagName === 'p' && n.textContent === '<img src=x onerror=1>'));
  trouver(doc.body, (n) => n.tagName === 'button').click();
  await a;
  await attendre();
  assert.ok(trouver(doc.body, (n) => n.tagName === 'p' && n.textContent === 'deuxième'));
  trouver(doc.body, (n) => n.tagName === 'button').click();
  await b;
});
