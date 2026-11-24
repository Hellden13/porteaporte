// tests/recompenses.test.js — Décisions de Denis sur fix-test-complet, point 3 :
// chaque récompense promise est déclenchée par sa condition, et jamais deux fois ;
// ce qui n'est pas appliqué n'est plus affiché. Points 4 (accents des courriels) et 5 (2 livraisons coincées).
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { creerBase, makeRes } = require('./aide-fausse-base');

before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-fake';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
});

const REC = require('../lib/_recompenses');
const CTX = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
const U = '55555555-5555-4555-8555-555555555555';
const P = '66666666-6666-4666-8666-666666666666'; // parrain
const AUTRE = '77777777-7777-4777-8777-777777777777';

// Les badges de la production (slug, XP, points), lus en lecture seule le 22 nov. 2026.
const BADGES = [
  ['premiere_livraison', 30, 20], ['livreur_fiable', 100, 50], ['gros_colis', 200, 100], ['cinq_etoiles', 120, 60],
  ['profil_verifie', 50, 25], ['nouveau_covoit', 50, 0], ['premier_trajet_cov', 50, 20], ['eco_route', 150, 40],
  ['ambassadeur_cov', 300, 75], ['parrain_actif', 150, 75], ['partenaire_confiance', 400, 150],
  ['fondateur_livreur', 500, 200], ['fondateur_expediteur', 500, 200], ['zero_retard', 80, 40], ['pionnier', 100, 100],
  ['auto_pleine', 100, 30], ['trajet_solidaire', 180, 50],
].map(([slug, xp, pts], i) => ({ id: `b-${i}`, slug, xp_reward: xp, points_reward: pts, active: true }));

function base(extra = {}) {
  return creerBase({ badges: BADGES, profiles: [{ id: U, xp: 0, driver_status: 'not_started' }, { id: P, xp: 0 }], livraisons: [], reviews: [], referrals: [], ride_driver_profiles: [], rides: [], ride_bookings: [], user_badges: [], ...extra });
}
const xpDe = (db, uid) => (db.tables.xp_transactions || []).filter((x) => x.user_id === uid).reduce((t, x) => t + x.amount, 0);
const ptsDe = (db, uid) => (db.tables.porte_coins_transactions || []).filter((x) => x.user_id === uid).reduce((t, x) => t + x.amount, 0);
const liv = (n, champ = 'livreur_id', uid = U) => Array.from({ length: n }, (_, i) => ({ id: `l-${champ}-${i}`, [champ]: uid, statut: 'payee', livre_le: `2026-11-${String(10 + (i % 15)).padStart(2, '0')}T00:00:00Z` }));

