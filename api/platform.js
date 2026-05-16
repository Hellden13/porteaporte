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
  await deliverPush(ctx, {
    type: 'nouvelle_mission',
    data: {
      id: livraison?.id,
      ville_depart: livraison?.ville_depart || payload.ville_depart,
      ville_arrivee: livraison?.ville_arrivee || payload.ville_arrivee,
      prix_total: livraison?.prix_total ?? payload.prix_total
    }
  }).catch((err) => console.error('[push nouvelle_mission]', err.message));
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
  const birthDate = String(body.birth_date || body.dob || '').trim();
  const kycPayload = {
    user_id: ctx.session.id,
    first_name: firstName,
    last_name: lastName,
    dob: /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : '1900-01-01',
    phone,
    address: [city, province].filter(Boolean).join(', '),
    transport_mode: transportMode || vehicule,
    eco_bonus: 0,
    doc_type: body.doc_type || 'profil_livreur',
    statut: nextDriverStatus,
    soumis_le: new Date().toISOString()
  };
  const kycRes = await fetch(`${ctx.sbUrl}/rest/v1/kyc_submissions?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      ...sbHeaders(ctx.sbKey),
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(kycPayload)
  }).catch(err => ({ ok: false, json: async () => ({ error: err.message }) }));
  const kycSaved = Boolean(kycRes && kycRes.ok);
  const kycError = kycSaved ? null : await kycRes.json().catch(() => ({}));

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
    kyc_saved: kycSaved,
    kyc_error: kycError,
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

async function adminSetUserAccess(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Admin requis' });
  }

  const userId = body.user_id || body.id;
  const action = String(body.action || '').trim();
  if (!userId || !['retirer', 'pause', 'reactiver', 'revision'].includes(action)) {
    return res.status(400).json({ error: 'user_id et action valide requis' });
  }

  if (userId === ctx.session.id) {
    return res.status(403).json({ error: 'Protection active: impossible de retirer ton propre compte admin' });
  }

  let targetRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role,suspendu,driver_status`, {
    headers: sbHeaders(ctx.sbKey)
  });
  if (!targetRes.ok) {
    targetRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role,suspendu`, {
      headers: sbHeaders(ctx.sbKey)
    });
  }
  const targetRows = targetRes.ok ? await targetRes.json() : [];
  const target = targetRows[0];
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (target.role === 'admin' && body.confirmation !== 'RETIRER_ADMIN') {
    return res.status(403).json({ error: 'Protection admin: confirmation speciale requise pour retirer un autre admin' });
  }

  const now = new Date().toISOString();
  const reason = String(body.reason || body.raison || '').trim().slice(0, 400);
  const patch = ['retirer', 'pause'].includes(action)
    ? {
        suspendu: true,
        driver_status: ['verified', 'pending_review'].includes(target.driver_status) ? 'suspended' : undefined,
        verification_status: 'suspended',
        raison_suspension: reason || (action === 'pause' ? 'Profil mis en pause par admin' : 'Utilisateur retire par admin'),
        mis_a_jour_le: now
      }
    : action === 'revision'
    ? {
        suspendu: false,
        driver_status: 'pending_review',
        verification_status: 'pending',
        raison_suspension: reason || 'Verification demandee de nouveau par admin',
        mis_a_jour_le: now
      }
    : {
        suspendu: false,
        driver_status: target.driver_status === 'suspended' ? 'not_started' : target.driver_status,
        verification_status: target.driver_status === 'suspended' ? 'pending' : undefined,
        raison_suspension: null,
        mis_a_jour_le: now
      };

  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  const profilePatchUrl = `${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`;
  const fallbackPatches = ['retirer', 'pause'].includes(action)
    ? [
        patch,
        { suspendu: true, verification_status: 'suspended', mis_a_jour_le: now },
        { suspendu: true, mis_a_jour_le: now },
        { suspendu: true }
      ]
    : action === 'revision'
    ? [
        patch,
        { suspendu: false, driver_status: 'pending_review', verification_status: 'pending', mis_a_jour_le: now },
        { suspendu: false, driver_status: 'pending_review', mis_a_jour_le: now },
        { suspendu: false, mis_a_jour_le: now }
      ]
    : [
        patch,
        { suspendu: false, verification_status: 'pending', mis_a_jour_le: now },
        { suspendu: false, mis_a_jour_le: now },
        { suspendu: false }
      ];

  let r;
  let data;
  for (const candidate of fallbackPatches) {
    r = await fetch(profilePatchUrl, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify(candidate)
    });
    data = await r.json().catch(() => ({}));
    if (r.ok) break;
  }
  if (!r.ok) return res.status(400).json({ error: 'Mise a jour acces utilisateur impossible', details: data });

  return res.status(200).json({ success: true, action, profile: Array.isArray(data) ? data[0] : data });
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

async function createReview(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['expediteur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role expediteur requis' });
  }

  const livraisonId = body.livraison_id || body.livraisonId || body.delivery_id;
  const rating = Math.round(toNumber(body.rating || body.note, 0));
  const comment = String(body.comment || body.commentaire || '').trim().slice(0, 800);
  if (!livraisonId || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'livraison_id et note 1-5 requis' });
  }

  const livRes = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}&select=id,expediteur_id,livreur_id,statut`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const rows = livRes.ok ? await livRes.json() : [];
  const livraison = rows[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });
  const admin = roleIn(ctx.profile, ['admin']);
  if (!admin && livraison.expediteur_id !== ctx.session.id) {
    return res.status(403).json({ error: 'Avis reserve a l expediteur de la livraison' });
  }
  if (!livraison.livreur_id) return res.status(409).json({ error: 'Aucun livreur assigne a evaluer' });
  if (!['livre', 'payee'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Avis possible seulement apres livraison' });
  }

  const reviewPayload = {
    reviewed_id: livraison.livreur_id,
    reviewer_id: ctx.session.id,
    rating,
    comment,
    delivery_id: livraison.id
  };
  let r = await fetch(`${ctx.sbUrl}/rest/v1/reviews`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(reviewPayload)
  });
  let data = await r.json().catch(() => ({}));

  if (!r.ok && /column .* does not exist|Could not find/i.test(JSON.stringify(data))) {
    const legacyPayload = {
      livreur_id: livraison.livreur_id,
      expediteur_id: ctx.session.id,
      livraison_id: livraison.id,
      note: rating,
      commentaire: comment
    };
    r = await fetch(`${ctx.sbUrl}/rest/v1/reviews`, {
      method: 'POST',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify(legacyPayload)
    });
    data = await r.json().catch(() => ({}));
  }

  if (!r.ok) {
    const evalPayload = {
      livraison_id: livraison.id,
      auteur_id: ctx.session.id,
      cible_id: livraison.livreur_id,
      note: rating,
      commentaire: comment
    };
    r = await fetch(`${ctx.sbUrl}/rest/v1/evaluations`, {
      method: 'POST',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify(evalPayload)
    });
    data = await r.json().catch(() => ({}));
  }

  if (!r.ok) return res.status(400).json({ error: 'Creation avis impossible', details: data });
  return res.status(200).json({ success: true, review: Array.isArray(data) ? data[0] : data });
}

