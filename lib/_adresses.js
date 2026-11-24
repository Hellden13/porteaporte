// lib/_adresses.js — Suggestions d'adresses (décision de Denis, 24 nov. 2026)
// Google Places (New) en principal, Geoapify en secours. Les clés restent sur le serveur.
// Sessions d'autocomplétion (un jeton par recherche, fermé par la demande de détails),
// limites par membre et par IP, quota journalier compté en base (bloqué si la base ne répond pas).
// Le texte libre reste toujours accepté : une panne ou un quota atteint donne simplement aucune suggestion.
'use strict';

const { getClientIp } = require('./_ratelimit');

const GOOGLE_AUTO = 'https://places.googleapis.com/v1/places:autocomplete';
const GOOGLE_LIEU = 'https://places.googleapis.com/v1/places/';
const GEO_AUTO = 'https://api.geoapify.com/v1/geocode/autocomplete';
const GEO_INVERSE = 'https://api.geoapify.com/v1/geocode/reverse';
// Priorité à la région Lévis / Québec.
const CENTRE = { latitude: 46.75, longitude: -71.19 };
const RAYON_M = 50000;
const MAX_SUGGESTIONS = 5;
const DELAI_MS = 2500;       // Google répond en 0,1 à 0,2 s
const DELAI_SECOURS_MS = 4500; // Geoapify : 0,4 à 8 s mesurés le 24 nov.

// Limites par membre et par IP : [nombre, fenêtre en secondes].
const LIMITES = {
  suggestions: { membre: [60, 600], ip: [120, 600] },
  details: { membre: [20, 600], ip: [40, 600] },
};
// Quota journalier : Google environ 10 000 requêtes gratuites par mois et par service (≈ 330 par jour).
// Geoapify gratuit : 3 000 crédits par jour.
function quotas() {
  const n = (v, d) => { const x = parseInt(v, 10); return Number.isFinite(x) && x >= 0 ? x : d; };
  return {
    google_suggestions: n(process.env.ADRESSES_GOOGLE_SUGGESTIONS_JOUR, 330),
    google_details: n(process.env.ADRESSES_GOOGLE_DETAILS_JOUR, 330),
    geoapify: n(process.env.ADRESSES_GEOAPIFY_JOUR, 2500),
  };
}
// Le ménage de rate_limits (cron-cleanup à 03:00 UTC) efface les lignes de plus d'une heure.
// La « journée » du quota commence donc à 03:00 UTC : le ménage ne touche jamais le compteur du jour en cours.
const DEBUT_JOURNEE_UTC_H = 3;
function journee(maintenant = Date.now()) {
  return new Date(maintenant - DEBUT_JOURNEE_UTC_H * 3600 * 1000).toISOString().slice(0, 10);
}

const env = (k) => String(process.env[k] || '').trim();

// ─── Validation des entrées ──────────────────────────────────────────────────
function texteRecherche(q) {
  const t = String(q == null ? '' : q).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return '';
  return t.slice(0, 120);
}
const jetonSession = (s) => (typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s) ? s : null);
const idLieu = (s) => (typeof s === 'string' && /^[A-Za-z0-9_-]{10,300}$/.test(s) ? s : null);

// ─── Nettoyage ───────────────────────────────────────────────────────────────
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => sansAccents(s).toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const mots = (s) => new Set(norm(s).split(' ').filter(Boolean));
const inclus = (a, b) => { for (const x of a) if (!b.has(x)) return false; return true; };
// « Hôpital Hôtel-Dieu de Lévis » et « Hôtel-Dieu de Lévis Urgence » à la même adresse : même endroit.
const semblables = (a, b) => { let c = 0; for (const x of a) if (b.has(x)) c++; return c / (a.size + b.size - c) >= 0.6; };

// Arrondissements : trop larges pour servir de secteur (« Les Chutes-de-la-Chaudière-Ouest » ≠ Saint-Nicolas).
const ARRONDISSEMENTS = new Set([
  'les chutes de la chaudiere ouest', 'les chutes de la chaudiere est', 'chutes de la chaudiere ouest', 'chutes de la chaudiere est',
  'les chutes de la chaudiere', 'desjardins', 'sainte foy sillery cap rouge', 'la cite limoilou', 'les rivieres',
  'la haute saint charles',
].map(norm));
const estArrondissement = (s) => ARRONDISSEMENTS.has(norm(s));
const GRANDES_VILLES = new Set(['levis', 'quebec', 'montreal', 'laval', 'gatineau', 'longueuil', 'sherbrooke', 'saguenay', 'trois rivieres']);

