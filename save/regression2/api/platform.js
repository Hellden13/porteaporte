const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function sbHeaders(key, prefer = 'return=representation') {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
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
  return body.endpoint || body.action || url.searchParams.get('endpoint') || url.pathname.split('/').pop();
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

async function createLivraison(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['expediteur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role expediteur requis' });
  }

  const payload = {
    expediteur_id: ctx.session.id,
    type: body.type || 'colis',
    description: body.description || '',
    type_colis: body.type_colis || body.typeColis || 'colis',
    adresse_depart: body.adresse_depart || body.pickup_address || body.depart || '',
    adresse_arrivee: body.adresse_arrivee || body.dropoff_address || body.arrivee || '',
    ville_depart: body.ville_depart || '',
    ville_arrivee: body.ville_arrivee || '',
    poids_kg: body.poids_kg === undefined && body.poids === undefined ? null : toNumber(body.poids_kg || body.poids),
    valeur_declaree: body.valeur_declaree === undefined ? null : toNumber(body.valeur_declaree),
    prix_total: toNumber(body.prix_total || body.prix, 0),
    assurance_plan: body.assurance_plan || null,
    notes: body.notes || null,
  };

  if (!payload.adresse_depart || !payload.adresse_arrivee) {
    return res.status(400).json({ error: 'adresses depart/arrivee requises' });
  }

  const insert = await insertWithSchemaFallback(
    `${ctx.sbUrl}/rest/v1/livraisons`,
    sbHeaders(ctx.sbKey),
    payload,
    ['description', 'type_colis', 'poids_kg', 'valeur_declaree', 'assurance_plan', 'notes']
  );

  if (!insert.ok) return res.status(400).json({ error: 'Creation livraison impossible', details: insert.data });
  const data = insert.data;
  const livraison = Array.isArray(data) ? data[0] : data;
  return res.status(200).json({ success: true, livraison });
}