async function fetchImpactState(sbUrl, sbKey) {
  const settingsRes = await fetch(`${sbUrl}/rest/v1/impact_settings?select=*&id=eq.default&limit=1`, {
    headers: sbHeaders(sbKey)
  });
  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  const settings = settingsRows[0] || {
    id: 'default',
    donation_rate_percent: 5,
    platform_commission_percent: 12,
    public_note: 'Montants estimes en direct, confirmes mensuellement.'
  };

  const orgRes = await fetch(`${sbUrl}/rest/v1/impact_organisations?select=*&order=sort_order.asc,name.asc`, {
    headers: sbHeaders(sbKey)
  });
  const organisations = orgRes.ok ? await orgRes.json() : [];
  const activeOrgs = organisations.filter((org) => org.active !== false).slice(0, 3);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const month = monthStart.toISOString().slice(0, 10);

  const livRes = await fetch(
    `${sbUrl}/rest/v1/livraisons?select=id,prix_total,prix,prix_final,statut,created_at,cree_le&statut=in.(payee,livre)&cree_le=gte.${monthStart.toISOString()}&cree_le=lt.${nextMonth.toISOString()}&limit=1000`,
    { headers: sbHeaders(sbKey) }
  );
  let livraisons = livRes.ok ? await livRes.json() : [];
  if (!livRes.ok) {
    const fallback = await fetch(
      `${sbUrl}/rest/v1/livraisons?select=id,prix_total,prix,prix_final,statut,created_at&statut=in.(payee,livre)&created_at=gte.${monthStart.toISOString()}&created_at=lt.${nextMonth.toISOString()}&limit=1000`,
      { headers: sbHeaders(sbKey) }
    );
    livraisons = fallback.ok ? await fallback.json() : [];
  }

  const revenueCents = livraisons.reduce((sum, row) => {
    const amount = toNumber(row.prix_total ?? row.prix_final ?? row.prix, 0);
    return sum + Math.round(amount * 100);
  }, 0);
  const commissionRate = Math.max(0, toNumber(settings.platform_commission_percent, 12));
  const donationRate = Math.max(0, toNumber(settings.donation_rate_percent, 5));
  const commissionCents = Math.round(revenueCents * commissionRate / 100);
  const donationPoolCents = Math.round(commissionCents * donationRate / 100);
  const allocationTotal = activeOrgs.reduce((sum, org) => sum + Math.max(0, toNumber(org.allocation_percent, 0)), 0);

  const allocations = activeOrgs.map((org) => {
    const percent = allocationTotal > 0 ? Math.max(0, toNumber(org.allocation_percent, 0)) : (activeOrgs.length ? 100 / activeOrgs.length : 0);
    return {
      id: org.id,
      name: org.name,
      description: org.description || '',
      website_url: org.website_url || '',
      allocation_percent: Math.round(percent * 100) / 100,
      amount_cents: Math.round(donationPoolCents * percent / 100)
    };
  });

  return {
    month,
    generated_at: new Date().toISOString(),
    settings,
    organisations,
    active_organisations: activeOrgs.length,
    totals: {
      deliveries_count: livraisons.length,
      revenue_cents: revenueCents,
      commission_cents: commissionCents,
      donation_pool_cents: donationPoolCents,
      donation_rate_percent: donationRate,
      platform_commission_percent: commissionRate,
      allocation_total_percent: Math.round(allocationTotal * 100) / 100,
      status: 'estimated'
    },
    allocations
  };
}

async function impactPublic(req, res, ctx) {
  const state = await fetchImpactState(ctx.sbUrl, ctx.sbKey);
  const publicState = {
    month: state.month,
    generated_at: state.generated_at,
    note: state.settings.public_note || 'Montants estimes en direct, confirmes mensuellement.',
    totals: state.totals,
    allocations: state.allocations
  };
  return res.status(200).json({ success: true, impact: publicState });
}

