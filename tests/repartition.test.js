// tests/repartition.test.js — Décisions de Denis sur fix-test-complet, points 1 et 2 :
// la répartition affichée partout est celle que le code verse, et la somme des parts égale
// exactement le montant payé, au cent près (livraison de 10 $, trajet de 2,88 $, et des milliers d'autres).
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
const { gainLivreurCents } = require('../lib/_gain-livreur');

// Les pourcentages réellement configurés en production le 22 nov. 2026 (lus en lecture seule).
const PROD = { pct_livreur: 60, pct_communaute: 2, pct_protection: 8, pct_urgence: 15, pct_developpement: 1.6, pct_marketing: 2, pct_operations: 5, pct_profit: 3, pct_stripe: 3.4 };
const REDIST_PROD = [
  { key: 'operations', pct: 30, label: 'Frais & opérations' },
  { key: 'securite', pct: 35, label: 'Fond de sécurité' },
  { key: 'dons', pct: 25, label: 'Dons organismes' },
  { key: 'developpeur', pct: 10, label: 'Développeur' },
];
const somme = (rep) => rep.lignes.reduce((t, l) => t + l.cents, 0);
const ligne = (rep, poste) => rep.lignes.find((l) => l.poste === poste);

describe('livraison de 10,00 $ : la somme de toutes les parts = 10,00 $ au cent près', () => {
  const rep = R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD });
  test('livreur 6,00 $ (60 % du prix total), Stripe 0,59 $ (2,9 % + 0,30 $)', () => {
    assert.equal(ligne(rep, 'livreur').cents, 600);
    assert.equal(ligne(rep, 'stripe').cents, 59);
    assert.equal(rep.restePlateformeCents, 341);
  });
  test('chaque poste reçoit sa part du reste, au prorata de son % (36,6 points au total)', () => {
    const attendu = { protection: 8, urgence: 15, communaute: 2, developpement: 1.6, marketing: 2, operations: 5, profit: 3 };
    const tot = Object.values(attendu).reduce((a, b) => a + b, 0);
    for (const [p, pct] of Object.entries(attendu)) {
      const c = ligne(rep, p).cents;
      assert.ok(Math.abs(c - (341 * pct) / tot) < 1, `${p} ${c}`);
    }
    assert.deepEqual(rep.lignes.map((l) => [l.poste, l.cents]), [
      ['livreur', 600], ['stripe', 59], ['protection', 74], ['urgence', 140], ['communaute', 19],
      ['developpement', 15], ['marketing', 19], ['operations', 46], ['profit', 28],
    ]);
  });
  test('total exact : 1000 cents', () => {
    assert.equal(somme(rep), 1000);
    assert.equal(rep.total, 1000);
  });
  test('avec les frais Stripe RÉELS lus à la capture, la somme reste exacte', () => {
    const r2 = R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD, fraisStripeCents: 62 });
    assert.equal(ligne(r2, 'stripe').cents, 62);
    assert.equal(ligne(r2, 'stripe').detail, 'frais réels Stripe');
    assert.equal(somme(r2), 1000);
  });
});

describe('trajet de 2,88 $ : la somme de toutes les parts = 2,88 $ au cent près', () => {
  const rep = R.repartitionTrajet({ montantPayeCents: 288, conducteurCents: 138, redistribution: REDIST_PROD });
  test('conducteur 1,38 $ (toute sa part), Stripe 0,38 $, le reste des frais de service partagé 30/35/25/10', () => {
    assert.deepEqual(rep.lignes.map((l) => [l.poste, l.cents]), [
      ['conducteur', 138], ['stripe', 38], ['operations', 34], ['securite', 39], ['dons', 28], ['developpeur', 11],
    ]);
  });
  test('total exact : 288 cents', () => {
    assert.equal(somme(rep), 288);
    assert.equal(rep.total, 288);
  });
});

