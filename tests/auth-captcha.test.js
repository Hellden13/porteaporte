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
  assert.match(html, /<script src="\/js\/auth-captcha\.js(\?v=[0-9]+)?"><\/script>/);
  assert.match(html, /id="admin-captcha"/);
  assert.match(html, /PAPAuthCaptcha\.mount\('admin-captcha', 'login'\)/);
  const appel = html.slice(html.indexOf('signInWithPassword'), html.indexOf('signInWithPassword') + 300);
  assert.match(appel, /options:\s*\{\s*captchaToken:\s*captchaToken \|\| undefined\s*\}/);
  assert.ok(html.indexOf('adminCaptcha.getToken()') < html.indexOf('signInWithPassword'), 'jeton demandé avant la connexion');
});

// ─── Jeton Turnstile : attente, repli getResponse, usage unique (urgence connexion du 26 nov. 2026) ───
const vm = require('node:vm');

function chargerCaptcha({ autoToken = true, dropCallback = false } = {}) {
  let clock = 0;
  const widget = { opts: null, response: '', resets: 0, serial: 0 };
  const issue = () => {
    widget.serial += 1;
    widget.response = 'jeton-' + widget.serial;
    if (!dropCallback) widget.opts.callback(widget.response);
  };
  const turnstile = {
    render(el, opts) { widget.opts = opts; if (autoToken) setImmediate(issue); return 'w1'; },
    getResponse(id) { return id === 'w1' ? widget.response : undefined; },
    isExpired() { return false; },
    reset() { widget.resets += 1; widget.response = ''; if (autoToken) setImmediate(issue); }
  };
  const container = { hidden: true, textContent: '' };
  const win = {
    turnstile,
    fetch: async () => ({ ok: true, json: async () => ({ enabled: true, site_key: 'cle-test' }) }),
  };
  const ctx = {
    window: win, document: { getElementById: () => container, querySelector: () => null },
    fetch: win.fetch,
    // Horloge accélérée : chaque attente de 200 ms avance de 1 s (le délai de 12 s passe vite).
    Date: { now: () => clock },
    setTimeout: (fn) => { clock += 1000; setImmediate(fn); return 0; },
    clearTimeout: () => {}, Promise, Error,
  };
  vm.runInNewContext(fs.readFileSync('js/auth-captcha.js', 'utf8'), ctx);
  return { captcha: win.PAPAuthCaptcha.mount('c', 'login'), widget, issue };
}

test('captcha : un clic avant que le jeton soit prêt attend le jeton au lieu de refuser', async () => {
  const { captcha } = chargerCaptcha();
  assert.equal(await captcha.getToken(), 'jeton-1');
});

test('captcha : deuxième essai après un échec (reset) reçoit un nouveau jeton', async () => {
  const { captcha, widget } = chargerCaptcha();
  assert.equal(await captcha.getToken(), 'jeton-1');
  captcha.reset();
  assert.equal(await captcha.getToken(), 'jeton-2');
  assert.equal(widget.resets, 1);
});

test('captcha : un jeton déjà remis n’est jamais redonné, même sans reset de la page', async () => {
  const { captcha, widget } = chargerCaptcha();
  assert.equal(await captcha.getToken(), 'jeton-1');
  assert.equal(await captcha.getToken(), 'jeton-2');
  assert.equal(widget.resets, 1);
});

test('captcha : callback perdu, le jeton réellement détenu par le widget (getResponse) est utilisé', async () => {
  const { captcha } = chargerCaptcha({ dropCallback: true });
  assert.equal(await captcha.getToken(), 'jeton-1');
});

test('captcha : aucun jeton après l’attente → message « robot » (échec fermé)', async () => {
  const { captcha } = chargerCaptcha({ autoToken: false });
  await assert.rejects(captcha.getToken(), /pas un robot/);
});

test('captcha : l’adresse du script est versionnée (le cache navigateur de 24 h ne garde pas un ancien module)', () => {
  for (const page of ['login.html', 'signup.html', 'admin/login.html']) {
    assert.match(read(page), /<script src="\/js\/auth-captcha\.js\?v=\d{8}"><\/script>/, page);
  }
});
