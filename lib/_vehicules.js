// lib/_vehicules.js — Véhicules des livreurs et conducteurs, et début de journée obligatoire.
// Sans migration (ancienne base) : tout passe par le journal transaction_audit_events.
//   « vehicule_enregistre » : un véhicule (type, numéro de série ou plaque, capacité, photo) ;
//   « vehicule_retire »     : retiré (par le membre ou l'admin) ; un véhicule retiré ne sert plus ;
//   « debut_journee »       : véhicule du jour + selfie + photo du véhicule (heure du Québec).
// Photos dans le bucket PRIVÉ kyc-documents (vehicules/… et debut-journee/…), lues par l'admin
// avec des liens signés de courte durée. Selfies et photos du jour : 90 jours, sauf litige ouvert.
// Le serveur ne croit plus profiles.transport_mode_actif (le navigateur peut l'écrire lui-même) :
// le jumelage utilise le véhicule du début de journée.
'use strict';

const crypto = require('crypto');
const { sbHeaders, roleIn, parseDataUrl, signStorageUrl, estimateRouteKm, normalizeCity, toNumber } = require('./_lib');

const BUCKET = 'kyc-documents';
const EVT_VEHICULE = 'vehicule_enregistre';
const EVT_RETRAIT = 'vehicule_retire';
const EVT_DEBUT = 'debut_journee';
const CONSERVATION_JOURS = 90;
const TAILLES = ['petit', 'moyen', 'gros', 'xl'];

// Plafonds par type (tableau accepté par Denis). Le plafond appliqué est le plus petit entre
// celui du type et la capacité déclarée du véhicule.
const TYPES = Object.freeze({
  a_pied: { label: 'À pied', tailleMax: 'petit', poidsMax: 5, distanceMax: 5, memeVille: true, covoiturage: false, placesMax: 0, photo: false, numero: false },
  trottinette_electrique: { label: 'Trottinette électrique', tailleMax: 'petit', poidsMax: 10, distanceMax: 15, memeVille: true, covoiturage: false, placesMax: 0, photo: true, numero: true },
  velo: { label: 'Vélo', tailleMax: 'moyen', poidsMax: 15, distanceMax: 20, memeVille: true, sansEpicerie: true, covoiturage: false, placesMax: 0, photo: true, numero: true },
  velo_electrique: { label: 'Vélo électrique', tailleMax: 'moyen', poidsMax: 20, distanceMax: 25, memeVille: true, sansEpicerie: true, covoiturage: false, placesMax: 0, photo: true, numero: true },
  moto: { label: 'Moto', tailleMax: 'moyen', poidsMax: 30, distanceMax: null, memeVille: false, covoiturage: false, placesMax: 0, photo: true, numero: true },
  auto: { label: 'Auto', tailleMax: 'gros', poidsMax: 100, distanceMax: null, memeVille: false, covoiturage: true, placesMax: 7, photo: true, numero: true },
  vus: { label: 'VUS', tailleMax: 'gros', poidsMax: 150, distanceMax: null, memeVille: false, covoiturage: true, placesMax: 8, photo: true, numero: true },
  camionnette: { label: 'Camionnette', tailleMax: 'xl', poidsMax: 500, distanceMax: null, memeVille: false, meubles: true, covoiturage: true, placesMax: 8, photo: true, numero: true },
});

function id(v) {
  const s = String(v || '').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(s) ? s : null;
}