describe('badges automatiques : chaque condition déclenche son badge', () => {
  const cas = [
    ['première livraison payée', { livraisons: liv(1) }, ['premiere_livraison', 'fondateur_livreur', 'pionnier']],
    ['10 livraisons payées', { livraisons: liv(10) }, ['premiere_livraison', 'livreur_fiable', 'fondateur_livreur', 'pionnier']],
    ['50 livraisons payées', { livraisons: liv(50) }, ['premiere_livraison', 'livreur_fiable', 'gros_colis', 'fondateur_livreur', 'pionnier']],
    ['note 4,8 sur 10 livraisons', { livraisons: liv(10), reviews: Array.from({ length: 10 }, (_, i) => ({ reviewed_id: U, rating: i ? 5 : 4, delivery_id: `l-${i}` })) }, ['premiere_livraison', 'livreur_fiable', 'cinq_etoiles', 'fondateur_livreur', 'pionnier']],
    ['note 4,7 : pas de « Service 5 étoiles »', { livraisons: liv(10), reviews: Array.from({ length: 10 }, (_, i) => ({ reviewed_id: U, rating: i < 3 ? 4 : 5, delivery_id: `l-${i}` })) }, ['premiere_livraison', 'livreur_fiable', 'fondateur_livreur', 'pionnier']],
    ['identité vérifiée', { profiles: [{ id: U, xp: 0, driver_status: 'verified' }] }, ['profil_verifie']],
    ['profil covoiturage créé', { ride_driver_profiles: [{ user_id: U }] }, ['nouveau_covoit']],
    ['premier trajet payé comme passager', { ride_bookings: [{ id: 'rb1', passenger_id: U, ride_id: 'r9', status: 'paye', paid_at: '2026-11-01T10:00:00Z' }] }, ['premier_trajet_cov', 'pionnier']],
    ['trajet de 60 km avec 2 passagers payés (conducteur)', { rides: [{ id: 'r1', driver_id: U, total_distance_km: 60 }], ride_bookings: [{ id: 'b1', ride_id: 'r1', status: 'paye', seats_reserved: 1, paid_at: '2026-11-01T10:00:00Z' }, { id: 'b2', ride_id: 'r1', status: 'paye', seats_reserved: 1, paid_at: '2026-11-01T10:00:00Z' }] }, ['premier_trajet_cov', 'eco_route', 'pionnier']],
    ['trajet de 40 km : pas d\'éco-route', { rides: [{ id: 'r1', driver_id: U, total_distance_km: 40 }], ride_bookings: [{ id: 'b1', ride_id: 'r1', status: 'paye', seats_reserved: 2, paid_at: '2026-11-01T10:00:00Z' }] }, ['premier_trajet_cov', 'pionnier']],
    ['trajet non payé : rien', { rides: [{ id: 'r1', driver_id: U, total_distance_km: 90 }], ride_bookings: [{ id: 'b1', ride_id: 'r1', status: 'confirme', seats_reserved: 3 }] }, []],
    ['parrainage récompensé', { referrals: [{ id: 'rf', referrer_id: U, referee_id: AUTRE, status: 'rewarded' }] }, ['parrain_actif']],
    ['niveau Ambassadeur + note 4,8', { profiles: [{ id: U, xp: 1200 }], reviews: [{ reviewed_id: U, rating: 5, ride_id: 'r1' }] }, ['partenaire_confiance']],
    ['niveau 3 seulement : pas « Partenaire confiance »', { profiles: [{ id: U, xp: 900 }], reviews: [{ reviewed_id: U, rating: 5, ride_id: 'r1' }] }, []],
    ['premier expéditeur payé', { livraisons: liv(1, 'expediteur_id') }, ['fondateur_expediteur', 'pionnier']],
  ];
  for (const [nom, tables, attendu] of cas) {
    test(nom, async () => {
      const db = base(tables);
      global.fetch = db.fetch;
      const r = await REC.verifierBadgesAuto(CTX, U);
      assert.deepEqual(r.donnes.sort(), [...attendu].sort());
      const xpAttendu = attendu.reduce((t, s) => t + BADGES.find((b) => b.slug === s).xp_reward, 0);
      assert.equal(xpDe(db, U), xpAttendu, 'les XP du badge sont donnés avec le badge');
    });
  }
  test('51e livreur : pas « Fondateur livreur » (50 premiers seulement)', async () => {
    const autres = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, livreur_id: `autre-${String(i).padStart(2, '0')}`, statut: 'payee', livre_le: `2026-10-01T00:${String(i).padStart(2, '0')}:00Z` }));
    const db = base({ livraisons: [...autres, { id: 'moi', livreur_id: U, statut: 'payee', livre_le: '2026-11-20T00:00:00Z' }] });
    global.fetch = db.fetch;
    const r = await REC.verifierBadgesAuto(CTX, U);
    assert.ok(!r.donnes.includes('fondateur_livreur'));
    assert.ok(r.donnes.includes('premiere_livraison'));
  });
  test('les badges sans condition vérifiable ne sont jamais donnés automatiquement', () => {
    const auto = REC.REGLES.map((r) => r.slug);
    for (const s of ['trajet_solidaire', 'communaute_active', 'ambassadeur_local']) assert.ok(!auto.includes(s), s);
    for (const s of ['zero_retard', 'pionnier', 'auto_pleine']) assert.ok(auto.includes(s), s + ' (décision de Denis : branché)');
  });
});

