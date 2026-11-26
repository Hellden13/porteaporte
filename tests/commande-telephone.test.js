'use strict';
// Partie A (Denis, 26 nov. 2026) : commande téléphonique — création, prix identique au calcul normal,
// Stripe Checkout en mode TEST seulement (faux Stripe), refus non-admin, interrupteur éteint = seul Denis,
// badge requis quand allumé, alerte et notification au paiement, courriel seulement sur clic.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { creerBase, rep, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
  process.env.SITE_URL = 'https://porteaporte.site';
});

const platform = require('../api/platform');
const CT = require('../lib/_commande-telephone');
const C = require('../lib/_codes-livraison');
const { computeDeliveryPrice } = require('../lib/_lib');
const { distanceLivraison } = require('../lib/_distance');
const { prixMinimumTotal } = require('../js/repartition');

const DENIS = '11111111-1111-4111-8111-111111111111';
const LIV = '22222222-2222-4222-8222-222222222222';
const MEMBRE = '33333333-3333-4333-8333-333333333333';
const PROFILS = [
  { id: DENIS, role: 'admin', email: 'admin@courriel-capture.ca', prenom: 'Denis', driver_status: 'verified', email_verified: true },
  { id: LIV, role: 'livreur', email: 'liv@courriel-capture.ca', prenom: 'Liv', driver_status: 'verified', email_verified: true, transport_mode: 'auto' },
  { id: MEMBRE, role: 'expediteur', email: 'm@courriel-capture.ca', prenom: 'Membre', email_verified: true },
];
const jourQc = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
const DEMAIN = jourQc(Date.now() + 86400000);
const COMMANDE = {
  payeur_nom: 'Julie Fille', payeur_email: 'julie@courriel-capture.ca', payeur_tel: '418 555-1234',
  aine_nom: 'Rita Tremblay', adresse_livraison: '12 rue des Érables, app. 3', ville_livraison: 'Lévis', cp_livraison: 'G6V 1A1',
  epicerie_nom: 'IGA Lévis', epicerie_adresse: '100 route du Président-Kennedy', epicerie_ville: 'Lévis', cp_epicerie: 'G6V 6C9',
  commande_no: 'A-4471', date: DEMAIN, heure_debut: '13:00', heure_fin: '15:00', note: '2e étage, petit chien',
  poids_kg: 10, taille: 'moyen', type: 'colis', protection: 'standard', priorite: false, valeur_commande: 120,
};

let db;
beforeEach(() => {
  db = creerBase({ profiles: PROFILS, livraisons: [] });
  db.stripeReponse = (url, m, body) => {
    if (/checkout\/sessions$/.test(url)) {
      const p = new URLSearchParams(body);
      return rep({ id: 'cs_test_' + (db.stripe.length), url: 'https://checkout.stripe.com/c/pay/cs_test_' + db.stripe.length, expires_at: Number(p.get('expires_at')) });
    }
    return rep({ id: 'x', status: 'expired' });
  };
  const base = db.fetch;
  global.fetch = async (url, o = {}) => {
    if (String(url).includes('/auth/v1/user')) {
      const t = String((o.headers && (o.headers.Authorization || o.headers.authorization)) || '').replace('Bearer ', '');
      const p = PROFILS.find((x) => x.id === t);
      return p ? rep({ id: p.id, email: p.email, email_confirmed_at: '2026-01-01T00:00:00Z' }) : rep({}, false, 401);
    }
    return base(url, o);
  };
});