async function impactApplicationPublic(req, res, ctx, body) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
  const organisationName = String(body.organisation_name || body.name || '').trim().slice(0, 160);
  const contactName = String(body.contact_name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 180);
  const phone = String(body.phone || '').trim().slice(0, 60);
  const websiteUrl = String(body.website_url || '').trim().slice(0, 250);
  const mission = String(body.mission || '').trim().slice(0, 1200);
  const requestedSupport = String(body.requested_support || '').trim().slice(0, 800);

  if (!organisationName || !contactName || !email || !mission) {
    return res.status(400).json({ error: 'Organisation, contact, courriel et mission requis' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Courriel invalide' });
  }

  const payload = {
    organisation_name: organisationName,
    contact_name: contactName,
    email,
    phone,
    website_url: websiteUrl,
    mission,
    requested_support: requestedSupport,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_applications`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Demande impossible', details: data });
  return res.status(200).json({ success: true, application: Array.isArray(data) ? data[0] : data });
}

async function impactAdmin(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  if (req.method === 'GET' || body.mode === 'list') {
    const state = await fetchImpactState(ctx.sbUrl, ctx.sbKey);
    const appRes = await fetch(`${ctx.sbUrl}/rest/v1/impact_applications?select=*&order=created_at.desc&limit=100`, {
      headers: sbHeaders(ctx.sbKey)
    });
    const applications = appRes.ok ? await appRes.json() : [];
    return res.status(200).json({ success: true, impact: state, applications });
  }

  if (body.mode === 'settings') {
    const donationRate = Math.max(0, Math.min(100, toNumber(body.donation_rate_percent, 5)));
    const commissionRate = Math.max(0, Math.min(100, toNumber(body.platform_commission_percent, 12)));
    const payload = {
      id: 'default',
      donation_rate_percent: donationRate,
      platform_commission_percent: commissionRate,
      public_note: String(body.public_note || '').slice(0, 400),
      updated_by: ctx.session.id,
      updated_at: new Date().toISOString()
    };
    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_settings?on_conflict=id`, {
      method: 'POST',
      headers: { ...sbHeaders(ctx.sbKey), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Parametres impact impossibles', details: data });
    return res.status(200).json({ success: true, settings: Array.isArray(data) ? data[0] : data });
  }

  if (body.mode === 'upsert_org') {
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Nom organisme requis' });
    const payload = {
      name,
      description: String(body.description || '').trim().slice(0, 300),
      website_url: String(body.website_url || '').trim().slice(0, 250),
      active: body.active !== false,
      allocation_percent: Math.max(0, Math.min(100, toNumber(body.allocation_percent, 0))),
      sort_order: Math.round(toNumber(body.sort_order, 0)),
      updated_at: new Date().toISOString()
    };
    if (body.id) payload.id = body.id;

    const currentState = await fetchImpactState(ctx.sbUrl, ctx.sbKey).catch(() => ({ organisations: [] }));
    const simulated = (currentState.organisations || [])
      .filter((org) => !body.id || org.id !== body.id)
      .concat({ id: body.id || 'new', ...payload });
    const active = simulated.filter((org) => org.active !== false);
    const activeTotal = active.reduce((sum, org) => sum + Math.max(0, toNumber(org.allocation_percent, 0)), 0);
    if (active.length > 3) {
      return res.status(409).json({ error: 'Maximum 3 organismes actifs a la fois' });
    }
    if (activeTotal > 100.01) {
      return res.status(409).json({ error: 'La repartition active ne peut pas depasser 100%' });
    }

    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_organisations${body.id ? '?on_conflict=id' : ''}`, {
      method: 'POST',
      headers: body.id ? { ...sbHeaders(ctx.sbKey), Prefer: 'resolution=merge-duplicates' } : sbHeaders(ctx.sbKey),
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Sauvegarde organisme impossible', details: data });
    return res.status(200).json({ success: true, organisation: Array.isArray(data) ? data[0] : data });
  }

  if (body.mode === 'delete_org') {
    const id = body.id;
    if (!id) return res.status(400).json({ error: 'id requis' });
    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_organisations?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: sbHeaders(ctx.sbKey, 'return=minimal')
    });
    if (!r.ok) return res.status(400).json({ error: 'Suppression organisme impossible' });
    return res.status(200).json({ success: true });
  }

  if (body.mode === 'update_application') {
    const id = body.id;
    const status = String(body.status || '').trim();
    if (!id || !['pending', 'approved', 'rejected', 'contacted'].includes(status)) {
      return res.status(400).json({ error: 'id et statut valide requis' });
    }
    const patch = {
      status,
      admin_note: String(body.admin_note || '').trim().slice(0, 800),
      reviewed_by: ctx.session.id,
      reviewed_at: new Date().toISOString()
    };
    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_applications?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify(patch)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Mise a jour demande impossible', details: data });

    let createdOrganisation = null;
    if (status === 'approved') {
      const appRows = Array.isArray(data) ? data : [data];
      const app = appRows[0];
      if (app?.organisation_name) {
        const existingRes = await fetch(
          `${ctx.sbUrl}/rest/v1/impact_organisations?name=eq.${encodeURIComponent(app.organisation_name)}&select=id,name&limit=1`,
          { headers: sbHeaders(ctx.sbKey) }
        );
        const existing = existingRes.ok ? await existingRes.json() : [];
        if (!existing.length) {
          const orgPayload = {
            name: app.organisation_name,
            description: app.mission || app.requested_support || '',
            website_url: app.website_url || '',
            active: false,
            allocation_percent: 0,
            sort_order: 99,
            updated_at: new Date().toISOString()
          };
          const orgRes = await fetch(`${ctx.sbUrl}/rest/v1/impact_organisations`, {
            method: 'POST',
            headers: sbHeaders(ctx.sbKey),
            body: JSON.stringify(orgPayload)
          });
          const orgData = await orgRes.json().catch(() => ({}));
          if (orgRes.ok) createdOrganisation = Array.isArray(orgData) ? orgData[0] : orgData;
        }
      }
    }

    return res.status(200).json({
      success: true,
      application: Array.isArray(data) ? data[0] : data,
      organisation_created: createdOrganisation
    });
  }

  return res.status(400).json({ error: 'Mode impact inconnu' });
}

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

function computeDriverLevel(profile, coinsBalance) {
  const deliveries = Number(profile?.livraisons || 0);
  const score = Number(profile?.score || profile?.score_confiance || 0) / 20;
  const levels = [
    { level: 1, name: 'Nouveau', min_deliveries: 0, min_score: 0, benefit: 'Acces aux missions locales.' },
    { level: 2, name: 'Fiable', min_deliveries: 10, min_score: 4.5, benefit: 'Meilleure visibilite sur les missions.' },
    { level: 3, name: 'Ambassadeur', min_deliveries: 50, min_score: 4.7, benefit: 'Missions prioritaires et badges avances.' },
    { level: 4, name: 'Capitaine regional', min_deliveries: 100, min_score: 4.8, benefit: 'Missions exclusives et priorite regionale.' }
  ];
  const current = [...levels].reverse().find((lvl) => deliveries >= lvl.min_deliveries && score >= lvl.min_score) || levels[0];
  const next = levels.find((lvl) => lvl.level === current.level + 1) || null;
  return { current, next, deliveries, score: Math.round(score * 10) / 10, coins_balance: coinsBalance };
}

async function rewardsDashboard(req, res, ctx) {
  const missionsRes = await fetch(`${ctx.sbUrl}/rest/v1/missions?select=*&status=eq.active&order=created_at.desc&limit=50`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const missions = missionsRes.ok ? await missionsRes.json() : defaultRewardMissions();

  const missionIds = missions.map((m) => m.id).filter((id) => !String(id).startsWith('default-'));
  let progress = [];
  if (missionIds.length) {
    const progressRes = await fetch(
      `${ctx.sbUrl}/rest/v1/user_missions?select=*&user_id=eq.${ctx.session.id}&mission_id=in.(${missionIds.join(',')})`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    progress = progressRes.ok ? await progressRes.json() : [];
  }

  const txRes = await fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount,reason,created_at&user_id=eq.${ctx.session.id}&order=created_at.desc&limit=100`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const txs = txRes.ok ? await txRes.json() : [];
  const txBalance = txs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const fallbackCoins = Number(ctx.profile?.porte_coins || ctx.profile?.portecoins || 0);
  const coinsBalance = txs.length ? txBalance : fallbackCoins;

  const drawsRes = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?select=*&status=eq.active&order=draw_date.asc&limit=5`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const draws = drawsRes.ok ? await drawsRes.json() : [];
  const drawIds = draws.map((d) => d.id);
  let entries = [];
  if (drawIds.length) {
    const entriesRes = await fetch(`${ctx.sbUrl}/rest/v1/draw_entries?select=draw_id,entries&user_id=eq.${ctx.session.id}&draw_id=in.(${drawIds.join(',')})`, {
      headers: sbHeaders(ctx.sbKey)
    });
    entries = entriesRes.ok ? await entriesRes.json() : [];
  }

  return res.status(200).json({
    success: true,
    porte_coins_balance: coinsBalance,
    transactions: txs.slice(0, 10),
    missions,
    progress,
    draws,
    entries,
    level: computeDriverLevel(ctx.profile, coinsBalance),
    legal_notice: 'Les tirages sont soumis aux reglements officiels. Aucun achat requis lorsque requis par la loi. Les PorteCoins n ont aucune valeur monetaire.'
  });
}

async function drawEnter(req, res, ctx, body) {
  const drawId = body.draw_id || body.drawId;
  const entries = Math.max(1, Math.min(50, Math.round(toNumber(body.entries, 1))));
  if (!drawId) return res.status(400).json({ error: 'draw_id requis' });
  const cost = entries * 10;

  const drawRes = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(drawId)}&status=eq.active&select=id,title,draw_date&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const draws = drawRes.ok ? await drawRes.json() : [];
  if (!draws.length) return res.status(404).json({ error: 'Tirage actif introuvable' });

  const txRes = await fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount&user_id=eq.${ctx.session.id}&limit=1000`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const txs = txRes.ok ? await txRes.json() : [];
  const balance = txs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  if (balance < cost) return res.status(409).json({ error: 'PorteCoins insuffisants', balance, cost });

  const debitRes = await fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      user_id: ctx.session.id,
      amount: -cost,
      reason: 'draw_entry',
      metadata: { draw_id: drawId, entries }
    })
  });
  const debit = await debitRes.json().catch(() => ({}));
  if (!debitRes.ok) return res.status(400).json({ error: 'Debit PorteCoins impossible', details: debit });

  const entryRes = await fetch(`${ctx.sbUrl}/rest/v1/draw_entries`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ draw_id: drawId, user_id: ctx.session.id, entries, cost_coins: cost })
  });
  const entry = await entryRes.json().catch(() => ({}));
  if (!entryRes.ok) return res.status(400).json({ error: 'Participation impossible', details: entry });
  return res.status(200).json({ success: true, entries, cost, balance_after: balance - cost });
}