describe('jamais deux fois', () => {
  test('badges : deux vérifications (même simultanées) = un seul badge et une seule fois ses XP et points', async () => {
    const db = base({ livraisons: liv(1) });
    global.fetch = db.fetch;
    await Promise.all([REC.verifierBadgesAuto(CTX, U), REC.verifierBadgesAuto(CTX, U)]);
    const avant = db.rpc.filter((x) => x.fn === 'grant_badge_v2').length;
    await REC.verifierBadgesAuto(CTX, U);
    assert.equal(db.rpc.filter((x) => x.fn === 'grant_badge_v2').length, avant, 'un badge déjà obtenu n\'est même plus redemandé');
    assert.equal(db.tables.user_badges.filter((b) => b.badges.slug === 'premiere_livraison').length, 1);
    assert.equal(xpDe(db, U), 30 + 500 + 100, 'première livraison + fondateur livreur + pionnier');
    assert.equal(ptsDe(db, U), 20 + 200 + 100);
  });
  test('base illisible : aucune décision, aucun badge', async () => {
    const db = base({ livraisons: liv(5) });
    db.illisible = ['profiles'];
    global.fetch = db.fetch;
    const r = await REC.verifierBadgesAuto(CTX, U);
    assert.deepEqual(r.donnes, []);
    assert.equal(db.rpc.length, 0);
  });
  test('parrainage : première action réelle du filleul → parrain +100 points +50 XP + badge, une seule fois même en simultané', async () => {
    const db = base({ referrals: [{ id: 'rf1', referrer_id: P, referee_id: U, status: 'pending' }], referral_codes: [{ user_id: P, total_rewarded: 0 }] });
    global.fetch = db.fetch;
    const [a, b] = await Promise.all([REC.recompenserParrainage(CTX, U, 'premiere_livraison'), REC.recompenserParrainage(CTX, U, 'premier_trajet')]);
    assert.equal([a.donne, b.donne].filter(Boolean).length, 1);
    await REC.recompenserParrainage(CTX, U, 'premiere_livraison');
    const pts = (db.tables.porte_coins_transactions || []).filter((x) => x.user_id === P && x.reason === 'referral_reward');
    assert.equal(pts.length, 1);
    assert.equal(pts[0].amount, 100);
    assert.equal(db.tables.xp_transactions.filter((x) => x.user_id === P && x.reason === 'referral_reward').length, 1);
    assert.ok(db.tables.user_badges.some((x) => x.user_id === P && x.badges.slug === 'parrain_actif'));
    assert.equal(db.tables.referrals[0].status, 'rewarded');
  });
  test('parrainage sans filleul en attente : rien', async () => {
    const db = base();
    global.fetch = db.fetch;
    assert.equal((await REC.recompenserParrainage(CTX, U, 'x')).donne, false);
    assert.equal(db.rpc.length, 0);
  });
  test('avis 5 étoiles : +15 XP une seule fois par avis ; 4 étoiles ou avis sur soi-même : rien', async () => {
    const db = base();
    global.fetch = db.fetch;
    const r = (rating, reviewer = AUTRE, ref = 'livraison:l1') => REC.recompenseAvis5Etoiles(CTX, { reviewedId: U, reviewerId: reviewer, refId: ref, rating });
    await Promise.all([r(5), r(5)]);
    await r(5);
    await r(4, AUTRE, 'livraison:l2');
    await r(5, U, 'livraison:l3');
    assert.equal(db.tables.xp_transactions.filter((x) => x.reason === 'avis_5_etoiles').length, 1);
    await r(5, AUTRE, 'trajet:r1');
    assert.equal(db.tables.xp_transactions.filter((x) => x.reason === 'avis_5_etoiles').length, 2, 'un autre avis 5 étoiles compte');
  });
  test('jalon « sans réclamation » : les points une seule fois, même si le tableau de bord est ouvert deux fois', async () => {
    const db = base();
    global.fetch = db.fetch;
    await Promise.all([REC.jalonSansReclamation(CTX, U, '7j', 25), REC.jalonSansReclamation(CTX, U, '7j', 25)]);
    await REC.jalonSansReclamation(CTX, U, '7j', 25);
    assert.equal(db.rpc.filter((x) => x.fn === 'award_claim_free_milestone').length, 1);
  });
  test('journal illisible : aucune récompense marquée (échec fermé)', async () => {
    const db = base();
    db.illisible = ['transaction_audit_events'];
    global.fetch = db.fetch;
    assert.equal(await REC.jalonSansReclamation(CTX, U, '30j', 100), false);
    assert.equal((await REC.recompenseAvis5Etoiles(CTX, { reviewedId: U, reviewerId: AUTRE, refId: 'l9', rating: 5 })).donne, false);
    assert.equal(db.rpc.length, 0);
  });
});

