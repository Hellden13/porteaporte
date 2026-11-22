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

test('connexion admin : widget Turnstile affiché et jeton transmis à Supabase (test complet du 22 nov.)', () => {
  const html = read('admin/login.html');
  assert.match(html, /<script src="\/js\/auth-captcha\.js"><\/script>/);
  assert.match(html, /id="admin-captcha"/);
  assert.match(html, /PAPAuthCaptcha\.mount\('admin-captcha', 'login'\)/);
  const appel = html.slice(html.indexOf('signInWithPassword'), html.indexOf('signInWithPassword') + 300);
  assert.match(appel, /options:\s*\{\s*captchaToken:\s*captchaToken \|\| undefined\s*\}/);
  assert.ok(html.indexOf('adminCaptcha.getToken()') < html.indexOf('signInWithPassword'), 'jeton demandé avant la connexion');
});