describe('au cent près pour tous les montants (rabais, fidélité, sauvetage, frais réels)', () => {
  test('livraisons : 0,01 $ à 500 $, toutes les options', () => {
    let n = 0;
    for (const paye of [1, 2, 49, 50, 99, 288, 999, 1000, 1001, 1234, 1999, 4567, 9999, 25000, 50000]) {
      for (const rabais of [0, 1, 250, 5000]) {
        for (const fidelitePct of [0, 3, 10, 40]) {
          for (const sauvetagePct of [0, 20]) {
            for (const frais of [null, 0, 31, 129]) {
              for (const settings of [PROD, {}, { pct_protection: 0, pct_urgence: 0, pct_communaute: 0, pct_developpement: 0, pct_marketing: 0, pct_operations: 0, pct_profit: 0 }]) {
                const rep = R.repartitionLivraison({ montantPayeCents: paye, rabaisCents: rabais, fidelitePct, sauvetagePct, fraisStripeCents: frais, settings });
                assert.equal(somme(rep), paye, JSON.stringify({ paye, rabais, fidelitePct, sauvetagePct, frais }));
                for (const l of rep.lignes) if (l.poste !== 'deficit') assert.ok(l.cents >= 0, l.poste);
                // Le livreur ne perd jamais rien à cause d'un rabais : sa part est calculée sur le prix avant rabais.
                assert.equal(rep.livreurCents, gainLivreurCents(paye + rabais, { fidelitePct, sauvetagePct }).netCents);
                n += 1;
              }
            }
          }
        }
      }
    }
    assert.ok(n > 5000);
  });
  test('covoiturage : conducteur intact, somme exacte', () => {
    for (const paye of [1, 150, 288, 300, 1550, 4321]) {
      for (const cond of [0, 100, 138, 1400, 99999]) {
        for (const frais of [null, 0, 40]) {
          const rep = R.repartitionTrajet({ montantPayeCents: paye, conducteurCents: cond, fraisStripeCents: frais, redistribution: REDIST_PROD });
          assert.equal(somme(rep), paye);
          assert.equal(rep.conducteurCents, Math.min(paye, cond));
        }
      }
    }
  });
  test('un rabais est payé par la plateforme (ligne « deficit » si le reste ne suffit pas)', () => {
    const rep = R.repartitionLivraison({ montantPayeCents: 500, rabaisCents: 500, settings: PROD });
    assert.equal(rep.livreurCents, 600, '60 % de 10 $ même si l\'expéditeur a payé 5 $');
    assert.ok(ligne(rep, 'deficit').cents < 0);
    assert.equal(somme(rep), 500);
  });
});

describe('Paramètres financiers : ce qui est configuré est ce qui est appliqué', () => {
  test('les réglages de production font 100 % avec un livreur à 60 %', () => {
    const v = R.validerParametres(PROD);
    assert.equal(v.ok, true, v.erreurs.join(' '));
    assert.ok(Math.abs(v.total - 100) < 1e-9);
  });
  test('livreur ≠ 60 % refusé (la règle de paiement ne change pas), total ≠ 100 % refusé', () => {
    assert.equal(R.validerParametres({ ...PROD, pct_livreur: 80, pct_urgence: 0, pct_stripe: 0, pct_operations: 0.4 }).ok, false);
    assert.match(R.validerParametres({ ...PROD, pct_protection: 7 }).erreurs.join(' '), /100 %/);
  });
  test('admin-settings-update : valide les réglages COMPLETS (actuels + modification) et refuse sinon', async () => {
    const platform = require('../api/platform');
    const ADMIN = '33333333-3333-4333-8333-333333333333';
    const db = creerBase({ platform_settings: [{ id: 'default', ...PROD }], profiles: [{ id: ADMIN, role: 'admin', email: 'a@courriel-capture.ca', email_verified: true }] });
    const base = db.fetch;
    global.fetch = async (url, o = {}) => (url.includes('/auth/v1/user') ? { ok: true, status: 200, json: async () => ({ id: ADMIN, email: 'a@courriel-capture.ca', email_confirmed_at: '2026-01-01' }) } : base(url, o));
    const appel = async (body) => {
      const res = makeRes();
      await platform({ method: 'POST', url: '/api/platform?endpoint=admin-settings-update', query: { endpoint: 'admin-settings-update' }, headers: { authorization: 'Bearer ' + ADMIN, 'content-type': 'application/json' }, body: { endpoint: 'admin-settings-update', ...body } }, res);
      return res;
    };
    let r = await appel({ pct_protection: 7 }); // un seul champ : le total deviendrait 99 %
    assert.equal(r._status, 400, JSON.stringify(r._body));
    assert.match(r._body.error, /100 %/);
    r = await appel({ pct_livreur: 70, pct_urgence: 5 });
    assert.equal(r._status, 400);
    assert.match(r._body.error, /60 %/);
    assert.equal(db.tables.platform_settings[0].pct_protection, 8, 'rien n\'a changé');
    r = await appel({ pct_protection: 7, pct_urgence: 16 }); // total toujours 100 %
    assert.equal(r._status, 200, JSON.stringify(r._body));
    assert.equal(db.tables.platform_settings[0].pct_protection, 7);
  });
});

