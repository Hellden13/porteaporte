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
  let r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,email,prenom,nom,role,suspendu,email_verified,verification_status,driver_status,ville,vehicule,trajet_principal,mode_livraison,transport_mode`, {
    headers: sbHeaders(sbKey)
  });
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

function roleIn(profile, roles) {
  return profile && !profile.suspendu && roles.includes(profile.role);
}

function mergeUserRole(currentRole, requestedRole) {
  const current = normalizeText(currentRole);
  const requested = normalizeText(requestedRole === 'both' ? 'les deux' : requestedRole);
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
  if (profile?.role === 'admin' && !profile?.suspendu) return true;
  return Boolean(
    profile &&
    !profile.suspendu &&
    isEmailVerified(session, profile) &&
    ['livreur', 'les deux'].includes(profile.role) &&
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
  const raw = [
    profile?.mode_livraison,
    profile?.transport_mode,
    profile?.vehicule,
    profile?.trajet_principal
  ].filter(Boolean).join(' ');
  const text = normalizeText(raw);

  if (!text) return 'unknown';
  if (text.includes('pied') || text.includes('marche')) return 'foot';
  if (text.includes('velo') || text.includes('bicyc') || text.includes('bike')) return 'bike';
  if (text.includes('trottinette')) return 'scooter';
  if (text.includes('moto') || text.includes('auto') || text.includes('voiture') || text.includes('camion') || text.includes('vus') || text.includes('fourgon') || text.includes('remorque')) return 'motor';
  return 'unknown';
}

function estimateRouteKm(from, to) {
  const a = normalizeCity(from);
  const b = normalizeCity(to);
  if (!a || !b) return null;
  if (a === b) return 5;
  const pairs = {
    'quebec-levis': 8,
    'levis-quebec': 8,
    'montreal-laval': 18,
    'laval-montreal': 18,
    'montreal-longueuil': 12,
    'longueuil-montreal': 12,
    'montreal-brossard': 16,
    'brossard-montreal': 16,
    'quebec-montreal': 265,
    'montreal-quebec': 265,
    'montreal-sherbrooke': 145,
    'sherbrooke-montreal': 145,
    'quebec-troisrivieres': 130,
    'troisrivieres-quebec': 130,
    'montreal-troisrivieres': 140,
    'troisrivieres-montreal': 140,
    'gatineau-montreal': 200,
    'montreal-gatineau': 200
  };
  return pairs[`${a}-${b}`] ?? 200;
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

  if (!fromCity || !toCity) {
    return { allowed: false, reason: 'Villes de livraison incompletes', mode, routeKm };
  }

  if (mode === 'foot') {
    if (!sameDeliveryCity) return { allowed: false, reason: 'A pied: meme ville seulement', mode, routeKm };
    if (!startsNearDriver) return { allowed: false, reason: 'A pied: ville de depart trop loin', mode, routeKm };
    if (routeKm !== null && routeKm > 5) return { allowed: false, reason: 'A pied: distance maximale 5 km', mode, routeKm };
    if (weightKg !== null && weightKg > 5) return { allowed: false, reason: 'A pied: colis trop lourd', mode, routeKm };
    return { allowed: true, reason: 'Compatible a pied', mode, routeKm };
  }

  if (mode === 'bike' || mode === 'scooter') {
    if (!sameDeliveryCity) return { allowed: false, reason: 'Velo/trottinette: meme ville seulement', mode, routeKm };
    if (!startsNearDriver) return { allowed: false, reason: 'Velo/trottinette: ville de depart trop loin', mode, routeKm };
    if (routeKm !== null && routeKm > 20) return { allowed: false, reason: 'Velo/trottinette: distance maximale 20 km', mode, routeKm };
    if (weightKg !== null && weightKg > 15) return { allowed: false, reason: 'Velo/trottinette: colis trop lourd', mode, routeKm };
    return { allowed: true, reason: 'Compatible velo/trottinette', mode, routeKm };
  }

  if (mode === 'motor') {
    return { allowed: true, reason: 'Compatible vehicule motorise', mode, routeKm };
  }

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
  siteOrigin,
  internalHeaders,
  callNotifier,
  deliveryEligibility,
  missingColumn,
  insertWithSchemaFallback,
  stripeRequest,
  defaultRewardMissions,
};
