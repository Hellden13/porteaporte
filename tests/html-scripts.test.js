const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

test('les scripts intégrés aux pages publiques sont valides', () => {
  const pages = fs.readdirSync(projectRoot).filter((file) => file.endsWith('.html'));
  const errors = [];

  for (const page of pages) {
    const html = fs.readFileSync(path.join(projectRoot, page), 'utf8');
    let inlineIndex = 0;
    const scripts = html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi);

    for (const match of scripts) {
      const attributes = match[1] || '';
      if (/\bsrc\s*=/i.test(attributes) || /type=["']application\/ld\+json["']/i.test(attributes)) continue;
      inlineIndex += 1;
      try {
        new vm.Script(match[2], { filename: `${page}#inline-${inlineIndex}` });
      } catch (error) {
        errors.push(`${page} (script ${inlineIndex}): ${error.message}`);
      }
    }
  }

  assert.deepEqual(errors, [], errors.join('\n'));
});

test('le mode express saute directement du trajet au prix', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'covoiturage-publier.html'), 'utf8');

  assert.match(
    html,
    /from === 1 && document\.body\.classList\.contains\('express-mode'\) \? 5 : from \+ 1/,
    'Suivant doit ignorer les étapes optionnelles masquées en mode express'
  );
  assert.match(
    html,
    /goStep\(document\.body\.classList\.contains\('express-mode'\) \? 1 : 4\)/,
    'Retour depuis le prix doit revenir au trajet en mode express'
  );
});
