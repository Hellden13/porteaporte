// lib/_recompenses.js — Les récompenses promises arrivent vraiment, au bon moment, une seule fois.
// Appelé après chaque paiement réellement capturé (livraison, trajet), après une vérification
// d'identité et après un avis. Aucune récompense en argent ici : badges, XP et Points Impact seulement
// (les Points Impact n'ont aucune valeur monétaire).
//
// Une seule fois :
//  - badges : grant_badge_v2 (table user_badges UNIQUE user_id+badge_id ; les XP et points du badge
//    sont donnés dans la même transaction SQL que le badge) ;
//  - parrainage : la ligne referrals passe de « pending » à « rewarded » par un PATCH conditionnel ;
//    seul l'appel qui a fait ce changement donne la récompense ;
//  - avis 5 étoiles, jalons sans réclamation : marque unique au journal (lib/_une-fois.js, échec fermé).
'use strict';

const { sbHeaders } = require('./_lib');
const { uneSeuleFois } = require('./_une-fois');

const EVT_RECOMPENSE = 'recompense_donnee';
const PARRAINAGE_POINTS = 100;
const PARRAINAGE_XP = 50;
const AVIS_5_ETOILES_XP = 15;
const FONDATEURS_LIVREURS = 50;
const FONDATEURS_EXPEDITEURS = 100;

function id(v) {
  const s = String(v || '').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(s) ? s : null;
}