function pickWeightedWinner(candidates) {
  const total = candidates.reduce((sum, row) => sum + Math.max(1, Number(row.entries_weight || row.entries || 1)), 0);
  if (!total) return null;
  const crypto = require('crypto');
  let roll = crypto.randomInt(1, total + 1);
  for (const row of candidates) {
    roll -= Math.max(1, Number(row.entries_weight || row.entries || 1));
    if (roll <= 0) return row;
  }
  return candidates[candidates.length - 1] || null;
}

async function runMonthlyDraw(ctx, drawId) {
  const drawRes = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(drawId)}&select=*&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const drawRows = drawRes.ok ? await drawRes.json() : [];
  const draw = drawRows[0];
  if (!draw) return { ok: false, status: 404, error: 'Tirage introuvable' };
  if (draw.status === 'completed') return { ok: false, status: 409, error: 'Tirage deja complete' };
  if (draw.status === 'cancelled') return { ok: false, status: 409, error: 'Tirage annule' };

  const existingRes = await fetch(`${ctx.sbUrl}/rest/v1/draw_winners?draw_id=eq.${encodeURIComponent(drawId)}&select=id,user_id&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const existing = existingRes.ok ? await existingRes.json() : [];
  if (existing.length) return { ok: false, status: 409, error: 'Un gagnant existe deja pour ce tirage' };

  const entriesRes = await fetch(`${ctx.sbUrl}/rest/v1/draw_entries?draw_id=eq.${encodeURIComponent(drawId)}&select=user_id,entries`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const entries = entriesRes.ok ? await entriesRes.json() : [];
  const grouped = new Map();
  entries.forEach((entry) => grouped.set(entry.user_id, (grouped.get(entry.user_id) || 0) + Number(entry.entries || 0)));
  let candidates = [...grouped.entries()].map(([user_id, entries_weight]) => ({ user_id, entries_weight }));

  if (!candidates.length && draw.auto_include_all_users !== false) {
    const profilesRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?select=id,email,role&suspendu=eq.false&role=in.(livreur,expediteur,les%20deux)&limit=2000`, {
      headers: sbHeaders(ctx.sbKey)
    });
    const profiles = profilesRes.ok ? await profilesRes.json() : [];
    candidates = profiles.map((profile) => ({
      user_id: profile.id,
      entries_weight: 1,
      user_email: profile.email,
      user_role: profile.role
    }));
  }
  if (!candidates.length) return { ok: false, status: 409, error: 'Aucun participant admissible' };

  const winner = pickWeightedWinner(candidates);
  const profileRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(winner.user_id)}&select=id,email,role&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const profiles = profileRes.ok ? await profileRes.json() : [];
  const profile = profiles[0] || {};

  const winnerRes = await insertWithSchemaFallback(
    `${ctx.sbUrl}/rest/v1/draw_winners`,
    sbHeaders(ctx.sbKey),
    {
      draw_id: drawId,
      user_id: winner.user_id,
      prize_title: draw.title || 'Tirage PorteaPorte',
      published: false,
      entries_weight: winner.entries_weight || 1,
      user_email: profile.email || winner.user_email || '',
      user_role: profile.role || winner.user_role || '',
      selected_by: ctx.session.id
    },
    ['entries_weight', 'user_email', 'user_role', 'selected_by']
  );
  if (!winnerRes.ok) return { ok: false, status: 400, error: 'Enregistrement gagnant impossible', details: winnerRes.data };

  await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(drawId)}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ status: 'completed', winner_selected_at: new Date().toISOString() })
  }).catch(() => {});

  return { ok: true, winner: Array.isArray(winnerRes.data) ? winnerRes.data[0] : winnerRes.data, candidates_count: candidates.length };
}