// Mots anglais fréquents dans les noms de lieux → français.
const TRADUCTIONS = [
  [/\bemergency room\b/gi, 'Urgence'],
  [/\bemergency\b/gi, 'Urgence'],
  [/\bgas station\b/gi, 'Station-service'],
  [/\bgasoline\b/gi, 'Station-service'],
  [/\bbus terminal\b/gi, 'Terminus d’autobus'],
  [/\bbus station\b/gi, 'Terminus d’autobus'],
  [/\btrain station\b/gi, 'Gare'],
  [/\bparking lot\b/gi, 'Stationnement'],
  [/\bparking\b/gi, 'Stationnement'],
  [/\bairport\b/gi, 'Aéroport'],
  [/\bhospital\b/gi, 'Hôpital'],
  [/\bpharmacy\b/gi, 'Pharmacie'],
  [/\bcity hall\b/gi, 'Hôtel de ville'],
  [/\s+wholesale\b/gi, ''],
];
// Lieux inutiles pour un départ, une destination ou un embarquement.
const NOMS_INUTILES = /\b(photography spot|photo spot|photo point|selfie|viewpoint|instagram)\b/i;
const TYPES_INUTILES = new Set(['atm', 'post_box', 'public_bathroom', 'toilet', 'plus_code']);
// Inutile seulement si le lieu n'est QUE ça (Google range « atm » parmi les types d'une cathédrale).
const TYPES_GENERIQUES = new Set(['establishment', 'point_of_interest', 'finance']);
const lieuInutile = (types) => {
  const precis = types.filter((t) => !TYPES_GENERIQUES.has(t));
  return precis.length > 0 && precis.every((t) => TYPES_INUTILES.has(t));
};
const PETITS_MOTS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'à', 'au', 'aux', 'sur', 'en', 'd', 'l']);

function majusculesPropres(s) {
  // « PLACE LAURIER » → « Place Laurier » (seulement si tout est en majuscules)
  const lettres = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (lettres.length < 4 || lettres !== lettres.toUpperCase()) return s;
  return s.toLowerCase().split(/(\s+|-)/).map((m, i) => (i > 0 && PETITS_MOTS.has(m) ? m : m.charAt(0).toUpperCase() + m.slice(1))).join('');
}

function nettoyerNom(nom) {
  let s = String(nom || '').replace(/\s+/g, ' ').trim();
  for (const [re, fr] of TRADUCTIONS) s = s.replace(re, fr);
  s = s.replace(/(\([^)]*\))(\s*\1)+/g, '$1'); // « (YQB) (YQB) » → « (YQB) »
  s = majusculesPropres(s);
  return s.replace(/\s+/g, ' ').replace(/\s+([,)])/g, '$1').trim();
}