// Date du Québec « AAAA-MM-JJ ».
function dateQc(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function rangTaille(t) {
  const i = TAILLES.indexOf(String(t || '').toLowerCase());
  return i < 0 ? 1 : i; // taille inconnue : traitée comme « moyen » (prudent)
}

// Capacité réelle : plafonds du type, réduits par ce que le membre a déclaré.
function capaciteReelle(v) {
  const t = TYPES[v?.type];
  if (!t) return null;
  const decl = v.capacite || {};
  const tailleDecl = TAILLES.includes(decl.taille_max) ? decl.taille_max : t.tailleMax;
  const poidsDecl = toNumber(decl.poids_max_kg, t.poidsMax);
  const placesDecl = toNumber(decl.places, t.placesMax);
  return {
    tailleMax: TAILLES[Math.min(rangTaille(t.tailleMax), rangTaille(tailleDecl))],
    poidsMax: Math.max(0, Math.min(t.poidsMax, poidsDecl > 0 ? poidsDecl : t.poidsMax)),
    places: t.covoiturage ? Math.max(0, Math.min(t.placesMax, Math.floor(placesDecl))) : 0,
    distanceMax: t.distanceMax,
    memeVille: t.memeVille,
  };
}

// Le colis convient-il au véhicule du jour ?
function eligibiliteVehicule(v, livraison, profil = {}) {
  const t = TYPES[v?.type];
  const mode = v?.type || 'aucun';
  const routeKm = estimateRouteKm(livraison?.ville_depart, livraison?.ville_arrivee);
  if (!t) return { allowed: false, reason: 'Aucun véhicule du jour', mode, routeKm };
  const cap = capaciteReelle(v);
  const de = normalizeCity(livraison?.ville_depart || '');
  const a = normalizeCity(livraison?.ville_arrivee || '');
  if (!de || !a) return { allowed: false, reason: 'Villes de livraison incomplètes', mode, routeKm };
  const taille = String(livraison?.taille_colis || '').toLowerCase();
  const poids = toNumber(livraison?.poids_kg, null);
  const type = String(livraison?.type_colis || '').toLowerCase();
  if (rangTaille(taille || 'moyen') > rangTaille(cap.tailleMax)) return { allowed: false, reason: `${t.label} : colis trop gros (maximum « ${cap.tailleMax} »)`, mode, routeKm };
  if (poids !== null && poids > cap.poidsMax) return { allowed: false, reason: `${t.label} : colis trop lourd (maximum ${cap.poidsMax} kg)`, mode, routeKm };
  if (type === 'meuble' && !t.meubles) return { allowed: false, reason: `${t.label} : un meuble demande une camionnette`, mode, routeKm };
  if (type === 'nourriture' && t.sansEpicerie) return { allowed: false, reason: `${t.label} : pas d'épicerie`, mode, routeKm };
  if (cap.memeVille) {
    if (de !== a) return { allowed: false, reason: `${t.label} : même ville seulement`, mode, routeKm };
    const ville = normalizeCity(profil?.ville || '');
    if (ville && ville !== de) return { allowed: false, reason: `${t.label} : ville de départ trop loin`, mode, routeKm };
    if (routeKm !== null && cap.distanceMax !== null && routeKm > cap.distanceMax) return { allowed: false, reason: `${t.label} : ${cap.distanceMax} km au maximum`, mode, routeKm };
  }
  return { allowed: true, reason: `Compatible : ${t.label}`, mode, routeKm };
}

// ── Lecture du journal ─────────────────────────────────────────────────────
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

// Véhicules actifs d'un membre (le dernier événement de chaque véhicule gagne). null si illisible.
async function vehiculesDe(ctx, userId) {
  const uid = id(userId);
  if (!uid) return [];
  const rows = await lire(ctx, `transaction_audit_events?user_id=eq.${uid}&event_type=in.(${EVT_VEHICULE},${EVT_RETRAIT})&select=id,event_type,created_at,evidence&order=created_at.asc&limit=500`);
  if (!rows) return null;
  const parId = new Map();
  for (const e of rows) {
    const v = e.evidence || {};
    if (!v.vehicule_id) continue;
    if (e.event_type === EVT_RETRAIT) parId.delete(v.vehicule_id);
    else parId.set(v.vehicule_id, { ...v, enregistre_le: e.created_at });
  }
  return [...parId.values()];
}

// Début de journée valide aujourd'hui (le plus récent), avec son véhicule encore actif. null sinon.
async function debutDuJour(ctx, userId, maintenant = new Date()) {
  const uid = id(userId);
  if (!uid) return null;
  const jour = dateQc(maintenant);
  const rows = await lire(ctx, `transaction_audit_events?user_id=eq.${uid}&event_type=eq.${EVT_DEBUT}&evidence->>date_qc=eq.${jour}&select=id,created_at,evidence&order=created_at.desc&limit=1`);
  const d = rows && rows[0];
  if (!d) return null;
  const actifs = await vehiculesDe(ctx, uid);
  const v = (actifs || []).find((x) => x.vehicule_id === d.evidence?.vehicule_id);
  if (!v) return null; // véhicule retiré depuis : il faut refaire le début de journée
  return { ...d.evidence, debut_id: d.id, commence_le: d.created_at, vehicule: v };
}

async function ecrire(ctx, ligne) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey, 'return=representation'),
    body: JSON.stringify(ligne),
  }).catch(() => null);
  return Boolean(r && r.ok);
}

