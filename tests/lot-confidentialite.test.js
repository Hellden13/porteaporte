// tests/lot-confidentialite.test.js — Lot confidentialité (décisions de Denis, 23 nov. 2026).
// Aucune vraie coordonnée entre conducteur et passager (sauf l'admin) ; messagerie liée au trajet avec avis
// sans adresse, fermeture 3 jours après le trajet, « Signaler », lecture admin seulement sur signalement ;
// bogue du texte vertical (overflow-wrap:break-word, zone de contact sous la carte sur cellulaire).
'use strict';

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { creerBase, makeRes } = require('./aide-fausse-base');
const M = require('../lib/_messagerie');

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const COND = '11111111-1111-4111-8111-111111111111';
const PASS = '22222222-2222-4222-8222-222222222222';
const AUTRE = '33333333-3333-4333-8333-333333333333';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const RIDE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOUR = 24 * 3600 * 1000;
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
const ctxDe = (uid, role = 'membre') => ({ ...CTX, session: { id: uid }, profile: { id: uid, role } });

function base({ depart = Date.now() + JOUR, recurrent = false, reservation = {} } = {}) {
  return creerBase({
    rides: [{ id: RIDE, driver_id: COND, start_city: 'Lévis', end_city: 'Rimouski', departure_time: new Date(depart).toISOString(), return_departure_time: null, is_recurring: recurrent, status: 'publie' }],
    ride_bookings: [{ id: 'b1', ride_id: RIDE, passenger_id: PASS, status: 'confirme', created_at: new Date(Date.now() - 10 * JOUR).toISOString(), updated_at: new Date(Date.now() - 10 * JOUR).toISOString(), ...reservation }],
    profiles: [
      { id: COND, prenom: 'Denis', email: 'cond@exemple.ca', telephone: '4185551234' },
      { id: PASS, prenom: 'Laura', email: 'pass@exemple.ca', telephone: '4185559876' },
    ],
    ride_messages: [], ride_reports: [],
  });
}
const envoyer = async (db, uid, autre, texte = 'Je serai au McDo à 10 h 25') => {
  global.fetch = db.fetch;
  const res = makeRes();
  await M.rideMessageSend({}, res, ctxDe(uid), { ride_id: RIDE, recipient_id: autre, body: texte });
  return res;
};