describe('covoiturage : missions déclenchées par le serveur seulement, une seule fois', () => {
  const rides = require('../lib/_rides');
  test('l\'endpoint public cov-progress est fermé (on ne déclare plus soi-même « trajet terminé »)', async () => {
    const res = makeRes();
    await rides.covProgress({}, res, { ...CTX, session: { id: U } }, { event: 'ride_complete', ride_id: 'r1' });
    assert.equal(res._status, 403);
  });
  test('inscription covoiturage : 50 XP une seule fois', async () => {
    const db = base({ cov_badges: [{ id: 'cb1', slug: 'nouveau_covoitureur' }], user_cov_badges: [] });
    global.fetch = db.fetch;
    for (let i = 0; i < 3; i++) await rides.covOnboard({}, makeRes(), { ...CTX, session: { id: U } });
    assert.equal((db.tables.cov_xp_log || []).length, 1);
    assert.equal(db.tables.xp_transactions.filter((x) => x.user_id === U).length, 1, 'XP générale ajoutée (grant_xp), pas écrasée');
  });
  test('mission « premier trajet » : progression une fois par réservation payée', async () => {
    const db = base({ cov_missions: [{ id: 'm1', slug: 'premier_trajet', target: 1, xp_reward: 50, active: true, name: 'Premier trajet' }], user_cov_missions: [], rides: [{ id: 'r1', driver_id: U, total_distance_km: 20, energy_type: 'electrique' }], ride_bookings: [{ id: 'b1', ride_id: 'r1', status: 'paye', seats_reserved: 1 }] });
    global.fetch = db.fetch;
    await rides.progresCovoiturage(CTX, U, 'ride_complete', { ride_id: 'r1', booking_id: 'b1' });
    await rides.progresCovoiturage(CTX, U, 'ride_complete', { ride_id: 'r1', booking_id: 'b1' });
    assert.equal(db.tables.user_cov_missions.length, 1);
    assert.equal(db.tables.user_cov_missions[0].done, true);
    // Mission (50 XP) + trajet vert électrique (30 XP), une seule fois chacun.
    assert.deepEqual((db.tables.cov_xp_log || []).map((x) => x.amount).sort(), [30, 50]);
  });
  test('la capture d\'un trajet payé déclenche badges, parrainage et missions', () => {
    const src = fs.readFileSync('lib/_rides.js', 'utf8');
    assert.match(src, /await verifierBadgesAuto\(ctx, uidR\);\s*await recompenserParrainage\(ctx, uidR, 'premier_trajet'\);\s*await progresCovoiturage\(ctx, uidR, 'ride_complete'/);
  });
});

describe('branché au bon moment', () => {
  test('livraison capturée (les deux chemins) : badges + parrainage du livreur et de l\'expéditeur', () => {
    const cap = fs.readFileSync('api/capture-livraison.js', 'utf8');
    assert.match(cap, /await verifierBadgesAuto\(ctxR, livraison\.livreur_id\);\s*await recompenserParrainage\(ctxR, livraison\.livreur_id, 'premiere_livraison'\);/);
    assert.match(cap, /await verifierBadgesAuto\(ctxR, livraison\.expediteur_id\);/);
    assert.doesNotMatch(cap, /autoGrantBadges/, 'l\'ancien code (badges inexistants, XP ajoutés à chaque fois) est retiré');
    const plat = fs.readFileSync('api/platform.js', 'utf8');
    assert.match(plat, /await verifierBadgesAuto\(ctx, livComplete\.livreur_id\); await recompenserParrainage\(ctx, livComplete\.livreur_id, 'premiere_livraison'\);/);
    assert.doesNotMatch(plat, /rewardReferralIfPending\(ctx, livraison\.livreur_id, 'first_delivery'\)/, 'plus de récompense au simple « livré » non payé');
  });
  test('identité approuvée → « Profil vérifié » ; avis → +15 XP ; jalons → une seule fois', () => {
    const plat = fs.readFileSync('api/platform.js', 'utf8');
    assert.match(plat, /if \(status === 'verified'\) await badgeProfilVerifie\(ctx, userId\)/);
    assert.equal((plat.match(/await recompenseAvis5Etoiles\(ctx, \{/g) || []).length, 2);
    assert.match(plat, /await jalonSansReclamation\(ctx, ctx\.session\.id, m\.key, m\.points\)/);
    assert.doesNotMatch(plat, /rpc\/award_claim_free_milestone/);
    const gr = fs.readFileSync('lib/_growth.js', 'utf8');
    assert.match(gr, /await jalonSansReclamation\(ctx, uid, m\.key, m\.points\)/);
    assert.doesNotMatch(gr, /rpc\/award_claim_free_milestone/);
  });
  test('bonus fidélité : le même calcul pour l\'écran et le paiement (recalculé à chaque capture)', async () => {
    const { calculerBonusFidelite } = require('../lib/_fidelite');
    const db = creerBase({ livraisons: liv(50), v_user_fiabilite: [{ id: U, score: 96 }], user_badges: [{ user_id: U }, { user_id: U }, { user_id: U }] });
    global.fetch = db.fetch;
    const f = await calculerBonusFidelite(CTX, { id: U, cree_le: '2025-01-01T00:00:00Z', loyalty_bonus_manual: 9 });
    assert.equal(f.bonus, 10, '2 + 2 + 1 + 1 + 9, plafonné à 10');
    assert.match(fs.readFileSync('lib/_apres-capture.js', 'utf8'), /calculerBonusFidelite\(ctx, prof, \{ enregistrer: true \}\)/);
    assert.match(fs.readFileSync('api/platform.js', 'utf8'), /const f = await calculerBonusFidelite\(\{ sbUrl, sbKey \}, p, \{ enregistrer: true \}\);/);
  });
});

describe('rien d\'affiché qui ne soit pas réel', () => {
  const lire = (f) => fs.readFileSync(f, 'utf8');
  test('programme Points Impact : plus d\'avantages de niveau ni de missions jamais déclenchées', () => {
    const h = lire('programme-points.html');
    for (const x of [/Missions spéciales/, /Meilleure visibilité/, /Support prioritaire/, /Mission complétée/, /missions exclusives/i, /Accès aux gros colis/]) assert.doesNotMatch(h, x);
    assert.match(h, /Un seul avantage de niveau : à partir du niveau 2 \(200 XP\), tes trajets de covoiturage apparaissent plus haut dans les résultats de recherche\./);
    assert.doesNotMatch(lire('lib/_growth.js'), /Missions exclusives, support prioritaire|Meilleure visibilité sur les missions/);
  });
  test('bonus éco (jamais versé) retiré : KYC, tableau du livreur, missions', () => {
    const k = lire('kyc.html');
    assert.doesNotMatch(k, /Ton bonus écologique est actif/);
    assert.doesNotMatch(k, /tu reçois un bonus de \$\{m\.eco\}%/);
    assert.match(lire('dashboard-livreur.html'), /if \(banner\) banner\.style\.display = 'none';/);
    assert.match(lire('browse-missions.html'), /if \(false && ecoBonus > 0\)/);
    assert.doesNotMatch(lire('lib/_fidelite.js'), /eco_bonus/, 'plus de point de fidélité « éco » non annoncé');
  });
  test('covoiturage : plus de « bonus de groupe » (jamais appliqué, aurait été pris sur le conducteur)', () => {
    const h = lire('covoiturage-info.html');
    assert.doesNotMatch(h, /Bonus de groupe|Un bonus groupe s'applique/);
    assert.match(h, /const bonusPct\s+= 0;/);
  });
  test('plans Pro fermés : avantages jamais appliqués, aucun abonnement vendu', async () => {
    // Plan du site, étape 1 : la page des plans est retirée (redirigée vers l'accueil).
    assert.ok(!fs.existsSync('abonnements.html'));
    const { subscriptionCreate } = require('../lib/_connect');
    const res = makeRes();
    await subscriptionCreate({ body: { plan: 'conducteur_pro' } }, res, { ...CTX, session: { id: U } });
    assert.equal(res._status, 503);
    assert.match(res._body.error, /pas encore offerts/);
  });
  test('courriels : plus de « 50 PorteCoins (valeur 5 $) », de badge Fondateur promis ni de tarifs préférentiels', () => {
    const n = lire('api/notifier.js');
    for (const x of [/50 PorteCoins/, /valeur 5 \$/i, /Valeur : 5,00 \$/, /Tarifs préférentiels/, /Badge exclusif "Fondateur"/, /PorteCoins bonus/, /accéder aux bonus mensuels/]) assert.doesNotMatch(n, x);
  });
  test('parrainage : pas de « bonus de bienvenue » pour le filleul', () => {
    assert.doesNotMatch(lire('parrainage.html'), /bonus de bienvenue/);
  });
  test('organismes : plus de « 5 % de chaque livraison va à… » (le versement n\'existe pas encore)', () => {
    for (const f of ['organismes.html', 'manifeste.html', 'vote-communautaire.html', 'admin/presse-kit.html']) {
      assert.doesNotMatch(lire(f), /data-share="communaute"/, f);
    }
    assert.doesNotMatch(lire('manifeste.html'), /fondations environnementales/);
  });
});

describe('point 4 : accents dans le texte des courriels (clés internes intactes)', () => {
  const n = fs.readFileSync('api/notifier.js', 'utf8');
  const html = n.split('\n').filter((l) => /<[a-z]|subject:/.test(l)).map((l) => l.replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ')).join('\n');
  test('plus de mots courants sans accent dans les gabarits', () => {
    for (const w of ['arrivee', 'identite', 'verification', 'deja', 'recu', 'numerique', 'reduire', 'quebecoise', 'meme', 'acces', 'reels', 'ete cree']) {
      assert.doesNotMatch(html, new RegExp(`(^|[^\\wÀ-ÿ_])${w}([^\\wÀ-ÿ_]|$)`, 'i'), w);
    }
  });
  test('les clés internes ne sont pas touchées', () => {
    assert.match(n, /data\.ville_arrivee/);
    assert.match(n, /data\.adresse_arrivee/);
    assert.match(n, /case 'livraison_complete':/);
  });
});

describe('point 5 : les 2 livraisons coincées (préparé, pas exécuté)', () => {
  const { adminRemettreRamasse, CODES_COINCES } = require('../lib/_livraisons-coincees');
  const ADM = { ...CTX, stripeKey: 'sk', session: { id: 'adm' }, profile: { role: 'admin' } };
  function b(statut = 'livre', pi = 'requires_capture') {
    const db = creerBase({ livraisons: [{ id: 'L1', code: 'PP-EA656834', statut, livre_le: '2026-11-22T15:00:00Z', expediteur_id: 'e', stripe_payment_intent: 'pi_1' }, { id: 'L2', code: 'PP-AUTRE001', statut: 'livre' }] });
    db.stripeReponse = () => ({ ok: true, status: 200, json: async () => ({ status: pi }) });
    global.fetch = db.fetch;
    return db;
  }
  const appel = async (ctx, code) => { const res = makeRes(); await adminRemettreRamasse({}, res, ctx, { code }); return res; };
  test('seulement les 2 codes, seulement l\'admin', async () => {
    assert.deepEqual([...CODES_COINCES], ['PP-EA656834', 'PP-B0FBF7D8']);
    b();
    assert.equal((await appel({ ...ADM, profile: { role: 'livreur' } }, 'PP-EA656834'))._status, 403);
    assert.equal((await appel(ADM, 'PP-AUTRE001'))._status, 400);
  });
  test('remet statut = ramasse et livre_le = null, rien d\'autre, et l\'écrit au journal', async () => {
    const db = b();
    const r = await appel(ADM, 'pp-ea656834');
    assert.equal(r._status, 200, JSON.stringify(r._body));
    const l = db.tables.livraisons[0];
    assert.equal(l.statut, 'ramasse');
    assert.equal(l.livre_le, null);
    assert.equal(l.stripe_payment_intent, 'pi_1', 'paiement intact');
    assert.ok(!db.stripe.some((s) => s.m === 'POST'), 'aucune écriture Stripe');
    assert.ok(db.tables.transaction_audit_events.some((e) => e.event_type === 'livraison_remise_ramasse'));
    assert.equal((await appel(ADM, 'PP-EA656834'))._status, 409, 'deuxième clic : rien');
  });
  test('paiement déjà capturé ou statut différent : rien ne change', async () => {
    let db = b('livre', 'succeeded');
    let r = await appel(ADM, 'PP-EA656834');
    assert.equal(r._status, 409);
    assert.match(r._body.error, /succeeded/);
    assert.equal(db.tables.livraisons[0].statut, 'livre');
    db = b('payee');
    r = await appel(ADM, 'PP-EA656834');
    assert.equal(r._status, 409);
    assert.match(r._body.error, /« payee »/);
    assert.equal(db.tables.livraisons[0].statut, 'payee');
  });
  test('le changement est conditionnel (statut encore « livre » au moment d\'écrire)', async () => {
    const db = b();
    const urls = [];
    const f = db.fetch;
    global.fetch = async (url, o = {}) => { if ((o.method || '').toUpperCase() === 'PATCH') urls.push(url); return f(url, o); };
    await appel(ADM, 'PP-EA656834');
    assert.equal(urls.length, 1);
    assert.match(urls[0], /livraisons\?id=eq\.L1&statut=eq\.livre$/);
  });
  test('script SQL de secours : dans prod-v2-plus-tard, jamais appliqué, ne touche pas au paiement', () => {
    const f = 'supabase/prod-v2-plus-tard/20261122150000_remettre_ramasse_2_livraisons.sql.NE-PAS-APPLIQUER';
    const sql = fs.readFileSync(f, 'utf8');
    assert.match(sql, /set statut = 'ramasse', livre_le = null/);
    assert.match(sql, /code in \('PP-EA656834', 'PP-B0FBF7D8'\) and statut = 'livre'/);
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /stripe_payment_intent\s*=|livreur_earnings|update public\.transactions/i);
    assert.match(sql, /^-- commit;$/m, 'le commit est laissé à la main');
  });
});