async function assignDriver(req, res, ctx, body) {
  const livraisonId = body.livraison_id || body.livraisonId;
  const livreurId = body.livreur_id || body.livreurId || ctx.session.id;
  if (!livraisonId) return res.status(400).json({ error: 'livraison_id requis' });

  const livRes = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${livraisonId}&select=id,expediteur_id,livreur_id,statut,ville_depart,ville_arrivee,type_colis,poids_kg`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const rows = livRes.ok ? await livRes.json() : [];
  const livraison = rows[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });
  if (livraison.livreur_id && livraison.livreur_id !== livreurId) {
    return res.status(409).json({ error: 'Livraison deja assignee' });
  }

  const admin = roleIn(ctx.profile, ['admin']);
  const selfDriver = livreurId === ctx.session.id && isVerifiedDriver(ctx.session, ctx.profile);
  const owner = livraison.expediteur_id === ctx.session.id;
  if (!admin && !selfDriver && !owner) return res.status(403).json({ error: 'Assignation refusee' });
  if (!admin && livraison.statut !== 'paiement_autorise') {
    return res.status(409).json({ error: 'Paiement escrow requis avant assignation' });
  }
  const targetProfile = livreurId === ctx.session.id ? ctx.profile : await getProfile(livreurId, ctx.sbUrl, ctx.sbKey);
  const targetVerified = targetProfile && !targetProfile.suspendu && ['livreur', 'les deux', 'admin'].includes(targetProfile.role) && targetProfile.driver_status === 'verified' && targetProfile.email_verified !== false;
  if (!admin && !targetVerified) return res.status(403).json({ error: 'Livreur cible non verifie' });
  if (!admin) {
    const eligibility = deliveryEligibility(targetProfile, livraison);
    if (!eligibility.allowed) {
      return res.status(403).json({
        error: 'Livraison incompatible avec le mode de transport du livreur',
        reason: eligibility.reason,
        mode: eligibility.mode,
        distance_km: eligibility.routeKm
      });
    }
  }

  const patch = { livreur_id: livreurId, statut: body.statut || 'confirme' };
  const r = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${livraisonId}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(patch)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Assignation impossible', details: data });
  return res.status(200).json({ success: true, livraison: Array.isArray(data) ? data[0] : data });
}

async function confirmDelivery(req, res, ctx, body) {
  const livraisonId = body.livraison_id || body.livraisonId;
  if (!livraisonId) return res.status(400).json({ error: 'livraison_id requis' });
  if (!isVerifiedDriver(ctx.session, ctx.profile) && !roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Livreur verifie requis' });
  }

  const livRes = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${livraisonId}&select=id,expediteur_id,livreur_id,statut`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const rows = livRes.ok ? await livRes.json() : [];
  const livraison = rows[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });
  if (!roleIn(ctx.profile, ['admin']) && livraison.livreur_id !== ctx.session.id) {
    return res.status(403).json({ error: 'Seul le livreur assigne peut marquer livre' });
  }
  if (!['confirme', 'en_route', 'ramasse'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Statut livraison incompatible avec livraison terminee' });
  }

  const r = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${livraisonId}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ statut: 'livre', livre_le: new Date().toISOString() })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Confirmation livraison impossible', details: data });
  return res.status(200).json({ success: true, livraison: Array.isArray(data) ? data[0] : data });
}
async function gpsUpdate(req, res, ctx, body) {
  const livraisonId = body.livraison_id || body.livraisonId;
  if (!livraisonId) return res.status(400).json({ error: 'livraison_id requis' });
  if (!isVerifiedDriver(ctx.session, ctx.profile)) return res.status(403).json({ error: 'Livreur verifie requis' });

  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Coordonnees GPS invalides' });
  }

  const livRes = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${livraisonId}&select=id,livreur_id,expediteur_id,statut`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const livraisons = livRes.ok ? await livRes.json() : [];
  const livraison = livraisons[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });
  if (!roleIn(ctx.profile, ['admin']) && livraison.livreur_id !== ctx.session.id) {
    return res.status(403).json({ error: 'GPS reserve au livreur assigne' });
  }

  const point = {
    livraison_id: livraisonId,
    livreur_id: livraison.livreur_id || ctx.session.id,
    latitude,
    longitude,
    accuracy_m: body.accuracy === undefined ? null : toNumber(body.accuracy),
    speed: body.speed === undefined ? null : toNumber(body.speed),
    heading: body.heading === undefined ? null : toNumber(body.heading),
    recorded_at: body.recorded_at || new Date().toISOString(),
    source: 'api',
  };

  const insert = await insertWithSchemaFallback(
    `${ctx.sbUrl}/rest/v1/delivery_locations`,
    sbHeaders(ctx.sbKey),
    point,
    ['accuracy_m', 'speed', 'heading', 'recorded_at', 'source']
  );
  if (!insert.ok) return res.status(400).json({ error: 'GPS update impossible', details: insert.data });
  return res.status(200).json({ success: true, location: Array.isArray(insert.data) ? insert.data[0] : insert.data });
}

async function availableLivraisons(req, res, ctx) {
  if (!isVerifiedDriver(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Livreur verifie requis' });
  }

  const r = await fetch(
    `${ctx.sbUrl}/rest/v1/livraisons?livreur_id=is.null&statut=in.(publie,paiement_autorise)&select=id,code,ville_depart,ville_arrivee,type_colis,poids_kg,prix_total,statut,cree_le&order=cree_le.desc&limit=100`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const rows = r.ok ? await r.json() : [];
  if (!r.ok) return res.status(400).json({ error: 'Lecture livraisons impossible', details: rows });
  const filtered = rows
    .map((row) => ({ row, eligibility: deliveryEligibility(ctx.profile, row) }))
    .filter((item) => item.eligibility.allowed);

  return res.status(200).json({
    success: true,
    transport_mode: driverTransportMode(ctx.profile),
    livraisons: filtered.map(({ row, eligibility }) => ({
      id: row.id,
      code: row.code,
      ville_depart: row.ville_depart,
      ville_arrivee: row.ville_arrivee,
      type_colis: row.type_colis,
      poids_kg: row.poids_kg,
      prix_total: row.prix_total,
      statut: row.statut,
      distance_km: eligibility.routeKm,
      compatibilite: eligibility.reason,
      cree_le: row.cree_le || row.created_at
    }))
  });
}

async function tracking(req, res, ctx, body) {
  const url = new URL(req.url || '/', 'https://porteaporte.site');
  const code = body.code || url.searchParams.get('code') || url.searchParams.get('id');
  if (!code) return res.status(400).json({ error: 'code ou id requis' });

  const isUuid = /^[0-9a-f-]{36}$/i.test(code);
  const filter = isUuid ? `id=eq.${encodeURIComponent(code)}` : `code=eq.${encodeURIComponent(code.toUpperCase())}`;
  const r = await fetch(
    `${ctx.sbUrl}/rest/v1/livraisons?${filter}&select=id,code,expediteur_id,livreur_id,statut,adresse_depart,adresse_arrivee,ville_depart,ville_arrivee,type_colis,type,poids_kg,valeur_declaree,assurance_plan,prix_total,created_at,cree_le&limit=1`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const rows = r.ok ? await r.json() : [];
  if (!r.ok) return res.status(400).json({ error: 'Lecture suivi impossible', details: rows });
  const livraison = rows[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });

  const admin = roleIn(ctx.profile, ['admin']);
  const participant = admin || livraison.expediteur_id === ctx.session.id || livraison.livreur_id === ctx.session.id;
  if (!participant) return res.status(403).json({ error: 'Suivi reserve aux participants de la livraison' });

  let latestRes = await fetch(
    `${ctx.sbUrl}/rest/v1/delivery_locations?livraison_id=eq.${livraison.id}&select=latitude,longitude,accuracy_m,speed,heading,recorded_at,created_at&order=recorded_at.desc&limit=1`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  let latestRows = latestRes.ok ? await latestRes.json() : [];
  if (!latestRes.ok) {
    latestRes = await fetch(
      `${ctx.sbUrl}/rest/v1/delivery_locations?livraison_id=eq.${livraison.id}&select=latitude,longitude,accuracy,speed,heading,recorded_at,created_at&order=recorded_at.desc&limit=1`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    latestRows = latestRes.ok ? await latestRes.json() : [];
    if (latestRows[0] && latestRows[0].accuracy !== undefined && latestRows[0].accuracy_m === undefined) {
      latestRows[0].accuracy_m = latestRows[0].accuracy;
    }
  }

  return res.status(200).json({
    success: true,
    livraison: {
      id: livraison.id,
      code: livraison.code,
      statut: livraison.statut,
      adresse_depart: participant ? livraison.adresse_depart : null,
      adresse_arrivee: participant ? livraison.adresse_arrivee : null,
      ville_depart: livraison.ville_depart,
      ville_arrivee: livraison.ville_arrivee,
      type_colis: livraison.type_colis || livraison.type,
      poids_kg: livraison.poids_kg,
      valeur_declaree: livraison.valeur_declaree,
      assurance_plan: livraison.assurance_plan,
      prix_total: livraison.prix_total,
      created_at: livraison.cree_le || livraison.created_at
    },
    latest_location: latestRows[0] || null
  });
}

async function submitDriverVerification(req, res, ctx, body) {
  if (!['livreur', 'les deux', 'admin'].includes(ctx.profile.role)) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  if (!isEmailVerified(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Courriel confirme requis avant verification livreur' });
  }
  if (ctx.profile.driver_status === 'suspended' || ctx.profile.verification_status === 'suspended') {
    return res.status(403).json({ error: 'Compte livreur suspendu' });
  }

  const firstName = String(body.prenom || ctx.profile.prenom || '').trim();
  const lastName = String(body.nom || ctx.profile.nom || '').trim();
  const phone = String(body.telephone || body.tel || '').trim();
  const city = String(body.ville || ctx.profile.ville || '').trim();
  const province = String(body.province || '').trim();
  const vehicule = String(body.vehicule || '').trim();
  const transportMode = String(body.transport_mode || driverTransportMode({ vehicule }) || 'unknown').trim();
  const route = String(body.trajet_principal || body.trajet || '').trim();

  if (!firstName || !lastName || !phone || !city || !vehicule) {
    return res.status(400).json({ error: 'Prenom, nom, telephone, ville et transport requis' });
  }

  const nextDriverStatus = ctx.profile.driver_status === 'verified' ? 'verified' : 'pending_review';

  // Build patch in layers: required fields first, optional extended fields added progressively
  const patchBase = {
    prenom: firstName,
    nom: lastName,
    telephone: phone,
    ville: city,
    verification_status: nextDriverStatus === 'verified' ? 'verified' : 'pending',
    driver_status: nextDriverStatus,
    mis_a_jour_le: new Date().toISOString()
  };

  const patchFull = {
    ...patchBase,
    vehicule,
    trajet_principal: route,
  };
  if (province) patchFull.province = province;
  if (transportMode) patchFull.transport_mode = transportMode;

  const profileUrl = `${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(ctx.session.id)}`;

  // Try 1: full patch with all optional columns
  let r = await fetch(profileUrl, { method: 'PATCH', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(patchFull) });
  let data = await r.json().catch(() => ({}));

  // Try 2: remove extended transport columns
  if (!r.ok && /column .* does not exist/i.test(JSON.stringify(data))) {
    const patch2 = { ...patchFull };
    delete patch2.province;
    delete patch2.transport_mode;
    r = await fetch(profileUrl, { method: 'PATCH', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(patch2) });
    data = await r.json().catch(() => ({}));
  }

  // Try 3: remove vehicule and trajet_principal (columns may not exist yet in DB)
  if (!r.ok && /column .* does not exist/i.test(JSON.stringify(data))) {
    r = await fetch(profileUrl, { method: 'PATCH', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(patchBase) });
    data = await r.json().catch(() => ({}));
  }

  // Try 4: remove driver_status / verification_status (SQL migration not yet run)
  if (!r.ok && /column .* does not exist/i.test(JSON.stringify(data))) {
    const patchMinimal = {
      prenom: firstName,
      nom: lastName,
      telephone: phone,
      ville: city,
      mis_a_jour_le: new Date().toISOString()
    };
    r = await fetch(profileUrl, { method: 'PATCH', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(patchMinimal) });
    data = await r.json().catch(() => ({}));
  }

  if (!r.ok) {
    return res.status(400).json({ error: 'Soumission verification impossible', details: data });
  }

  const updated = Array.isArray(data) ? data[0] : data;
  const cardId = 'PP-DR-' + String(ctx.session.id || '').slice(0, 8).toUpperCase();
  const notify = await callNotifier('carte_livreur', {
    user_id: ctx.session.id,
    email: ctx.session.email || updated.email || ctx.profile.email,
    prenom: updated.prenom || firstName,
    nom: updated.nom || lastName,
    ville: updated.ville || city,
    vehicule: updated.vehicule || vehicule,
    transport_mode: updated.transport_mode || transportMode,
    driver_status: updated.driver_status || nextDriverStatus,
    card_id: cardId
  }).catch(err => ({ ok: false, data: { error: err.message } }));

  return res.status(200).json({
    success: true,
    driver_status: updated.driver_status || nextDriverStatus,
    verification_status: updated.verification_status || patchBase.verification_status,
    card_id: cardId,
    email_sent: Boolean(notify.ok),
    email_error: notify.ok ? null : notify.data
  });
}

async function requestDriverCard(req, res, ctx) {
  if (!['livreur', 'les deux', 'admin'].includes(ctx.profile.role)) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  if (!isEmailVerified(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Courriel confirme requis avant carte livreur' });
  }
  const cardId = 'PP-DR-' + String(ctx.session.id || '').slice(0, 8).toUpperCase();
  const result = await callNotifier('carte_livreur', {
    user_id: ctx.session.id,
    email: ctx.session.email || ctx.profile.email,
    prenom: ctx.profile.prenom || '',
    nom: ctx.profile.nom || '',
    ville: ctx.profile.ville || '',
    vehicule: ctx.profile.vehicule || ctx.profile.transport_mode || '',
    transport_mode: ctx.profile.transport_mode || '',
    driver_status: ctx.profile.driver_status || 'pending_review',
    card_id: cardId
  });
  if (!result.ok) {
    return res.status(result.status || 500).json({
      error: 'Carte livreur non envoyee',
      details: result.data
    });
  }
  return res.status(200).json({ success: true, card_id: cardId });
}

async function adminUpdateDriverStatus(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Admin requis' });
  }
  const userId = body.user_id || body.id;
  const status = String(body.driver_status || body.status || '').trim();
  const allowed = new Set(['not_started', 'pending_review', 'verified', 'rejected', 'suspended']);
  if (!userId || !allowed.has(status)) {
    return res.status(400).json({ error: 'user_id et driver_status valide requis' });
  }

  const patch = {
    driver_status: status,
    verification_status: status === 'verified' ? 'verified' : status === 'rejected' ? 'rejected' : status === 'suspended' ? 'suspended' : 'pending',
    suspendu: status === 'suspended',
    mis_a_jour_le: new Date().toISOString()
  };

  const r = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(patch)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Mise a jour livreur impossible', details: data });

  const updated = Array.isArray(data) ? data[0] : data;
  if (status === 'verified' && updated?.email) {
    await callNotifier('carte_livreur', {
      user_id: updated.id,
      email: updated.email,
      prenom: updated.prenom || '',
      nom: updated.nom || '',
      ville: updated.ville || '',
      vehicule: updated.vehicule || updated.transport_mode || '',
      transport_mode: updated.transport_mode || '',
      driver_status: updated.driver_status,
      card_id: 'PP-DR-' + String(updated.id || '').slice(0, 8).toUpperCase()
    }).catch(() => {});
  }

  return res.status(200).json({ success: true, profile: updated });
}
async function notifications(req, res, ctx, body) {
  if (req.method === 'GET' || body.mode === 'list') {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/notifications?user_id=eq.${ctx.session.id}&select=*&order=created_at.desc&limit=50`, {
      headers: sbHeaders(ctx.sbKey)
    });
    const data = r.ok ? await r.json() : [];
    return res.status(r.ok ? 200 : 400).json(r.ok ? { success: true, notifications: data } : { error: 'Lecture notifications impossible' });
  }

  const userId = body.user_id || body.userId || ctx.session.id;
  const admin = roleIn(ctx.profile, ['admin']);
  if (userId !== ctx.session.id && !admin) return res.status(403).json({ error: 'Notification refusee' });

  const payload = {
    user_id: userId,
    type: body.type || 'info',
    titre: body.titre || body.title || 'PorteaPorte',
    message: body.message || '',
    lu: false,
    metadata: body.metadata || {},
  };
  const r = await fetch(`${ctx.sbUrl}/rest/v1/notifications`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Creation notification impossible', details: data });
  return res.status(200).json({ success: true, notification: Array.isArray(data) ? data[0] : data });
}