describe('messagerie liée au trajet', () => {
  test('passager → conducteur : message enregistré, avis courriel au conducteur SANS adresse ni texte de l’autre', async () => {
    const db = base();
    const res = await envoyer(db, PASS, COND);
    assert.equal(res._status, 200, JSON.stringify(res._body));
    assert.equal(db.tables.ride_messages.length, 1);
    const avis = db.courriels.filter((c) => c.type === 'ride_nouveau_message');
    assert.equal(avis.length, 1);
    assert.equal(avis[0].data.to_email, 'cond@exemple.ca');
    const brut = JSON.stringify(avis[0].data);
    assert.doesNotMatch(brut, /pass@exemple\.ca|5559876|McDo/, 'ni courriel, ni téléphone, ni texte du passager');
    assert.equal(avis[0].data.expediteur_prenom, 'Laura');
    assert.match(avis[0].data.lien, new RegExp(`message=${PASS}`));
  });

  test('avis : un seul par conversation et par demi-heure (pas de pluie de courriels)', async () => {
    const db = base();
    await envoyer(db, PASS, COND, 'un');
    await envoyer(db, PASS, COND, 'deux');
    await envoyer(db, PASS, COND, 'trois');
    assert.equal(db.tables.ride_messages.length, 3);
    assert.equal(db.courriels.filter((c) => c.type === 'ride_nouveau_message').length, 1);
    await envoyer(db, COND, PASS, 'réponse');
    assert.equal(db.courriels.filter((c) => c.type === 'ride_nouveau_message').length, 2, 'l’autre sens a son propre avis');
  });

  test('personne hors du trajet : 403, rien enregistré', async () => {
    const db = base();
    let res = await envoyer(db, AUTRE, COND);
    assert.equal(res._status, 403);
    res = await envoyer(db, PASS, AUTRE);
    assert.equal(res._status, 403);
    assert.equal(db.tables.ride_messages.length, 0);
  });

  test('fermée 3 jours après le trajet : 2 jours après = permis, 4 jours après = refusé ; la conversation reste lisible', async () => {
    let db = base({ depart: Date.now() - 2 * JOUR });
    assert.equal((await envoyer(db, PASS, COND))._status, 200);
    db = base({ depart: Date.now() - 4 * JOUR });
    db.tables.ride_messages.push({ id: 'm0', ride_id: RIDE, sender_id: COND, recipient_id: PASS, body: 'Merci !', created_at: new Date().toISOString(), read_at: null });
    const res = await envoyer(db, PASS, COND);
    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'messagerie_fermee');
    assert.equal(db.tables.ride_messages.length, 1);
    const t = makeRes();
    await M.rideMessageThread({}, t, ctxDe(PASS), { ride_id: RIDE, other_user_id: COND });
    assert.equal(t._status, 200);
    assert.equal(t._body.ferme, true);
    assert.equal(t._body.messages.length, 1);
  });

  test('trajet récurrent : ouvert tant que la réservation est en cours ; fermé 3 jours après la fin', async () => {
    let db = base({ depart: Date.now() - 60 * JOUR, recurrent: true });
    assert.equal((await envoyer(db, PASS, COND))._status, 200);
    const fini = new Date(Date.now() - 5 * JOUR).toISOString();
    db = base({ depart: Date.now() - 60 * JOUR, recurrent: true, reservation: { status: 'paye', completed_at: fini, updated_at: fini } });
    assert.equal((await envoyer(db, PASS, COND))._status, 403);
  });

  test('règle pure : fin + 3 jours', () => {
    const ride = { departure_time: '2026-11-20T15:00:00Z', is_recurring: false };
    assert.equal(M.etatFermeture(ride, [], new Date('2026-11-23T14:59:00Z')).ferme, false);
    assert.equal(M.etatFermeture(ride, [], new Date('2026-11-23T15:00:00Z')).ferme, true);
    assert.equal(M.JOURS_APRES_TRAJET, 3);
  });
});

