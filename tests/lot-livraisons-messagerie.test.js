// tests/lot-livraisons-messagerie.test.js — Lot confidentialité des livraisons + code de trajet masqué
// (décisions de Denis, 24 nov. 2026).
'use strict';

process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'secret-de-test-livraisons-0123456789';

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { creerBase, makeRes } = require('./aide-fausse-base');
const M = require('../lib/_messagerie');
const ML = require('../lib/_messagerie-livraison');
const { codesLivraison } = require('../lib/_codes-livraison');
const { hashReceptionCode } = require('../lib/_lib');

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const EXP = '11111111-1111-4111-8111-111111111111';
const LIV = '22222222-2222-4222-8222-222222222222';
const DEST = '33333333-3333-4333-8333-333333333333';
const AUTRE = '44444444-4444-4444-8444-444444444444';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const L = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOUR = 24 * 3600 * 1000;
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
const ctxDe = (uid, role = 'membre') => ({ ...CTX, session: { id: uid }, profile: { id: uid, role } });
const ctxLien = () => ({ ...CTX, session: null, profile: null });
const CODES = codesLivraison(L);

function base(liv = {}) {
  return creerBase({
    livraisons: [{
      id: L, code: 'PP-TEST1234', statut: 'confirme', expediteur_id: EXP, livreur_id: LIV, destinataire_user_id: null,
      destinataire_email: 'dest@exemple.ca', destinataire_tel: '4185550000', destinataire_nom: 'Julie', ville_depart: 'Lévis', ville_arrivee: 'Québec',
      livre_le: null, recipient_confirmed_at: null, mis_a_jour_le: new Date().toISOString(),
      pickup_code_hash: hashReceptionCode(CODES.ramassage, L), recipient_confirmation_hash: hashReceptionCode(CODES.reception, L), ...liv,
    }],
    profiles: [
      { id: EXP, prenom: 'Denis', email: 'exp@exemple.ca' },
      { id: LIV, prenom: 'Marc', email: 'liv@exemple.ca' },
    ],
  });
}
async function appel(fn, ctx, body, parLien) {
  const r = makeRes();
  await ML[fn]({}, r, ctx, body, parLien);
  return r;
}
const jeton = (v = 0) => ML.jetonDestinataire(L, v);
const messages = (db) => db.tables.transaction_audit_events.filter((e) => e.event_type === ML.EV_MESSAGE);
const avis = (db) => db.courriels.filter((c) => c.type === 'livraison_nouveau_message');

describe('code de sécurité du trajet masqué dans la messagerie covoiturage', () => {
  const RIDE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const BOOK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  function baseTrajet() {
    return creerBase({
      rides: [{ id: RIDE, driver_id: LIV, start_city: 'Lévis', end_city: 'Rimouski', departure_time: new Date(Date.now() + JOUR).toISOString(), is_recurring: false }],
      ride_bookings: [{ id: BOOK, ride_id: RIDE, passenger_id: EXP, status: 'confirme' }],
      profiles: [{ id: EXP, prenom: 'Laura', email: 'p@exemple.ca' }, { id: LIV, prenom: 'Marc', email: 'c@exemple.ca' }],
      ride_messages: [],
    });
  }
  const code = () => require('../lib/_rides').codeTrajet(BOOK);
  for (const forme of [(c) => c, (c) => c.split('').join(' '), (c) => c.slice(0, 3) + '-' + c.slice(3)]) {
    test(`le code de CETTE réservation est masqué (« ${forme('123456')} »), avec l’avis « à l’arrivée, en personne »`, async () => {
      const db = baseTrajet();
      global.fetch = db.fetch;
      const r = makeRes();
      await M.rideMessageSend({}, r, ctxDe(EXP), { ride_id: RIDE, recipient_id: LIV, body: `Voici mon code : ${forme(code())}` });
      assert.equal(r._status, 200, JSON.stringify(r._body));
      assert.equal(r._body.avis, 'Ne partage ton code qu’à l’arrivée, en personne.');
      const enBase = db.tables.ride_messages[0].body;
      assert.ok(!enBase.replace(/\D/g, '').includes(code()), enBase);
      assert.match(enBase, /code masqué/);
      const o = db.tables.transaction_audit_events.find((e) => e.event_type === 'message_original_masque');
      assert.equal(o.user_id, EXP);
    });
  }
  test('un autre nombre à 6 chiffres reste visible', async () => {
    const db = baseTrajet();
    global.fetch = db.fetch;
    const autre = code() === '123456' ? '654321' : '123456';
    const r = makeRes();
    await M.rideMessageSend({}, r, ctxDe(EXP), { ride_id: RIDE, recipient_id: LIV, body: `Le numéro de commande est ${autre}` });
    assert.equal(r._body.masque, false);
    assert.equal(db.tables.ride_messages[0].body, `Le numéro de commande est ${autre}`);
  });
});