async function appel(qui, endpoint, body = {}) {
  const res = makeRes();
  await platform({ method: 'POST', url: '/api/platform?endpoint=' + endpoint, query: { endpoint }, body: { endpoint, ...body }, headers: { authorization: 'Bearer ' + qui, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' } }, res);
  return res;
}

test('refus non-admin : chaque route de commande téléphonique répond 403 à un membre et à un livreur', async () => {
  for (const ep of ['admin-commande-tel-prix', 'admin-commande-tel-creer', 'admin-commande-tel-liste', 'admin-commande-tel-lien', 'admin-commande-tel-courriel', 'admin-service-aines']) {
    for (const qui of [MEMBRE, LIV]) {
      const r = await appel(qui, ep, { ...COMMANDE, livraison_id: 'aaaaaaaa-0000-4000-8000-000000000001', partage: true });
      assert.equal(r._status, 403, `${ep} par ${qui}`);
    }
  }
  assert.equal(db.tables.livraisons.length, 0);
  assert.equal(db.stripe.length, 0);
});

test('prix : identique au calcul normal (price-estimate + options de create-mission)', async () => {
  const km = distanceLivraison({ ville_depart: 'Lévis', ville_arrivee: 'Lévis', cp_depart: 'G6V 6C9', cp_arrivee: 'G6V 1A1' }).km;
  const info = computeDeliveryPrice({ distance_km: km, weight_kg: 10, size: 'moyen', type: 'colis', urgency: 'flexible' });
  const normal = prixMinimumTotal(info.price_cad);
  const est = await appel(DENIS, 'price-estimate', { ville_depart: 'Lévis', ville_arrivee: 'Lévis', code_postal_depart: 'G6V 6C9', code_postal_arrivee: 'G6V 1A1', poids_kg: 10, taille_colis: 'moyen', type_colis: 'colis', deadline: 'flexible' });
  assert.equal(est._body.suggested_total_cad, normal, 'même calcul que price-estimate');
  const r = await appel(DENIS, 'admin-commande-tel-prix', COMMANDE);
  assert.equal(r._status, 200, JSON.stringify(r._body));
  assert.equal(r._body.prix.livraison, normal);
  assert.equal(r._body.prix.protection, 2.99, 'Standard cochée par défaut');
  assert.equal(r._body.prix.total, Math.round((normal + 2.99) * 100) / 100);
  const p2 = await appel(DENIS, 'admin-commande-tel-prix', { ...COMMANDE, protection: 'base', priorite: true });
  assert.equal(p2._body.prix.total, Math.round((normal + 1 + 5) * 100) / 100, 'options réajustées');
  const plus = await appel(DENIS, 'admin-commande-tel-prix', { ...COMMANDE, protection: 'plus' });
  assert.equal(plus._status, 400, '« Plus » refusé');
});

test('création : livraison au nom de Denis, en attente (invisible), marquée, codes au hasard, lien Checkout de test', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  let r;
  try { r = await appel(DENIS, 'admin-commande-tel-creer', COMMANDE); } finally { console.log = orig; }
  assert.equal(r._status, 200, JSON.stringify(r._body));
  const l = db.tables.livraisons[0];
  assert.equal(l.expediteur_id, DENIS);
  assert.equal(l.statut, 'en_attente', 'pas visible des livreurs avant le paiement');
  assert.ok(l.admin_note.startsWith('📞 Commande téléphonique'));
  assert.equal(r._body.titre, '📞 Rita Tremblay — IGA Lévis → 12 rue des Érables');
  assert.ok(l.description.startsWith(r._body.titre));
  assert.equal(l.assurance_plan, 'standard');
  assert.equal(l.destinataire_nom, 'Rita Tremblay');
  assert.equal(l.reception_note_livreur, '2e étage, petit chien');
  assert.equal(Number(l.prix_total), r._body.prix.total);
  // Codes au hasard, hachés à clé, montrés dans l'admin.
  assert.match(r._body.code_reception, /^\d{6}$/);
  assert.ok(C.codeCorrespond('reception', r._body.code_reception, l.id, l.recipient_confirmation_hash));
  assert.ok(C.codeCorrespond('ramassage', r._body.code_ramassage, l.id, l.pickup_code_hash));
  // Journal : marquage, courriel et cellulaire CHIFFRÉS.
  const ev = db.tables.transaction_audit_events.find((e) => e.event_type === 'commande_telephonique');
  assert.ok(ev);
  const brut = JSON.stringify(ev.evidence);
  assert.ok(!brut.includes('julie@') && !brut.includes('4185551234'), 'contact du payeur chiffré');
  assert.equal(C.dechiffrer(ev.evidence.payeur_email_c), 'julie@courriel-capture.ca');
  // Stripe Checkout (faux Stripe, clé de TEST) : capture manuelle, métadonnées, 24 h au plus.
  assert.ok(process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'));
  const s = db.stripe.find((x) => /checkout\/sessions$/.test(x.url));
  const p = new URLSearchParams(s.body);
  assert.equal(p.get('mode'), 'payment');
  assert.equal(p.get('payment_intent_data[capture_method]'), 'manual');
  assert.equal(p.get('payment_intent_data[metadata][livraison_id]'), l.id);
  assert.equal(p.get('payment_intent_data[metadata][source]'), 'telephone');
  assert.equal(p.get('payment_intent_data[metadata][expediteur_id]'), DENIS);
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), String(Math.round(r._body.prix.total * 100)));
  assert.equal(p.get('customer_email'), 'julie@courriel-capture.ca');
  assert.ok(Number(p.get('expires_at')) <= Math.floor(Date.now() / 1000) + 24 * 3600);
  assert.ok(!s.body.includes('card[number]') && !s.body.includes('payment_method_data'), 'aucune carte saisie dans l’admin');
  assert.match(r._body.lien.url, /^https:\/\/checkout\.stripe\.com\//);
  // Aucun courriel envoyé à la création ; aucun courriel ni téléphone dans les journaux.
  assert.equal(db.courriels.filter((c) => c.type === 'commande_tel_lien_paiement').length, 0);
  assert.ok(!logs.join('\n').match(/julie@|555-1234|4185551234/), 'journaux propres');
});

test('validation serveur : champs requis, payeur joignable, plage horaire, au plus 5 jours avant', async () => {
  const cas = [
    [{ payeur_nom: '' }, 'payeur_nom'], [{ payeur_email: '', payeur_tel: '' }, 'payeur_email'],
    [{ payeur_email: 'pas-un-courriel' }, 'payeur_email'], [{ payeur_tel: '123' }, 'payeur_tel'],
    [{ aine_nom: '' }, 'aine_nom'], [{ commande_no: '' }, 'commande_no'], [{ epicerie_nom: '' }, 'epicerie_nom'],
    [{ heure_debut: '15:00', heure_fin: '13:00' }, 'heure_debut'],
    [{ date: jourQc(Date.now() + 6 * 86400000) }, 'date'], [{ date: jourQc(Date.now() - 86400000) }, 'date'],
    [{ poids_kg: 99 }, 'poids_kg'], [{ protection: 'plus' }, 'protection'], [{ valeur_commande: '' }, 'valeur_commande'],
  ];
  for (const [modif, champ] of cas) {
    const r = await appel(DENIS, 'admin-commande-tel-creer', { ...COMMANDE, ...modif });
    assert.equal(r._status, 400, JSON.stringify(modif));
    assert.equal(r._body.champ, champ, JSON.stringify(modif));
  }
  assert.equal(db.tables.livraisons.length, 0);
});

test('nouveau lien : l’ancien est fermé chez Stripe ; refusé une fois payé', async () => {
  const r = await appel(DENIS, 'admin-commande-tel-creer', COMMANDE);
  const id = r._body.livraison_id;
  const n = await appel(DENIS, 'admin-commande-tel-lien', { livraison_id: id });
  assert.equal(n._status, 200, JSON.stringify(n._body));
  assert.notEqual(n._body.lien.url, r._body.lien.url);
  assert.ok(db.stripe.some((x) => x.url.endsWith(`/checkout/sessions/${r._body.lien.session_id}/expire`)));
  db.tables.livraisons[0].statut = 'paiement_autorise';
  assert.equal((await appel(DENIS, 'admin-commande-tel-lien', { livraison_id: id }))._status, 409);
});

test('courriel : seulement sur clic, au payeur, avec la phrase checkout.stripe.com', async () => {
  const r = await appel(DENIS, 'admin-commande-tel-creer', COMMANDE);
  const c = await appel(DENIS, 'admin-commande-tel-courriel', { livraison_id: r._body.livraison_id });
  assert.equal(c._status, 200, JSON.stringify(c._body));
  assert.equal(c._body.envoye_a, 'ju…@courriel-capture.ca');
  const m = db.courriels.filter((x) => x.type === 'commande_tel_lien_paiement');
  assert.equal(m.length, 1);
  assert.equal(m[0].data.to, 'julie@courriel-capture.ca');
  const { buildEmails } = require('../api/notifier');
  const [mail] = buildEmails('commande_tel_lien_paiement', m[0].data, 'a@x.ca', 'f@x.ca', 'PorteàPorte');
  assert.match(mail.html, /Le paiement se fait seulement sur checkout\.stripe\.com, jamais par téléphone ni par texto\./);
  assert.match(mail.html, /prélevé <strong>après la livraison<\/strong>/);
});

test('liste admin : titre, payeur, statut, codes, lien valide', async () => {
  await appel(DENIS, 'admin-commande-tel-creer', COMMANDE);
  const r = await appel(DENIS, 'admin-commande-tel-liste');
  assert.equal(r._status, 200);
  const c = r._body.commandes[0];
  assert.equal(c.titre, '📞 Rita Tremblay — IGA Lévis → 12 rue des Érables');
  assert.equal(c.statut, 'en_attente');
  assert.equal(c.payeur_email, 'julie@courriel-capture.ca');
  assert.match(c.code_reception, /^\d{6}$/);
  assert.match(c.lien.url, /checkout\.stripe\.com/);
  assert.equal(r._body.reglage.partage, false, 'éteint par défaut');
});

test('interrupteur éteint : seul Denis peut prendre la commande ; refus serveur pour un autre livreur', async () => {
  const r = await appel(DENIS, 'admin-commande-tel-creer', COMMANDE);
  const l = { ...db.tables.livraisons[0], statut: 'paiement_autorise' };
  db.tables.livraisons[0].statut = 'paiement_autorise';
  assert.equal(await CT.peutPrendre({ sbUrl: 'https://fake.supabase.co', sbKey: 'k' }, l, DENIS), true);
  assert.equal(await CT.peutPrendre({ sbUrl: 'https://fake.supabase.co', sbKey: 'k' }, l, LIV), false);
  const a = await appel(LIV, 'assign-driver', { livraison_id: r._body.livraison_id, livreur_id: LIV });
  assert.equal(a._status, 403);
  assert.equal(a._body.code, 'service_aines_reserve');
  const b = await appel(DENIS, 'assign-driver', { livraison_id: r._body.livraison_id, livreur_id: LIV });
  assert.equal(b._body.code, 'service_aines_reserve', 'même l’admin ne peut pas l’assigner à un livreur non permis');
  assert.equal(db.tables.livraisons[0].livreur_id, undefined);
  // Une livraison normale n'est pas touchée par la règle.
  assert.equal(await CT.peutPrendre({ sbUrl: 'https://fake.supabase.co', sbKey: 'k' }, { admin_note: null, expediteur_id: MEMBRE }, LIV), true);
});

test('interrupteur allumé : badge « Approuvé service aux aînés » requis (accordé par l’admin seulement)', async () => {
  const r = await appel(DENIS, 'admin-commande-tel-creer', COMMANDE);
  db.tables.livraisons[0].statut = 'paiement_autorise';
  const ctx = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
  assert.equal((await appel(DENIS, 'admin-service-aines', { partage: true }))._body.reglage.partage, true);
  assert.equal(await CT.peutPrendre(ctx, db.tables.livraisons[0], LIV), false, 'sans badge');
  assert.equal((await appel(LIV, 'admin-service-aines', { livreur_id: LIV, accorde: true }))._status, 403, 'un livreur ne se l’accorde pas');
  const g = await appel(DENIS, 'admin-service-aines', { livreur_id: LIV, accorde: true });
  assert.ok(g._body.livreurs.find((x) => x.id === LIV).approuve);
  assert.equal(await CT.peutPrendre(ctx, db.tables.livraisons[0], LIV), true, 'avec badge');
  await appel(DENIS, 'admin-service-aines', { partage: false });
  assert.equal(await CT.peutPrendre(ctx, db.tables.livraisons[0], LIV), false, 'éteint de nouveau : seul Denis');
  const a = await appel(LIV, 'assign-driver', { livraison_id: r._body.livraison_id, livreur_id: LIV });
  assert.equal(a._body.code, 'service_aines_reserve');
});

test('au paiement (webhook) : alerte [PP-ALERTE] Livraison une seule fois, notification seulement aux livreurs permis', async () => {
  const r = await appel(DENIS, 'admin-commande-tel-creer', COMMANDE);
  const ctx = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
  const pushes = [];
  const deliverPush = async (_c, b) => { pushes.push(b.user_id); return { ok: true }; };
  const a = await CT.apresPaiementCommande(ctx, r._body.livraison_id, { deliverPush });
  assert.equal(a.fait, true);
  assert.deepEqual(pushes, [DENIS], 'interrupteur éteint : seulement Denis');
  const alertes = db.courriels.filter((c) => c.type === 'admin_critical_alert');
  assert.equal(alertes.length, 1);
  assert.match(alertes[0].data.subject, /Nouvelle livraison payée/);
  assert.equal(alertes[0].data.title, '📞 Rita Tremblay — IGA Lévis → 12 rue des Érables');
  const b = await CT.apresPaiementCommande(ctx, r._body.livraison_id, { deliverPush });
  assert.equal(b.fait, false, 'une seule fois si Stripe renvoie l’événement');
  assert.equal(db.courriels.filter((c) => c.type === 'admin_critical_alert').length, 1);
  // À la création : aucune alerte, aucune notification.
  const src = fs.readFileSync('lib/_commande-telephone.js', 'utf8');
  assert.ok(!/deliverPush|alertAdmin\(/.test(src.slice(src.indexOf('async function creerCommande'), src.indexOf('// ── Liste admin'))));
  assert.match(fs.readFileSync('api/stripe-webhook.js', 'utf8'), /if \(obj\.metadata\?\.source === 'telephone'\) \{[\s\S]*apresPaiementCommande\(/);
});

test('page admin et retour de paiement : protégées / sans carte / phrase anti-fraude', () => {
  const h = fs.readFileSync('admin/commandes-telephoniques.html', 'utf8');
  assert.match(h, /AUTH_API\.requireAuth\('admin'\)/);
  assert.doesNotMatch(h, /<input[^>]*(cc-number|card)/i, 'aucun champ de carte');
  assert.match(h, /Créer et générer le lien de paiement/);
  assert.match(h, /Générer un nouveau lien/);
  assert.match(h, /<option value="standard" selected>/);
  assert.match(h, /id="poids_kg" type="number" min="0.5" max="30" step="0.5" value="10"/);
  assert.match(h, /<option value="moyen" selected>/);
  assert.match(fs.readFileSync('paiement-recu.html', 'utf8'), /Le paiement se fait seulement sur checkout\.stripe\.com, jamais par téléphone ni par texto\./);
  assert.match(fs.readFileSync('admin/dashboard-admin.html', 'utf8'), /href="\/admin\/commandes-telephoniques\.html"/);
});