async function lire(ctx, chemin) {
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/${chemin}`, { headers: sbHeaders(ctx.sbKey) });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return Array.isArray(d) ? d : null;
  } catch (_) {
    return null;
  }
}

async function rpc(ctx, fn, params) {
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(params) });
    return { ok: r.ok, status: r.status, data: r.ok ? await r.json().catch(() => null) : null };
  } catch (_) {
    return { ok: false, status: 0, data: null };
  }
}

function moyenne(notes) {
  const v = notes.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  return v.length ? { n: v.length, moy: v.reduce((a, b) => a + b, 0) / v.length } : { n: 0, moy: 0 };
}

// Rang (1 = premier) d'un membre parmi ceux qui ont fini une première livraison payée.
function rang(rows, champ, uid) {
  const vus = [];
  for (const r of rows || []) {
    const u = r[champ];
    if (u && !vus.includes(u)) vus.push(u);
    if (u === uid) break;
  }
  const i = vus.indexOf(uid);
  return i < 0 ? Infinity : i + 1;
}

// Tout ce qu'il faut savoir pour décider des badges d'un membre (uniquement des faits enregistrés).
async function statsMembre(ctx, uid) {
  const s = { uid };
  const [prof, livrees, envoyees, avis, parrains, profilCov, mesTrajets, passager] = await Promise.all([
    lire(ctx, `profiles?id=eq.${uid}&select=id,xp,driver_status&limit=1`),
    lire(ctx, `livraisons?livreur_id=eq.${uid}&statut=in.(payee,paid)&select=id&limit=5000`),
    lire(ctx, `livraisons?expediteur_id=eq.${uid}&statut=in.(payee,paid)&select=id&limit=5000`),
    lire(ctx, `reviews?reviewed_id=eq.${uid}&select=rating,delivery_id,ride_id&limit=5000`),
    lire(ctx, `referrals?referrer_id=eq.${uid}&status=eq.rewarded&select=id&limit=1000`),
    lire(ctx, `ride_driver_profiles?user_id=eq.${uid}&select=user_id&limit=1`),
    lire(ctx, `rides?driver_id=eq.${uid}&select=id,total_distance_km&limit=1000`),
    lire(ctx, `ride_bookings?passenger_id=eq.${uid}&status=eq.paye&select=id,ride_id&limit=5000`),
  ]);
  if (!prof) return null; // base illisible : on ne décide rien
  s.xp = Number(prof[0]?.xp || 0);
  s.verifie = prof[0]?.driver_status === 'verified';
  s.livrees = (livrees || []).length;
  s.envoyees = (envoyees || []).length;
  const notesLiv = moyenne((avis || []).filter((a) => a.delivery_id).map((a) => a.rating));
  const notesCov = moyenne((avis || []).filter((a) => a.ride_id).map((a) => a.rating));
  const notesTout = moyenne((avis || []).map((a) => a.rating));
  s.noteLivraison = notesLiv;
  s.noteCovoiturage = notesCov;
  s.noteTout = notesTout;
  s.parrainages = (parrains || []).length;
  s.profilCovoiturage = (profilCov || []).length > 0;
  s.trajetsPassager = (passager || []).length;
  s.trajetsConducteur = 0;
  s.ecoRoute = false;
  const rides = mesTrajets || [];
  if (rides.length) {
    const ids = rides.map((r) => id(r.id)).filter(Boolean);
    const payes = ids.length ? (await lire(ctx, `ride_bookings?ride_id=in.(${ids.join(',')})&status=eq.paye&select=ride_id,seats_reserved&limit=5000`)) || [] : [];
    const places = {};
    for (const b of payes) places[b.ride_id] = (places[b.ride_id] || 0) + Math.max(1, Number(b.seats_reserved) || 1);
    s.trajetsConducteur = Object.keys(places).length;
    s.ecoRoute = rides.some((r) => Number(r.total_distance_km) >= 50 && (places[r.id] || 0) >= 2);
  }
  s.trajets = s.trajetsConducteur + s.trajetsPassager;
  return s;
}

// Badges dont la condition est vérifiable par des faits enregistrés. Les autres (« zéro retard »,
// « pionnier », « auto pleine ») attendent une décision de Denis ; les badges communautaires
// (« trajet solidaire », « communauté active », « ambassadeur local ») sont attribués à la main par l'admin.
const REGLES = [
  { slug: 'premiere_livraison', ok: (s) => s.livrees >= 1 },
  { slug: 'livreur_fiable', ok: (s) => s.livrees >= 10 },
  { slug: 'gros_colis', ok: (s) => s.livrees >= 50 },
  { slug: 'cinq_etoiles', ok: (s) => s.noteLivraison.n >= 10 && s.noteLivraison.moy >= 4.8 },
  { slug: 'profil_verifie', ok: (s) => s.verifie },
  { slug: 'nouveau_covoit', ok: (s) => s.profilCovoiturage },
  { slug: 'premier_trajet_cov', ok: (s) => s.trajets >= 1 },
  { slug: 'eco_route', ok: (s) => s.ecoRoute },
  { slug: 'ambassadeur_cov', ok: (s) => s.trajets >= 10 && s.noteCovoiturage.n >= 1 && s.noteCovoiturage.moy >= 4.8 },
  { slug: 'parrain_actif', ok: (s) => s.parrainages >= 1 },
  { slug: 'partenaire_confiance', ok: (s) => s.xp >= 1000 && s.noteTout.n >= 1 && s.noteTout.moy >= 4.8 },
  { slug: 'fondateur_livreur', ok: (s) => s.rangLivreur <= FONDATEURS_LIVREURS, besoin: 'rangLivreur' },
  { slug: 'fondateur_expediteur', ok: (s) => s.rangExpediteur <= FONDATEURS_EXPEDITEURS, besoin: 'rangExpediteur' },
];

async function donnerBadge(ctx, uid, slug) {
  let r = await rpc(ctx, 'grant_badge_v2', { p_user_id: uid, p_badge_slug: slug, p_granted_by: 'system_auto', p_force: false });
  if (!r.ok && r.status === 404) {
    r = await rpc(ctx, 'grant_badge', { p_user_id: uid, p_badge_slug: slug, p_granted_by: 'system_auto' });
    return r.ok && r.data === true;
  }
  return r.ok && r.data === 'granted';
}

// Vérifie tous les badges automatiques d'un membre et donne ceux dont la condition est remplie.
async function verifierBadgesAuto(ctx, userId) {
  const uid = id(userId);
  if (!uid || !ctx?.sbUrl) return { donnes: [] };
  const s = await statsMembre(ctx, uid);
  if (!s) return { donnes: [], erreur: 'base_illisible' };
  const deja = new Set(((await lire(ctx, `user_badges?user_id=eq.${uid}&select=badges(slug)&limit=500`)) || []).map((b) => b.badges?.slug).filter(Boolean));
  if (REGLES.some((r) => r.besoin === 'rangLivreur' && !deja.has(r.slug)) && s.livrees >= 1) {
    s.rangLivreur = rang(await lire(ctx, 'livraisons?statut=in.(payee,paid)&livreur_id=not.is.null&select=livreur_id,livre_le&order=livre_le.asc.nullslast&limit=5000'), 'livreur_id', uid);
  } else s.rangLivreur = Infinity;
  if (REGLES.some((r) => r.besoin === 'rangExpediteur' && !deja.has(r.slug)) && s.envoyees >= 1) {
    s.rangExpediteur = rang(await lire(ctx, 'livraisons?statut=in.(payee,paid)&select=expediteur_id,livre_le&order=livre_le.asc.nullslast&limit=5000'), 'expediteur_id', uid);
  } else s.rangExpediteur = Infinity;
  const donnes = [];
  for (const regle of REGLES) {
    if (deja.has(regle.slug) || !regle.ok(s)) continue;
    if (await donnerBadge(ctx, uid, regle.slug)) donnes.push(regle.slug);
  }
  return { donnes, stats: s };
}

// Parrainage : la première action réelle (livraison payée ou trajet payé) du filleul récompense le parrain,
// une seule fois (100 Points Impact + 50 XP, puis le badge « Parrain actif »).
async function recompenserParrainage(ctx, refereeId, action) {
  const uid = id(refereeId);
  if (!uid) return { donne: false };
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/referrals?referee_id=eq.${uid}&status=eq.pending`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey, 'return=representation'),
      body: JSON.stringify({ status: 'rewarded', action_type: action, rewarded_at: new Date().toISOString(), points_granted: PARRAINAGE_POINTS, xp_granted: PARRAINAGE_XP }),
    });
    if (!r.ok) return { donne: false };
    const rows = await r.json().catch(() => []);
    const ref = Array.isArray(rows) ? rows[0] : null;
    if (!ref?.referrer_id) return { donne: false }; // déjà récompensé, ou pas de parrain
    await rpc(ctx, 'grant_points_impact', { p_user_id: ref.referrer_id, p_amount: PARRAINAGE_POINTS, p_reason: 'referral_reward', p_ref_type: 'referral', p_ref_id: ref.id });
    await rpc(ctx, 'grant_xp', { p_user_id: ref.referrer_id, p_amount: PARRAINAGE_XP, p_reason: 'referral_reward', p_ref_type: 'referral', p_ref_id: ref.id });
    const codes = await lire(ctx, `referral_codes?user_id=eq.${ref.referrer_id}&select=total_rewarded&limit=1`);
    await fetch(`${ctx.sbUrl}/rest/v1/referral_codes?user_id=eq.${ref.referrer_id}`, {
      method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
      body: JSON.stringify({ total_rewarded: (Number(codes?.[0]?.total_rewarded) || 0) + 1 }),
    }).catch(() => {});
    await verifierBadgesAuto(ctx, ref.referrer_id);
    return { donne: true, parrain: ref.referrer_id };
  } catch (_) {
    return { donne: false };
  }
}