describe('messagerie de livraison : membres', () => {
  test('livreur → destinataire : enregistré masqué au journal, avis au destinataire avec SON lien, sans adresse du livreur', async () => {
    const db = base();
    global.fetch = db.fetch;
    const r = await appel('envoyerLivraison', ctxDe(LIV), { livraison_id: L, avec: 'destinataire', body: 'Je passe vers 14 h, mon cell 418 555 1234' }, false);
    assert.equal(r._status, 200, JSON.stringify(r._body));
    const m = messages(db);
    assert.equal(m.length, 1);
    assert.equal(m[0].evidence.conv, 'livreur-destinataire');
    assert.doesNotMatch(m[0].evidence.body, /555/);
    const a = avis(db);
    assert.equal(a.length, 1);
    assert.equal(a[0].data.to_email, 'dest@exemple.ca');
    assert.match(a[0].data.lien, new RegExp(`/message-livraison\\.html\\?l=${L}&t=${encodeURIComponent(jeton(0))}`));
    assert.doesNotMatch(JSON.stringify(a[0].data), /liv@exemple|555 1234/);
  });

  test('expéditeur ↔ livreur permis ; expéditeur ↔ destinataire refusé ; personne hors livraison refusée', async () => {
    const db = base();
    global.fetch = db.fetch;
    assert.equal((await appel('envoyerLivraison', ctxDe(EXP), { livraison_id: L, avec: 'livreur', body: 'Merci !' }, false))._status, 200);
    assert.equal((await appel('envoyerLivraison', ctxDe(EXP), { livraison_id: L, avec: 'destinataire', body: 'x' }, false))._status, 403);
    assert.equal((await appel('envoyerLivraison', ctxDe(AUTRE), { livraison_id: L, avec: 'livreur', body: 'x' }, false))._status, 403);
    assert.equal(avis(db)[0].data.to_email, 'liv@exemple.ca');
  });

  test('aucun livreur assigné : 409', async () => {
    const db = base({ livreur_id: null });
    global.fetch = db.fetch;
    assert.equal((await appel('envoyerLivraison', ctxDe(EXP), { livraison_id: L, avec: 'livreur', body: 'x' }, false))._status, 409);
  });

  test('codes de CETTE livraison masqués (ramassage et réception) ; un autre nombre reste', async () => {
    const db = base();
    global.fetch = db.fetch;
    await appel('envoyerLivraison', ctxDe(EXP), { livraison_id: L, avec: 'livreur', body: `ramassage ${CODES.ramassage}, réception ${CODES.reception.split('').join(' ')}` }, false);
    const corps = messages(db)[0].evidence.body;
    assert.ok(!corps.replace(/\D/g, '').includes(CODES.ramassage) && !corps.replace(/\D/g, '').includes(CODES.reception), corps);
    const autre = [CODES.ramassage, CODES.reception].includes('246810') ? '135791' : '246810';
    const r = await appel('envoyerLivraison', ctxDe(EXP), { livraison_id: L, avec: 'livreur', body: `colis n° ${autre}` }, false);
    assert.equal(r._body.masque, false);
  });

  test('codes masqués même si leurs hachages manquent en base (vieille livraison, saisie manuelle)', async () => {
    const db = base({ pickup_code_hash: null, recipient_confirmation_hash: null });
    global.fetch = db.fetch;
    await appel('envoyerLivraison', ctxLien(), { l: L, t: jeton(0), body: `Mon code est ${CODES.reception}` }, true);
    assert.ok(!messages(db)[0].evidence.body.replace(/\D/g, '').includes(CODES.reception), messages(db)[0].evidence.body);
  });

  test('avis : au plus un par conversation et par demi-heure', async () => {
    const db = base();
    global.fetch = db.fetch;
    for (const t of ['un', 'deux', 'trois']) await appel('envoyerLivraison', ctxDe(LIV), { livraison_id: L, avec: 'expediteur', body: t }, false);
    assert.equal(messages(db).length, 3);
    assert.equal(avis(db).length, 1);
  });

  test('liste des conversations du membre : aucune coordonnée du destinataire', async () => {
    const db = base();
    global.fetch = db.fetch;
    const r = makeRes();
    await ML.conversationsLivraison({}, r, ctxDe(LIV));
    assert.equal(r._status, 200);
    assert.deepEqual(r._body.livraisons[0].avec, ['expediteur', 'destinataire']);
    assert.doesNotMatch(JSON.stringify(r._body), /dest@exemple|4185550000/);
  });
});