async function televerser(ctx, chemin, dataUrl) {
  const p = parseDataUrl(dataUrl);
  if (!p || !p.buffer || !p.buffer.length) { const e = new Error('Photo invalide ou vide'); e.status = 400; throw e; }
  if (!/^image\//.test(p.mimeType)) { const e = new Error('Une photo est requise'); e.status = 400; throw e; }
  if (p.buffer.length > 900000) { const e = new Error('Photo trop lourde. Reprends une photo plus légère.'); e.status = 413; throw e; }
  const objet = `${chemin}.${p.ext}`;
  const r = await fetch(`${ctx.sbUrl}/storage/v1/object/${BUCKET}/${objet}`, {
    method: 'POST',
    headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}`, 'Content-Type': p.mimeType, 'x-upsert': 'false' },
    body: p.buffer,
  }).catch(() => null);
  if (!r || !r.ok) { const e = new Error('Photo non enregistrée. Réessaie.'); e.status = 502; throw e; }
  return objet;
}

// ── Endpoints membre ───────────────────────────────────────────────────────
async function mesVehicules(req, res, ctx) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const v = await vehiculesDe(ctx, ctx.session.id);
  if (v === null) return res.status(503).json({ error: 'Lecture impossible. Réessaie.' });
  const d = await debutDuJour(ctx, ctx.session.id);
  // Membres actuels (décision de Denis) : un livreur ou un conducteur doit enregistrer son véhicule
  // à sa prochaine connexion ; l'ancien choix « véhicule du jour » ne compte plus.
  let conducteur = false;
  if (!v.length) {
    const r = await lire(ctx, `rides?driver_id=eq.${encodeURIComponent(ctx.session.id)}&select=id&limit=1`);
    conducteur = Boolean(r && r.length);
  }
  const doitEnregistrer = !v.length && (roleIn(ctx.profile, ['livreur', 'les deux']) || ctx.profile?.driver_status === 'verified' || conducteur);
  return res.status(200).json({
    success: true,
    doit_enregistrer: doitEnregistrer,
    vehicules: v.map(publicVehicule),
    debut_journee: d ? { vehicule_id: d.vehicule_id, type: d.vehicule.type, label: TYPES[d.vehicule.type]?.label, commence_le: d.commence_le } : null,
    types: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { label: t.label, tailleMax: t.tailleMax, poidsMax: t.poidsMax, placesMax: t.placesMax, covoiturage: t.covoiturage, photo: t.photo, numero: t.numero }])),
  });
}

function publicVehicule(v) {
  return { vehicule_id: v.vehicule_id, type: v.type, label: TYPES[v.type]?.label || v.type, description: v.description || '', numero: v.numero || '', capacite: capaciteReelle(v), photo: Boolean(v.photo_path), enregistre_le: v.enregistre_le };
}

async function enregistrerVehicule(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const type = String(body.type || '');
  const t = TYPES[type];
  if (!t) return res.status(400).json({ error: 'Type de véhicule inconnu' });
  const numero = String(body.numero || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 40);
  if (t.numero && !/^[A-Z0-9][A-Z0-9 -]{2,39}$/.test(numero)) return res.status(400).json({ error: 'Numéro de série ou plaque requis (3 caractères ou plus)' });
  if (t.photo && !body.photo_data_url) return res.status(400).json({ error: 'Photo du véhicule requise' });
  const actifs = await vehiculesDe(ctx, ctx.session.id);
  if (actifs === null) return res.status(503).json({ error: 'Lecture impossible : rien n’a été enregistré.' });
  if (actifs.length >= 10) return res.status(409).json({ error: '10 véhicules au maximum' });
  if (t.numero && actifs.some((v) => v.numero === numero)) return res.status(409).json({ error: 'Ce véhicule est déjà enregistré' });
  const vehiculeId = crypto.randomUUID();
  let photoPath = null;
  if (t.photo) {
    try { photoPath = await televerser(ctx, `vehicules/${ctx.session.id}/${vehiculeId}`, body.photo_data_url); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  }
  const capacite = {
    taille_max: TAILLES.includes(body.taille_max) && rangTaille(body.taille_max) <= rangTaille(t.tailleMax) ? body.taille_max : t.tailleMax,
    poids_max_kg: Math.max(0, Math.min(t.poidsMax, toNumber(body.poids_max_kg, t.poidsMax) || t.poidsMax)),
    places: t.covoiturage ? Math.max(0, Math.min(t.placesMax, Math.floor(toNumber(body.places, 0)))) : 0,
  };
  const evidence = { vehicule_id: vehiculeId, type, description: String(body.description || '').trim().slice(0, 80), numero: t.numero ? numero : '', capacite, photo_path: photoPath, source: 'lib/_vehicules' };
  if (!(await ecrire(ctx, { user_id: ctx.session.id, actor_id: ctx.session.id, event_type: EVT_VEHICULE, status: 'actif', evidence }))) {
    return res.status(503).json({ error: 'Journal indisponible : véhicule non enregistré.' });
  }
  return res.status(200).json({ success: true, vehicule: publicVehicule({ ...evidence, enregistre_le: new Date().toISOString() }) });
}

async function retirerVehicule(req, res, ctx, body, { parAdmin = false } = {}) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  if (parAdmin && !roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const proprio = parAdmin ? id(body.user_id) : ctx.session.id;
  const vid = String(body.vehicule_id || '');
  const actifs = await vehiculesDe(ctx, proprio);
  if (actifs === null) return res.status(503).json({ error: 'Lecture impossible' });
  if (!actifs.some((v) => v.vehicule_id === vid)) return res.status(404).json({ error: 'Véhicule introuvable' });
  const ok = await ecrire(ctx, { user_id: proprio, actor_id: ctx.session.id, event_type: EVT_RETRAIT, status: 'retire', evidence: { vehicule_id: vid, par: parAdmin ? 'admin' : 'membre', raison: String(body.raison || '').slice(0, 200) || null } });
  if (!ok) return res.status(503).json({ error: 'Journal indisponible : rien n’a changé.' });
  return res.status(200).json({ success: true });
}

// Correspondance avec l'ancien champ (affichage seulement) : profiles.transport_mode_actif.
const MODE_ANCIEN = { a_pied: 'pied', trottinette_electrique: 'trottinette', velo: 'velo', velo_electrique: 'velo', moto: 'moto', auto: 'auto', vus: 'auto', camionnette: 'camionnette' };

async function commencerJournee(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const actifs = await vehiculesDe(ctx, ctx.session.id);
  if (actifs === null) return res.status(503).json({ error: 'Lecture impossible. Réessaie.' });
  if (!actifs.length) return res.status(409).json({ error: 'Enregistre d’abord ton véhicule.', code: 'vehicule_requis' });
  const v = actifs.find((x) => x.vehicule_id === String(body.vehicule_id || ''));
  if (!v) return res.status(400).json({ error: 'Choisis un de tes véhicules enregistrés. Un véhicule non enregistré ne peut pas servir.' });
  if (!body.selfie_data_url) return res.status(400).json({ error: 'Selfie requis' });
  const photoRequise = TYPES[v.type]?.photo;
  if (photoRequise && !body.photo_data_url) return res.status(400).json({ error: 'Photo du véhicule requise' });
  const jour = dateQc();
  const base = `debut-journee/${ctx.session.id}/${jour}/${Date.now()}`;
  let selfie;
  let photo = null;
  try {
    selfie = await televerser(ctx, `${base}-selfie`, body.selfie_data_url);
    if (photoRequise) photo = await televerser(ctx, `${base}-vehicule`, body.photo_data_url);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  const ok = await ecrire(ctx, {
    user_id: ctx.session.id, actor_id: ctx.session.id, event_type: EVT_DEBUT, status: 'commence',
    evidence: { vehicule_id: v.vehicule_id, type: v.type, date_qc: jour, selfie_path: selfie, photo_path: photo, source: 'lib/_vehicules' },
  });
  if (!ok) return res.status(503).json({ error: 'Journal indisponible : début de journée non enregistré.' });
  await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(ctx.session.id)}`, {
    method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ transport_mode_actif: MODE_ANCIEN[v.type] || v.type }),
  }).catch(() => {});
  return res.status(200).json({ success: true, debut_journee: { vehicule_id: v.vehicule_id, type: v.type, label: TYPES[v.type].label, date_qc: jour } });
}

