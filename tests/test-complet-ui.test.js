// tests/test-complet-ui.test.js — Test complet du 22 nov. 2026 : vérifications des pages (points 5 et suivants).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const lire = (f) => fs.readFileSync(f, 'utf8');
const fonction = (src, nom) => {
  const i = src.indexOf(`function ${nom}(`);
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  return src.slice(i, src.indexOf('\n    }\n', i) + 6);
};

test('5. pickup sans caméra : photo téléversée à la place, message clair, aucune fenêtre d\'alerte', () => {
  const html = lire('dashboard-livreur.html');
  assert.match(html, /<input type="file" accept="image\/\*" capture="user" id="selfie-file-\$\{row\.id\}" onchange="selfieDepuisFichier\('\$\{row\.id\}', this\)"/);
  assert.match(html, /Téléverser une photo à la place/);
  const start = fonction(html, 'startSelfie');
  assert.match(start, /!navigator\.mediaDevices \|\| typeof navigator\.mediaDevices\.getUserMedia !== 'function'/);
  assert.match(start, /NotAllowedError/);
  assert.match(start, /selfieSansCamera\(id/);
  assert.doesNotMatch(start, /alert\(/);
  const fichier = fonction(html, 'selfieDepuisFichier');
  assert.match(fichier, /selfieData\[id\] = dataUrl/);
  assert.match(fichier, /\^image\\\//);
});