describe('destinataire sans compte : lien personnel', () => {
  test('bon lien : lit et écrit ; l’avis va au livreur ; « moi » marqué ; aucune adresse renvoyée', async () => {
    const db = base();
    global.fetch = db.fetch;
    await appel('envoyerLivraison', ctxDe(LIV), { livraison_id: L, avec: 'destinataire', body: 'Bonjour' }, false);
    const s = await appel('envoyerLivraison', ctxLien(), { l: L, t: jeton(0), body: 'Je suis là après 17 h' }, true);
    assert.equal(s._status, 200, JSON.stringify(s._body));
    const t = await appel('threadLivraison', ctxLien(), { l: L, t: jeton(0) }, true);
    assert.equal(t._status, 200);
    assert.deepEqual(t._body.messages.map((m) => [m.de, m.moi]), [['livreur', false], ['destinataire', true]]);
    assert.doesNotMatch(JSON.stringify(t._body), /@exemple|4185550000/);
    assert.ok(avis(db).some((a) => a.data.to_email === 'liv@exemple.ca'));
    assert.equal(messages(db)[1].user_id, null, 'destinataire sans compte : aucune ligne lisible par un membre');
  });

  test('lien faux ou modifié : 403', async () => {
    const db = base();
    global.fetch = db.fetch;
    for (const t of ['', 'abc', jeton(0).slice(0, -1) + (jeton(0).endsWith('A') ? 'B' : 'A'), ML.jetonDestinataire('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0)]) {
      assert.equal((await appel('threadLivraison', ctxLien(), { l: L, t }, true))._status, 403, t);
    }
    assert.ok(jeton(0).length >= 43, 'au moins 256 bits');
  });

  test('révocation par l’admin : l’ancien lien ne marche plus ; le nouveau (envoyé au destinataire) marche', async () => {
    const db = base();
    global.fetch = db.fetch;
    let r = makeRes();
    await ML.adminRevoquerLien({}, r, ctxDe(EXP), { code: 'PP-TEST1234' });
    assert.equal(r._status, 403, 'membre refusé');
    r = makeRes();
    await ML.adminRevoquerLien({}, r, ctxDe(ADMIN, 'admin'), { code: 'pp-test1234', renvoyer: true });
    assert.equal(r._status, 200, JSON.stringify(r._body));
    assert.equal(r._body.nouveau_lien_envoye, true);
    assert.equal((await appel('threadLivraison', ctxLien(), { l: L, t: jeton(0) }, true))._status, 403);
    assert.equal((await appel('threadLivraison', ctxLien(), { l: L, t: jeton(1) }, true))._status, 200);
    const envoi = db.courriels.find((c) => c.type === 'livraison_lien_destinataire');
    assert.equal(envoi.data.to_email, 'dest@exemple.ca');
    assert.ok(envoi.data.lien.includes(encodeURIComponent(jeton(1))));
  });

  test('fermeture 3 jours après la livraison : le lien expire (410) ; un membre ne peut plus écrire ; 2 jours après : permis', async () => {
    let db = base({ statut: 'payee', livre_le: new Date(Date.now() - 4 * JOUR).toISOString(), mis_a_jour_le: new Date(Date.now() - 4 * JOUR).toISOString() });
    global.fetch = db.fetch;
    assert.equal((await appel('threadLivraison', ctxLien(), { l: L, t: jeton(0) }, true))._status, 410);
    assert.equal((await appel('envoyerLivraison', ctxDe(LIV), { livraison_id: L, avec: 'expediteur', body: 'x' }, false))._status, 403);
    const t = await appel('threadLivraison', ctxDe(LIV), { livraison_id: L, avec: 'expediteur' }, false);
    assert.equal(t._body.ferme, true, 'encore lisible par les membres');
    db = base({ statut: 'livre', livre_le: new Date(Date.now() - 2 * JOUR).toISOString(), mis_a_jour_le: new Date(Date.now() - 2 * JOUR).toISOString() });
    global.fetch = db.fetch;
    assert.equal((await appel('envoyerLivraison', ctxLien(), { l: L, t: jeton(0), body: 'Merci !' }, true))._status, 200);
  });

  test('livraison annulée : fermée 3 jours après l’annulation', () => {
    const l = { statut: 'retour_expediteur', mis_a_jour_le: '2026-11-20T12:00:00Z' };
    assert.equal(ML.etatFermetureLivraison(l, new Date('2026-11-23T11:59:00Z')).ferme, false);
    assert.equal(ML.etatFermetureLivraison(l, new Date('2026-11-23T12:00:00Z')).ferme, true);
    assert.equal(ML.etatFermetureLivraison({ statut: 'confirme' }).ferme, false);
  });
});

describe('Signaler et lecture admin (livraisons)', () => {
  test('signalement par le lien → journal + alerte ; admin lit seulement depuis le signalement, avec l’original ; lecture journalisée', async () => {
    const db = base();
    global.fetch = db.fetch;
    await appel('envoyerLivraison', ctxDe(LIV), { livraison_id: L, avec: 'destinataire', body: 'Paie-moi 20 $ comptant, texte au 418 555 1234' }, false);
    const s = await appel('signalerLivraison', ctxLien(), { l: L, t: jeton(0), raison: 'paiement', details: 'Il veut de l’argent' }, true);
    assert.equal(s._status, 200, JSON.stringify(s._body));
    assert.ok(db.courriels.some((c) => c.type === 'admin_critical_alert'));
    // En production, l'id du journal est un uuid (la fausse base donne « id-000… ») : on le remet au vrai format.
    const ev = db.tables.transaction_audit_events.find((e) => e.id === s._body.report_id);
    ev.id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const rid = ev.id;
    let r = makeRes();
    await ML.adminThreadLivraison({}, r, ctxDe(LIV), { report_id: rid });
    assert.equal(r._status, 403, 'membre');
    r = makeRes();
    await ML.adminThreadLivraison({}, r, ctxDe(ADMIN, 'admin'), {});
    assert.equal(r._status, 403, 'sans signalement');
    r = makeRes();
    await ML.adminThreadLivraison({}, r, ctxDe(ADMIN, 'admin'), { report_id: rid });
    assert.equal(r._status, 200);
    assert.match(r._body.messages[0].body, /coordonnées masquées/);
    assert.match(r._body.messages[0].original, /418 555 1234/);
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'messages_lus_admin').length, 1);
    const liste = await ML.signalementsLivraison(CTX);
    assert.equal(liste[0].sorte, 'livraison');
    assert.doesNotMatch(JSON.stringify(liste), /418 555|comptant/, 'la liste ne montre pas le contenu');
  });

  test('raison inconnue : 400', async () => {
    const db = base();
    global.fetch = db.fetch;
    assert.equal((await appel('signalerLivraison', ctxDe(EXP), { livraison_id: L, avec: 'livreur', raison: 'x' }, false))._status, 400);
  });
});