describe('Signaler et lecture admin', () => {
  test('signalement : ride_reports + journal + alerte admin ; raison inconnue → 400 ; hors trajet → 403', async () => {
    const db = base();
    global.fetch = db.fetch;
    let res = makeRes();
    await M.rideMessageReport({}, res, ctxDe(PASS), { ride_id: RIDE, other_user_id: COND, raison: 'nimporte' });
    assert.equal(res._status, 400);
    res = makeRes();
    await M.rideMessageReport({}, res, ctxDe(AUTRE), { ride_id: RIDE, other_user_id: COND, raison: 'propos' });
    assert.equal(res._status, 403);
    res = makeRes();
    await M.rideMessageReport({}, res, ctxDe(PASS), { ride_id: RIDE, other_user_id: COND, raison: 'paiement', details: 'Il veut 20 $ comptant' });
    assert.equal(res._status, 200, JSON.stringify(res._body));
    const r = db.tables.ride_reports[0];
    assert.deepEqual([r.reporter_id, r.reported_id, r.reason, r.status], [PASS, COND, 'messagerie:paiement', 'ouvert']);
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'messages_signales').length, 1);
    assert.ok(db.courriels.some((c) => c.type === 'admin_critical_alert'));
  });

  test('admin : lecture SEULEMENT à partir d’un signalement de messagerie, journalisée ; membre refusé', async () => {
    const db = base();
    db.tables.ride_messages.push(
      { id: 'm1', ride_id: RIDE, sender_id: PASS, recipient_id: COND, body: 'Bonjour', created_at: '2026-11-23T10:00:00Z' },
      { id: 'm2', ride_id: RIDE, sender_id: COND, recipient_id: PASS, body: 'Paie-moi comptant', created_at: '2026-11-23T10:01:00Z' });
    db.tables.ride_reports.push(
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ride_id: RIDE, reporter_id: PASS, reported_id: COND, reason: 'messagerie:paiement', status: 'ouvert' },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ride_id: RIDE, reporter_id: PASS, reported_id: COND, reason: 'Retard', status: 'ouvert' });
    global.fetch = db.fetch;
    const appel = async (ctx, body) => { const r = makeRes(); await M.rideMessageAdminThread({}, r, ctx, body); return r; };
    assert.equal((await appel(ctxDe(PASS), { report_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }))._status, 403, 'membre');
    assert.equal((await appel(ctxDe(ADMIN, 'admin'), {}))._status, 403, 'admin sans signalement');
    assert.equal((await appel(ctxDe(ADMIN, 'admin'), { report_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }))._status, 403, 'signalement qui n’est pas de messagerie');
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'messages_lus_admin').length, 0);
    const ok = await appel(ctxDe(ADMIN, 'admin'), { report_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    assert.equal(ok._status, 200);
    assert.equal(ok._body.messages.length, 2);
    const j = db.tables.transaction_audit_events.filter((e) => e.event_type === 'messages_lus_admin');
    assert.equal(j.length, 1);
    assert.equal(j[0].user_id, ADMIN);
  });

  test('liste des signalements : admin seulement', async () => {
    const db = base();
    global.fetch = db.fetch;
    const r = makeRes();
    await M.rideMessageReports({}, r, ctxDe(PASS));
    assert.equal(r._status, 403);
  });
});