// Avis 5 étoiles reçu : +15 XP à la personne évaluée, une seule fois par avis (même s'il est modifié).
async function recompenseAvis5Etoiles(ctx, { reviewedId, reviewerId, refId, rating }) {
  const uid = id(reviewedId);
  if (!uid || Number(rating) !== 5 || !refId || uid === id(reviewerId)) return { donne: false };
  const ok = await uneSeuleFois(ctx, `avis5:${refId}:${reviewerId}:${uid}`, { eventType: EVT_RECOMPENSE, userId: uid, evidence: { sorte: 'avis_5_etoiles', xp: AVIS_5_ETOILES_XP } });
  if (!ok) return { donne: false };
  await rpc(ctx, 'grant_xp', { p_user_id: uid, p_amount: AVIS_5_ETOILES_XP, p_reason: 'avis_5_etoiles', p_ref_type: 'review', p_ref_id: null });
  await verifierBadgesAuto(ctx, uid);
  return { donne: true };
}

// Profil vérifié (identité approuvée par l'admin) : badge « Profil vérifié » (+50 XP, +25 points).
async function badgeProfilVerifie(ctx, userId) {
  return verifierBadgesAuto(ctx, userId);
}

// Jalon « sans réclamation » : le RPC award_claim_free_milestone n'est appelé qu'une fois par jalon
// (la fonction SQL lit puis écrit sans verrou : deux appels simultanés auraient donné les points deux fois).
async function jalonSansReclamation(ctx, userId, cle, points) {
  const uid = id(userId);
  if (!uid || !cle) return false;
  const ok = await uneSeuleFois(ctx, `jalon:${uid}:${cle}`, { eventType: EVT_RECOMPENSE, userId: uid, evidence: { sorte: 'jalon_sans_reclamation', points } });
  if (!ok) return false;
  await rpc(ctx, 'award_claim_free_milestone', { p_driver_id: uid, p_milestone_key: cle, p_points: points });
  return true;
}

module.exports = {
  EVT_RECOMPENSE, REGLES, PARRAINAGE_POINTS, PARRAINAGE_XP, AVIS_5_ETOILES_XP,
  statsMembre, verifierBadgesAuto, recompenserParrainage, recompenseAvis5Etoiles, badgeProfilVerifie, jalonSansReclamation,
};