describe('le livreur ne voit plus les coordonnées du destinataire', () => {
  test('serveur : liste du livreur et export de ses données sans téléphone ni courriel du destinataire', () => {
    const s = lire('api/platform.js');
    assert.match(s, /function sansCoordonneesDestinataire\(l\)[\s\S]{0,300}'destinataire_tel', 'destinataire_email', 'telephone_destinataire', 'email_destinataire', 'tel_destinataire'/);
    assert.match(s, /\.\.\.\(roleIn\(ctx\.profile, \['admin'\]\) \? l : sansCoordonneesDestinataire\(l\)\)/);
    assert.match(s, /data\.livraisons_livrees = r2\.ok \? \(await r2\.json\(\)\)\.map\(sansCoordonneesDestinataire\)/);
  });
  test('tableau du livreur : plus de lien tel:, boutons de messagerie à la place', () => {
    const h = lire('membre-livrer.html');
    assert.doesNotMatch(h, /telDestinataire|href="tel:\$\{/);
    assert.match(h, /message-livraison\.html\?l=\$\{encodeURIComponent\(row\.id\)\}&avec=destinataire/);
  });
  test('ancienne messagerie (écriture directe, sans masquage) retirée partout', () => {
    for (const f of fs.readdirSync(path.join(__dirname, '..')).filter((x) => x.endsWith('.html'))) {
      assert.doesNotMatch(lire(f), /\.from\(['"]messages['"]\)/, f);
    }
    // Plan du site, étape 1 : l'ancienne page est retirée ; la redirection est dans vercel.json.
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'messagerie.html')));
    assert.ok(JSON.parse(lire('vercel.json')).redirects.some((r) => r.source === '/messagerie.html' && r.destination === '/message-livraison.html'));
  });
  test('points d’accès du lien : publics (avant la session), limités par adresse IP', () => {
    const s = lire('api/platform.js');
    const i = s.indexOf("endpoint === 'livraison-message-lien-thread'");
    const j = s.indexOf("const session = await getSession(req, sbUrl, sbKey);\n    if (!session) return res.status(401).json({ error: 'Session requise' });");
    assert.ok(i > 0 && j > 0 && i < j);
    assert.match(s.slice(i, i + 600), /checkRateLimit\(`livmsg-lien:ip:/);
  });
  test('courriels : bouton « Écrire au livreur » dans le courriel du code ; avis sans adresse, lien limité au site', () => {
    const { buildEmails } = require('../api/notifier');
    const [c] = buildEmails('code_destinataire', { destinataire_email: 'dest@exemple.ca', recipient_code: '123456', confirm_link: 'https://porteaporte.site/x', lien_messagerie: 'https://porteaporte.site/message-livraison.html?l=1&t=abc' }, 'a@b.c', 'n@b.c', 'PorteàPorte');
    assert.match(c.html, /Écrire au livreur/);
    const [a] = buildEmails('livraison_nouveau_message', { to_email: 'dest@exemple.ca', expediteur_label: 'ton livreur', code_livraison: 'PP-1', lien: 'https://evil.example/phish' }, 'a@b.c', 'n@b.c', 'PorteàPorte');
    assert.doesNotMatch(a.html, /evil\.example/);
    assert.match(a.html, /Tu as un nouveau message de <strong[^>]*>ton livreur/);
  });
});

test('vrai appel au serveur, sans session : le lien personnel ouvre la conversation (pas de 401) ; un faux lien est refusé', async () => {
  process.env.SUPABASE_URL = CTX.sbUrl;
  process.env.SUPABASE_SERVICE_KEY = 'k';
  const db = base();
  global.fetch = db.fetch;
  const platform = require('../api/platform');
  const appelSrv = async (t) => {
    const r = makeRes();
    await platform({ method: 'POST', url: '/api/platform', body: { endpoint: 'livraison-message-lien-thread', l: L, t }, headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' } }, r);
    return r;
  };
  const ok = await appelSrv(jeton(0));
  assert.equal(ok._status, 200, JSON.stringify(ok._body));
  assert.equal(ok._body.moi, 'destinataire');
  assert.equal((await appelSrv('faux'))._status, 403);
});