// « Route Marie-Victorin, Les Chutes-de-la-Chaudière-Ouest, Lévis, QC, Canada » → { rue, secteur, ville }
function decouperSecondaire(texte) {
  let p = String(texte || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (p.length && norm(p[p.length - 1]) === 'canada') p.pop();
  // Province : « QC » toujours ; « Québec » seulement quand une ville la précède (« Saint-Jean-sur-Richelieu, Québec »).
  if (p.length && norm(p[p.length - 1]) === 'qc') p.pop();
  else if (p.length >= 2 && norm(p[p.length - 1]) === 'quebec') p.pop();
  p = p.filter((x) => !estArrondissement(x));
  let ville = p.length ? p[p.length - 1] : '';
  let avant = p.slice(0, -1);
  // « Rue de la Concorde, Lévis, Saint-Romuald » : la grande ville passe en dernier.
  if (avant.length && GRANDES_VILLES.has(norm(avant[avant.length - 1])) && !GRANDES_VILLES.has(norm(ville))) {
    const v = avant[avant.length - 1];
    avant = avant.slice(0, -1).concat([ville]);
    ville = v;
  }
  const RUE = /^(\d+\s+)?(\d+(e|re|er)\s+)?(rue|route|rte|boulevard|boul|bd|chemin|ch|avenue|av|rang|place|côte|cote|montée|montee|autoroute|promenade|carré|carre|allée|allee|impasse|terrasse|croissant)\b/i;
  const rue = avant.find((x) => RUE.test(x)) || '';
  const secteur = avant.filter((x) => x !== rue && /^[A-ZÀ-Ö0-9]/.test(x)).pop() || '';
  return { rue, secteur, ville };
}

function libelleSecondaire({ rue, secteur, ville }) {
  const lieu = [secteur, ville].filter(Boolean).filter((x, i, a) => a.findIndex((y) => norm(y) === norm(x)) === i).join(', ');
  return [rue, lieu].filter(Boolean).join(' · ');
}

// Doublons : même rue et même ville, et un nom contenu dans l'autre ou presque pareil.
function sansDoublons(liste) {
  const gardes = [];
  for (const s of liste) {
    const m = mots(s.principal);
    const cleDe = (x) => norm(x.rue).replace(/^\d+ /, '') + '|' + norm(x.ville); // « 1401 18e Rue » = « 18e Rue »
    const cle = cleDe(s);
    const double = gardes.some((g) => {
      if (cleDe(g) !== cle) return false;
      const n = mots(g.principal);
      return inclus(m, n) || inclus(n, m) || semblables(m, n);
    });
    if (!double) gardes.push(s);
  }
  return gardes;
}

function suggestionsGoogle(data) {
  const brutes = [];
  for (const s of (data && data.suggestions) || []) {
    const p = s && s.placePrediction;
    if (!p || !idLieu(p.placeId)) continue;
    const f = p.structuredFormat || {};
    const nomBrut = (f.mainText && f.mainText.text) || (p.text && p.text.text) || '';
    const types = Array.isArray(p.types) ? p.types : [];
    if (!nomBrut || NOMS_INUTILES.test(nomBrut) || lieuInutile(types)) continue;
    const morceaux = decouperSecondaire(f.secondaryText && f.secondaryText.text);
    brutes.push({
      id: p.placeId,
      principal: nettoyerNom(nomBrut),
      rue: morceaux.rue,
      secteur: morceaux.secteur,
      ville: morceaux.ville,
      etablissement: types.includes('establishment') || types.includes('point_of_interest'),
    });
  }
  return sansDoublons(brutes).slice(0, MAX_SUGGESTIONS).map((s) => ({
    id: s.id, principal: s.principal, secondaire: libelleSecondaire(s), secteur: s.secteur, ville: s.ville, etablissement: s.etablissement,
  }));
}

function adresseGeoapify(r) {
  const ligne1 = [r.housenumber, r.street].filter(Boolean).join(' ') || r.address_line1 || r.name || '';
  const ville = r.city || r.town || r.village || r.municipality || '';
  let secteur = String(r.suburb || r.district || '').replace(/\s*\([^)]*\)\s*$/, ''); // « Lévis (quartier) »
  if (estArrondissement(secteur) || norm(secteur) === norm(ville)) secteur = '';
  return {
    ligne1: nettoyerNom(ligne1),
    ville,
    secteur,
    code_postal: formatCodePostal(r.postcode),
    province: r.state_code || '',
    etablissement: r.result_type === 'amenity',
  };
}

function suggestionsGeoapify(data) {
  const brutes = [];
  for (const r of (data && data.results) || []) {
    if (!r || (r.country_code && r.country_code !== 'ca')) continue;
    const a = adresseGeoapify(r);
    const principal = nettoyerNom(r.name || a.ligne1);
    // Arrêts d'autobus d'OpenStreetMap (« de la Traverse / du Rail ») : inutiles ici.
    if (!principal || NOMS_INUTILES.test(principal) || /^[a-zà-ÿ]/.test(principal)) continue;
    const rue = r.name && a.ligne1 && norm(a.ligne1) !== norm(principal) ? a.ligne1 : (r.street && norm(r.street) !== norm(principal) ? r.street : '');
    brutes.push({ principal, rue, secteur: a.secteur, ville: a.ville, details: a, etablissement: a.etablissement });
  }
  return sansDoublons(brutes).slice(0, MAX_SUGGESTIONS).map((s) => ({
    id: null, principal: s.principal, secondaire: libelleSecondaire(s), secteur: s.secteur, ville: s.ville, etablissement: s.etablissement,
    details: { ...s.details, adresse_complete: [s.details.ligne1, s.details.ville, s.details.province, s.details.code_postal].filter(Boolean).join(', ') },
  }));
}