// ── Covoiturage ────────────────────────────────────────────────────────────
// À la publication : un véhicule enregistré qui transporte des passagers, avec assez de places.
async function vehiculePourTrajet(ctx, userId, placesDemandees, vehiculeId = null) {
  const actifs = await vehiculesDe(ctx, userId);
  if (actifs === null) return { ok: false, status: 503, error: 'Lecture des véhicules impossible. Réessaie.' };
  const possibles = actifs.filter((v) => TYPES[v.type]?.covoiturage && capaciteReelle(v).places >= Math.max(1, Number(placesDemandees) || 1));
  const v = vehiculeId ? possibles.find((x) => x.vehicule_id === vehiculeId) : possibles[0];
  if (!v) return { ok: false, status: 409, code: 'vehicule_requis', error: `Enregistre un véhicule avec au moins ${Math.max(1, Number(placesDemandees) || 1)} place(s) passager (auto, VUS ou camionnette) avant de publier un trajet.` };
  return { ok: true, vehicule: v };
}

// Au départ : début de journée fait aujourd'hui avec un véhicule de covoiturage qui a assez de places.
async function departTrajetPermis(ctx, userId, placesDuTrajet) {
  const d = await debutDuJour(ctx, userId);
  if (!d) return { ok: false, status: 409, code: 'debut_journee_requis', error: 'Fais ton début de journée (véhicule, selfie, photo) avant de partir.' };
  if (!TYPES[d.vehicule.type]?.covoiturage || capaciteReelle(d.vehicule).places < Math.max(1, Number(placesDuTrajet) || 1)) {
    return { ok: false, status: 409, code: 'vehicule_du_jour_incompatible', error: 'Ton véhicule du jour ne peut pas transporter ces passagers. Refais ton début de journée avec le bon véhicule.' };
  }
  return { ok: true, debut: d };
}