async function adminRewards(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  if (req.method === 'GET' || body.mode === 'list') {
    const [missionsRes, drawsRes, txRes] = await Promise.all([
      fetch(`${ctx.sbUrl}/rest/v1/missions?select=*&order=created_at.desc&limit=100`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?select=*&order=draw_date.desc&limit=50`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount&limit=1000`, { headers: sbHeaders(ctx.sbKey) })
    ]);
    const missions = missionsRes.ok ? await missionsRes.json() : [];
    const draws = drawsRes.ok ? await drawsRes.json() : [];
    const txs = txRes.ok ? await txRes.json() : [];
    return res.status(200).json({
      success: true,
      missions,
      draws,
      stats: {
        coins_issued_net: txs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
        transactions_count: txs.length,
        active_draws: draws.filter((d) => d.status === 'active').length,
        cancelled_draws: draws.filter((d) => d.status === 'cancelled').length
      }
    });
  }

  if (body.mode === 'create_mission') {
    const payload = {
      title: String(body.title || '').trim().slice(0, 140),
      description: String(body.description || '').trim().slice(0, 800),
      objective_type: String(body.objective_type || 'custom').trim().slice(0, 80),
      objective_target: Math.max(1, Math.round(toNumber(body.objective_target, 1))),
      reward_coins: Math.max(0, Math.round(toNumber(body.reward_coins, 0))),
      deadline: body.deadline || null,
      status: body.status || 'active'
    };
    if (!payload.title) return res.status(400).json({ error: 'Titre requis' });
    const r = await fetch(`${ctx.sbUrl}/rest/v1/missions`, { method: 'POST', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Creation mission impossible', details: data });
    return res.status(200).json({ success: true, mission: Array.isArray(data) ? data[0] : data });
  }

  if (body.mode === 'create_draw') {
    const payload = {
      title: String(body.title || '').trim().slice(0, 140),
      description: String(body.description || '').trim().slice(0, 800),
      draw_date: body.draw_date,
      status: body.status || 'active',
      rules_url: body.rules_url || '/reglements-tirage.html',
      auto_include_all_users: body.auto_include_all_users !== false,
      admin_note: String(body.admin_note || '').trim().slice(0, 500)
    };
    if (!payload.title || !payload.draw_date) return res.status(400).json({ error: 'Titre et date requis' });
    const insert = await insertWithSchemaFallback(
      `${ctx.sbUrl}/rest/v1/monthly_draws`,
      sbHeaders(ctx.sbKey),
      payload,
      ['auto_include_all_users', 'admin_note']
    );
    if (!insert.ok) return res.status(400).json({ error: 'Creation tirage impossible', details: insert.data });
    return res.status(200).json({ success: true, draw: Array.isArray(insert.data) ? insert.data[0] : insert.data });
  }

  if (body.mode === 'update_draw_status') {
    const id = body.id || body.draw_id;
    const status = String(body.status || '').trim();
    const allowed = new Set(['draft', 'active', 'closed', 'completed', 'cancelled']);
    if (!id || !allowed.has(status)) return res.status(400).json({ error: 'id et statut valide requis' });
    const r = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Mise a jour tirage impossible', details: data });
    return res.status(200).json({ success: true, draw: Array.isArray(data) ? data[0] : data });
  }

  if (body.mode === 'run_draw') {
    const id = body.id || body.draw_id;
    if (!id) return res.status(400).json({ error: 'draw_id requis' });
    const result = await runMonthlyDraw(ctx, id);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error, details: result.details });
    return res.status(200).json({ success: true, winner: result.winner, candidates_count: result.candidates_count });
  }

  return res.status(400).json({ error: 'Mode rewards inconnu' });
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
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const internalHeader = req.headers['x-internal-notifier-secret'];
    const internal = Boolean(internalSecret && internalHeader && internalHeader === internalSecret);

    if (endpoint === 'impact-public') {
      return await impactPublic(req, res, { sbUrl, sbKey });
    }
    if (endpoint === 'impact-application') {
      return await impactApplicationPublic(req, res, { sbUrl, sbKey }, body);
    }

    if (endpoint === 'push-send' && internal) {
      const ctx = {
        sbUrl,
        sbKey,
        stripeKey: process.env.STRIPE_SECRET_KEY,
        session: { id: 'internal', email: 'internal@porteaporte.site' },
        profile: { role: 'admin', suspendu: false },
        internal: true
      };
      return await pushSend(req, res, ctx, body);
    }

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
    if (endpoint === 'retirer') return await adminSetUserAccess(req, res, ctx, { ...body, action: 'retirer' });
    if (endpoint === 'pause-user') return await adminSetUserAccess(req, res, ctx, { ...body, action: 'pause' });
    if (endpoint === 'reactiver-user') return await adminSetUserAccess(req, res, ctx, { ...body, action: 'reactiver' });
    if (endpoint === 'revision-user') return await adminSetUserAccess(req, res, ctx, { ...body, action: 'revision' });
    if (endpoint === 'admin-user-access') return await adminSetUserAccess(req, res, ctx, body);
    if (endpoint === 'refund-payment') return await refundPayment(req, res, ctx, body);
    if (endpoint === 'create-review') return await createReview(req, res, ctx, body);
    if (endpoint === 'impact-admin') return await impactAdmin(req, res, ctx, body);
    if (endpoint === 'rewards-dashboard') return await rewardsDashboard(req, res, ctx);
    if (endpoint === 'draw-enter') return await drawEnter(req, res, ctx, body);
    if (endpoint === 'admin-rewards') return await adminRewards(req, res, ctx, body);
    if (endpoint === 'push-subscribe') return await pushSubscribe(req, res, ctx, body);
    if (endpoint === 'push-send') return await pushSend(req, res, ctx, body);
    if (endpoint === 'ride-create')   return await rideCreate(req, res, ctx, body);
    if (endpoint === 'ride-search')   return await rideSearch(req, res, ctx, body);
    if (endpoint === 'ride-detail')   return await rideDetail(req, res, ctx, body);
    if (endpoint === 'ride-book')     return await rideBook(req, res, ctx, body);
    if (endpoint === 'ride-cancel')   return await rideCancel(req, res, ctx, body);
    if (endpoint === 'ride-my-rides') return await rideMyRides(req, res, ctx, body);
    if (endpoint === 'ride-admin')    return await rideAdmin(req, res, ctx, body);
    if (endpoint === 'ride-report')   return await rideReport(req, res, ctx, body);
    return res.status(400).json({ error: 'Endpoint plateforme inconnu: ' + endpoint });
  } catch (err) {
    console.error('[platform]', endpoint, err.message, err.stack);
    return res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
};

/* ============================================================
   PUSH NOTIFICATIONS
============================================================ */
async function pushSubscribe(req, res, ctx, body) {
  const { subscription } = body;
  const userId = ctx.session.id;
  if (req.method === 'DELETE') {
    const ep = body.endpoint;
    if (!ep) return res.status(400).json({ error: 'endpoint requis' });
    await fetch(`${ctx.sbUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
      method: 'DELETE', headers: sbHeaders(ctx.sbKey)
    });
    return res.status(200).json({ ok: true });
  }
  if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription requise' });
  const r = await fetch(`${ctx.sbUrl}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id:  userId,
      endpoint: subscription.endpoint,
      p256dh:   subscription.keys?.p256dh,
      auth:     subscription.keys?.auth,
      cree_le:  new Date().toISOString()
    })
  });
  return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
}

