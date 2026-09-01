const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('inscription transmet le jeton CAPTCHA à Supabase', () => {
  const html = read('signup.html');
  assert.match(html, /PAPAuthCaptcha\.mount\('signup-captcha', 'signup'\)/);
  assert.match(html, /captchaToken:\s*captchaToken \|\| undefined/);
});

test('connexion et réinitialisation transmettent le jeton CAPTCHA', () => {
  const html = read('login.html');
  assert.match(html, /PAPAuthCaptcha\.mount\('login-captcha', 'login'\)/);
  assert.ok((html.match(/captchaToken:\s*captchaToken \|\| undefined/g) || []).length >= 2);
});

test('la clé publique Turnstile vient de la configuration serveur', () => {
  const platform = read('api/platform.js');
  assert.match(platform, /endpoint === 'turnstile-config'/);
  assert.match(platform, /process\.env\.TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(read('js/auth-captcha.js'), /0x4[A-Za-z0-9_-]{10,}/);
});
