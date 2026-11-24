// tests/decisions-denis.test.js — Décisions de Denis 1 à 9 (fix-test-complet) et points 41 à 43.
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const R = require('../js/repartition');
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
const U = '55555555-5555-4555-8555-555555555555';
const PROD = { pct_livreur: 60, pct_communaute: 2, pct_protection: 8, pct_urgence: 15, pct_developpement: 1.6, pct_marketing: 2, pct_operations: 5, pct_profit: 3, pct_stripe: 3.4 };
const REDIST_PROD = [{ key: 'operations', pct: 30, label: 'Frais & opérations' }, { key: 'securite', pct: 35, label: 'Fond de sécurité' }, { key: 'dons', pct: 25, label: 'Dons organismes' }, { key: 'developpeur', pct: 10, label: 'Développeur' }];
const somme = (rep) => rep.lignes.reduce((t, l) => t + l.cents, 0);
const lire = (f) => fs.readFileSync(f, 'utf8');
const payees = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, livreur_id: U, statut: 'payee', ...extra }));

describe('1. fidélité : 60 % exact au départ, bonus seulement après 10 livraisons payées', () => {
  const { calculerBonusFidelite } = require('../lib/_fidelite');
  const profil = { id: U, cree_le: '2024-01-01T00:00:00Z', loyalty_bonus_manual: 0 };
  const cas = [[0, 0], [1, 0], [9, 0], [10, 4], [49, 4], [50, 6]];
  for (const [n, attendu] of cas) {
    test(`${n} livraisons payées, fiabilité 100, 3 badges, 2 ans de membre → +${attendu}`, async () => {
      const db = creerBase({ livraisons: payees(n), v_user_fiabilite: [{ id: U, score: 100 }], user_badges: [{ user_id: U }, { user_id: U }, { user_id: U }] });
      global.fetch = db.fetch;
      assert.equal((await calculerBonusFidelite(CTX, profil)).bonus, attendu);
    });
  }
  test('une livraison « livre » non payée ne compte pas', async () => {
    const db = creerBase({ livraisons: payees(10, { statut: 'livre' }), v_user_fiabilite: [{ id: U, score: 100 }] });
    global.fetch = db.fetch;
    assert.equal((await calculerBonusFidelite(CTX, profil)).bonus, 0);
  });
  test('10 $ pour un nouveau livreur : 6,00 $ exact (le +2 automatique d\'avant a disparu)', async () => {
    const db = creerBase({ livraisons: payees(1), v_user_fiabilite: [{ id: U, score: 100 }] });
    global.fetch = db.fetch;
    const b = (await calculerBonusFidelite(CTX, profil)).bonus;
    assert.equal(R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD, fidelitePct: b }).livreurCents, 600);
  });
});

