// api/_lib.js — Utilitaires partagés PorteaPorte
// Ce fichier est require() par platform.js et tous les modules extraits.

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function sanitizeEnv(s) {
  let v = (s || '').trim();
  while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1);
  return v.trim();
}

/* Valide qu'un ID est un UUID ou identifiant Supabase sûr (hex + tirets, max 64 chars).
   Empêche l'injection dans les filtres in.() de PostgREST. */
function safeIds(arr) {
  return (arr || []).filter(id => typeof id === 'string' && /^[0-9a-f\-]{1,64}$/i.test(id));
}

function sbHeaders(key, prefer = 'return=representation') {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  return {
    mimeType,
    ext,
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function uploadProofPhoto(sbUrl, sbKey, livraisonId, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !parsed.buffer.length) return null;
  if (parsed.buffer.length > 900000) {
    const err = new Error('Photo trop lourde. Reprends une photo plus legere.');
    err.status = 413;
    throw err;
  }
  const objectPath = `${encodeURIComponent(livraisonId)}/${Date.now()}-${Math.random().toString(36).slice(2)}.${parsed.ext}`;
  const upload = await fetch(`${sbUrl}/storage/v1/object/delivery-proofs/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': parsed.mimeType,
      'x-upsert': 'false'
    },
    body: parsed.buffer
  }).catch(() => null);
  if (!upload?.ok) return null;
  return {
    bucket: 'delivery-proofs',
    path: objectPath,
    mimeType: parsed.mimeType,
    size: parsed.buffer.length
  };
}

async function signStorageUrl(sbUrl, sbKey, bucket, path) {
  if (!bucket || !path) return null;
  const r = await fetch(`${sbUrl}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: 60 * 10 })
  }).catch(() => null);
  if (!r?.ok) return null;
  const data = await r.json().catch(() => ({}));
  if (!data.signedURL && !data.signedUrl) return null;
  const signed = data.signedURL || data.signedUrl;
  return signed.startsWith('http') ? signed : `${sbUrl}/storage/v1${signed}`;
}

async function getSession(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${token}` }
  });
  return r.ok ? r.json() : null;
}

async function getProfile(userId, sbUrl, sbKey) {
  let r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,email,prenom,nom,role,suspendu,email_verified,verification_status,driver_status,ville,vehicule,trajet_principal,mode_livraison,transport_mode,transport_mode_actif,transport_modes_disponibles,route_origine,route_destination,route_deviation_km,route_date,route_heure_debut,route_heure_fin`, {
    headers: sbHeaders(sbKey)
  });
  if (!r.ok) {
    r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,email,prenom,nom,role,suspendu,email_verified,verification_status,driver_status,ville,vehicule,trajet_principal,mode_livraison,transport_mode`, {
      headers: sbHeaders(sbKey)
    });
  }
  if (!r.ok) {
    r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,email,prenom,nom,role,suspendu,email_verified,verification_status,driver_status,ville,vehicule,trajet_principal`, {
      headers: sbHeaders(sbKey)
    });
  }
  if (!r.ok) {
    r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,email,prenom,nom,role,suspendu,email_verified,verification_status,driver_status`, {
      headers: sbHeaders(sbKey)
    });
  }
  if (!r.ok) {
    r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,role,suspendu`, {
      headers: sbHeaders(sbKey)
    });
  }
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

function normalizeRole(role) {
  const value = normalizeText(role).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (['admin', 'administrator', 'administrateur'].includes(value)) return 'admin';
  if (['livreur', 'driver'].includes(value)) return 'livreur';
  if (['expediteur', 'expediteur client', 'sender'].includes(value)) return 'expediteur';
  if (['les deux', 'both', 'livreur expediteur', 'expediteur livreur'].includes(value)) return 'les deux';
  return value;
}

function roleIn(profile, roles) {
  if (!profile || profile.suspendu) return false;
  const actual = normalizeRole(profile.role);
  return roles.some((role) => normalizeRole(role) === actual);
}

function mergeUserRole(currentRole, requestedRole) {
  const current = normalizeRole(currentRole);
  const requested = normalizeRole(requestedRole);
  if (requested === 'les deux') return 'les deux';
  if (current === 'admin') return 'admin';
  if ((current === 'expediteur' && requested === 'livreur') || (current === 'livreur' && requested === 'expediteur')) {
    return 'les deux';
  }
  if (current === 'les deux') return 'les deux';
  if (requested === 'livreur') return 'livreur';
  if (requested === 'expediteur') return 'expediteur';
  return currentRole || 'expediteur';
}