function formatCodePostal(cp) {
  const c = String(cp || '').toUpperCase().replace(/\s+/g, '');
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(c) ? c.slice(0, 3) + ' ' + c.slice(3) : String(cp || '').trim();
}

function adresseGoogle(lieu) {
  const comp = (type, court) => {
    const c = ((lieu && lieu.addressComponents) || []).find((x) => Array.isArray(x.types) && x.types.includes(type));
    return c ? (court ? c.shortText : c.longText) || '' : '';
  };
  const ville = comp('locality') || comp('postal_town') || comp('administrative_area_level_3') || comp('sublocality_level_1');
  let secteur = comp('neighborhood') || comp('sublocality_level_1');
  if (estArrondissement(secteur) || norm(secteur) === norm(ville)) secteur = '';
  const ligne1 = [comp('street_number'), comp('route')].filter(Boolean).join(' ');
  const types = Array.isArray(lieu && lieu.types) ? lieu.types : [];
  return {
    ligne1,
    ville,
    secteur,
    code_postal: formatCodePostal(comp('postal_code')),
    province: comp('administrative_area_level_1', true),
    adresse_complete: String((lieu && lieu.formattedAddress) || '').replace(/,\s*Canada$/, ''),
    etablissement: types.includes('establishment') || types.includes('point_of_interest'),
    _position: lieu && lieu.location ? { lat: Number(lieu.location.latitude), lon: Number(lieu.location.longitude) } : null,
  };
}

// ─── Appels externes ─────────────────────────────────────────────────────────
// Délai indépendant du fetch : si le fournisseur ne répond pas, on passe au secours.
async function appel(url, options, delai) {
  let minuterie;
  const limite = new Promise((_, rej) => { minuterie = setTimeout(() => rej(new Error('delai')), delai); });
  try {
    const r = await Promise.race([fetch(url, options), limite]);
    if (!r || !r.ok) return null;
    return await Promise.race([r.json(), limite]);
  } catch (_) {
    return null; // jamais l'URL ni la clé dans un message d'erreur
  } finally {
    clearTimeout(minuterie);
  }
}

// Compteur en base (RPC check_rate_limit). Pour un quota : si la base ne répond pas, c'est NON.
async function compter(ctx, cle, max, secondes) {
  if (max <= 0) return false;
  try {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: cle, p_max: max, p_window_seconds: secondes }),
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch (_) {
    return false;
  }
}
const quotaDuJour = (ctx, service, max) => compter(ctx, `adresses:${service}:${journee(ctx.maintenant)}`, max, 26 * 3600);

async function limiter(req, ctx, sorte) {
  const L = LIMITES[sorte];
  const membre = await compter(ctx, `adresses:${sorte}:membre:${ctx.session.id}`, L.membre[0], L.membre[1]);
  if (!membre) return false;
  return compter(ctx, `adresses:${sorte}:ip:${getClientIp(req) || 'inconnue'}`, L.ip[0], L.ip[1]);
}

async function googleSuggestions(q, session, ctx) {
  const cle = env('GOOGLE_PLACES_API_KEY');
  if (!cle) return null;
  if (!(await quotaDuJour(ctx, 'google_suggestions', quotas().google_suggestions))) return null;
  const d = await appel(GOOGLE_AUTO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle },
    body: JSON.stringify({
      input: q, languageCode: 'fr', regionCode: 'ca', includedRegionCodes: ['ca'], sessionToken: session,
      locationBias: { circle: { center: CENTRE, radius: RAYON_M } },
    }),
  }, ctx.delaiMs || DELAI_MS);
  return d ? suggestionsGoogle(d) : null;
}

async function geoapifySuggestions(q, ctx) {
  const cle = env('GEOAPIFY_API_KEY');
  if (!cle) return null;
  if (!(await quotaDuJour(ctx, 'geoapify', quotas().geoapify))) return null;
  const p = new URLSearchParams({ text: q, lang: 'fr', filter: 'countrycode:ca', bias: `proximity:${CENTRE.longitude},${CENTRE.latitude}`, limit: '8', format: 'json', apiKey: cle });
  const d = await appel(`${GEO_AUTO}?${p}`, { method: 'GET' }, ctx.delaiMs || DELAI_SECOURS_MS);
  return d ? suggestionsGeoapify(d) : null;
}