// ── Admin ──────────────────────────────────────────────────────────────────
async function adminVehicules(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : dateQc();
  const veh = await lire(ctx, `transaction_audit_events?event_type=in.(${EVT_VEHICULE},${EVT_RETRAIT})&select=user_id,event_type,created_at,evidence&order=created_at.asc&limit=5000`);
  const debuts = await lire(ctx, `transaction_audit_events?event_type=eq.${EVT_DEBUT}&evidence->>date_qc=eq.${jour}&select=user_id,created_at,evidence&order=created_at.desc&limit=500`);
  if (!veh || !debuts) return res.status(503).json({ error: 'Journal illisible' });
  const parMembre = new Map();
  for (const e of veh) {
    const m = parMembre.get(e.user_id) || new Map();
    if (e.event_type === EVT_RETRAIT) m.delete(e.evidence?.vehicule_id);
    else m.set(e.evidence?.vehicule_id, { ...e.evidence, enregistre_le: e.created_at });
    parMembre.set(e.user_id, m);
  }
  const signe = (p) => (p ? signStorageUrl(ctx.sbUrl, ctx.sbKey, BUCKET, p).catch(() => null) : null);
  const vehicules = [];
  for (const [uid, m] of parMembre) for (const v of m.values()) vehicules.push({ user_id: uid, ...publicVehicule(v), photo_url: await signe(v.photo_path) });
  const jourListe = [];
  for (const d of debuts) jourListe.push({ user_id: d.user_id, commence_le: d.created_at, vehicule_id: d.evidence?.vehicule_id, type: d.evidence?.type, label: TYPES[d.evidence?.type]?.label, selfie_url: await signe(d.evidence?.selfie_path), photo_url: await signe(d.evidence?.photo_path), photos_supprimees: Boolean(d.evidence?.photos_supprimees_le) });
  return res.status(200).json({ success: true, date: jour, vehicules, debuts_journee: jourListe });
}