function isEmailVerified(session, profile) {
  return Boolean(profile?.email_verified || session?.email_confirmed_at || session?.confirmed_at);
}

function isVerifiedDriver(session, profile) {
  const role = normalizeRole(profile?.role);
  if (role === 'admin' && !profile?.suspendu) return true;
  return Boolean(
    profile &&
    !profile.suspendu &&
    isEmailVerified(session, profile) &&
    ['livreur', 'les deux'].includes(role) &&
    profile.driver_status === 'verified'
  );
}

function endpointFromReq(req, body) {
  const url = new URL(req.url || '/', 'https://porteaporte.site');
  return body.endpoint || url.searchParams.get('endpoint') || url.pathname.split('/').pop() || body.action;
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function generateReceptionCode() {
  const crypto = require('crypto');
  return String(crypto.randomInt(100000, 1000000));
}

function hashReceptionCode(code, livraisonId) {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(`${String(code || '').trim()}|${String(livraisonId || '')}`)
    .digest('hex');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCity(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function driverTransportMode(profile) {
  // Priorité au mode actif choisi pour aujourd'hui
  const activeMode = profile?.transport_mode_actif;
  if (activeMode) {
    const text = normalizeText(activeMode);
    if (text.includes('pied') || text.includes('marche') || text === 'walking' || text === 'foot') return 'foot';
    if (text.includes('velo') || text.includes('bike')) return 'bike';
    if (text.includes('trottinette') || text.includes('skate') || text === 'scooter') return 'scooter';
    if (text.includes('camion') || text.includes('fourgon') || text === 'truck' || text === 'van') return 'truck';
    if (text.includes('moto')) return 'moto';
    if (text.includes('voiture') || text.includes('auto') || text === 'car') return 'car';
  }
  const raw = [
    profile?.mode_livraison,
    profile?.transport_mode,
    profile?.vehicule,
    profile?.trajet_principal
  ].filter(Boolean).join(' ');
  const text = normalizeText(raw);

  if (!text) return 'unknown';
  if (text.includes('pied') || text.includes('marche') || text.includes('walking') || text === 'foot') return 'foot';
  if (text.includes('velo') || text.includes('bicyc') || text.includes('bike')) return 'bike';
  if (text.includes('trottinette') || text.includes('skate') || text === 'scooter') return 'scooter';
  // Camion / fourgon / van / camionnette → truck (peut transporter XL)
  if (text.includes('camion') || text.includes('fourgon') || text.includes('truck') || text.includes('van') || text.includes('remorque')) return 'truck';
  // Moto / motocyclette → moto (capacité limitée)
  if (text.includes('moto') && !text.includes('motoris')) return 'moto';
  // Voiture / auto / VUS / car → car
  if (text.includes('voiture') || text.includes('auto') || text.includes('vus') || text === 'car') return 'car';
  if (text.includes('motor')) return 'car'; // fallback générique
  return 'unknown';
}

// ── Base de coordonnées GPS des villes du Québec (extensible) ──
const CITIES_QC = {
  montreal:        [45.5017, -73.5673],
  laval:           [45.5781, -73.7124],
  longueuil:       [45.5371, -73.5111],
  brossard:        [45.4583, -73.4665],
  saintlambert:    [45.5025, -73.5044],
  boucherville:    [45.5947, -73.4361],
  repentigny:      [45.7423, -73.4546],
  terrebonne:      [45.7000, -73.6333],
  blainville:      [45.6700, -73.8800],
  mirabel:         [45.6500, -74.0833],
  vaudreuildorion: [45.4000, -74.0333],
  pointeclaire:    [45.4500, -73.8167],
  doliemontroyal:  [45.5050, -73.6450],
  saintdjerome:    [45.7800, -74.0033],
  joliette:        [46.0167, -73.4333],
  quebec:          [46.8139, -71.2080],
  levis:           [46.8033, -71.1779],
  saintnicolas:    [46.7064, -71.3625],
  stnicolas:       [46.7064, -71.3625],
  sainteoy:        [46.7500, -71.3000],
  beauport:        [46.8853, -71.1953],
  charlesbourg:    [46.8581, -71.2858],
  laplaine:        [46.8000, -71.2167],
  caphedlerouge:   [46.7553, -71.3614],
  troisrivieres:   [46.3432, -72.5432],
  shawinigan:      [46.5667, -72.7500],
  sherbrooke:      [45.4042, -71.8929],
  magog:           [45.2667, -72.1500],
  granby:          [45.4000, -72.7333],
  drummondville:   [45.8833, -72.4833],
  saintehyacinthe: [45.6303, -72.9583],
  victoriaville:   [46.0500, -71.9667],
  thetford:        [46.1000, -71.3000],
  saintegeorges:   [46.1167, -70.6667],
  rimouski:        [48.4500, -68.5333],
  matane:          [48.8500, -67.5167],
  sept_iles:       [50.2167, -66.3833],
  baiecomeau:      [49.2167, -68.1500],
  saguenay:        [48.4283, -71.0688],
  alma:            [48.5500, -71.6500],
  chicoutimi:      [48.4280, -71.0683],
  jonquiere:       [48.4167, -71.2333],
  gatineau:        [45.4765, -75.7013],
  hull:            [45.4310, -75.7130],
  rouynnoranda:    [48.2433, -79.0233],
  valdor:          [48.0972, -77.7967],
  amos:            [48.5667, -78.1167]
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function cityCoords(name) {
  const norm = normalizeCity(name);
  return CITIES_QC[norm] || null;
}

function estimateRouteKm(from, to) {
  const a = normalizeCity(from);
  const b = normalizeCity(to);
  if (!a || !b) return null;
  if (a === b) return 5;
  // Calcul Haversine si on a les coords
  const c1 = cityCoords(from);
  const c2 = cityCoords(to);
  if (c1 && c2) return Math.round(haversineKm(c1[0], c1[1], c2[0], c2[1]));
  // Fallback : valeur générique
  return 200;
}

// Distance perpendiculaire (approximative) d'un point à un segment route
function distanceToRouteKm(point, routeStart, routeEnd) {
  if (!point || !routeStart || !routeEnd) return null;
  const d_start = haversineKm(point[0], point[1], routeStart[0], routeStart[1]);
  const d_end   = haversineKm(point[0], point[1], routeEnd[0], routeEnd[1]);
  const d_route = haversineKm(routeStart[0], routeStart[1], routeEnd[0], routeEnd[1]);
  // Si point très proche d'une extrémité → distance directe
  if (d_start < 3 || d_end < 3) return Math.min(d_start, d_end);
  // Triangle : si point "déborde" du segment → distance à l'extrémité la plus proche
  if (d_start * d_start > d_end * d_end + d_route * d_route) return d_end;
  if (d_end * d_end > d_start * d_start + d_route * d_route) return d_start;
  // Distance perpendiculaire (loi des cosinus + aire triangle)
  const s = (d_start + d_end + d_route) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - d_start) * (s - d_end) * (s - d_route)));
  return d_route > 0 ? (2 * area) / d_route : 0;
}

async function grantBadgeBySlug(sbUrl, sbKey, userId, slug) {
  try {
    const br = await fetch(`${sbUrl}/rest/v1/badges?slug=eq.${encodeURIComponent(slug)}&select=id,xp_reward`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    });
    const badges = br.ok ? await br.json() : [];
    if (!badges[0]) return false;
    const badgeId = badges[0].id;
    const xpReward = badges[0].xp_reward || 0;
    // Check si déjà accordé
    const ur = await fetch(`${sbUrl}/rest/v1/user_badges?user_id=eq.${userId}&badge_id=eq.${badgeId}&select=id&limit=1`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    });
    const existing = ur.ok ? await ur.json() : [];
    if (existing.length > 0) return false;
    // Grant
    await fetch(`${sbUrl}/rest/v1/user_badges`, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, badge_id: badgeId, granted_at: new Date().toISOString(), granted_by: 'auto' })
    });
    // Add XP
    if (xpReward > 0) {
      const pr = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=xp`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
      });
      const profs = pr.ok ? await pr.json() : [];
      const currentXp = Number(profs[0]?.xp || 0);
      await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ xp: currentXp + xpReward })
      });
    }
    return true;
  } catch (e) { return false; }
}

/**
 * Calculateur de prix de livraison
 * Empêche un expéditeur de fixer 5$ pour livrer un frigo.
 * @returns { price_cad, min_price_cad, breakdown }
 */
function computeDeliveryPrice({ distance_km, weight_kg, size, type, urgency }) {
  const dist = Math.max(1, Number(distance_km) || 5);
  const weight = Math.max(0.1, Number(weight_kg) || 1);

  const sizeKey = String(size || 'moyen').toLowerCase().replace(/[^a-z_]/g, '');
  const typeKey = String(type || 'colis').toLowerCase().replace(/[^a-z_]/g, '');
  const urgKey = String(urgency || 'flexible').toLowerCase().replace(/[^a-z0-9_-]/g, '');

  // Tarifs beta: moins cher qu'un transporteur, mais assez haut pour interesser les livreurs.
  const BASE_BY_TYPE = {
    document: 5,
    enveloppe: 5,
    lettre: 5,
    colis: 7,
    nourriture: 8,
    fragile: 9,
    electronique: 10,
    meuble: 16,
    electromenager: 22,
    autre: 8
  };
  const FLOOR_BY_SIZE = {
    xs: 6, document: 6, enveloppe: 6, lettre: 6,
    s: 8, petit: 8, small: 8,
    m: 10, moyen: 10, medium: 10,
    l: 18, grand: 18, large: 18,
    xl: 35, tres_grand: 35
  };
  const SIZE_MULT = {
    xs: 0.85, document: 0.85, enveloppe: 0.85, lettre: 0.85,
    s: 1, petit: 1, small: 1,
    m: 1.15, moyen: 1.15, medium: 1.15,
    l: 1.75, grand: 1.75, large: 1.75,
    xl: 3.2, tres_grand: 3.2
  };
  const TYPE_MULT = {
    lettre: 0.75, enveloppe: 0.75, document: 0.75,
    colis: 1,
    nourriture: 1.1,
    fragile: 1.25,
    electronique: 1.35,
    meuble: 2.1,
    electromenager: 2.8,
    autre: 1
  };
  const URGENCY_MULT = {
    maintenant: 1.45, same_day: 1.45, urgent: 1.45, '24h': 1.35,
    '48h': 1.15,
    '3-7days': 1, flexible: 1, normal: 1
  };

  const base = BASE_BY_TYPE[typeKey] != null ? BASE_BY_TYPE[typeKey] : BASE_BY_TYPE.colis;
  const floor = FLOOR_BY_SIZE[sizeKey] != null ? FLOOR_BY_SIZE[sizeKey] : FLOOR_BY_SIZE.moyen;
  const sizeMult = SIZE_MULT[sizeKey] != null ? SIZE_MULT[sizeKey] : 1;
  const typeMult = TYPE_MULT[typeKey] != null ? TYPE_MULT[typeKey] : 1;
  const urgMult = URGENCY_MULT[urgKey] != null ? URGENCY_MULT[urgKey] : 1;

  const localKm = Math.min(dist, 8);
  const regionalKm = Math.max(0, dist - 8);
  const distanceFee = (localKm * 0.65) + (regionalKm * 0.42);
  const includedKg = typeKey === 'document' || typeKey === 'lettre' || typeKey === 'enveloppe' ? 0.5 : 2;
  const billableKg = Math.max(0, weight - includedKg);
  const weightFee = billableKg * (sizeKey === 'xl' || typeKey === 'electromenager' ? 1.4 : 0.9);
  const subtotal = base + distanceFee + weightFee;
  const final = subtotal * sizeMult * typeMult * urgMult;

  const price = Math.max(floor, Math.ceil(final));
  const minPrice = Math.max(floor, Math.ceil(price * 0.9));

  return {
    price_cad: price,
    min_price_cad: minPrice,
    breakdown: {
      base,
      floor,
      distance_km: dist,
      distance_fee: Math.round(distanceFee * 100) / 100,
      weight_kg: weight,
      billable_kg: Math.round(billableKg * 100) / 100,
      weight_fee: Math.round(weightFee * 100) / 100,
      size_mult: sizeMult,
      type_mult: typeMult,
      urgency_mult: urgMult,
      subtotal: Math.round(subtotal * 100) / 100
    }
  };
}

function isMissionOnRoute(missionFrom, missionTo, routeFrom, routeTo, deviationMaxKm) {
  const mF = cityCoords(missionFrom);
  const mT = cityCoords(missionTo);
  const rF = cityCoords(routeFrom);
  const rT = cityCoords(routeTo);
  if (!mF || !mT || !rF || !rT) return false;
  const distFrom = distanceToRouteKm(mF, rF, rT);
  const distTo   = distanceToRouteKm(mT, rF, rT);
  if (distFrom == null || distTo == null) return false;
  return distFrom <= deviationMaxKm && distTo <= deviationMaxKm;
}

function siteOrigin() {
  return (process.env.PUBLIC_SITE_ORIGIN || process.env.ALLOWED_ORIGIN || 'https://porteaporte.site').replace(/\/$/, '');
}

function internalHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers['x-internal-notifier-secret'] = secret;
  return headers;
}

async function callNotifier(type, data) {
  const r = await fetch(`${siteOrigin()}/api/notifier`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ type, data })
  });
  const out = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: out };
}

/**
 * Alerte rapide à l'admin (denismorneaubtc@gmail.com via ADMIN_EMAIL).
 * Fire-and-forget : ne bloque jamais le flow principal en cas d'erreur.
 * @param {string} subject   Titre court
 * @param {string} message   Description du contexte (1-3 phrases)
 * @param {object} options   { severity: 'critical'|'warning'|'info'|'success', details: {label:value}, cta_url, cta_label }
 */
function alertAdmin(subject, message, options = {}) {
  return callNotifier('admin_critical_alert', {
    subject,
    title: options.title || subject,
    message,
    severity: options.severity || 'info',
    details: options.details || null,
    cta_url: options.cta_url || 'https://porteaporte.site/admin/operations.html',
    cta_label: options.cta_label || 'Voir dans le Centre Opérations →'
  }).catch((err) => console.error('[alertAdmin]', err.message));
}

function deliveryEligibility(profile, livraison) {
  if (profile?.role === 'admin') {
    return { allowed: true, reason: 'Accès admin', mode: 'motor', routeKm: estimateRouteKm(livraison?.ville_depart, livraison?.ville_arrivee) };
  }
  const mode = driverTransportMode(profile);
  const driverCity = normalizeCity(profile?.ville || '');
  const fromCity = normalizeCity(livraison?.ville_depart || '');
  const toCity = normalizeCity(livraison?.ville_arrivee || '');
  const sameDeliveryCity = fromCity && toCity && fromCity === toCity;
  const startsNearDriver = !driverCity || !fromCity || driverCity === fromCity;
  const routeKm = estimateRouteKm(livraison?.ville_depart, livraison?.ville_arrivee);
  const weightKg = toNumber(livraison?.poids_kg, null);
  const taille = (livraison?.taille_colis || '').toLowerCase();

  if (!fromCity || !toCity) {
    return { allowed: false, reason: 'Villes de livraison incompletes', mode, routeKm };
  }

  // Filtrage par taille colis : XL/électroménager exige camionnette/van
  if (taille === 'xl' && mode !== 'truck') {
    return { allowed: false, reason: 'XL / électroménager : camionnette/van requise', mode, routeKm };
  }
  if (taille === 'gros' && !['car', 'truck', 'motor'].includes(mode)) {
    return { allowed: false, reason: 'Gros colis : voiture/camion requis', mode, routeKm };
  }
  // Moto : pas adapté pour gros ni XL
  if (mode === 'moto' && ['gros', 'xl'].includes(taille)) {
    return { allowed: false, reason: 'Moto : colis trop encombrant', mode, routeKm };
  }

  if (mode === 'foot') {
    if (!sameDeliveryCity) return { allowed: false, reason: 'A pied: meme ville seulement', mode, routeKm };
    if (!startsNearDriver) return { allowed: false, reason: 'A pied: ville de depart trop loin', mode, routeKm };
    if (routeKm !== null && routeKm > 5) return { allowed: false, reason: 'A pied: distance maximale 5 km', mode, routeKm };
    if (weightKg !== null && weightKg > 5) return { allowed: false, reason: 'A pied: colis trop lourd', mode, routeKm };
    if (taille === 'moyen') return { allowed: false, reason: 'A pied: colis moyen trop encombrant', mode, routeKm };
    return { allowed: true, reason: 'Compatible a pied', mode, routeKm };
  }

  if (mode === 'bike' || mode === 'scooter') {
    if (!sameDeliveryCity) return { allowed: false, reason: 'Velo/trottinette: meme ville seulement', mode, routeKm };
    if (!startsNearDriver) return { allowed: false, reason: 'Velo/trottinette: ville de depart trop loin', mode, routeKm };
    if (routeKm !== null && routeKm > 20) return { allowed: false, reason: 'Velo/trottinette: distance maximale 20 km', mode, routeKm };
    if (weightKg !== null && weightKg > 15) return { allowed: false, reason: 'Velo/trottinette: colis trop lourd', mode, routeKm };
    return { allowed: true, reason: 'Compatible velo/trottinette', mode, routeKm };
  }

  if (mode === 'moto') {
    if (weightKg !== null && weightKg > 30) return { allowed: false, reason: 'Moto : colis trop lourd (max 30 kg)', mode, routeKm };
    return { allowed: true, reason: 'Compatible moto', mode, routeKm };
  }

  if (mode === 'car') {
    if (weightKg !== null && weightKg > 100) return { allowed: false, reason: 'Voiture : colis trop lourd (max 100 kg)', mode, routeKm };
    return { allowed: true, reason: 'Compatible voiture/VUS', mode, routeKm };
  }

  if (mode === 'truck' || mode === 'motor') {
    return { allowed: true, reason: 'Compatible camion/camionnette', mode, routeKm };
  }

  // Filtrage disponibilités destinataire vs livreur (si renseignées des 2 côtés)
  // Implémenté plus loin dans availableLivraisons après éligibilité de base.

  if (!sameDeliveryCity || !startsNearDriver) {
    return { allowed: false, reason: 'Mode de transport a configurer pour voir les livraisons plus loin', mode, routeKm };
  }
  return { allowed: true, reason: 'Compatible localement; mode de transport a completer', mode, routeKm };
}

function missingColumn(details) {
  const message = typeof details === 'string' ? details : details?.message || '';
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match ? match[1] : null;
}

async function insertWithSchemaFallback(url, headers, payload, optionalColumns = []) {
  const current = { ...payload };

  for (let attempt = 0; attempt <= optionalColumns.length + 2; attempt += 1) {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(current)
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, data };

    const missing = missingColumn(data);
    if (missing && Object.prototype.hasOwnProperty.call(current, missing)) {
      delete current[missing];
      continue;
    }

    const removable = optionalColumns.find((column) => Object.prototype.hasOwnProperty.call(current, column));
    if (removable) {
      delete current[removable];
      continue;
    }

    return { ok: false, data };
  }

  return { ok: false, data: { message: 'Schema incompatible avec livraisons' } };
}

async function stripeRequest(method, path, body, secretKey) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-04-10',
    },
  };
  if (body && method !== 'GET') options.body = new URLSearchParams(body).toString();
  const r = await fetch(`https://api.stripe.com${path}`, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `Stripe ${r.status}`);
  return data;
}