async function deliverPush(ctx, body) {
  const webpush = require('web-push');
  const vapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!vapidPublic || !vapidPrivate) {
    return { ok: false, status: 503, error: 'VAPID non configure', sent: 0, failed: 0 };
  }

  webpush.setVapidDetails(
    'mailto:bonjour@porteaporte.site',
    vapidPublic,
    vapidPrivate
  );

  const TEMPLATES = {
    nouvelle_mission: d => ({ title: '📦 Nouvelle mission !', body: `${d.ville_depart} → ${d.ville_arrivee} · ${d.prix_total} $`, tag: 'mission-' + d.id, data: { url: '/browse-missions.html' } }),
    mission_assignee: d => ({ title: '✅ Mission confirmée !', body: `Livraison ${d.code}`, tag: 'assigned-' + d.id, data: { url: '/map.html?id=' + d.id } }),
    kyc_approuve:     () => ({ title: '🎉 Vérification approuvée !', body: 'Tu peux maintenant accepter des livraisons.', tag: 'kyc-ok', data: { url: '/dashboard-livreur.html' } }),
    kyc_rejete:       d  => ({ title: '⚠️ Dossier KYC refusé', body: d.raison || 'Consulte ta messagerie.', tag: 'kyc-ko', data: { url: '/kyc.html' } }),
    message_recu:     d  => ({ title: '💬 Nouveau message', body: (d.expediteur || 'Client') + ' : ' + (d.apercu || ''), tag: 'msg-' + d.conv_id, data: { url: '/messagerie.html?conv=' + d.conv_id } }),
    paiement_libere:  d  => ({ title: '💰 Paiement libéré !', body: `${d.montant} $ déposés sur ton compte.`, tag: 'pay-' + d.livraison_id, data: { url: '/dashboard-livreur.html' } })
  };

  const { type, data = {}, userIds = null } = body;
  if (!type || !TEMPLATES[type]) return { ok: false, status: 400, error: 'type invalide', sent: 0, failed: 0 };
  const payload = TEMPLATES[type](data);

  let targetUserIds = Array.isArray(userIds) ? userIds : null;
  if (!targetUserIds && type === 'nouvelle_mission') {
    const driversRes = await fetch(
      `${ctx.sbUrl}/rest/v1/profiles?select=id&role=in.(livreur,les%20deux)&suspendu=eq.false&driver_status=eq.verified&disponible=eq.true&limit=500`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    const drivers = driversRes.ok ? await driversRes.json() : [];
    targetUserIds = drivers.map((driver) => driver.id).filter(Boolean);
    if (!targetUserIds.length) return { ok: true, sent: 0, failed: 0, targeted: 0 };
  }

  let url = `${ctx.sbUrl}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`;
  if (targetUserIds?.length) url += `&user_id=in.(${targetUserIds.join(',')})`;
  const r   = await fetch(url, { headers: sbHeaders(ctx.sbKey) });
  const subs = r.ok ? await r.json() : [];
  if (!subs.length) return { ok: true, sent: 0, failed: 0, targeted: targetUserIds?.length || null };

  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(payload)
    ).catch(async err => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await fetch(`${ctx.sbUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
          method: 'DELETE', headers: sbHeaders(ctx.sbKey)
        });
      }
      throw err;
    }))
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return { ok: true, sent, failed: results.length - sent, targeted: targetUserIds?.length || null };
}

async function pushSend(req, res, ctx, body) {
  if (!ctx.internal && !['admin', 'expediteur'].includes(ctx.profile?.role)) {
    return res.status(403).json({ error: 'Non autorise' });
  }

  const result = await deliverPush(ctx, body);
  return res.status(result.status || (result.ok ? 200 : 400)).json(result);
}

// ═══════════════════════════════════════════════════════════════
// COVOITURAGE
// ═══════════════════════════════════════════════════════════════

const RIDE_COST_PER_KM   = 0.35;
const RIDE_PLATFORM_PCT  = 0.10;
const RIDE_MAX_COST_PER_KM = 0.50;
const RIDE_FEE_LUGGAGE   = 5.00;
const RIDE_FEE_PET       = 8.00;
const RIDE_FEE_STOP      = 3.00;

function calcRidePrice({ totalDistanceKm, passengerDistanceKm, costPerKm, hasLuggage, hasPet, extraStops, detourKm, seats }) {
  const cpk = Number(costPerKm) || RIDE_COST_PER_KM;
  const totalKm = Number(totalDistanceKm) || 0;
  const paxKm   = Number(passengerDistanceKm) || totalKm;
  const nSeats  = Number(seats) || 1;

  const totalCostBase = totalKm * cpk;
  const paxSharePct   = totalKm > 0 ? (paxKm / totalKm) : 1;
  const paxBase       = totalCostBase * paxSharePct * nSeats;

  const luggageFee = hasLuggage ? RIDE_FEE_LUGGAGE : 0;
  const petFee     = hasPet     ? RIDE_FEE_PET     : 0;
  const stopFee    = (Number(extraStops) || 0) * RIDE_FEE_STOP;
  const detourFee  = (Number(detourKm)  || 0) * cpk;

  const subtotal      = paxBase + luggageFee + petFee + stopFee + detourFee;
  const platformFee   = Math.round(subtotal * RIDE_PLATFORM_PCT * 100) / 100;
  const totalPassenger = Math.round((subtotal + platformFee) * 100) / 100;
  const driverAmount  = Math.round(subtotal * 100) / 100;

  const maxAllowed = Math.round(paxKm * RIDE_MAX_COST_PER_KM * 100) / 100;
  const overLimit  = totalPassenger > maxAllowed + platformFee;

  return {
    costPerKm: cpk,
    totalDistanceKm: totalKm,
    totalCostBase: Math.round(totalCostBase * 100) / 100,
    paxDistanceKm: paxKm,
    paxSharePct: Math.round(paxSharePct * 10000) / 100,
    paxBase:       Math.round(paxBase * 100) / 100,
    luggageFee, petFee, stopFee, detourFee,
    platformFee, driverAmount, totalPassenger,
    overLimit, maxAllowed,
  };
}

async function rideCreate(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const {
    start_city, end_city, departure_time,
    available_seats, vehicle_type, trunk_size,
    accepts_pets, accepts_large_luggage, accepts_extra_stops,
    non_smoker, women_only, child_seat_available, accessible,
    flexibility_minutes, is_return_trip, return_departure_time,
    is_recurring, recurrence_days,
    start_sector, end_sector,
    start_lat, start_lng, end_lat, end_lng,
    total_distance_km, cost_per_km, personal_rules,
  } = body;

  if (!start_city || !end_city || !departure_time || !available_seats) {
    return res.status(400).json({ error: 'Champs requis : start_city, end_city, departure_time, available_seats' });
  }

  const distKm = Number(total_distance_km) || estimateRouteKm(start_city, end_city) || 100;
  const cpk    = Math.min(Number(cost_per_km) || RIDE_COST_PER_KM, RIDE_MAX_COST_PER_KM);

  const payload = {
    driver_id: ctx.session.id,
    start_city: String(start_city).trim(),
    start_sector: start_sector ? String(start_sector).trim() : null,
    start_lat: start_lat ? Number(start_lat) : null,
    start_lng: start_lng ? Number(start_lng) : null,
    end_city: String(end_city).trim(),
    end_sector: end_sector ? String(end_sector).trim() : null,
    end_lat: end_lat ? Number(end_lat) : null,
    end_lng: end_lng ? Number(end_lng) : null,
    departure_time: new Date(departure_time).toISOString(),
    flexibility_minutes: Number(flexibility_minutes) || 0,
    is_return_trip: Boolean(is_return_trip),
    return_departure_time: is_return_trip && return_departure_time ? new Date(return_departure_time).toISOString() : null,
    is_recurring: Boolean(is_recurring),
    recurrence_days: is_recurring && Array.isArray(recurrence_days) ? recurrence_days : null,
    vehicle_type: vehicle_type || 'berline',
    trunk_size: ['petit','moyen','grand'].includes(trunk_size) ? trunk_size : 'moyen',
    available_seats: Math.min(Math.max(Number(available_seats) || 1, 1), 8),
    accepts_pets: Boolean(accepts_pets),
    accepts_large_luggage: Boolean(accepts_large_luggage),
    accepts_extra_stops: Boolean(accepts_extra_stops),
    non_smoker: accepts_pets === undefined ? true : Boolean(non_smoker),
    women_only: Boolean(women_only),
    child_seat_available: Boolean(child_seat_available),
    accessible: Boolean(accessible),
    personal_rules: personal_rules ? String(personal_rules).slice(0, 500) : null,
    cost_per_km: cpk,
    total_distance_km: distKm,
    status: 'publie',
  };

  const r = await fetch(`${ctx.sbUrl}/rest/v1/rides`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Création trajet impossible', details: data });

  const ride = Array.isArray(data) ? data[0] : data;
  return res.status(200).json({ success: true, ride });
}

async function rideSearch(req, res, ctx, body) {
  const url = new URL(req.url || '/', 'https://porteaporte.site');
  const start = body.start_city || url.searchParams.get('start_city') || '';
  const end   = body.end_city   || url.searchParams.get('end_city')   || '';
  const date  = body.date       || url.searchParams.get('date')       || '';
  const seats = Number(body.seats || url.searchParams.get('seats') || 1);

  let filter = `status=eq.publie&available_seats=gte.${seats}`;
  if (start) filter += `&start_city=ilike.*${encodeURIComponent(start)}*`;
  if (end)   filter += `&end_city=ilike.*${encodeURIComponent(end)}*`;
  if (date) {
    const d = new Date(date);
    if (!isNaN(d)) {
      const from = new Date(d); from.setHours(0,0,0,0);
      const to   = new Date(d); to.setHours(23,59,59,999);
      filter += `&departure_time=gte.${from.toISOString()}&departure_time=lte.${to.toISOString()}`;
    }
  }
  filter += '&order=departure_time.asc&limit=50';

  const select = 'id,start_city,start_sector,end_city,end_sector,departure_time,available_seats,vehicle_type,trunk_size,accepts_pets,accepts_large_luggage,accepts_extra_stops,non_smoker,women_only,accessible,cost_per_km,total_distance_km,status,driver_id';

  const r = await fetch(`${ctx.sbUrl}/rest/v1/rides?${filter}&select=${select}`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const rides = r.ok ? await r.json() : [];

  // Enrichir avec prix estimé et info chauffeur limitée (sans données privées)
  const enriched = await Promise.all(rides.map(async (ride) => {
    const price = calcRidePrice({
      totalDistanceKm: ride.total_distance_km,
      passengerDistanceKm: ride.total_distance_km,
      costPerKm: ride.cost_per_km,
      seats,
    });

    // Profil chauffeur — données publiques seulement
    const pRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${ride.driver_id}&select=prenom,driver_status,verification_status`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const pRows = pRes.ok ? await pRes.json() : [];
    const driver = pRows[0] || {};

    return {
      ...ride,
      start_lat: undefined, start_lng: undefined,
      end_lat: undefined,   end_lng: undefined,
      driver: {
        prenom: driver.prenom || 'Chauffeur',
        verified: driver.driver_status === 'verified',
      },
      estimated_price: price.totalPassenger,
      driver_amount:   price.driverAmount,
      platform_fee:    price.platformFee,
    };
  }));

  return res.status(200).json({ rides: enriched });
}

