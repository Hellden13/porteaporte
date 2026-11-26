'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const notifier = require('../api/notifier');

const ADMIN = 'admin@example.com';
const FROM = 'notifications@example.com';
const NAME = 'PorteàPorte';

function adminEmail(type, data) {
  const sensitiveRoute = 'personne@example.com 418-555-0123 123e4567-e89b-42d3-a456-426614174000';
  const emails = notifier.buildEmails(type, { trajet: sensitiveRoute, ...data }, ADMIN, FROM, NAME);
  const email = emails.find((item) => item.to === ADMIN);
  assert.ok(email, `alerte admin absente pour ${type}`);
  assert.match(email.subject, /^\[PP-ALERTE\] /);
  assert.doesNotMatch(email.subject, /personne@example\.com|418[ -]?555|Jean Dupont|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  for (const label of ['Type', 'Date/heure', 'Trajet', 'Montant', 'Lien admin']) {
    assert.match(email.html, new RegExp(`>${label.replace('/', '\\/')}<`), `champ ${label} absent du corps pour ${type}`);
  }
  assert.match(email.html, /href="https:\/\/porteaporte\.site\/admin\//, `lien admin cliquable absent pour ${type}`);
  return email;
}

test('nouvelle demande de livraison : sujet PP-ALERTE Livraison', () => {
  const email = adminEmail('admin_critical_alert', {
    subject: 'Nouvelle livraison #ABC123',
    details: { Trajet: 'Lévis → Québec', 'Prix total': '18 $' },
    created_at: '2026-11-25T15:00:00Z',
    cta_url: 'https://porteaporte.site/admin/operations.html'
  });
  assert.match(email.subject, /^\[PP-ALERTE\] Livraison — /);
});

test('les sujets réduisent les adresses civiques aux villes', () => {
  const emails = notifier.buildEmails('admin_critical_alert', {
    subject: 'Nouvelle livraison #ABC123',
    trajet: '123 rue Principale, Lévis → 456 boulevard Charest, Québec',
    ville_depart: 'Lévis',
    ville_arrivee: 'Québec',
    details: { Trajet: '123 rue Principale, Lévis → 456 boulevard Charest, Québec', 'Prix total': '18 $' }
  }, ADMIN, FROM, NAME);
  const email = emails.find((item) => item.to === ADMIN);
  assert.ok(email);
  assert.match(email.subject, /Lévis → Québec/);
  assert.doesNotMatch(email.subject, /123|456|Principale|Charest|rue|boulevard/i);
});

test('les sujets gardent les villes en « St- » et retirent toujours le numéro civique', () => {
  const subject = (ville_depart, ville_arrivee) => notifier
    .buildEmails('preuve_soumise_admin', { code: 'X', ville_depart, ville_arrivee }, ADMIN, FROM, NAME)
    .find((item) => item.to === ADMIN).subject;
  assert.match(subject('St-Jérôme', 'Ste-Foy'), /St-Jérôme → Ste-Foy$/);
  assert.match(subject('12 St-Joseph, St-Hyacinthe', '45 rue du Lac, Québec QC G1K 3H4'), /St-Hyacinthe → Québec$/);
  assert.doesNotMatch(subject('12 St-Joseph, St-Hyacinthe', '45 rue du Lac, Québec QC G1K 3H4'), /12|45|Joseph|Lac|G1K/);
  assert.doesNotMatch(subject('Rue Principale Lévis', 'Québec'), /Principale|→/);
});

test('nouvelle réservation : sujet PP-ALERTE Covoiturage', () => {
  const email = adminEmail('ride_booking_to_driver', {
    driver_email: 'conducteur@example.com', passenger_name: 'Jean Dupont',
    ville_depart: 'Lévis', ville_arrivee: 'Québec', total_price: 2.88,
    departure_time: '2026-11-26T13:00:00Z'
  });
  assert.match(email.subject, /^\[PP-ALERTE\] Covoiturage — /);
});

test('nouveau message : sujet PP-ALERTE Messagerie', () => {
  const email = adminEmail('admin_nouveau_message', {
    contexte: 'livraison', ville_depart: 'Lévis', ville_arrivee: 'Québec',
    created_at: '2026-11-25T15:00:00Z'
  });
  assert.match(email.subject, /^\[PP-ALERTE\] Messagerie — /);
});

test('preuve déposée : sujet PP-ALERTE Preuve de livraison', () => {
  const email = adminEmail('preuve_soumise_admin', {
    code: 'ABC123', ville_depart: 'Lévis', ville_arrivee: 'Québec', prix_total: 18,
    date_heure: '2026-11-25T15:00:00Z', admin_link: 'https://porteaporte.site/admin/operations.html'
  });
  assert.match(email.subject, /^\[PP-ALERTE\] Preuve de livraison — /);
});

test('annulation : sujet PP-ALERTE Annulation', () => {
  const email = adminEmail('ride_booking_cancelled', {
    passenger_email: 'personne@example.com', ville_depart: 'Lévis', ville_arrivee: 'Québec',
    total_price: 2.88, paiement: false
  });
  assert.match(email.subject, /^\[PP-ALERTE\] Annulation — /);
});

test('litige : sujet PP-ALERTE Litige', () => {
  const email = adminEmail('admin_critical_alert', {
    subject: 'Manquement signalé sur #ABC123', created_at: '2026-11-25T15:00:00Z',
    cta_url: 'https://porteaporte.site/admin/manquements.html'
  });
  assert.match(email.subject, /^\[PP-ALERTE\] Litige — /);
});

test('bienvenue ne produit aucune alerte admin (création de compte côté navigateur seulement)', () => {
  const emails = notifier.buildEmails('bienvenue', {
    to: 'personne@example.com', prenom: 'Jean', role: 'livreur'
  }, ADMIN, FROM, NAME);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'personne@example.com');
  assert.ok(!emails.some((item) => item.to === ADMIN));
});

function makeRes() {
  return {
    _status: 200, _body: null, _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
    setHeader(k, v) { this._headers[k] = v; }
  };
}

test('bienvenue sans secret interne est refusé, même depuis l’origine du site', async () => {
  const handler = require('../api/notifier');
  const avantSecret = process.env.INTERNAL_API_SECRET;
  const avantFetch = global.fetch;
  let envois = 0;
  global.fetch = async () => { envois += 1; return { ok: true, status: 200, json: async () => ({}) }; };
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
  try {
    const body = { type: 'bienvenue', to: 'personne@example.com', data: { prenom: 'Jean', role: 'livreur' } };
    for (const headers of [
      { origin: 'https://porteaporte.site', referer: 'https://porteaporte.site/signup.html' },
      { origin: 'https://porteaporte.site', 'x-internal-notifier-secret': 'mauvais-secret-de-meme-longueur' }
    ]) {
      const res = makeRes();
      await handler({ method: 'POST', headers, body }, res);
      assert.equal(res._status, 403);
      assert.match(res._body?.error || '', /Secret interne requis/);
    }
    delete process.env.INTERNAL_API_SECRET;
    const res = makeRes();
    await handler({ method: 'POST', headers: { origin: 'https://porteaporte.site' }, body }, res);
    assert.equal(res._status, 503);
    assert.equal(envois, 0, 'aucun envoi ne doit partir');
  } finally {
    if (avantSecret === undefined) delete process.env.INTERNAL_API_SECRET; else process.env.INTERNAL_API_SECRET = avantSecret;
    global.fetch = avantFetch;
  }
});