/* Missions de récompense par défaut (fallback si la table missions est vide) */
function defaultRewardMissions() {
  const now = new Date();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return [
    {
      id: 'default-5-week',
      title: '5 livraisons cette semaine',
      description: 'Completer 5 livraisons pour debloquer un bonus de regularite.',
      objective_type: 'deliveries_week',
      objective_target: 5,
      reward_coins: 50,
      deadline: monthEnd.toISOString(),
      status: 'active'
    },
    {
      id: 'default-perfect',
      title: 'Service impeccable',
      description: 'Maintenir une note moyenne de 4.8 ou plus sur 10 livraisons.',
      objective_type: 'rating',
      objective_target: 10,
      reward_coins: 75,
      deadline: monthEnd.toISOString(),
      status: 'active'
    },
    {
      id: 'default-community',
      title: 'Coup de main communautaire',
      description: 'Aider un aine ou une demande solidaire approuvee.',
      objective_type: 'community',
      objective_target: 1,
      reward_coins: 50,
      deadline: monthEnd.toISOString(),
      status: 'active'
    }
  ];
}

module.exports = {
  CORS,
  sanitizeEnv,
  safeIds,
  sbHeaders,
  parseDataUrl,
  uploadProofPhoto,
  signStorageUrl,
  getSession,
  getProfile,
  normalizeRole,
  roleIn,
  mergeUserRole,
  isEmailVerified,
  isVerifiedDriver,
  endpointFromReq,
  toNumber,
  generateReceptionCode,
  hashReceptionCode,
  normalizeText,
  normalizeCity,
  driverTransportMode,
  estimateRouteKm,
  haversineKm,
  cityCoords,
  distanceToRouteKm,
  isMissionOnRoute,
  grantBadgeBySlug,
  CITIES_QC,
  siteOrigin,
  internalHeaders,
  callNotifier,
  alertAdmin,
  computeDeliveryPrice,
  deliveryEligibility,
  missingColumn,
  insertWithSchemaFallback,
  stripeRequest,
  defaultRewardMissions,
};