describe('le paiement réel écrit la répartition au journal, une seule fois', () => {
  const LIV = 'aaaaaaaa-0000-4000-8000-0000000000a1';
  const LIVREUR = '22222222-2222-4222-8222-222222222222';
  const EXP = '11111111-1111-4111-8111-111111111111';
  function base() {
    return creerBase({
      platform_settings: [{ id: 'default', ...PROD }],
      impact_settings: [{ id: 'default', ride_redistribution: REDIST_PROD }],
      profiles: [{ id: LIVREUR, cree_le: '2026-10-01T00:00:00Z', loyalty_bonus_manual: 0 }],
      v_user_fiabilite: [{ id: LIVREUR, score: 80 }], // fiabilité < 95 : pas de bonus fidélité
      stripe_connect_accounts: [{ user_id: LIVREUR, stripe_account_id: 'acct_test', status: 'active' }],
      promo_code_uses: [],
    });
  }
  const captured = { id: 'pi_test', amount_received: 1000, currency: 'cad', latest_charge: 'ch_test' };
  test('10 $ : virement Stripe de 6,00 $, gain 6,00 $, journal = 10,00 $ au cent près ; deuxième appel : rien de plus au journal', async () => {
    const db = base();
    db.stripeReponse = (url) => (url.includes('/v1/charges/') ? { ok: true, status: 200, json: async () => ({ balance_transaction: { fee: 59 } }) } : { ok: true, status: 200, json: async () => ({ id: 'tr_test' }) });
    global.fetch = db.fetch;
    const { apresCaptureLivraison } = require('../lib/_apres-capture');
    const ctx = { sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk_test_fake123' };
    const r1 = await apresCaptureLivraison(ctx, { id: LIV, livreur_id: LIVREUR, expediteur_id: EXP, code: 'PP-TEST0001' }, captured);
    assert.equal(r1.netCents, 600);
    const virement = db.stripe.find((s) => s.url.endsWith('/v1/transfers'));
    assert.match(virement.body, /amount=600&/);
    assert.equal(db.tables.livreur_earnings[0].net_amount, 6);
    const j = db.tables.transaction_audit_events.filter((e) => e.event_type === 'repartition_capturee');
    assert.equal(j.length, 1);
    assert.equal(j[0].amount_cents, 1000);
    assert.equal(j[0].evidence.lignes.reduce((t, l) => t + l.cents, 0), 1000);
    assert.equal(j[0].evidence.frais_stripe_reels, true);
    await apresCaptureLivraison(ctx, { id: LIV, livreur_id: LIVREUR, expediteur_id: EXP }, captured);
    assert.equal(db.tables.transaction_audit_events.filter((e) => e.event_type === 'repartition_capturee').length, 1, 'jamais deux fois au journal');
  });
  test('code promo de 2 $ : le livreur touche 60 % du prix AVANT rabais (6,00 $ sur 8 $ payés)', async () => {
    const db = base();
    db.tables.promo_code_uses.push({ livraison_id: LIV, discount_applied: 2 });
    db.stripeReponse = () => ({ ok: false, status: 500, json: async () => ({}) }); // Stripe muet : frais estimés
    global.fetch = db.fetch;
    const { apresCaptureLivraison } = require('../lib/_apres-capture');
    const r = await apresCaptureLivraison({ sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk' }, { id: LIV, livreur_id: LIVREUR, expediteur_id: EXP }, { ...captured, amount_received: 800 });
    assert.equal(r.netCents, 600);
    assert.equal(r.repartition.total, 800);
    assert.equal(r.repartition.rabaisCents, 200);
  });
  test('bonus fidélité recalculé à la capture (10 livraisons payées + fiabilité 100 → +2) : versé ET écrit au journal, pris sur la plateforme', async () => {
    const db = base();
    db.tables.v_user_fiabilite = [{ id: LIVREUR, score: 100 }];
    db.tables.livraisons = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, livreur_id: LIVREUR, statut: 'payee' }));
    db.stripeReponse = (url) => (url.includes('/v1/charges/') ? { ok: true, status: 200, json: async () => ({ balance_transaction: { fee: 59 } }) } : { ok: true, status: 200, json: async () => ({ id: 'tr_test' }) });
    global.fetch = db.fetch;
    const { apresCaptureLivraison } = require('../lib/_apres-capture');
    const r = await apresCaptureLivraison({ sbUrl: 'https://fake.supabase.co', sbKey: 'k', stripeKey: 'sk' }, { id: LIV, livreur_id: LIVREUR, expediteur_id: EXP }, captured);
    assert.equal(r.netCents, 620);
    assert.equal(r.repartition.total, 1000);
    assert.equal(db.tables.profiles[0].loyalty_bonus_pct, 2, 'le bonus affiché au livreur = le bonus versé');
    assert.match(db.stripe.find((s) => s.url.endsWith('/v1/transfers')).body, /amount=620&/);
  });
  test('journal illisible : la répartition n\'est pas écrite deux fois (échec fermé)', async () => {
    const { enregistrerRepartition } = require('../lib/_repartition-journal');
    const db = creerBase();
    db.illisible = ['transaction_audit_events'];
    global.fetch = db.fetch;
    const rep = R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD });
    const r = await enregistrerRepartition({ sbUrl: 'https://fake.supabase.co', sbKey: 'k' }, { sorte: 'livraison', refId: LIV, repartition: rep });
    assert.equal(r.ok, false);
  });
  test('une répartition dont la somme est fausse n\'est jamais écrite', async () => {
    const { enregistrerRepartition } = require('../lib/_repartition-journal');
    const db = creerBase();
    global.fetch = db.fetch;
    const rep = R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD });
    rep.lignes[0].cents += 1; rep.total += 1;
    const r = await enregistrerRepartition({ sbUrl: 'https://fake.supabase.co', sbKey: 'k' }, { sorte: 'livraison', refId: LIV, repartition: rep });
    assert.equal(r.ok, false);
    assert.equal(db.tables.transaction_audit_events.length, 0);
  });
  test('les deux chemins de capture de livraison et la capture du covoiturage écrivent au journal', () => {
    assert.match(fs.readFileSync('lib/_apres-capture.js', 'utf8'), /await enregistrerRepartition\(ctx, \{\s*sorte: 'livraison'/);
    const rides = fs.readFileSync('lib/_rides.js', 'utf8');
    assert.match(rides, /const rep = repartitionTrajet\(\{\s*montantPayeCents: payeCents,\s*conducteurCents: driverAmountCents,/);
    assert.match(rides, /await enregistrerRepartition\(ctx, \{ sorte: 'covoiturage', refId: booking\.id/);
  });
});

describe('page Transparence : mêmes chiffres, même source', () => {
  test('impact-public donne les exemples 10 $ et 2,88 $ du même calcul, et les totaux RÉELS du journal', async () => {
    const platform = require('../api/platform');
    const ev = (sorte, montant, lignes) => ({ event_type: 'repartition_capturee', amount_cents: montant, evidence: { sorte, lignes } });
    const l10 = R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD }).lignes.map(({ poste, label, cents }) => ({ poste, label, cents }));
    const t288 = R.repartitionTrajet({ montantPayeCents: 288, conducteurCents: 138, redistribution: REDIST_PROD }).lignes.map(({ poste, label, cents }) => ({ poste, label, cents }));
    const db = creerBase({
      platform_settings: [{ id: 'default', ...PROD, profit_to_insurance: true, insurance_fund_topup_cents: 0 }],
      impact_settings: [{ id: 'default', ride_redistribution: REDIST_PROD, ride_platform_fee: 1.5 }],
      transaction_audit_events: [ev('livraison', 1000, l10), ev('livraison', 1000, l10), ev('covoiturage', 288, t288)],
    });
    global.fetch = db.fetch;
    const res = makeRes();
    await platform({ method: 'GET', url: '/api/platform?endpoint=impact-public', query: { endpoint: 'impact-public' }, headers: {}, body: {} }, res);
    assert.equal(res._status, 200);
    const imp = res._body.impact;
    assert.equal(imp.exemples.livraison.total, 1000);
    assert.equal(imp.exemples.covoiturage.total, 288);
    assert.equal(imp.exemples.covoiturage.conducteurCents, 138);
    assert.equal(imp.repartition_reelle.paiements, 3);
    assert.equal(imp.repartition_reelle.montant_cents, 2288);
    const postes = Object.values(imp.repartition_reelle.postes);
    assert.equal(postes.reduce((t, p) => t + p.cents, 0), 2288, 'le journal additionné = l\'argent payé');
    // Fonds communauté = poste communauté des livraisons + poste « dons » du covoiturage, tels qu'au journal.
    assert.equal(imp.totals.donation_pool_cents, 19 * 2 + 28);
    // Fonds de sécurité = protection (+ réserve en mode bêta) des livraisons + sécurité du covoiturage.
    assert.equal(res._body.protection_fund.from_deliveries_cents, (74 + 28) * 2);
    assert.equal(res._body.protection_fund.from_covoiturage_cents, 39);
  });
  test('la page affiche les exemples et le journal du serveur (plus de % × ticket estimé)', () => {
    const html = fs.readFileSync('transparence.html', 'utf8');
    assert.match(html, /lignesRepartition\(ex\.livraison\)/);
    assert.match(html, /lignesRepartition\(ex\.covoiturage\)/);
    assert.match(html, /impact\.repartition_reelle/);
    assert.doesNotMatch(html, /ticket \* pct \/ 100/);
    assert.doesNotMatch(html, /Fonds dons estimé/);
    const plat = fs.readFileSync('api/platform.js', 'utf8');
    assert.doesNotMatch(plat, /Math\.round\(revenueCents \* pct \/ 100\)/, 'plus d\'estimation revenus × %');
    assert.doesNotMatch(plat, /Math\.round\(totalRevenueCents \* effectiveInsurancePct\)/);
  });
  test('admin, livreur et calculateur public utilisent le même calcul (js/repartition.js)', () => {
    for (const f of ['admin/dashboard-admin.html', 'admin/parametres.html', 'dashboard-livreur.html', 'calculateur-prix.html']) {
      const html = fs.readFileSync(f, 'utf8');
      assert.match(html, /src="\/js\/repartition\.js"/, f);
      assert.match(html, /PAPRepartition\.repartitionLivraison\(/, f);
    }
    assert.match(fs.readFileSync('admin/parametres.html', 'utf8'), /fige = p\.key === 'pct_livreur' \? 'disabled/);
  });
  test('le navigateur calcule exactement comme le serveur (même fichier)', () => {
    const win = {};
    vm.runInNewContext(fs.readFileSync('js/repartition.js', 'utf8'), { window: win, Math, Number, Object, Array, String });
    const a = win.PAPRepartition.repartitionLivraison({ montantPayeCents: 1000, settings: PROD });
    assert.equal(JSON.stringify(a.lignes.map((l) => l.cents)), JSON.stringify(R.repartitionLivraison({ montantPayeCents: 1000, settings: PROD }).lignes.map((l) => l.cents)));
  });
});

describe('« Tu gagnes » partout, et le formulaire parle du prix total', () => {
  test('notification de nouvelle mission et courriel au livreur : « Tu gagnes »', () => {
    const push = fs.readFileSync('lib/_push.js', 'utf8');
    assert.match(push, /Tu gagnes : \$\{\(gainLivreurCents\(/);
    const n = fs.readFileSync('api/notifier.js', 'utf8');
    assert.match(n, /<span style="color:#888;">Tu gagnes<\/span>/);
    const cap = fs.readFileSync('api/capture-livraison.js', 'utf8');
    assert.doesNotMatch(cap, /captured\.amount_received \* 0\.60/, 'le montant du courriel = le montant versé');
  });
  test('le gain affiché ne compte plus de bonus éco jamais versé', () => {
    const dl = fs.readFileSync('dashboard-livreur.html', 'utf8');
    assert.doesNotMatch(dl, /tu reçois \$\{basePct\}% \+ \$\{ecoBonus\}% de bonus éco/);
    assert.doesNotMatch(dl, /money\(earnings\)/, 'les PorteCoins ne sont plus affichés comme des dollars');
  });
});