async function rideDetail(req, res, ctx, body) {
  const url    = new URL(req.url || '/', 'https://porteaporte.site');
  const rideId = body.ride_id || url.searchParams.get('ride_id');
  if (!rideId) return res.status(400).json({ error: 'ride_id requis' });

  const r = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${rideId}&select=*`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return res.status(404).json({ error: 'Trajet introuvable' });

  const ride = rows[0];
  if (ride.status !== 'publie' && ride.driver_id !== ctx.session?.id &&
      ctx.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Trajet non disponible' });
  }

  // Arrêts
  const stopsRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_stops?ride_id=eq.${rideId}&order=stop_order.asc`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const stops = stopsRes.ok ? await stopsRes.json() : [];

  // Chauffeur — données publiques
  const pRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${ride.driver_id}&select=prenom,driver_status,created_at`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const pRows = pRes.ok ? await pRes.json() : [];
  const driver = pRows[0] || {};

  // Calcul prix avec options passager depuis body
  const paxKm = Number(body.passenger_distance_km) || ride.total_distance_km;
  const price = calcRidePrice({
    totalDistanceKm: ride.total_distance_km,
    passengerDistanceKm: paxKm,
    costPerKm: ride.cost_per_km,
    hasLuggage:  body.has_large_luggage,
    hasPet:      body.has_pet,
    extraStops:  body.extra_stops_count,
    detourKm:    body.requested_detour_km,
    seats:       body.seats_reserved || 1,
  });

  // Masquer coordonnées exactes si non confirmé
  const isParty = ctx.session && (ride.driver_id === ctx.session.id || ctx.profile?.role === 'admin');
  const safeRide = { ...ride };
  if (!isParty) {
    delete safeRide.start_lat; delete safeRide.start_lng;
    delete safeRide.end_lat;   delete safeRide.end_lng;
  }

  return res.status(200).json({
    ride: safeRide,
    stops,
    driver: {
      prenom:   driver.prenom || 'Chauffeur',
      verified: driver.driver_status === 'verified',
      member_since: driver.created_at ? new Date(driver.created_at).getFullYear() : null,
    },
    price_breakdown: price,
  });
}

async function rideBook(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { ride_id, pickup_city, dropoff_city, seats_reserved,
          has_large_luggage, has_pet, extra_stops_count,
          requested_detour_km, passenger_distance_km, special_requests,
          pickup_sector, dropoff_sector } = body;

  if (!ride_id || !pickup_city || !dropoff_city) {
    return res.status(400).json({ error: 'ride_id, pickup_city, dropoff_city requis' });
  }

  // Vérifier que le trajet existe et a des places
  const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=id,driver_id,available_seats,status,cost_per_km,total_distance_km,accepts_pets,accepts_large_luggage`, {
    headers: sbHeaders(ctx.sbKey),
  });
  const rRows = rRes.ok ? await rRes.json() : [];
  if (!rRows.length) return res.status(404).json({ error: 'Trajet introuvable' });

  const ride = rRows[0];
  if (ride.status !== 'publie') return res.status(400).json({ error: 'Ce trajet n\'est plus disponible' });
  if (ride.driver_id === ctx.session.id) return res.status(400).json({ error: 'Vous ne pouvez pas réserver votre propre trajet' });
  if (!ride.accepts_pets && has_pet) return res.status(400).json({ error: 'Ce chauffeur n\'accepte pas les animaux' });
  if (!ride.accepts_large_luggage && has_large_luggage) return res.status(400).json({ error: 'Ce chauffeur n\'accepte pas les gros bagages' });

  const seats = Math.max(1, Number(seats_reserved) || 1);
  if (seats > ride.available_seats) return res.status(400).json({ error: `Seulement ${ride.available_seats} place(s) disponible(s)` });

  const paxKm = Number(passenger_distance_km) || ride.total_distance_km;
  const price = calcRidePrice({
    totalDistanceKm: ride.total_distance_km,
    passengerDistanceKm: paxKm,
    costPerKm: ride.cost_per_km,
    hasLuggage:  has_large_luggage,
    hasPet:      has_pet,
    extraStops:  extra_stops_count,
    detourKm:    requested_detour_km,
    seats,
  });

  const booking = {
    ride_id,
    passenger_id: ctx.session.id,
    pickup_city:  String(pickup_city).trim(),
    pickup_sector: pickup_sector ? String(pickup_sector).trim() : null,
    dropoff_city: String(dropoff_city).trim(),
    dropoff_sector: dropoff_sector ? String(dropoff_sector).trim() : null,
    seats_reserved: seats,
    has_large_luggage: Boolean(has_large_luggage),
    has_pet:           Boolean(has_pet),
    extra_stops_count: Number(extra_stops_count) || 0,
    requested_detour_km: Number(requested_detour_km) || 0,
    special_requests: special_requests ? String(special_requests).slice(0, 500) : null,
    passenger_distance_km: price.paxDistanceKm,
    base_share:    price.paxBase,
    luggage_fee:   price.luggageFee,
    pet_fee:       price.petFee,
    stop_fee:      price.stopFee,
    detour_fee:    price.detourFee,
    platform_fee:  price.platformFee,
    driver_amount: price.driverAmount,
    total_passenger: price.totalPassenger,
    status: 'en_attente',
  };

  const bRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
    body: JSON.stringify(booking),
  });
  const bData = await bRes.json().catch(() => ({}));
  if (!bRes.ok) return res.status(400).json({ error: 'Réservation impossible', details: bData });

  const saved = Array.isArray(bData) ? bData[0] : bData;

  // Sauvegarder le breakdown pour audit
  await fetch(`${ctx.sbUrl}/rest/v1/ride_price_breakdowns`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      booking_id:     saved.id,
      cost_per_km:    price.costPerKm,
      total_distance: price.totalDistanceKm,
      total_cost_base: price.totalCostBase,
      pax_distance:   price.paxDistanceKm,
      pax_share_pct:  price.paxSharePct,
      pax_base:       price.paxBase,
      extras_detail:  { luggage: price.luggageFee, pet: price.petFee, stops: price.stopFee, detour: price.detourFee },
      platform_pct:   RIDE_PLATFORM_PCT * 100,
      driver_receives: price.driverAmount,
      passenger_pays:  price.totalPassenger,
    }),
  }).catch(() => {});

  // Décrémenter places disponibles
  await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ available_seats: ride.available_seats - seats }),
  }).catch(() => {});

  return res.status(200).json({ success: true, booking: saved, price_breakdown: price });
}