async function refundPayment(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Role admin requis' });
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const livraisonId = body.livraison_id || body.livraisonId;
  let paymentIntent = body.payment_intent_id || body.paymentIntentId;
  if (!paymentIntent && livraisonId) {
    const txRes = await fetch(`${ctx.sbUrl}/rest/v1/transactions?livraison_id=eq.${livraisonId}&type=eq.paiement_livraison&select=id,stripe_payment_intent&order=created_at.desc&limit=1`, {
      headers: sbHeaders(ctx.sbKey)
    });
    const txs = txRes.ok ? await txRes.json() : [];
    paymentIntent = txs[0]?.stripe_payment_intent;
  }
  if (!paymentIntent) return res.status(400).json({ error: 'payment_intent_id ou livraison_id requis' });

  const params = { payment_intent: paymentIntent, reason: 'requested_by_customer' };
  if (body.amount || body.montant_cents) params.amount = String(Math.round(Number(body.amount || body.montant_cents)));
  const refund = await stripeRequest('POST', '/v1/refunds', params, ctx.stripeKey);

  if (livraisonId) {
    await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${livraisonId}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey, 'return=minimal'),
      body: JSON.stringify({ statut: 'rembourse' })
    }).catch(() => {});
  }

  return res.status(200).json({ success: true, refund_id: refund.id, status: refund.status, amount: refund.amount });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  let endpoint = 'unknown';
  try {
    const body = req.body || {};
    endpoint = endpointFromReq(req, body);
    const sbUrl = (process.env.SUPABASE_URL || '').replace(/[﻿​]/g, '').trim();
    const sbKey = (process.env.SUPABASE_SERVICE_KEY || '').replace(/[﻿​]/g, '').trim();
    if (!sbUrl || !sbKey) return res.status(503).json({ error: 'Supabase non configure' });

    const session = await getSession(req, sbUrl, sbKey);
    if (!session) return res.status(401).json({ error: 'Session requise' });
    const profile = await getProfile(session.id, sbUrl, sbKey);
    if (!profile || profile.suspendu || profile.verification_status === 'suspended') {
      return res.status(403).json({ error: 'Profil invalide ou suspendu' });
    }

    const ctx = { sbUrl, sbKey, stripeKey: process.env.STRIPE_SECRET_KEY, session, profile };

    if (endpoint === 'create-livraison') return await createLivraison(req, res, ctx, body);
    if (endpoint === 'assign-driver') return await assignDriver(req, res, ctx, body);
    if (endpoint === 'gps-update') return await gpsUpdate(req, res, ctx, body);
    if (endpoint === 'confirm-delivery') return await confirmDelivery(req, res, ctx, body);
    if (endpoint === 'available-livraisons') return await availableLivraisons(req, res, ctx, body);
    if (endpoint === 'tracking') return await tracking(req, res, ctx, body);
    if (endpoint === 'notifications') return await notifications(req, res, ctx, body);
    if (endpoint === 'submit-driver-verification') return await submitDriverVerification(req, res, ctx, body);
    if (endpoint === 'request-driver-card') return await requestDriverCard(req, res, ctx, body);
    if (endpoint === 'admin-update-driver-status') return await adminUpdateDriverStatus(req, res, ctx, body);
    if (endpoint === 'refund-payment') return await refundPayment(req, res, ctx, body);
    return res.status(400).json({ error: 'Endpoint plateforme inconnu: ' + endpoint });
  } catch (err) {
    console.error('[platform]', endpoint, err.message, err.stack);
    return res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
};




