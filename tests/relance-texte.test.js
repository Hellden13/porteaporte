// tests/relance-texte.test.js — Texte du courriel « Relancer » (verification_rappel), 22 nov. 2026. Aucun envoi.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildEmails } = require('../api/notifier');

const construire = (data) => buildEmails('verification_rappel', { email: 'membre@example.com', ...data }, 'admin@example.com', 'envoi@example.com', 'PorteàPorte');
const texte = (html) => html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n\s+/g, '\n').trim();

describe('courriel Relancer — nouveau texte', () => {
  test('un seul courriel, au membre, du bon expéditeur', () => {
    const e = construire({ prenom: 'Julie' });
    assert.equal(e.length, 1);
    assert.equal(e[0].to, 'membre@example.com');
    assert.equal(e[0].from.email, 'envoi@example.com');
  });

  test('sujet avec le prénom', () => {
    assert.equal(construire({ prenom: 'Julie' })[0].subject, "Julie, un trajet Lévis ↔ Québec t'attend sur PorteàPorte");
  });

  test('sans prénom : sujet et salutation restent propres', () => {
    const [e] = construire({ prenom: '' });
    assert.equal(e.subject, "Un trajet Lévis ↔ Québec t'attend sur PorteàPorte");
    assert.match(texte(e.html), /^PORTEÀPORTE\nSalut,\n/);
  });

  test('corps exact (texte de Denis)', () => {
    const attendu = [
      'PORTEÀPORTE',
      'Salut Julie,',
      "Tu t'es inscrit sur PorteàPorte il y a quelque temps, mais ta vérification n'est pas encore terminée.",
      'Bonne nouvelle : le service roule maintenant entre Lévis et Québec.',
      "🚗 Tu fais déjà la route ? Une fois vérifié, tu peux publier tes trajets, partager tes frais d'essence et transporter des colis en chemin.",
      "🪑 Besoin d'un lift ? Un trajet régulier part de Saint-Nicolas (McDonald's) vers Place Laurier à 8 h, avec un retour à 16 h, du lundi au vendredi. 2,88 $ la place.",
      'Il te reste moins de 2 minutes pour finir :',
      'Terminer ma vérification',
      'Des questions ? Réponds simplement à ce courriel.',
      'Denis',
      "PorteàPorte — Quelqu'un passe déjà dans ta direction.",
    ].join('\n');
    assert.equal(texte(construire({ prenom: 'Julie' })[0].html), attendu);
  });

  test('le bouton garde le lien existant (livreur.html), et c\'est le seul lien', () => {
    const html = construire({ prenom: 'Julie' })[0].html;
    const liens = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(liens, ['https://porteaporte.site/livreur.html']);
    assert.match(html, /<a href="https:\/\/porteaporte\.site\/livreur\.html"[^>]*>Terminer ma vérification<\/a>/);
  });

  test('l\'ancien texte a disparu', () => {
    const [e] = construire({ prenom: 'Julie' });
    assert.doesNotMatch(e.subject, /Il te reste une étape/);
    assert.doesNotMatch(e.html, /Compléter ma vérification|Tu es inscrit — il te reste|Terminer mon inscription|ton profil n'est pas encore|📦/);
  });

  test('prénom piégé : échappé dans le corps, sans saut de ligne dans le sujet', () => {
    const [e] = construire({ prenom: '<img src=x onerror=alert(1)>\r\nBcc: x@y' });
    assert.doesNotMatch(e.html, /<img/);
    assert.match(e.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(e.subject, /[\r\n]/);
  });
});

describe('courriel Relancer — Reply-To vers ADMIN_EMAIL', () => {
  test('le courriel porte replyTo = ADMIN_EMAIL', () => {
    assert.equal(construire({ prenom: 'Julie' })[0].replyTo, 'admin@example.com');
  });

  test('Resend reçoit reply_to (et rien n\'est vraiment envoyé)', async () => {
    const handler = require('../api/notifier');
    const avant = { ...process.env };
    process.env.RESEND_API_KEY = 're_fake';
    process.env.ADMIN_EMAIL = 'denis@example.com';
    process.env.FROM_EMAIL = 'envoi@example.com';
    process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
    const envois = [];
    const fetchAvant = global.fetch;
    global.fetch = async (url, o) => {
      envois.push({ url, body: JSON.parse(o.body) });
      return { status: 200, ok: true, text: async () => '{"id":"faux"}' };
    };
    try {
      const res = { _s: 200, _b: null, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { this._b = b; return this; }, end() { return this; } };
      await handler({ method: 'POST', headers: { 'x-internal-notifier-secret': 'secret-interne-de-test-assez-long' }, body: { type: 'verification_rappel', data: { email: 'membre@example.com', prenom: 'Julie' } } }, res);
      assert.equal(res._s, 200);
      assert.equal(envois.length, 1);
      assert.equal(envois[0].url, 'https://api.resend.com/emails');
      assert.equal(envois[0].body.reply_to, 'denis@example.com');
      assert.equal(envois[0].body.to, 'membre@example.com');
      assert.equal(envois[0].body.subject, "Julie, un trajet Lévis ↔ Québec t'attend sur PorteàPorte");
    } finally {
      global.fetch = fetchAvant;
      for (const k of Object.keys(process.env)) if (!(k in avant)) delete process.env[k];
      Object.assign(process.env, avant);
    }
  });

  test('les autres courriels ne reçoivent pas de reply_to', () => {
    const autres = buildEmails('verification_refusee', { email: 'membre@example.com', prenom: 'Julie', reason: 'x' }, 'admin@example.com', 'envoi@example.com', 'P');
    assert.ok(autres.length >= 1);
    for (const e of autres) assert.equal(e.replyTo, undefined);
  });
});