describe('aucune vraie coordonnée entre conducteur et passager', () => {
  test('ride-driver-contact : passager refusé (403), admin permis', async () => {
    const { rideDriverContact } = require('../lib/_rides');
    const db = base();
    db.tables.ride_bookings[0].id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    global.fetch = db.fetch;
    let r = makeRes();
    await rideDriverContact({}, r, ctxDe(PASS), { booking_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    assert.equal(r._status, 403);
    assert.equal(r._body.telephone, undefined);
    r = makeRes();
    await rideDriverContact({}, r, ctxDe(ADMIN, 'admin'), { booking_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    assert.equal(r._status, 200);
    assert.equal(r._body.email, 'cond@exemple.ca');
  });

  test('courriel au conducteur : ni courriel ni téléphone du passager ; la copie admin garde le courriel', () => {
    const { buildEmails } = require('../api/notifier');
    const mails = buildEmails('ride_booking_to_driver', { driver_email: 'cond@exemple.ca', passenger_name: 'Laura', admin_passenger_email: 'pass@exemple.ca', passenger_email: 'pass@exemple.ca', passenger_phone: '4185559876', ville_depart: 'Lévis', ville_arrivee: 'Rimouski' }, 'admin@b.c', 'n@b.c', 'PorteàPorte');
    const cond = mails.find((m) => m.to === 'cond@exemple.ca');
    assert.doesNotMatch(cond.html, /pass@exemple\.ca|5559876|tel:|mailto:/);
    assert.match(cond.html, /messagerie/);
    const admin = mails.find((m) => m.to === 'admin@b.c');
    assert.match(admin.html, /pass@exemple\.ca/);
  });

  test('avis « nouveau message » : lien vers le site, aucune adresse', () => {
    const { buildEmails } = require('../api/notifier');
    const [m] = buildEmails('ride_nouveau_message', { to_email: 'cond@exemple.ca', prenom: 'Denis', expediteur_prenom: 'Laura', ville_depart: 'Lévis', ville_arrivee: 'Rimouski', lien: `/covoiturage-trajet.html?id=${RIDE}&message=${PASS}` }, 'a@b.c', 'n@b.c', 'PorteàPorte');
    assert.equal(m.to, 'cond@exemple.ca');
    assert.match(m.html, /Tu as un nouveau message de <strong[^>]*>Laura/);
    assert.match(m.html, /https:\/\/porteaporte\.site\/covoiturage-trajet\.html/);
    assert.doesNotMatch(m.html, /@exemple/);
  });

  test('serveur : les envois de confirmation ne transmettent plus les coordonnées de l’autre', () => {
    const s = lire('lib/_rides.js');
    assert.doesNotMatch(s, /driver_phone:|passenger_phone:/);
    assert.doesNotMatch(s, /driver_email: drv\?\.email \|\| ''/);
    assert.doesNotMatch(s, /passenger_profile:profiles!passenger_id\([^)]*(email|telephone)/);
    assert.doesNotMatch(s, /has_phone|has_email/);
  });

  test('pages membres : aucun lien mailto/tel vers l’autre membre, bouton messagerie à la place', () => {
    for (const f of ['covoiturage-confirme.html', 'dashboard-covoiturage.html', 'covoiturage-trajet.html']) {
      const h = lire(f);
      assert.doesNotMatch(h, /mailto:\$\{|tel:\$\{|'tel:' \+|'mailto:' \+|openDriverContact|ride-driver-contact|driver\.telephone|driver\.email/, f);
    }
    assert.match(lire('covoiturage-confirme.html'), /Écrire au conducteur/);
    assert.match(lire('dashboard-covoiturage.html'), /ouvrirMessagerie\(/);
    for (const f of ['covoiturage-confirme.html', 'dashboard-covoiturage.html', 'covoiturage-trajet.html']) assert.match(lire(f), /\/js\/ride-chat\.js/, f);
  });

  test('widget : Signaler sans boîte de dialogue du navigateur, état fermé, rappel de confidentialité', () => {
    const js = lire('js/ride-chat.js');
    assert.match(js, /ride-message-report/);
    assert.match(js, /Conversation fermée/);
    assert.match(js, /Tes coordonnées restent privées/);
    assert.doesNotMatch(js, /window\.(prompt|confirm)\(/);
    assert.match(js, /const ta = overlay\.querySelector\('\.rc-input textarea'\)/, 'Entrée envoie le message, pas le champ du signalement');
    assert.match(js, /z-index: 2147483000/, 'au-dessus des boutons flottants');
  });
});

describe('bogue du texte vertical', () => {
  test('règle commune des cartes : break-word (plus anywhere)', () => {
    const js = lire('js/flottants.js');
    assert.match(js, /overflow-wrap:break-word;word-break:normal/);
    assert.doesNotMatch(js, /overflow-wrap:anywhere/);
    assert.doesNotMatch(lire('assets/visual-polish.css'), /overflow-wrap:\s*anywhere/);
  });
  test('fiche du conducteur : zone de contact sous la carte sur cellulaire', () => {
    const h = lire('covoiturage-confirme.html');
    assert.match(h, /@media \(max-width: 560px\)[\s\S]{0,200}\.driver-row > \.contact-btns \{ grid-column:1 \/ -1; \}/);
  });
});

describe('masquage des coordonnées dans la messagerie', () => {
  const masques = [
    '418-555-1234', '(418) 555 1234', '418.555.1234', '4185551234', '418 555 1234', '418 - 555 - 1234', '418/555/1234',
    '1-800-555-1234', '1 800 555 1234', '+1 418 555 1234', '+14185551234', '418 555 12 34', '555-1234',
    '4 1 8 5 5 5 1 2 3 4', '4-1-8-5-5-5-1-2-3-4', '418 555 et 1234', '4l8 555 l234', '４１８５５５１２３４',
    'quatre un huit cinq cinq cinq un deux trois quatre', '418 cinq cinq cinq 1234', 'four one eight five five five one two three four',
    'denis@gmail.com', 'DENIS.M@VIDEOTRON.CA', 'denis.morneau+pap@outlook.com', 'denis @ gmail . com', 'denis＠gmail.com',
    'denis (at) gmail (dot) com', 'denis[at]gmail[.]com', 'denis at gmail dot com', 'denis arobase gmail point com',
  ];
  for (const t of masques) {
    test(`masqué : « ${t} »`, () => {
      const r = M.masquerCoordonnees(`Écris-moi : ${t} merci`);
      assert.equal(r.masque, true);
      assert.ok(r.texte.includes(M.MASQUE));
      assert.doesNotMatch(r.texte.replace(M.MASQUE, ''), /\d{3}|@|＠|gmail|videotron|outlook|cinq|five/i, r.texte);
    });
  }
  const gardes = [
    'Rendez-vous le 2026-11-25 à 10 h 30', '3 places, 2 bagages, 4,20 $', 'Code PP-EA656834', 'Je suis au 1160 rue de la Concorde',
    'On part à 10 et on arrive à 14 h', 'Il est 21:30 et je suis à 2 km', 'J’ai 2 sacs et 1 valise, 30 kg et 20 kg', 'un deux trois, on y va !',
  ];
  for (const t of gardes) {
    test(`gardé tel quel : « ${t} »`, () => {
      const r = M.masquerCoordonnees(t);
      assert.equal(r.masque, false);
      assert.equal(r.texte, t);
    });
  }

  test('envoi : l’autre ne voit que la version masquée ; l’original est au journal, au nom de l’expéditeur seulement', async () => {
    const db = base();
    const res = await envoyer(db, PASS, COND, 'Texte-moi au 418 555-9876 ou pass@exemple.ca');
    assert.equal(res._status, 200);
    assert.equal(res._body.masque, true);
    const enBase = db.tables.ride_messages[0].body;
    assert.doesNotMatch(enBase, /555|9876|pass@exemple/);
    const t = makeRes();
    await M.rideMessageThread({}, t, ctxDe(COND), { ride_id: RIDE, other_user_id: PASS });
    assert.doesNotMatch(JSON.stringify(t._body), /555-9876|pass@exemple\.ca/, 'le conducteur ne voit jamais l’original');
    const o = db.tables.transaction_audit_events.filter((e) => e.event_type === 'message_original_masque');
    assert.equal(o.length, 1);
    assert.equal(o[0].user_id, PASS, 'lisible par son auteur et l’admin seulement (RLS du journal)');
    assert.equal(o[0].evidence.original, 'Texte-moi au 418 555-9876 ou pass@exemple.ca');
    assert.equal(o[0].evidence.message_id, db.tables.ride_messages[0].id);
  });

  test('admin, à partir d’un signalement : voit l’original à côté du message masqué', async () => {
    const db = base();
    await envoyer(db, COND, PASS, 'Paie-moi comptant, mon cell : 418 555 1234');
    db.tables.ride_reports.push({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ride_id: RIDE, reporter_id: PASS, reported_id: COND, reason: 'messagerie:paiement', status: 'ouvert' });
    const r = makeRes();
    await M.rideMessageAdminThread({}, r, ctxDe(ADMIN, 'admin'), { report_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    assert.equal(r._status, 200);
    assert.match(r._body.messages[0].body, /coordonnées masquées/);
    assert.equal(r._body.messages[0].original, 'Paie-moi comptant, mon cell : 418 555 1234');
  });

  test('message sans coordonnées : rien au journal des originaux', async () => {
    const db = base();
    await envoyer(db, PASS, COND, 'Je serai au McDo à 10 h 25');
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'message_original_masque').length, 0);
  });
});

test('masque propre : rien ne reste autour (parenthèse, +, point final gardé)', () => {
  assert.equal(M.masquerCoordonnees('Appelle au (418) 555 1234 svp').texte, `Appelle au ${M.MASQUE} svp`);
  assert.equal(M.masquerCoordonnees('Mon cell +1 418 555 1234.').texte, `Mon cell ${M.MASQUE}.`);
});