// ── Conservation : 90 jours, sauf litige ouvert ────────────────────────────
async function litigeOuvert(ctx, uid) {
  const rows = await lire(ctx, `livraisons?or=(livreur_id.eq.${uid},expediteur_id.eq.${uid})&statut=eq.litige&select=id&limit=1`);
  return rows === null ? true : rows.length > 0; // illisible : on garde (prudent)
}

async function purgerPhotosDuJour(ctx, maintenant = new Date()) {
  const limite = new Date(maintenant.getTime() - CONSERVATION_JOURS * 86400000).toISOString();
  const rows = await lire(ctx, `transaction_audit_events?event_type=eq.${EVT_DEBUT}&created_at=lt.${encodeURIComponent(limite)}&select=id,user_id,evidence&limit=500`);
  if (!rows) return { purges: 0, gardes: 0, erreur: 'journal_illisible' };
  let purges = 0;
  let gardes = 0;
  for (const e of rows) {
    const ev = e.evidence || {};
    if (ev.photos_supprimees_le) continue;
    if (await litigeOuvert(ctx, e.user_id)) { gardes += 1; continue; }
    const chemins = [ev.selfie_path, ev.photo_path].filter(Boolean);
    if (chemins.length) {
      const r = await fetch(`${ctx.sbUrl}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE', headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: chemins }),
      }).catch(() => null);
      if (!r || !r.ok) continue;
    }
    await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?id=eq.${encodeURIComponent(e.id)}`, {
      method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
      body: JSON.stringify({ evidence: { ...ev, selfie_path: null, photo_path: null, photos_supprimees_le: maintenant.toISOString() } }),
    }).catch(() => {});
    purges += 1;
  }
  return { purges, gardes };
}

module.exports = {
  TYPES, TAILLES, BUCKET, CONSERVATION_JOURS, EVT_VEHICULE, EVT_RETRAIT, EVT_DEBUT,
  dateQc, capaciteReelle, eligibiliteVehicule, vehiculesDe, debutDuJour,
  mesVehicules, enregistrerVehicule, retirerVehicule, commencerJournee,
  vehiculePourTrajet, departTrajetPermis, adminVehicules, purgerPhotosDuJour, litigeOuvert,
};
