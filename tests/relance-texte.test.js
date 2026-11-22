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
      "Tu t'es inscrit sur PorteàPorte il y a quelque temps, mais ton profil n'est pas encore terminé.",
      'Bonne nouvelle : le service roule maintenant entre Lévis et Québec.',
      "🚗 Un trajet régulier part de Saint-Nicolas (McDonald's) vers Place Laurier à 8 h, avec un retour à 16 h, du lundi au vendredi. 2,88 $ la place.",
      "📦 Tu as un colis à faire passer de l'autre côté du fleuve ? Il peut voyager sur la même route.",
      'Il te reste moins de 2 minutes pour finir ton profil :',
      'Terminer mon inscription',
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
    assert.match(html, /<a href="https:\/\/porteaporte\.site\/livreur\.html"[^>]*>Terminer mon inscription<\/a>/);
  });

  test('l\'ancien texte a disparu', () => {
    const [e] = construire({ prenom: 'Julie' });
    assert.doesNotMatch(e.subject, /Il te reste une étape/);
    assert.doesNotMatch(e.html, /Compléter ma vérification|Tu es inscrit — il te reste/);
  });

  test('prénom piégé : échappé dans le corps, sans saut de ligne dans le sujet', () => {
    const [e] = construire({ prenom: '<img src=x onerror=alert(1)>\r\nBcc: x@y' });
    assert.doesNotMatch(e.html, /<img/);
    assert.match(e.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(e.subject, /[\r\n]/);
  });
});