describe('2-3-5. bonus éco, bonus de groupe et plans Pro : abandonnés / fermés', () => {
  test('le prix du covoiturage n\'applique jamais de rabais de groupe (le conducteur garde sa part)', () => {
    const { calcRidePrice } = require('../lib/_rides');
    const base = { totalDistanceKm: 100, passengerDistanceKm: 100, costPerKm: 0.2, seats: 1, totalSeats: 4 };
    const seul = calcRidePrice({ ...base, confirmedPassengers: 0 });
    const plein = calcRidePrice({ ...base, confirmedPassengers: 4 });
    assert.equal(plein.driverAmount, seul.driverAmount);
    assert.equal(plein.totalPassenger, seul.totalPassenger);
    assert.match(lire('lib/_rides.js'), /group_discount: null, \/\/ bonus de groupe abandonné/);
  });
  test('aucun bonus éco dans le paiement ni à l\'écran', () => {
    assert.doesNotMatch(lire('lib/_fidelite.js'), /eco_bonus/);
    assert.doesNotMatch(lire('kyc.html'), /bonus écologique est actif|\+\$\{m\.eco\}% bonus écologique actif/);
  });
  test('plans Pro : toujours fermés', () => {
    assert.match(lire('lib/_connect.js'), /PAP_PLANS_PRO_OUVERTS !== 'oui'/);
    assert.doesNotMatch(lire('abonnements.html'), /onclick="subscribe\(/);
  });
});

describe('4. niveaux : seul avantage = meilleur classement dans la recherche dès le niveau 2', () => {
  const { niveauDeuxOuPlus, classementRecherche } = require('../lib/_rides');
  test('niveau 2 = 200 XP', () => {
    assert.equal(niveauDeuxOuPlus({ xp: 199 }), false);
    assert.equal(niveauDeuxOuPlus({ xp: 200 }), true);
  });
  test('un conducteur de niveau 2 passe devant à pertinence presque égale', () => {
    const liste = [{ id: 'a', match_score: 75, niveau_2_plus: false }, { id: 'b', match_score: 70, niveau_2_plus: true }, { id: 'c', match_score: 90, niveau_2_plus: false }];
    liste.sort((x, y) => classementRecherche(y) - classementRecherche(x));
    assert.deepEqual(liste.map((x) => x.id), ['c', 'b', 'a']);
  });
  test('la recherche trie avec ce classement, l\'affichage le dit tel quel', () => {
    const src = lire('lib/_rides.js');
    assert.match(src, /enriched\.sort\(\(a, b\) => classementRecherche\(b\) - classementRecherche\(a\)\);/);
    assert.match(src, /photo_visible_to_others,xp`/);
    assert.match(lire('programme-points.html'), /200 XP requis · meilleur classement dans les résultats de recherche du covoiturage/);
    assert.match(lire('lib/_growth.js'), /benefit: 'Meilleur classement dans les résultats de recherche du covoiturage\.'/);
  });
});

describe('6. versements trimestriels approuvés par Denis (aucun virement automatique)', () => {
  const V = require('../lib/_versements');
  const ev = (quand, sorte, lignes) => ({ event_type: 'repartition_capturee', created_at: quand, evidence: { sorte, lignes } });
  function base() {
    return creerBase({
      profiles: [{ id: 'adm', role: 'admin' }],
      transaction_audit_events: [
        ev('2026-08-10T15:00:00Z', 'livraison', [{ poste: 'communaute', cents: 19 }, { poste: 'urgence', cents: 140 }]),
        ev('2026-09-30T15:00:00Z', 'livraison', [{ poste: 'communaute', cents: 19 }, { poste: 'urgence', cents: 140 }]),
        ev('2026-09-12T15:00:00Z', 'covoiturage', [{ poste: 'dons', label: 'Dons organismes', cents: 28 }, { poste: 'securite', cents: 39 }]),
        ev('2026-11-20T15:00:00Z', 'livraison', [{ poste: 'communaute', cents: 19 }, { poste: 'urgence', cents: 140 }]),
        ev('2026-09-01T15:00:00Z', 'annulation_livraison', [{ poste: 'fonds_securite', cents: 50 }]),
      ],
    });
  }
  test('trimestre du Québec (heure de Toronto) et trimestre terminé', () => {
    assert.equal(V.trimestreDe('2026-10-01T03:00:00Z'), '2026-T3', '30 sept. 23 h au Québec');
    assert.equal(V.trimestreDe('2026-10-01T05:00:00Z'), '2026-T4');
    assert.equal(V.trimestreTermine('2026-T3', new Date('2026-11-22T12:00:00Z')), true);
    assert.equal(V.trimestreTermine('2026-T4', new Date('2026-11-22T12:00:00Z')), false);
  });
  test('montants du journal : organismes = communauté + dons ; fonds d\'urgence = urgence', async () => {
    const db = base();
    global.fetch = db.fetch;
    const e = await V.etatVersements(CTX, new Date('2026-11-22T12:00:00Z'));
    const t = (tr, p) => e.versements.find((x) => x.trimestre === tr && x.poste === p);
    assert.equal(t('2026-T3', 'organismes').montant_cents, 19 + 19 + 28);
    assert.equal(t('2026-T3', 'urgence').montant_cents, 280);
    assert.equal(t('2026-T3', 'organismes').statut, 'a_approuver');
    assert.equal(t('2026-T4', 'urgence').statut, 'en_cours');
  });
  test('approuver : admin seulement, trimestre terminé seulement, une seule fois, trace au journal, aucun appel Stripe', async () => {
    const db = base();
    global.fetch = db.fetch;
    const appel = async (profile, body) => { const res = makeRes(); await V.adminVersementApprouver({}, res, { ...CTX, session: { id: 'adm' }, profile }, body); return res; };
    assert.equal((await appel({ role: 'livreur' }, { trimestre: '2026-T3', poste: 'organismes' }))._status, 403);
    const enCours = V.trimestreDe(new Date().toISOString());
    assert.equal((await appel({ role: 'admin' }, { trimestre: enCours, poste: 'urgence' }))._status, 409);
    const [a, b] = await Promise.all([appel({ role: 'admin' }, { trimestre: '2026-T3', poste: 'organismes', note: 'Moisson' }), appel({ role: 'admin' }, { trimestre: '2026-T3', poste: 'organismes' })]);
    assert.deepEqual([a._status, b._status].sort(), [200, 409]);
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'versement_approuve').length, 1);
    const ap = db.tables.transaction_audit_events.find((e) => e.event_type === 'versement_approuve');
    assert.equal(ap.amount_cents, 66);
    assert.equal(ap.user_id, 'adm', 'qui a approuvé');
    assert.equal(db.stripe.length, 0, 'aucun virement automatique');
    const pub = await V.versementsApprouvesPublics(CTX);
    assert.deepEqual(pub.map((x) => [x.trimestre, x.poste, x.montant_cents]), [['2026-T3', 'organismes', 66]]);
  });
  test('écran admin et page Transparence', () => {
    const adm = lire('admin/dashboard-admin.html');
    assert.match(adm, /Versements à approuver/);
    assert.match(adm, /endpoint=admin-versement-approuver/);
    assert.match(adm, /aucun virement automatique/);
    assert.match(lire('transparence.html'), /impact\.versements_approuves/);
    assert.match(lire('api/platform.js'), /publicState\.versements_approuves = await versementsApprouvesPublics\(ctx\)/);
  });
});

describe('7. badges zéro retard, pionnier, auto pleine', () => {
  const REC = require('../lib/_recompenses');
  const B = ['zero_retard', 'pionnier', 'auto_pleine', 'premiere_livraison', 'livreur_fiable', 'fondateur_livreur', 'premier_trajet_cov'].map((slug, i) => ({ id: `b${i}`, slug, xp_reward: 10, points_reward: 1, active: true }));
  // 17 h 30 au Québec (heure normale, UTC−5) : avant la fin de plage de 18 h ; 18 h 30 : après.
  const aLHeure = (i) => ({ id: `z${i}`, livreur_id: U, statut: 'payee', livre_le: `2026-11-${String(10 + i).padStart(2, '0')}T22:30:00Z`, destinataire_dispo_fin: '18:00:00' });
  const enRetard = (i) => ({ id: `r${i}`, livreur_id: U, statut: 'payee', livre_le: `2026-11-${String(10 + i).padStart(2, '0')}T23:30:00Z`, destinataire_dispo_fin: '18:00:00' });
  test('heure du Québec : 17 h 30 à l\'heure, 18 h 30 en retard ; date souhaitée dépassée = en retard', () => {
    assert.equal(REC.livreeALHeure(aLHeure(1)), true);
    assert.equal(REC.livreeALHeure(enRetard(1)), false);
    assert.equal(REC.livreeALHeure({ ...aLHeure(1), date_souhaitee: '2026-11-10' }), false);
    assert.equal(REC.livreeALHeure({ livre_le: '2026-11-11T15:00:00Z' }), null, 'sans plage : pas comptée');
  });
  const cas = [
    ['10 livraisons de suite à l\'heure → zéro retard', Array.from({ length: 10 }, (_, i) => aLHeure(i)), true],
    ['9 seulement → non', Array.from({ length: 9 }, (_, i) => aLHeure(i)), false],
    ['5 à l\'heure, 1 en retard, 5 à l\'heure → non (la série recommence)', [...[0, 1, 2, 3, 4].map(aLHeure), enRetard(5), ...[6, 7, 8, 9, 10].map(aLHeure)], false],
    ['1 en retard puis 10 à l\'heure → oui', [enRetard(0), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(aLHeure)], true],
  ];
  for (const [nom, livs, attendu] of cas) {
    test(nom, async () => {
      const db = creerBase({ badges: B, profiles: [{ id: U, xp: 0 }], livraisons: livs, user_badges: [] });
      global.fetch = db.fetch;
      const r = await REC.verifierBadgesAuto(CTX, U);
      assert.equal(r.donnes.includes('zero_retard'), attendu);
    });
  }
  test('pionnier : les 50 premiers membres avec une transaction payée (peu importe le rôle), pas le 51e', async () => {
    const autres = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, expediteur_id: `e${String(i).padStart(2, '0')}`, statut: 'payee', livre_le: `2026-09-01T00:${String(i).padStart(2, '0')}:00Z` }));
    let db = creerBase({ badges: B, profiles: [{ id: U, xp: 0 }], livraisons: [...autres, { id: 'moi', livreur_id: U, statut: 'payee', livre_le: '2026-11-01T00:00:00Z' }], user_badges: [] });
    global.fetch = db.fetch;
    assert.ok(!(await REC.verifierBadgesAuto(CTX, U)).donnes.includes('pionnier'), '51e');
    db = creerBase({ badges: B, profiles: [{ id: U, xp: 0 }], livraisons: [...autres.slice(0, 49), { id: 'moi', livreur_id: U, statut: 'payee', livre_le: '2026-11-01T00:00:00Z' }], user_badges: [] });
    global.fetch = db.fetch;
    assert.ok((await REC.verifierBadgesAuto(CTX, U)).donnes.includes('pionnier'), '50e');
  });
  test('pionnier : un trajet payé compte aussi (passager)', async () => {
    const db = creerBase({ badges: B, profiles: [{ id: U, xp: 0 }], ride_bookings: [{ id: 'k', passenger_id: U, ride_id: 'r1', status: 'paye', paid_at: '2026-10-01T00:00:00Z' }], rides: [{ id: 'r1', driver_id: 'd' }], user_badges: [] });
    global.fetch = db.fetch;
    assert.ok((await REC.verifierBadgesAuto(CTX, U)).donnes.includes('pionnier'));
  });
  test('auto pleine : toutes les places payées sur un même trajet', async () => {
    const trajet = (payees) => creerBase({ badges: B, profiles: [{ id: U, xp: 0 }], rides: [{ id: 'r1', driver_id: U, total_distance_km: 20, total_seats: 3 }], ride_bookings: [
      { id: 'a', ride_id: 'r1', status: 'paye', seats_reserved: 2, paid_at: '2026-10-01T00:00:00Z' },
      { id: 'b', ride_id: 'r1', status: payees ? 'paye' : 'confirme', seats_reserved: 1, paid_at: '2026-10-01T00:00:00Z' },
    ], user_badges: [] });
    let db = trajet(true);
    global.fetch = db.fetch;
    assert.ok((await REC.verifierBadgesAuto(CTX, U)).donnes.includes('auto_pleine'));
    db = trajet(false);
    global.fetch = db.fetch;
    assert.ok(!(await REC.verifierBadgesAuto(CTX, U)).donnes.includes('auto_pleine'), '2 places sur 3 payées');
  });
  test('réaffichés avec la condition exacte', () => {
    const h = lire('programme-points.html');
    assert.match(h, /Zéro retard<\/div><div class="badge-desc">10 livraisons de suite livrées avant la fin de la plage horaire choisie par l’expéditeur\./);
    assert.match(h, /Pionnier<\/div><div class="badge-desc">Parmi les 50 premiers membres à avoir une transaction payée\./);
    assert.match(h, /Auto pleine<\/div><div class="badge-desc">Toutes les places payées sur un même trajet\./);
  });
});

describe('8. prime de protection : 100 % au fonds de protection, hors des 60 % du livreur', () => {
  test('livraison de 10 $ + protection Standard (2,99 $) = 12,99 $ : livreur 6,00 $, prime 2,99 $ au fonds, total exact', () => {
    const rep = R.repartitionLivraison({ montantPayeCents: 1299, settings: PROD, planProtection: 'standard' });
    const l = (p) => rep.lignes.find((x) => x.poste === p).cents;
    assert.equal(l('livreur'), 600);
    assert.equal(l('prime_protection'), 299);
    assert.equal(l('stripe'), 68);
    assert.deepEqual(rep.lignes.map((x) => [x.poste, x.cents]), [['livreur', 600], ['stripe', 68], ['prime_protection', 299], ['protection', 73], ['urgence', 136], ['communaute', 18], ['developpement', 15], ['marketing', 18], ['operations', 45], ['profit', 27]]);
    assert.equal(somme(rep), 1299);
  });
  test('sans protection : rien ne change (10 $ → livreur 6,00 $, pas de ligne prime)', () => {
    const rep = R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD, planProtection: 'none' });
    assert.equal(rep.livreurCents, 600);
    assert.ok(!rep.lignes.some((x) => x.poste === 'prime_protection'));
  });
  test('au cent près pour tous les plans, prix, rabais et fidélités', () => {
    for (const plan of ['none', 'base', 'standard', 'plus', 'inconnu', null]) {
      for (const paye of [50, 100, 599, 1000, 1299, 2599, 10000]) {
        for (const rabais of [0, 300]) {
          for (const f of [0, 4]) {
            const rep = R.repartitionLivraison({ montantPayeCents: paye, rabaisCents: rabais, settings: PROD, planProtection: plan, fidelitePct: f });
            assert.equal(somme(rep), paye);
            const prime = Math.min(paye + rabais, R.primeProtectionCents(plan));
            assert.equal(rep.livreurCents, R.gainLivreurCents(paye + rabais - prime, { fidelitePct: f }).netCents);
          }
        }
      }
    }
  });
  test('mêmes primes partout : paiement, formulaire, « Tu gagnes » du navigateur', () => {
    const win = {};
    vm.runInNewContext(lire('js/gain-livreur.js'), { window: win, Math, Number, String, Object });
    assert.equal(JSON.stringify(win.PAPGain.PRIMES_PROTECTION_CENTS), JSON.stringify(R.PRIMES_PROTECTION_CENTS));
    const m = lire('create-mission.html').match(/const INSURANCE_PLANS=\{none:\{premium:0[^;]*base:\{premium:([\d.]+)[^;]*standard:\{premium:([\d.]+)[^;]*plus:\{premium:([\d.]+)/);
    assert.deepEqual(m.slice(1).map((x) => Math.round(Number(x) * 100)), [100, 299, 599]);
    assert.equal(win.PAPGain.texte(12.99, { planProtection: 'standard' }), '6,00 $');
    assert.equal(win.PAPGain.texte(10), '6,00 $');
  });
  test('capture réelle : le virement au livreur est 6,00 $ sur 12,99 $ avec protection Standard', async () => {
    const LIVREUR = '22222222-2222-4222-8222-222222222222';
    const db = creerBase({ platform_settings: [{ id: 'default', ...PROD }], impact_settings: [{ id: 'default' }], profiles: [{ id: LIVREUR, cree_le: '2026-10-01' }], stripe_connect_accounts: [{ user_id: LIVREUR, stripe_account_id: 'acct', status: 'active' }], promo_code_uses: [], livraisons: [] });
    db.stripeReponse = (url) => (url.includes('/v1/charges/') ? { ok: true, status: 200, json: async () => ({ balance_transaction: { fee: 68 } }) } : { ok: true, status: 200, json: async () => ({ id: 'tr' }) });
    global.fetch = db.fetch;
    const { apresCaptureLivraison } = require('../lib/_apres-capture');
    const r = await apresCaptureLivraison({ ...CTX, stripeKey: 'sk' }, { id: 'L', livreur_id: LIVREUR, expediteur_id: 'e', assurance_plan: 'standard' }, { id: 'pi', amount_received: 1299, currency: 'cad', latest_charge: 'ch' });
    assert.equal(r.netCents, 600);
    assert.match(db.stripe.find((s) => s.url.endsWith('/v1/transfers')).body, /amount=600&/);
    const j = db.tables.transaction_audit_events.find((e) => e.event_type === 'repartition_capturee');
    assert.ok(j.evidence.lignes.some((l) => l.poste === 'prime_protection' && l.cents === 299));
  });
  test('le fonds de protection compte la prime (Transparence) et les 2 chemins de capture transmettent le plan', () => {
    const plat = lire('api/platform.js');
    assert.match(plat, /p\.poste === 'prime_protection'/);
    assert.match(plat, /livraison_protection: repartitionLivraisonCalc\(\{ montantPayeCents: 1299, settings, planProtection: 'standard' \}\)/);
    assert.match(plat, /rescue_livreur_original,rescue_bonus_pct,assurance_plan`/);
    assert.match(lire('lib/_apres-capture.js'), /planProtection: livraison\.assurance_plan,/);
    assert.match(lire('transparence.html'), /lignesRepartition\(ex\.livraison_protection\)/);
  });
});

describe('9. annulations au journal (livraison et covoiturage), incluses dans Transparence', () => {
  const J = require('../lib/_repartition-journal');
  test('répartition d\'une annulation : remboursement + dédommagement + fonds + Stripe = montant, au cent près', () => {
    for (const [tot, remb, dedo, fonds] of [[1000, 900, 80, 20], [1000, 500, 450, 50], [1000, 1000, 0, 0], [288, 144, 115, 29], [288, 0, 259, 29]]) {
      const a = R.repartitionAnnulation({ totalCents: tot, remboursementCents: remb, dedommagementCents: dedo, fondsCents: fonds });
      assert.equal(somme(a), tot, `${tot} ${remb}`);
      assert.equal(a.lignes.find((l) => l.poste === 'remboursement').cents, remb);
    }
    const toutRendu = R.repartitionAnnulation({ totalCents: 1000, remboursementCents: 1000 });
    assert.equal(toutRendu.lignes.find((l) => l.poste === 'stripe'), undefined, 'rien de gardé : pas de frais');
  });
  test('écrite une seule fois par annulation', async () => {
    const db = creerBase();
    global.fetch = db.fetch;
    const args = { sorte: 'annulation_livraison', refId: 'L1', totalCents: 1000, remboursementCents: 500, dedommagementCents: 450, fondsCents: 50 };
    await Promise.all([J.enregistrerAnnulation(CTX, args), J.enregistrerAnnulation(CTX, args)]);
    const ev = db.tables.transaction_audit_events.filter((e) => e.event_type === 'repartition_capturee');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].evidence.sorte, 'annulation_livraison');
    assert.equal(ev[0].evidence.lignes.reduce((t, l) => t + l.cents, 0), 1000);
  });
  test('branché : annulation de livraison, annulation passager, conducteur qui annule, remboursement admin', () => {
    assert.match(lire('api/cancel-livraison.js'), /await enregistrerAnnulation\(\{ sbUrl: SB_URL, sbKey: SB_KEY \}, \{\s*sorte: 'annulation_livraison'/);
    const rides = lire('lib/_rides.js');
    assert.match(rides, /sorte: 'annulation_covoiturage', refId: b\.id/);
    assert.equal((rides.match(/await journalRemboursementComplet\(ctx, booking, pi, '(autorisation_liberee|rembourse)'\);/g) || []).length, 2);
    assert.match(lire('api/platform.js'), /sorte: 'annulation_livraison', refId: `\$\{livraisonId\}:remboursement-admin:/);
  });
  test('Transparence : les annulations ont leurs totaux à part (un remboursement n\'est pas un paiement gardé), le fonds compte leur part', async () => {
    const platform = require('../api/platform');
    const l10 = R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD }).lignes.map(({ poste, label, cents }) => ({ poste, label, cents }));
    const an = R.repartitionAnnulation({ totalCents: 1000, remboursementCents: 500, dedommagementCents: 450, fondsCents: 50 }).lignes.map(({ poste, label, cents }) => ({ poste, label, cents }));
    const db = creerBase({
      platform_settings: [{ id: 'default', ...PROD, profit_to_insurance: true }],
      impact_settings: [{ id: 'default', ride_redistribution: REDIST_PROD, ride_platform_fee: 1.5 }],
      transaction_audit_events: [
        { event_type: 'repartition_capturee', amount_cents: 1000, evidence: { sorte: 'livraison', lignes: l10 } },
        { event_type: 'repartition_capturee', amount_cents: 1000, evidence: { sorte: 'annulation_livraison', lignes: an } },
      ],
    });
    global.fetch = db.fetch;
    const res = makeRes();
    await platform({ method: 'GET', url: '/api/platform?endpoint=impact-public', query: { endpoint: 'impact-public' }, headers: {}, body: {} }, res);
    const j = res._body.impact.repartition_reelle;
    assert.equal(j.paiements, 1);
    assert.equal(j.montant_cents, 1000);
    assert.equal(j.annulation_livraison.paiements, 1);
    assert.equal(j.postes['annulation_livraison:remboursement'].cents, 500);
    assert.equal(res._body.protection_fund.from_deliveries_cents, 74 + 28 + 50);
    assert.match(lire('transparence.html'), /annulation_livraison:'annulation de livraison'/);
  });
});

describe('41. session expirée : retour à la connexion, puis à la page d\'origine', () => {
  function charger(chemin, { recherche = '' } = {}) {
    const remplacee = [];
    const ecouteurs = [];
    const corps = { children: [], insertBefore(n) { this.children.unshift(n); }, firstChild: null };
    const doc = { readyState: 'complete', addEventListener() {}, getElementById: (id) => corps.children.find((c) => c.id === id) || null, querySelector: () => corps, body: corps, createElement: () => ({ setAttribute() {}, style: {} }) };
    let deconnexion = null;
    const client = { auth: { onAuthStateChange: (f) => { ecouteurs.push(f); }, signOut: async () => { deconnexion = true; ecouteurs.forEach((f) => f('SIGNED_OUT', null)); } } };
    const reponses = { status: 401 };
    const win = {
      location: { pathname: chemin, search: recherche, replace: (u) => remplacee.push(u) },
      fetch: async () => reponses,
      getSupabaseClient: () => client,
    };
    win.window = win;
    vm.runInNewContext(lire('js/session-expiree.js'), { window: win, document: doc, setTimeout: () => 0, encodeURIComponent, Promise });
    return { win, remplacee, client, corps, reponses, emettre: (e) => ecouteurs.forEach((f) => f(e, null)), deconnexionFaite: () => deconnexion };
  }
  test('page membre + réponse 401 à une demande avec jeton → /login.html?expiree=1&next=…', async () => {
    const t = charger('/dashboard-livreur.html', { recherche: '?tab=paiements' });
    await t.win.fetch('/api/platform?endpoint=my-driver-livraisons', { headers: { Authorization: 'Bearer x' } });
    assert.deepEqual(t.remplacee, ['/login.html?expiree=1&next=%2Fdashboard-livreur.html%3Ftab%3Dpaiements']);
  });
  test('session terminée par Supabase → même redirection ; admin → /admin/login.html', () => {
    const t = charger('/admin/dashboard-admin.html');
    t.emettre('SIGNED_OUT');
    assert.deepEqual(t.remplacee, ['/admin/login.html?expiree=1&next=%2Fadmin%2Fdashboard-admin.html']);
  });
  test('déconnexion volontaire, page publique, ou 401 sans jeton : aucune redirection', async () => {
    let t = charger('/dashboard.html');
    await t.client.auth.signOut();
    assert.deepEqual(t.remplacee, []);
    t = charger('/index.html');
    t.emettre('SIGNED_OUT');
    await t.win.fetch('/api/platform', { headers: { Authorization: 'Bearer x' } });
    assert.deepEqual(t.remplacee, []);
    t = charger('/dashboard.html');
    await t.win.fetch('/api/platform?endpoint=impact-public', {});
    assert.deepEqual(t.remplacee, []);
  });
  test('page de connexion : message « Ta session a expiré »', () => {
    const t = charger('/login.html', { recherche: '?expiree=1&next=%2Fdashboard.html' });
    assert.equal(t.corps.children[0].id, 'pap-session-expiree');
    assert.match(t.corps.children[0].textContent, /Ta session a expiré/);
  });
  test('chargé sur toutes les pages qui ont les fenêtres de la page ; la connexion admin rouvre la page admin', () => {
    for (const d of ['.', 'admin', 'covoiturage']) {
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.html'))) {
        const h = lire(`${d}/${f}`);
        if (h.includes('src="/js/dialogues.js"')) assert.match(h, /<script src="\/js\/session-expiree\.js"><\/script>/, `${d}/${f}`);
      }
    }
    assert.match(lire('admin/login.html'), /window\.location\.href = suivante \|\| '\/admin\/dashboard-admin\.html'/);
    assert.match(lire('login.html'), /params\.get\('next'\)/);
  });
});

describe('42. « livrées/payées » seulement si le paiement est capturé', () => {
  test('admin : le compteur n\'inclut plus « livre » (en attente de capture)', () => {
    const h = lire('admin/dashboard-admin.html');
    assert.match(h, /const PAIEMENT_CAPTURE = \['payee', 'paid', 'succeeded'\];/);
    assert.match(h, /const delivered = livraisons\.filter\(l => PAIEMENT_CAPTURE\.includes\(normalizedLivraisonStatus\(l\)\)\)\.length;/);
  });
  test('livreur : revenus et relevé seulement sur les paiements capturés', () => {
    const h = lire('dashboard-livreur.html');
    assert.match(h, /\['payee', 'paid', 'succeeded'\]\.includes\(l\.statut\) && Number\(l\.prix_total\) > 0/);
    assert.match(h, /\.in\('statut', \['payee', 'paid', 'succeeded'\]\)/);
    assert.doesNotMatch(h, /\.in\('statut', \['livre', 'payee'\]\)/);
  });
});

describe('43. le texte d\'une carte ne déborde plus', () => {
  test('règle commune (js/flottants.js, chargé sur 116 pages) : passage à la ligne dans la carte, carte jamais plus large que l\'écran', () => {
    const js = lire('js/flottants.js');
    assert.match(js, /\[class\*="card"\]\{min-width:0;max-width:100%;box-sizing:border-box\}/);
    assert.match(js, /\[class\*="card"\],\[class\*="card"\] \*\{overflow-wrap:break-word;word-break:normal\}/);
  });
});