// Secteur précis (« Saint-Nicolas ») : Google ne donne que l'arrondissement à Lévis et à Québec.
async function secteurGeoapify(pos, ctx) {
  const cle = env('GEOAPIFY_API_KEY');
  if (!cle || !pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
  if (!(await quotaDuJour(ctx, 'geoapify', quotas().geoapify))) return null;
  const p = new URLSearchParams({ lat: String(pos.lat), lon: String(pos.lon), lang: 'fr', format: 'json', apiKey: cle });
  const d = await appel(`${GEO_INVERSE}?${p}`, { method: 'GET' }, ctx.delaiMs || DELAI_MS);
  const r = d && d.results && d.results[0];
  if (!r) return null;
  const s = r.suburb || '';
  return s && !estArrondissement(s) ? { secteur: s, ville: r.city || '' } : null;
}

const ATTRIBUTION = { google: 'Google Maps', geoapify: 'Geoapify · © OpenStreetMap' };

// ─── Points d'accès (membre connecté) ────────────────────────────────────────
async function suggestions(req, res, ctx, body) {
  if (!ctx.session || !ctx.session.id) return res.status(401).json({ error: 'Connexion requise' });
  const q = texteRecherche(body && body.q);
  const session = jetonSession(body && body.session);
  if (!session) return res.status(400).json({ error: 'Session de recherche invalide' });
  if (!q) return res.status(200).json({ fournisseur: null, suggestions: [] });
  if (!(await limiter(req, ctx, 'suggestions'))) {
    return res.status(429).json({ error: 'Trop de recherches. Écris ton adresse au complet : c’est correct.', texte_libre: true });
  }
  const g = await googleSuggestions(q, session, ctx);
  if (g) return res.status(200).json({ fournisseur: 'google', attribution: ATTRIBUTION.google, suggestions: g });
  const a = await geoapifySuggestions(q, ctx);
  if (a) return res.status(200).json({ fournisseur: 'geoapify', attribution: ATTRIBUTION.geoapify, suggestions: a });
  return res.status(200).json({ fournisseur: null, suggestions: [], indisponible: true, texte_libre: true });
}

async function details(req, res, ctx, body) {
  if (!ctx.session || !ctx.session.id) return res.status(401).json({ error: 'Connexion requise' });
  const id = idLieu(body && body.id);
  const session = jetonSession(body && body.session);
  if (!id || !session) return res.status(400).json({ error: 'Choix invalide' });
  if (!(await limiter(req, ctx, 'details'))) {
    return res.status(429).json({ error: 'Trop de recherches. Écris ton adresse au complet : c’est correct.', texte_libre: true });
  }
  const cle = env('GOOGLE_PLACES_API_KEY');
  if (!cle || !(await quotaDuJour(ctx, 'google_details', quotas().google_details))) {
    return res.status(503).json({ error: 'Suggestions indisponibles', texte_libre: true });
  }
  const p = new URLSearchParams({ languageCode: 'fr', regionCode: 'ca', sessionToken: session });
  const lieu = await appel(`${GOOGLE_LIEU}${encodeURIComponent(id)}?${p}`, {
    method: 'GET',
    // Champs « Essentials » seulement (pas de nom, d'avis ni d'horaire : plus cher et inutile ici).
    headers: { 'X-Goog-Api-Key': cle, 'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location,types' },
  }, ctx.delaiMs || DELAI_MS);
  if (!lieu) return res.status(503).json({ error: 'Suggestions indisponibles', texte_libre: true });
  const a = adresseGoogle(lieu);
  const s = await secteurGeoapify(a._position, ctx);
  if (s && (!s.ville || norm(s.ville) === norm(a.ville)) && norm(s.secteur) !== norm(a.ville)) a.secteur = s.secteur;
  delete a._position; // la position ne sort pas du serveur
  return res.status(200).json({ fournisseur: 'google', adresse: a });
}

module.exports = {
  suggestions, details,
  // pour les tests
  texteRecherche, jetonSession, idLieu, nettoyerNom, decouperSecondaire, sansDoublons, suggestionsGoogle, suggestionsGeoapify,
  adresseGoogle, adresseGeoapify, formatCodePostal, journee, quotas, LIMITES, DEBUT_JOURNEE_UTC_H, ATTRIBUTION,
};