async function rideCancel(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { booking_id, ride_id } = body;

  // Annulation par passager (via booking_id)
  if (booking_id) {
    const bRes = await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${booking_id}&select=id,passenger_id,ride_id,seats_reserved,status`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const bRows = bRes.ok ? await bRes.json() : [];
    if (!bRows.length) return res.status(404).json({ error: 'Réservation introuvable' });

    const b = bRows[0];
    if (b.passenger_id !== ctx.session.id && ctx.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    if (['annule_passager','annule_chauffeur','complete'].includes(b.status)) {
      return res.status(400).json({ error: 'Réservation déjà annulée ou complétée' });
    }

    await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?id=eq.${booking_id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule_passager' }),
    });

    // Remettre les places
    const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${b.ride_id}&select=available_seats`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const rRows = rRes.ok ? await rRes.json() : [];
    if (rRows.length) {
      await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${b.ride_id}`, {
        method: 'PATCH',
        headers: sbHeaders(ctx.sbKey),
        body: JSON.stringify({ available_seats: (rRows[0].available_seats || 0) + b.seats_reserved }),
      }).catch(() => {});
    }

    return res.status(200).json({ success: true, action: 'annule_passager' });
  }

  // Annulation par chauffeur (via ride_id)
  if (ride_id) {
    const rRes = await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}&select=id,driver_id,status`, {
      headers: sbHeaders(ctx.sbKey),
    });
    const rRows = rRes.ok ? await rRes.json() : [];
    if (!rRows.length) return res.status(404).json({ error: 'Trajet introuvable' });

    const ride = rRows[0];
    if (ride.driver_id !== ctx.session.id && ctx.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    await fetch(`${ctx.sbUrl}/rest/v1/rides?id=eq.${ride_id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule' }),
    });

    await fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?ride_id=eq.${ride_id}&status=eq.en_attente`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status: 'annule_chauffeur' }),
    }).catch(() => {});

    return res.status(200).json({ success: true, action: 'trajet_annule' });
  }

  return res.status(400).json({ error: 'booking_id ou ride_id requis' });
}

async function rideMyRides(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const url  = new URL(req.url || '/', 'https://porteaporte.site');
  const view = body.view || url.searchParams.get('view') || 'all';

  const ridesRes = await fetch(
    `${ctx.sbUrl}/rest/v1/rides?driver_id=eq.${ctx.session.id}&order=departure_time.desc&limit=50&select=id,start_city,end_city,departure_time,available_seats,status,total_distance_km,cost_per_km`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const myRides = ridesRes.ok ? await ridesRes.json() : [];

  const bookingsRes = await fetch(
    `${ctx.sbUrl}/rest/v1/ride_bookings?passenger_id=eq.${ctx.session.id}&order=created_at.desc&limit=50&select=id,ride_id,pickup_city,dropoff_city,seats_reserved,total_passenger,driver_amount,status,created_at`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const myBookings = bookingsRes.ok ? await bookingsRes.json() : [];

  return res.status(200).json({ my_rides: myRides, my_bookings: myBookings });
}

async function rideAdmin(req, res, ctx, body) {
  if (ctx.profile?.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });

  const url   = new URL(req.url || '/', 'https://porteaporte.site');
  const limit = Number(body.limit || url.searchParams.get('limit') || 100);

  const [ridesRes, bookingsRes, reportsRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/rides?order=created_at.desc&limit=${limit}&select=*,driver_profile:profiles!driver_id(prenom)`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_bookings?order=created_at.desc&limit=${limit}&select=*,passenger_profile:profiles!passenger_id(prenom)`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/ride_reports?order=created_at.desc&limit=50&select=*,reporter_profile:profiles!reporter_id(prenom)`, { headers: sbHeaders(ctx.sbKey) }),
  ]);

  const rides    = ridesRes.ok    ? (await ridesRes.json()).map(r => ({ ...r, driver_prenom: r.driver_profile?.prenom || null, driver_profile: undefined }))       : [];
  const bookings = bookingsRes.ok ? (await bookingsRes.json()).map(b => ({ ...b, passenger_prenom: b.passenger_profile?.prenom || null, passenger_profile: undefined })) : [];
  const reports  = reportsRes.ok  ? (await reportsRes.json()).map(r => ({ ...r, reporter_prenom: r.reporter_profile?.prenom || null, reporter_profile: undefined }))    : [];

  return res.status(200).json({ rides, bookings, reports });
}

async function rideReport(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });

  const { ride_id, booking_id, reported_id, reason, details } = body;
  if (!reason) return res.status(400).json({ error: 'reason requis' });

  const r = await fetch(`${ctx.sbUrl}/rest/v1/ride_reports`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      ride_id:     ride_id    || null,
      booking_id:  booking_id || null,
      reporter_id: ctx.session.id,
      reported_id: reported_id || null,
      reason:      String(reason).slice(0, 200),
      details:     details ? String(details).slice(0, 1000) : null,
      status: 'ouvert',
    }),
  });

  if (!r.ok) return res.status(400).json({ error: 'Signalement impossible' });
  return res.status(200).json({ success: true, message: 'Signalement reçu. Notre équipe va examiner.' });
}
