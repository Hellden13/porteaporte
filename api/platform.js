// api/platform.js — Gestionnaire principal PorteaPorte
// Modules extraits : _lib.js · _push.js · _rides.js · _growth.js · _connect.js

const {
  CORS, sanitizeEnv, safeIds, sbHeaders, parseDataUrl, uploadProofPhoto,
  signStorageUrl, getSession, getProfile, roleIn, mergeUserRole,
  isEmailVerified, isVerifiedDriver, endpointFromReq, toNumber,
  generateReceptionCode, hashReceptionCode, normalizeText, normalizeCity,
  driverTransportMode, estimateRouteKm, siteOrigin, internalHeaders,
  callNotifier, deliveryEligibility, missingColumn, insertWithSchemaFallback,
  stripeRequest, defaultRewardMissions,
} = require('../lib/_lib');

const { pushSubscribe, deliverPush, pushSend } = require('../lib/_push');
const {
  getRideSettings,
  rideDriverProfile, rideCreate, rideSearch, rideDetail, rideBook, rideCancel,
  rideMyRides, rideAdmin, rideReport, ridePackageBook, safeMeetingPoints,
  covDashboard, covOnboard, covProgress,
} = require('../lib/_rides');
const {
  growthDashboard, referralGet, referralUse, badgesList, badgesGrant,
  xpHistory, pointsHistory, adminGrowth, badgeCampaigns, badgeCampaignSave,
  badgeCampaignToggle, badgeBenefitStatus, rewardReferralIfPending,
} = require('../lib/_growth');
const {
  stripeConnectOnboard, stripeConnectStatus, stripeConnectDashboard,
  stripeConnectPayout, livreurEarnings, subscriptionCreate, subscriptionStatus,
} = require('../lib/_connect');
const { checkRateLimit, getClientIp } = require('../lib/_ratelimit');

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
    nom_destinataire: body.nom_destinataire || null,
    email_destinataire: body.email_destinataire || null,
    telephone_destinataire: body.telephone_destinataire || null,
    taille_colis: body.taille_colis || null,
    destinataire_dispo_jours: Array.isArray(body.destinataire_dispo_jours) && body.destinataire_dispo_jours.length ? body.destinataire_dispo_jours : null,
    destinataire_dispo_debut: body.destinataire_dispo_debut || null,
    destinataire_dispo_fin: body.destinataire_dispo_fin || null,
  };

  if (!payload.adresse_depart || !payload.adresse_arrivee) {
    return res.status(400).json({ error: 'adresses depart/arrivee requises' });
  }

  const insert = await insertWithSchemaFallback(
    `${ctx.sbUrl}/rest/v1/livraisons`,
    sbHeaders(ctx.sbKey),
    payload,
    ['description', 'type_colis', 'poids_kg', 'valeur_declaree', 'assurance_plan', 'notes', 'nom_destinataire', 'email_destinataire', 'telephone_destinataire', 'taille_colis', 'destinataire_dispo_jours', 'destinataire_dispo_debut', 'destinataire_dispo_fin']
  );

  if (!insert.ok) return res.status(400).json({ error: 'Creation livraison impossible', details: insert.data });
  const data = insert.data;
  const livraison = Array.isArray(data) ? data[0] : data;
  let receptionCode = livraison?.id ? generateReceptionCode() : null;
  if (receptionCode) {
    const hash = hashReceptionCode(receptionCode, livraison.id);
    const codePatch = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraison.id)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({
        recipient_confirmation_hash: hash,
        recipient_confirmation_created_at: new Date().toISOString()
      })
    }).catch(() => {});
    if (!codePatch || !codePatch.ok) receptionCode = null;
  }
  await deliverPush(ctx, {
    type: 'nouvelle_mission',
    data: {
      id: livraison?.id,
      ville_depart: livraison?.ville_depart || payload.ville_depart,
      ville_arrivee: livraison?.ville_arrivee || payload.ville_arrivee,
      prix_total: livraison?.prix_total ?? payload.prix_total
    }
  }).catch((err) => console.error('[push nouvelle_mission]', err.message));

  // Email à l'expéditeur avec le code de réception destinataire
  if (receptionCode && (ctx.session.email || ctx.profile?.email)) {
    callNotifier('livraison_creee_expediteur', {
      expediteur_email: ctx.session.email || ctx.profile?.email,
      prenom: ctx.profile?.prenom || '',
      code: livraison?.code || livraison?.id?.slice(0, 8) || '',
      livraison_id: livraison?.id || '',
      ville_depart: livraison?.ville_depart || payload.ville_depart || '',
      ville_arrivee: livraison?.ville_arrivee || payload.ville_arrivee || '',
      adresse_depart: payload.adresse_depart || '',
      adresse_arrivee: payload.adresse_arrivee || '',
      type_colis: payload.type_colis || 'Colis',
      prix_total: livraison?.prix_total ?? payload.prix_total,
      recipient_code: receptionCode,
      confirm_link: `${siteOrigin()}/confirmation-destinataire.html?livraison_id=${encodeURIComponent(livraison?.id || '')}`
    }).catch((err) => console.error('[notifier livraison_creee_expediteur]', err.message));
  }

  // Email automatique au destinataire avec son code + lien confirmation
  if (receptionCode && payload.email_destinataire) {
    callNotifier('code_destinataire', {
      destinataire_email: payload.email_destinataire,
      destinataire_nom:   payload.nom_destinataire || '',
      expediteur_nom:     ctx.profile?.prenom || '',
      recipient_code:     receptionCode,
      ville_depart:       livraison?.ville_depart || payload.ville_depart || '',
      ville_arrivee:      livraison?.ville_arrivee || payload.ville_arrivee || '',
      adresse_arrivee:    payload.adresse_arrivee || '',
      type_colis:         payload.type_colis || 'Colis',
      confirm_link:       `${siteOrigin()}/confirmation-destinataire.html?livraison_id=${encodeURIComponent(livraison?.id || '')}`
    }).catch((err) => console.error('[notifier code_destinataire]', err.message));
  }

  return res.status(200).json({ success: true, livraison, recipient_confirmation_code: receptionCode });
}

async function setUserRole(req, res, ctx, body) {
  const requested = body.role || body.requested_role;
  const requestedNormalized = requested === 'both' ? 'les deux' : requested;
  if (!['livreur', 'expediteur', 'les deux', 'both'].includes(String(requested || '').trim())) {
    return res.status(400).json({ error: 'Role invalide' });
  }

  const nextRole = mergeUserRole(ctx.profile?.role, requestedNormalized);
  const patch = {
    email: ctx.session.email || ctx.profile?.email || '',
    role: nextRole,
    email_verified: isEmailVerified(ctx.session, ctx.profile),
    verification_status: ctx.profile?.verification_status || 'pending',
    driver_status: ctx.profile?.driver_status || 'not_started',
    mis_a_jour_le: new Date().toISOString()
  };

  const profileUrl = ctx.profile
    ? `${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(ctx.session.id)}`
    : `${ctx.sbUrl}/rest/v1/profiles?on_conflict=id`;
  let r = await fetch(profileUrl, {
    method: ctx.profile ? 'PATCH' : 'POST',
    headers: ctx.profile ? sbHeaders(ctx.sbKey) : { ...sbHeaders(ctx.sbKey), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(ctx.profile ? patch : { id: ctx.session.id, ...patch })
  });
  let data = await r.json().catch(() => ({}));

  if (!r.ok && /column .* does not exist/i.test(JSON.stringify(data))) {
    const fallbackPayload = {
      email: patch.email,
      role: nextRole,
      mis_a_jour_le: patch.mis_a_jour_le
    };
    if (!ctx.profile) fallbackPayload.id = ctx.session.id;
    r = await fetch(profileUrl, {
      method: ctx.profile ? 'PATCH' : 'POST',
      headers: ctx.profile ? sbHeaders(ctx.sbKey) : { ...sbHeaders(ctx.sbKey), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(fallbackPayload)
    });
    data = await r.json().catch(() => ({}));
  }

  if (!r.ok) {
    return res.status(400).json({ error: 'Mise a jour role impossible', details: data });
  }

  const profile = Array.isArray(data) ? data[0] : data;
  return res.status(200).json({
    success: true,
    role: profile?.role || nextRole,
    driver_status: profile?.driver_status || patch.driver_status,
    profile
  });
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

// ── Imprévu réception (3 actions livreur) ──
async function livraisonImprevu(req, res, ctx, body) {
  const livraisonId = body.livraison_id;
  const action = body.action; // 'depot_securise' | 'relivraison' | 'retour_expediteur'
  const raison = body.raison || '';
  if (!livraisonId || !action) return res.status(400).json({ error: 'livraison_id et action requis' });
  if (!['depot_securise', 'relivraison', 'retour_expediteur'].includes(action)) {
    return res.status(400).json({ error: 'Action invalide' });
  }

  // Charger livraison
  const lr = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}&select=id,code,statut,livreur_id,expediteur_id,ville_depart,ville_arrivee,prix_total`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const rows = lr.ok ? await lr.json() : [];
  const livraison = rows[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });

  // Vérifier que c'est le livreur assigné ou un admin
  const admin = roleIn(ctx.profile, ['admin']);
  if (!admin && livraison.livreur_id !== ctx.session.id) {
    return res.status(403).json({ error: 'Livreur assigné requis' });
  }
  if (!['confirme', 'en_route', 'ramasse'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Action impossible dans l\'état actuel de la livraison' });
  }

  let newStatut, patchExtra = {};
  if (action === 'depot_securise') {
    newStatut = 'livre'; // déposé → en attente confirmation/photo dans depot-preuve.html
    patchExtra.delivery_confirmation_mode = 'depot_securise';
  } else if (action === 'relivraison') {
    newStatut = 'relivraison_demandee';
    patchExtra.relivraison_date = body.relivraison_date || null;
    patchExtra.relivraison_heure_debut = body.relivraison_heure_debut || null;
    patchExtra.relivraison_heure_fin = body.relivraison_heure_fin || null;
  } else if (action === 'retour_expediteur') {
    newStatut = 'retour_expediteur';
  }

  // Calcul compensation livreur si destinataire fautif
  const fautif = body.fautif || 'inconnu'; // 'destinataire' | 'livreur' | 'inconnu'
  let compensationPct = 0;
  if (action === 'retour_expediteur' && fautif === 'destinataire') compensationPct = 0.50;
  if (action === 'relivraison' && fautif === 'destinataire') compensationPct = 0.25;

  const patch = {
    statut: newStatut,
    imprevu_raison: raison,
    imprevu_demande_le: new Date().toISOString(),
    ...patchExtra
  };
  const pr = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(patch)
  });
  if (!pr.ok) {
    const errData = await pr.json().catch(() => ({}));
    return res.status(400).json({ error: 'Mise à jour impossible', details: errData });
  }

  // Crédit compensation livreur si destinataire fautif
  let compensationAmount = 0;
  if (compensationPct > 0 && livraison.livreur_id && Number(livraison.prix_total) > 0) {
    const grossCad = Number(livraison.prix_total) * compensationPct;
    const netCad = grossCad * 0.60; // 60% au livreur (même règle que livraison normale)
    compensationAmount = Number(netCad.toFixed(2));
    await fetch(`${ctx.sbUrl}/rest/v1/livreur_earnings`, {
      method: 'POST',
      headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: livraison.livreur_id,
        livraison_id: livraisonId,
        gross_amount: Number(grossCad.toFixed(2)),
        platform_fee: Number((grossCad - netCad).toFixed(2)),
        net_amount: compensationAmount,
        currency: 'cad',
        status: 'available',
        available_after: new Date().toISOString(),
        type: 'compensation_imprevu',
        notes: `Compensation ${Math.round(compensationPct * 100)}% suite à imprévu destinataire: ${raison || action}`,
        created_at: new Date().toISOString()
      })
    }).catch(err => console.error('[compensation livreur]', err.message));
  }

  // Notifier expéditeur
  const expRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(livraison.expediteur_id)}&select=email,prenom`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const expProfile = expRes.ok ? (await expRes.json())[0] : null;
  if (expProfile?.email) {
    callNotifier('livraison_imprevu', {
      expediteur_email: expProfile.email,
      prenom: expProfile.prenom || '',
      code: livraison.code || livraisonId.slice(0, 8),
      action,
      raison,
      fautif,
      compensation_amount: compensationAmount,
      ville_depart: livraison.ville_depart,
      ville_arrivee: livraison.ville_arrivee,
      relivraison_date: patch.relivraison_date,
      relivraison_heure_debut: patch.relivraison_heure_debut,
      relivraison_heure_fin: patch.relivraison_heure_fin
    }).catch(err => console.error('[notifier livraison_imprevu]', err.message));
  }

  return res.status(200).json({ success: true, statut: newStatut, compensation_amount: compensationAmount });
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

  // Déclenche la récompense parrainage si le livreur a été parrainé (fire-and-forget)
  rewardReferralIfPending(ctx, livraison.livreur_id, 'first_delivery').catch(() => {});

  return res.status(200).json({ success: true, livraison: Array.isArray(data) ? data[0] : data });
}

async function submitDeliveryProof(req, res, ctx, body) {
  const livraisonId = body.livraison_id || body.livraisonId;
  if (!livraisonId) return res.status(400).json({ error: 'livraison_id requis' });
  if (!isVerifiedDriver(ctx.session, ctx.profile) && !roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Livreur verifie requis' });
  }

  const note = String(body.note || '').trim();
  const dropoffType = String(body.dropoff_type || 'sans_contact').trim();
  const photoDataUrl = String(body.photo_data_url || '').trim();
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  const accuracyM = toNumber(body.accuracy_m);

  if (!note || note.length < 8) {
    return res.status(400).json({ error: 'Note de depot requise (minimum 8 caracteres)' });
  }
  if (!photoDataUrl || !photoDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Photo de preuve requise' });
  }
  if (photoDataUrl.length > 1250000) {
    return res.status(413).json({ error: 'Photo trop lourde. Reprends une photo plus legere.' });
  }
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Position GPS obligatoire pour un depot sans destinataire' });
  }

  const livRes = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}&select=id,livreur_id,expediteur_id,statut`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const rows = livRes.ok ? await livRes.json() : [];
  const livraison = rows[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });
  if (!roleIn(ctx.profile, ['admin']) && livraison.livreur_id !== ctx.session.id) {
    return res.status(403).json({ error: 'Seul le livreur assigne peut deposer une preuve' });
  }
  if (!['confirme', 'en_route', 'ramasse'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Statut livraison incompatible avec depot preuve' });
  }

  let storedPhoto = null;
  try {
    storedPhoto = await uploadProofPhoto(ctx.sbUrl, ctx.sbKey, livraisonId, photoDataUrl);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Photo de preuve invalide' });
  }

  const proofPayload = {
    livraison_id: livraisonId,
    livreur_id: ctx.session.id,
    proof_type: 'dropoff_without_recipient',
    dropoff_type: dropoffType,
    note,
    photo_data_url: storedPhoto ? 'stored_in_supabase_storage' : photoDataUrl,
    photo_storage_bucket: storedPhoto?.bucket || null,
    photo_storage_path: storedPhoto?.path || null,
    photo_mime_type: storedPhoto?.mimeType || null,
    photo_size_bytes: storedPhoto?.size || null,
    latitude,
    longitude,
    accuracy_m: accuracyM,
    status: 'submitted',
    created_at: new Date().toISOString()
  };

  let proofRes = await fetch(`${ctx.sbUrl}/rest/v1/delivery_proofs`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
    body: JSON.stringify(proofPayload)
  });
  let proofData = await proofRes.json().catch(() => ({}));

  // Compatibilite: si la migration Storage n'est pas encore executee,
  // on garde l'ancien stockage base64 pour ne jamais bloquer une preuve de livraison.
  const schemaMiss = JSON.stringify(proofData).includes('photo_storage_') || JSON.stringify(proofData).includes('schema cache');
  if (!proofRes.ok && schemaMiss) {
    const legacyPayload = { ...proofPayload, photo_data_url: photoDataUrl };
    delete legacyPayload.photo_storage_bucket;
    delete legacyPayload.photo_storage_path;
    delete legacyPayload.photo_mime_type;
    delete legacyPayload.photo_size_bytes;
    proofRes = await fetch(`${ctx.sbUrl}/rest/v1/delivery_proofs`, {
      method: 'POST',
      headers: { ...sbHeaders(ctx.sbKey), Prefer: 'return=representation' },
      body: JSON.stringify(legacyPayload)
    });
    proofData = await proofRes.json().catch(() => ({}));
  }
  if (!proofRes.ok) return res.status(400).json({ error: 'Enregistrement preuve impossible', details: proofData });

  const patchCandidates = [
    {
      statut: 'livre',
      livre_le: new Date().toISOString(),
      delivery_confirmation_mode: 'proof_without_recipient',
      delivery_proof_required_admin_review: true
    },
    { statut: 'livre', livre_le: new Date().toISOString() },
    { statut: 'livre' }
  ];
  let patched = false;
  for (const patch of patchCandidates) {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify(patch)
    });
    if (r.ok) {
      patched = true;
      break;
    }
  }
  if (!patched) return res.status(400).json({ error: 'Preuve enregistree, mais statut livraison non mis a jour' });

  // Notifications post-preuve — fire and forget
  try {
    const fullLivRes = await fetch(
      `${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}&select=id,code,ville_depart,adresse_depart,ville_arrivee,adresse_arrivee,type_colis,prix_total,expediteur_id,email_destinataire,nom_destinataire`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    const fullLivRows = fullLivRes.ok ? await fullLivRes.json() : [];
    const fullLiv = fullLivRows[0] || {};

    // Récupérer l'email de l'expéditeur
    let expediteurEmail = null;
    let expediteurPrenom = '';
    if (fullLiv.expediteur_id) {
      const epRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(fullLiv.expediteur_id)}&select=email,prenom`, { headers: sbHeaders(ctx.sbKey) });
      const epRows = epRes.ok ? await epRes.json() : [];
      expediteurEmail = epRows[0]?.email || null;
      expediteurPrenom = epRows[0]?.prenom || '';
    }

    const adminLink = `${siteOrigin()}/admin/dashboard-admin.html`;
    const livraisonCode = fullLiv.code || livraisonId.slice(0, 8);
    const confirmLink = `${siteOrigin()}/confirmation-destinataire.html?livraison_id=${encodeURIComponent(livraisonId)}`;

    // 1. Notif admin — preuve soumise, action requise
    callNotifier('preuve_soumise_admin', {
      code: livraisonCode,
      livraison_id: livraisonId,
      ville_depart: fullLiv.ville_depart || '',
      ville_arrivee: fullLiv.ville_arrivee || '',
      type_colis: fullLiv.type_colis || 'Colis',
      prix_total: fullLiv.prix_total || 0,
      livreur_prenom: ctx.profile?.prenom || '',
      livreur_email: ctx.session.email || '',
      note,
      admin_link: adminLink,
      confirm_link: confirmLink
    }).catch((e) => console.error('[notifier preuve_soumise_admin]', e.message));

    // 2. Notif expéditeur — colis livré, en attente confirmation
    if (expediteurEmail) {
      callNotifier('colis_livre_expediteur', {
        expediteur_email: expediteurEmail,
        prenom: expediteurPrenom,
        code: livraisonCode,
        livraison_id: livraisonId,
        ville_depart: fullLiv.ville_depart || '',
        ville_arrivee: fullLiv.ville_arrivee || '',
        adresse_arrivee: fullLiv.adresse_arrivee || '',
        type_colis: fullLiv.type_colis || 'Colis',
        confirm_link: confirmLink,
        nom_destinataire: fullLiv.nom_destinataire || ''
      }).catch((e) => console.error('[notifier colis_livre_expediteur]', e.message));
    }

    // 3. Notif destinataire — si email disponible
    if (fullLiv.email_destinataire) {
      callNotifier('colis_livre_destinataire', {
        destinataire_email: fullLiv.email_destinataire,
        nom_destinataire: fullLiv.nom_destinataire || '',
        code: livraisonCode,
        livraison_id: livraisonId,
        ville_arrivee: fullLiv.ville_arrivee || '',
        confirm_link: confirmLink
      }).catch((e) => console.error('[notifier colis_livre_destinataire]', e.message));
    }
  } catch (notifErr) {
    console.error('[post-proof notifications]', notifErr.message);
  }

  return res.status(200).json({
    success: true,
    proof: Array.isArray(proofData) ? proofData[0] : proofData,
    message: 'Preuve enregistree. Paiement Stripe bloque jusqu au code destinataire ou validation admin.'
  });
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
    `${ctx.sbUrl}/rest/v1/livraisons?livreur_id=is.null&statut=in.(publie,paiement_autorise)&select=id,code,expediteur_id,ville_depart,ville_arrivee,type_colis,taille_colis,poids_kg,prix_total,statut,description,destinataire_dispo_jours,destinataire_dispo_debut,destinataire_dispo_fin,cree_le&order=cree_le.desc&limit=100`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const rows = r.ok ? await r.json() : [];
  if (!r.ok) return res.status(400).json({ error: 'Lecture livraisons impossible', details: rows });
  const filtered = rows
    .map((row) => ({ row, eligibility: deliveryEligibility(ctx.profile, row) }))
    .filter((item) => item.eligibility.allowed);

  // Enrichir avec les profils expéditeurs
  const expIds = [...new Set(filtered.map(({ row }) => row.expediteur_id).filter(Boolean))];
  let expProfiles = {};
  const _safeExpIds1 = safeIds(expIds);
  if (_safeExpIds1.length > 0) {
    const ids = _safeExpIds1.map(id => `"${id}"`).join(',');
    const pr = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=in.(${ids})&select=id,prenom,nom,photo_url,score_confiance`, { headers: sbHeaders(ctx.sbKey) });
    if (pr.ok) { (await pr.json()).forEach(p => { expProfiles[p.id] = p; }); }
  }

  return res.status(200).json({
    success: true,
    transport_mode: driverTransportMode(ctx.profile),
    livraisons: filtered.map(({ row, eligibility }) => ({
      id: row.id,
      code: row.code,
      ville_depart: row.ville_depart,
      adresse_depart: null,
      ville_arrivee: row.ville_arrivee,
      adresse_arrivee: null,
      adresse_masquees: true,
      type_colis: row.type_colis,
      taille_colis: row.taille_colis,
      destinataire_dispo_jours: row.destinataire_dispo_jours,
      destinataire_dispo_debut: row.destinataire_dispo_debut,
      destinataire_dispo_fin: row.destinataire_dispo_fin,
      poids_kg: row.poids_kg,
      prix_total: row.prix_total,
      statut: row.statut,
      description: row.description,
      notes: null,
      distance_km: eligibility.routeKm,
      compatibilite: eligibility.reason,
      cree_le: row.cree_le || row.created_at,
      expediteur_profile: row.expediteur_id ? (expProfiles[row.expediteur_id] || null) : null
    }))
  });
}

async function myLivraisons(req, res, ctx, body) {
  const admin = roleIn(ctx.profile, ['admin']);
  const requestedUserId = body.user_id || body.expediteur_id || null;
  const expediteurId = admin && requestedUserId ? requestedUserId : ctx.session.id;

  if (!admin && !roleIn(ctx.profile, ['expediteur', 'les deux'])) {
    return res.status(403).json({ error: 'Role expediteur requis' });
  }

  const baseUrl = `${ctx.sbUrl}/rest/v1/livraisons?expediteur_id=eq.${encodeURIComponent(expediteurId)}&select=*&limit=200`;
  let r = await fetch(`${baseUrl}&order=cree_le.desc`, { headers: sbHeaders(ctx.sbKey) });
  let rows = r.ok ? await r.json() : [];

  if (!r.ok) {
    r = await fetch(`${baseUrl}&order=created_at.desc`, { headers: sbHeaders(ctx.sbKey) });
    rows = r.ok ? await r.json() : [];
  }

  if (!r.ok) {
    r = await fetch(baseUrl, { headers: sbHeaders(ctx.sbKey) });
    rows = r.ok ? await r.json() : [];
  }

  if (!r.ok) {
    return res.status(400).json({ error: 'Lecture livraisons expediteur impossible', details: rows });
  }

  const livraisons = rows
    .map((row) => ({
      ...row,
      type_colis: row.type_colis || row.type || row.categorie || 'Colis',
      poids_kg: row.poids_kg ?? row.poids ?? null,
      prix_total: row.prix_total ?? row.prix ?? row.montant ?? 0,
      statut: row.statut || row.status || 'en_attente',
      livreur_id: row.livreur_id || row.driver_id || null,
      cree_le: row.cree_le || row.created_at || row.date_creation || null,
      created_at: row.created_at || row.cree_le || row.date_creation || null
    }))
    .sort((a, b) => new Date(b.cree_le || b.created_at || 0) - new Date(a.cree_le || a.created_at || 0));

  // Enrichir avec les profils des livreurs assignés
  const livreurIds = [...new Set(livraisons.map(l => l.livreur_id).filter(Boolean))];
  let livreurProfiles = {};
  const _safeLivreurIds = safeIds(livreurIds);
  if (_safeLivreurIds.length > 0) {
    const ids = _safeLivreurIds.map(id => `"${id}"`).join(',');
    const pr = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=in.(${ids})&select=id,prenom,nom,photo_url,score_confiance,telephone`, { headers: sbHeaders(ctx.sbKey) });
    if (pr.ok) {
      const prows = await pr.json();
      prows.forEach(p => { livreurProfiles[p.id] = p; });
    }
  }
  const enriched = livraisons.map(l => ({
    ...l,
    livreur_profile: l.livreur_id ? (livreurProfiles[l.livreur_id] || null) : null
  }));

  return res.status(200).json({ success: true, livraisons: enriched });
}

async function myDriverLivraisons(req, res, ctx) {
  const admin = roleIn(ctx.profile, ['admin']);
  if (!admin && !isVerifiedDriver(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Livreur verifie requis' });
  }

  const baseUrl = `${ctx.sbUrl}/rest/v1/livraisons?livreur_id=eq.${encodeURIComponent(ctx.session.id)}&select=*&limit=100`;
  let r = await fetch(`${baseUrl}&order=cree_le.desc`, { headers: sbHeaders(ctx.sbKey) });
  let rows = r.ok ? await r.json() : [];

  if (!r.ok) {
    r = await fetch(`${baseUrl}&order=created_at.desc`, { headers: sbHeaders(ctx.sbKey) });
    rows = r.ok ? await r.json() : [];
  }
  if (!r.ok) {
    r = await fetch(baseUrl, { headers: sbHeaders(ctx.sbKey) });
    rows = r.ok ? await r.json() : [];
  }
  if (!r.ok) {
    return res.status(400).json({ error: 'Lecture livraisons livreur impossible', details: rows });
  }

  const livraisons = rows
    .map((row) => ({
      ...row,
      type_colis: row.type_colis || row.type || row.categorie || 'Colis',
      poids_kg: row.poids_kg ?? row.poids ?? null,
      prix_total: row.prix_total ?? row.prix ?? row.montant ?? 0,
      statut: row.statut || row.status || 'confirme',
      cree_le: row.cree_le || row.created_at || row.date_creation || null,
      created_at: row.created_at || row.cree_le || row.date_creation || null
    }))
    .sort((a, b) => new Date(b.cree_le || b.created_at || 0) - new Date(a.cree_le || a.created_at || 0));

  // Enrichir avec les profils des expéditeurs
  const expIds = [...new Set(livraisons.map(l => l.expediteur_id).filter(Boolean))];
  let expProfiles = {};
  const _safeExpIds2 = safeIds(expIds);
  if (_safeExpIds2.length > 0) {
    const ids = _safeExpIds2.map(id => `"${id}"`).join(',');
    const pr = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=in.(${ids})&select=id,prenom,nom,photo_url,score_confiance`, { headers: sbHeaders(ctx.sbKey) });
    if (pr.ok) { (await pr.json()).forEach(p => { expProfiles[p.id] = p; }); }
  }
  const enriched = livraisons.map(l => ({
    ...l,
    expediteur_profile: l.expediteur_id ? (expProfiles[l.expediteur_id] || null) : null
  }));

  return res.status(200).json({ success: true, livraisons: enriched });
}

async function adminDashboard(req, res, ctx) {
  if (!roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Admin requis' });
  }

  const profilesRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?select=*&order=prenom.asc&limit=1000`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const profiles = profilesRes.ok ? await profilesRes.json() : [];

  let livraisonsRes = await fetch(
    `${ctx.sbUrl}/rest/v1/livraisons?select=id,code,ville_depart,ville_arrivee,statut,prix_total,created_at,cree_le,livreur_id,expediteur_id&order=created_at.desc&limit=100`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  let livraisons = livraisonsRes.ok ? await livraisonsRes.json() : [];

  if (!livraisonsRes.ok) {
    livraisonsRes = await fetch(
      `${ctx.sbUrl}/rest/v1/livraisons?select=id,code,ville_depart,ville_arrivee,statut,prix_total,cree_le,livreur_id,expediteur_id&order=cree_le.desc&limit=100`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    livraisons = livraisonsRes.ok ? await livraisonsRes.json() : [];
  }

  if (!livraisonsRes.ok) {
    livraisonsRes = await fetch(
      `${ctx.sbUrl}/rest/v1/livraisons?select=*&limit=100`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    livraisons = livraisonsRes.ok ? await livraisonsRes.json() : [];
  }

  if (!profilesRes.ok) {
    return res.status(400).json({ error: 'Lecture profils admin impossible', details: profiles });
  }
  if (!livraisonsRes.ok) {
    return res.status(400).json({ error: 'Lecture livraisons admin impossible', details: livraisons });
  }

  const livraisonIds = livraisons.map((l) => l.id).filter(Boolean).slice(0, 100);
  let proofByLivraison = {};
  const _safeLivraisonIds = safeIds(livraisonIds);
  if (_safeLivraisonIds.length) {
    const ids = _safeLivraisonIds.map((id) => `"${id}"`).join(',');
    const proofRes = await fetch(
      `${ctx.sbUrl}/rest/v1/delivery_proofs?livraison_id=in.(${ids})&select=id,livraison_id,proof_type,dropoff_type,status,created_at,photo_storage_path&order=created_at.desc`,
      { headers: sbHeaders(ctx.sbKey) }
    ).catch(() => null);
    if (proofRes?.ok) {
      const proofRows = await proofRes.json().catch(() => []);
      proofRows.forEach((proof) => {
        if (!proofByLivraison[proof.livraison_id]) proofByLivraison[proof.livraison_id] = proof;
      });
    }
  }

  const normalizedLivraisons = livraisons.map((row) => ({
    ...row,
    statut: row.statut || row.status || 'inconnu',
    prix_total: row.prix_total ?? row.prix ?? row.montant ?? 0,
    created_at: row.created_at || row.cree_le || row.date_creation || null,
    delivery_proof: proofByLivraison[row.id] || null,
  }));

  return res.status(200).json({
    success: true,
    profiles,
    livraisons: normalizedLivraisons
  });
}

async function adminDeliveryProof(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Admin requis' });
  }
  const livraisonId = body.livraison_id || body.livraisonId;
  const proofId = body.proof_id || body.proofId;
  if (!livraisonId && !proofId) return res.status(400).json({ error: 'livraison_id ou proof_id requis' });

  const filter = proofId
    ? `id=eq.${encodeURIComponent(proofId)}`
    : `livraison_id=eq.${encodeURIComponent(livraisonId)}`;
  const proofRes = await fetch(
    `${ctx.sbUrl}/rest/v1/delivery_proofs?${filter}&select=*&order=created_at.desc&limit=1`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const proofs = proofRes.ok ? await proofRes.json().catch(() => []) : [];
  if (!proofRes.ok) return res.status(400).json({ error: 'Lecture preuve impossible', details: proofs });
  const proof = proofs[0];
  if (!proof) return res.status(404).json({ error: 'Preuve introuvable' });
  proof.photo_signed_url = await signStorageUrl(
    ctx.sbUrl,
    ctx.sbKey,
    proof.photo_storage_bucket || 'delivery-proofs',
    proof.photo_storage_path
  );

  const livRes = await fetch(
    `${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(proof.livraison_id)}&select=id,code,ville_depart,ville_arrivee,statut,prix_total,livreur_id,expediteur_id,created_at,cree_le&limit=1`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const livraisons = livRes.ok ? await livRes.json().catch(() => []) : [];

  return res.status(200).json({
    success: true,
    proof,
    livraison: livraisons[0] || null
  });
}

async function adminDisputes(req, res, ctx) {
  if (!roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Admin requis' });
  }

  let livRes = await fetch(
    `${ctx.sbUrl}/rest/v1/livraisons?select=*&or=(statut.in.(litige,rembourse),delivery_proof_required_admin_review.eq.true)&order=created_at.desc&limit=100`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  let livraisons = livRes.ok ? await livRes.json().catch(() => []) : [];

  if (!livRes.ok) {
    livRes = await fetch(
      `${ctx.sbUrl}/rest/v1/livraisons?select=*&statut=in.(litige,rembourse)&limit=100`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    livraisons = livRes.ok ? await livRes.json().catch(() => []) : [];
  }
  if (!livRes.ok) return res.status(400).json({ error: 'Lecture litiges impossible', details: livraisons });

  const ids = livraisons.map((l) => l.id).filter(Boolean);
  let proofByLivraison = {};
  if (ids.length) {
    const inIds = ids.map((id) => `"${id}"`).join(',');
    const proofRes = await fetch(
      `${ctx.sbUrl}/rest/v1/delivery_proofs?livraison_id=in.(${inIds})&select=id,livraison_id,proof_type,dropoff_type,note,latitude,longitude,accuracy_m,status,created_at,photo_storage_path&order=created_at.desc`,
      { headers: sbHeaders(ctx.sbKey) }
    ).catch(() => null);
    if (proofRes?.ok) {
      const proofRows = await proofRes.json().catch(() => []);
      proofRows.forEach((proof) => {
        if (!proofByLivraison[proof.livraison_id]) proofByLivraison[proof.livraison_id] = proof;
      });
    }
  }

  return res.status(200).json({
    success: true,
    litiges: livraisons.map((row) => ({
      ...row,
      statut: row.statut || row.status || 'inconnu',
      prix_total: row.prix_total ?? row.prix ?? row.montant ?? 0,
      created_at: row.created_at || row.cree_le || row.date_creation || null,
      delivery_proof: proofByLivraison[row.id] || null
    }))
  });
}

async function adminDisputeAction(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) {
    return res.status(403).json({ error: 'Admin requis' });
  }
  const livraisonId = body.livraison_id || body.livraisonId;
  const action = String(body.action || '').trim();
  const note = String(body.note || '').trim().slice(0, 800);
  if (!livraisonId) return res.status(400).json({ error: 'livraison_id requis' });
  if (!['open_litige', 'ask_info', 'close_review'].includes(action)) {
    return res.status(400).json({ error: 'Action litige invalide' });
  }

  const patch = {
    updated_at: new Date().toISOString()
  };
  if (action === 'open_litige' || action === 'ask_info') {
    patch.statut = 'litige';
    patch.delivery_proof_required_admin_review = true;
  }
  if (action === 'close_review') {
    patch.delivery_proof_required_admin_review = false;
  }
  if (note) {
    patch.admin_note = note;
  }

  const candidates = [patch, { statut: patch.statut || 'litige' }, { delivery_proof_required_admin_review: patch.delivery_proof_required_admin_review }];
  let lastData = null;
  for (const candidate of candidates) {
    const r = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey, 'return=representation'),
      body: JSON.stringify(candidate)
    });
    lastData = await r.json().catch(() => ({}));
    if (r.ok) {
      // Si litige ouvert → enregistrer la date sur le profil du livreur pour reset le streak
      if (action === 'open_litige') {
        const liv = Array.isArray(lastData) ? lastData[0] : lastData;
        const driverId = liv?.livreur_id;
        if (driverId) {
          // Appel RPC record_driver_litige (fail silencieux)
          fetch(`${ctx.sbUrl}/rest/v1/rpc/record_driver_litige`, {
            method: 'POST',
            headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_driver_id: driverId })
          }).catch(() => {});
        }
      }
      return res.status(200).json({
        success: true,
        livraison: Array.isArray(lastData) ? lastData[0] : lastData,
        action
      });
    }
  }
  return res.status(400).json({ error: 'Mise a jour litige impossible', details: lastData });
}

async function tracking(req, res, ctx, body) {
  const url = new URL(req.url || '/', 'https://porteaporte.site');
  const code = body.code || body.livraison_id || body.livraisonId
    || url.searchParams.get('code')
    || url.searchParams.get('id')
    || url.searchParams.get('livraison_id');
  if (!code) return res.status(400).json({ error: 'code ou id requis' });

  const isUuid = /^[0-9a-f-]{36}$/i.test(code);
  const filter = isUuid ? `id=eq.${encodeURIComponent(code)}` : `code=eq.${encodeURIComponent(code.toUpperCase())}`;
  const trackingSelects = [
    'id,code,expediteur_id,livreur_id,statut,adresse_depart,adresse_arrivee,ville_depart,ville_arrivee,type_colis,taille_colis,type,poids_kg,valeur_declaree,assurance_plan,prix_total,reception_mode,reception_heure_debut,reception_heure_fin,reception_photo_obligatoire,reception_lieu_repli,reception_note_livreur,created_at,cree_le',
    'id,code,expediteur_id,livreur_id,statut,adresse_depart,adresse_arrivee,ville_depart,ville_arrivee,type_colis,type,poids_kg,valeur_declaree,assurance_plan,prix_total,created_at,cree_le',
    'id,expediteur_id,livreur_id,statut,adresse_depart,adresse_arrivee,ville_depart,ville_arrivee,type_colis,poids_kg,prix_total,created_at',
    'id,expediteur_id,statut,ville_depart,ville_arrivee,prix_total,created_at',
    'id,expediteur_id,statut,prix_total',
  ];
  let r = null;
  let rows = [];
  for (const sel of trackingSelects) {
    r = await fetch(
      `${ctx.sbUrl}/rest/v1/livraisons?${filter}&select=${sel}&limit=1`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    rows = await r.json().catch(() => []);
    if (r.ok) break;
  }
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
      type_colis: livraison.type_colis || livraison.type || null,
      poids_kg: livraison.poids_kg || null,
      valeur_declaree: livraison.valeur_declaree || null,
      assurance_plan: livraison.assurance_plan || null,
      prix_total: livraison.prix_total || null,
      created_at: livraison.cree_le || livraison.created_at || null
    },
    latest_location: latestRows[0] || null
  });
}

async function submitDriverVerification(req, res, ctx, body) {
  if (!['livreur', 'les deux', 'admin'].includes(ctx.profile.role)) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  // Rate limit : 3 soumissions KYC par utilisateur par 24h
  const rl = await checkRateLimit(`kyc:${ctx.session.id}`, 3, 86400);
  if (!rl.allowed) return res.status(429).json({ error: 'Trop de soumissions KYC aujourd\'hui. Réessayez demain.' });
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
  // Rate limit : 5 avis par utilisateur par heure
  const rl = await checkRateLimit(`review:${ctx.session.id}`, 5, 3600);
  if (!rl.allowed) return res.status(429).json({ error: 'Trop d\'avis soumis. Réessayez dans une heure.' });

  const livraisonId = body.livraison_id || body.livraisonId || body.delivery_id;
  const rating = Math.round(toNumber(body.rating || body.note, 0));
  const comment = String(body.comment || body.commentaire || '').trim().slice(0, 800);
  const reviewerRole = body.reviewer_role || 'expediteur'; // 'expediteur' | 'livreur'
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
  if (!['livre', 'livree', 'payee', 'confirmee', 'succeeded'].includes(livraison.statut) && !admin) {
    return res.status(409).json({ error: 'Avis possible seulement apres livraison' });
  }

  let reviewedId, reviewedRole;
  if (reviewerRole === 'livreur') {
    // Livreur évalue l'expéditeur
    if (!admin && livraison.livreur_id !== ctx.session.id)
      return res.status(403).json({ error: 'Avis reserve au livreur de cette livraison' });
    if (!livraison.expediteur_id) return res.status(409).json({ error: 'Aucun expediteur a evaluer' });
    reviewedId   = livraison.expediteur_id;
    reviewedRole = 'expediteur';
  } else {
    // Expéditeur évalue le livreur (défaut)
    if (!admin && livraison.expediteur_id !== ctx.session.id)
      return res.status(403).json({ error: 'Avis reserve a l expediteur de la livraison' });
    if (!livraison.livreur_id) return res.status(409).json({ error: 'Aucun livreur assigne a evaluer' });
    reviewedId   = livraison.livreur_id;
    reviewedRole = 'livreur';
  }

  const reviewPayload = {
    reviewed_id:   reviewedId,
    reviewer_id:   ctx.session.id,
    reviewer_role: reviewerRole,
    reviewed_role: reviewedRole,
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

// Avis public du destinataire (sans auth — prouvé par le code de confirmation)
async function recipientReview(req, res, sbUrl, sbKey, body) {
  // Rate limit : 3 avis par IP par heure (endpoint public sans auth)
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`recipient-review:${ip}`, 3, 3600);
  if (!rl.allowed) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une heure.' });

  const livraisonId = body.livraison_id;
  const rating  = Math.round(toNumber(body.rating || body.note, 0));
  const comment = String(body.comment || body.commentaire || '').trim().slice(0, 800);
  if (!livraisonId || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'livraison_id et note 1-5 requis' });
  }
  // Vérifier que la livraison est bien confirmée/livrée
  const livRes = await fetch(`${sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}&select=id,livreur_id,statut`, {
    headers: sbHeaders(sbKey)
  });
  const rows = livRes.ok ? await livRes.json() : [];
  const liv = rows[0];
  if (!liv) return res.status(404).json({ error: 'Livraison introuvable' });
  if (!['livre', 'livree', 'payee', 'confirmee', 'succeeded'].includes(liv.statut)) {
    return res.status(409).json({ error: 'Livraison pas encore confirmee' });
  }
  if (!liv.livreur_id) return res.status(409).json({ error: 'Aucun livreur a evaluer' });

  // Vérifier qu'il n'y a pas déjà un avis destinataire pour cette livraison
  const existRes = await fetch(`${sbUrl}/rest/v1/reviews?delivery_id=eq.${encodeURIComponent(livraisonId)}&reviewer_role=eq.destinataire&select=id&limit=1`, {
    headers: sbHeaders(sbKey)
  });
  const existing = existRes.ok ? await existRes.json() : [];
  if (existing.length) return res.status(409).json({ error: 'Avis destinataire deja soumis' });

  const payload = {
    reviewed_id:   liv.livreur_id,
    reviewer_id:   null,
    reviewer_role: 'destinataire',
    reviewed_role: 'livreur',
    is_anonymous:  true,
    rating,
    comment,
    delivery_id: liv.id
  };
  // Essai schema moderne
  let r = await fetch(`${sbUrl}/rest/v1/reviews`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify(payload)
  });
  let data = await r.json().catch(() => ({}));
  // Fallback schema legacy
  if (!r.ok) {
    const legacy = { livreur_id: liv.livreur_id, note: rating, commentaire: comment, livraison_id: liv.id };
    r = await fetch(`${sbUrl}/rest/v1/reviews`, {
      method: 'POST', headers: sbHeaders(sbKey), body: JSON.stringify(legacy)
    });
    data = await r.json().catch(() => ({}));
  }
  if (!r.ok) return res.status(400).json({ error: 'Avis destinataire impossible', details: data });
  return res.status(200).json({ success: true });
}

async function fetchImpactState(sbUrl, sbKey) {
  const settingsRes = await fetch(`${sbUrl}/rest/v1/impact_settings?select=*&id=eq.default&limit=1`, {
    headers: sbHeaders(sbKey)
  });
  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  const settings = settingsRows[0] || {
    id: 'default',
    pct_livreur: 85, pct_plateforme: 15, pct_don: 0,
    pct_tirage: 0, pct_developpeur: 0, pct_securite: 0, pct_assurance: 0,
    ride_platform_fee: 1.50, ride_fee_luggage: 5, ride_fee_pet: 8, ride_fee_stop: 3,
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

  const slices = {
    livreur:     Math.max(0, toNumber(settings.pct_livreur, 85)),
    plateforme:  Math.max(0, toNumber(settings.pct_plateforme, 15)),
    don:         Math.max(0, toNumber(settings.pct_don, 0)),
    tirage:      Math.max(0, toNumber(settings.pct_tirage, 0)),
    developpeur: Math.max(0, toNumber(settings.pct_developpeur, 0)),
    securite:    Math.max(0, toNumber(settings.pct_securite, 0)),
    assurance:   Math.max(0, toNumber(settings.pct_assurance, 0)),
  };
  const donationPoolCents = Math.round(revenueCents * slices.don / 100);
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
      donation_pool_cents: donationPoolCents,
      slices,
      slice_cents: Object.fromEntries(Object.entries(slices).map(([k, pct]) => [k, Math.round(revenueCents * pct / 100)])),
      allocation_total_percent: Math.round(allocationTotal * 100) / 100,
      status: 'estimated'
    },
    allocations
  };
}

async function impactPublic(req, res, ctx) {
  const state = await fetchImpactState(ctx.sbUrl, ctx.sbKey);

  // Fonds de protection : 2% de toutes les livraisons confirmées depuis le début
  const fundRes = await fetch(
    `${ctx.sbUrl}/rest/v1/livraisons?select=prix_total&statut=eq.confirmee&limit=10000`,
    { headers: sbHeaders(ctx.sbKey) }
  ).catch(() => null);
  const fundRows = fundRes?.ok ? await fundRes.json().catch(() => []) : [];
  const fundTotalCents = Math.round(
    fundRows.reduce((sum, r) => sum + toNumber(r.prix_total, 0) * 100, 0) * 0.02
  );
  const fundMaxClaimCents = Math.floor(fundTotalCents * 0.5); // max 50% du fonds par réclamation

  const [drawsRes, winnersRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?select=id,title,description,draw_date,status,rules_url&status=in.(active,closed,completed)&order=draw_date.desc&limit=12`, {
      headers: sbHeaders(ctx.sbKey)
    }).catch(() => null),
    fetch(`${ctx.sbUrl}/rest/v1/draw_winners?select=id,draw_id,user_email,user_role,prize_title,created_at&order=created_at.desc&limit=12`, {
      headers: sbHeaders(ctx.sbKey)
    }).catch(() => null)
  ]);
  const draws = drawsRes?.ok ? await drawsRes.json() : [];
  const winnersRaw = winnersRes?.ok ? await winnersRes.json() : [];
  const winners = winnersRaw.map((winner) => {
    const email = String(winner.user_email || '');
    const maskedEmail = email.includes('@')
      ? `${email.slice(0, 2)}***@${email.split('@')[1]}`
      : '';
    return { ...winner, user_email: maskedEmail };
  });
  const publicState = {
    month: state.month,
    generated_at: state.generated_at,
    note: state.settings.public_note || 'Montants estimes en direct, confirmes mensuellement.',
    totals: state.totals,
    allocations: state.allocations
  };
  const protectionFund = {
    total_cents: fundTotalCents,
    max_claim_cents: fundMaxClaimCents,
    funded_by: '2% de chaque livraison confirmée',
    note: 'Fonds volontaire bêta — pas un contrat d\'assurance.'
  };

  return res.status(200).json({ success: true, impact: publicState, draws, winners, protection_fund: protectionFund });
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
    const pct = (v, def) => Math.max(0, Math.min(100, toNumber(v, def)));
    const payload = {
      id: 'default',
      pct_livreur:     pct(body.pct_livreur, 60),
      pct_plateforme:  pct(body.pct_plateforme, 15),
      pct_don:         pct(body.pct_don, 0),
      pct_tirage:      pct(body.pct_tirage, 0),
      pct_developpeur: pct(body.pct_developpeur, 0),
      pct_securite:    pct(body.pct_securite, 0),
      pct_assurance:   pct(body.pct_assurance, 0),
      ride_platform_pct:  pct(body.ride_platform_pct, 10),
      ride_fee_luggage:   Math.max(0, toNumber(body.ride_fee_luggage, 5)),
      ride_fee_pet:       Math.max(0, toNumber(body.ride_fee_pet, 8)),
      ride_fee_stop:      Math.max(0, toNumber(body.ride_fee_stop, 3)),
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
    // Avertissement seulement — ne bloque pas, permet ajustements un par un
    payload.allocation_warning = activeTotal > 100.01 ? `Total actif = ${Math.round(activeTotal)}% (sera normalisé au calcul)` : null;

    const warning = payload.allocation_warning;
    delete payload.allocation_warning;
    const r = await fetch(`${ctx.sbUrl}/rest/v1/impact_organisations${body.id ? '?on_conflict=id' : ''}`, {
      method: 'POST',
      headers: body.id ? { ...sbHeaders(ctx.sbKey), Prefer: 'resolution=merge-duplicates' } : sbHeaders(ctx.sbKey),
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Sauvegarde organisme impossible', details: data });
    return res.status(200).json({ success: true, organisation: Array.isArray(data) ? data[0] : data, warning });
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

  // ── Claim-free streak ──────────────────────────────────────────────────────
  const MILESTONES = [
    { key: '7j',   days: 7,   label: 'Semaine propre',       emoji: '🌱', points: 25 },
    { key: '30j',  days: 30,  label: 'Mois irréprochable',   emoji: '⭐', points: 100 },
    { key: '90j',  days: 90,  label: 'Livreur fiable',       emoji: '🏆', points: 250 },
    { key: '180j', days: 180, label: 'Livreur de confiance', emoji: '💎', points: 500 },
    { key: '365j', days: 365, label: 'Livreur élite',        emoji: '🚀', points: 1000 },
  ];
  let claimFreeData = { claim_free_days: 0, milestones_reached: [] };
  try {
    const cfRes = await fetch(`${ctx.sbUrl}/rest/v1/rpc/get_claim_free_days`, {
      method: 'POST',
      headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_driver_id: ctx.session.id })
    });
    if (cfRes.ok) claimFreeData = await cfRes.json();
  } catch (_) {}

  // Auto-attribution des jalons non encore donnés
  const reached = claimFreeData.milestones_reached || [];
  for (const m of MILESTONES) {
    if (claimFreeData.claim_free_days >= m.days && !reached.includes(m.key)) {
      // Attribuer le jalon (fire & forget)
      fetch(`${ctx.sbUrl}/rest/v1/rpc/award_claim_free_milestone`, {
        method: 'POST',
        headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_driver_id: ctx.session.id, p_milestone_key: m.key, p_points: m.points })
      }).catch(() => {});
      reached.push(m.key); // optimistic update pour la réponse courante
    }
  }

  const nextMilestone = MILESTONES.find(m => !reached.includes(m.key)) || null;

  return res.status(200).json({
    success: true,
    porte_coins_balance: coinsBalance,
    transactions: txs.slice(0, 10),
    missions,
    progress,
    draws,
    entries,
    level: computeDriverLevel(ctx.profile, coinsBalance),
    claim_free: {
      days: claimFreeData.claim_free_days || 0,
      milestones: MILESTONES.map(m => ({
        ...m,
        reached: reached.includes(m.key),
        current: claimFreeData.claim_free_days >= m.days
      })),
      next: nextMilestone ? {
        ...nextMilestone,
        days_remaining: Math.max(0, nextMilestone.days - (claimFreeData.claim_free_days || 0))
      } : null
    },
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

  const existingRes = await fetch(`${ctx.sbUrl}/rest/v1/draw_winners?draw_id=eq.${encodeURIComponent(drawId)}&select=id,draw_id,user_id,user_email,user_role,prize_title,published,created_at&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const existing = existingRes.ok ? await existingRes.json() : [];
  if (existing.length) {
    await fetch(`${ctx.sbUrl}/rest/v1/draw_winners?id=eq.${encodeURIComponent(existing[0].id)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey, 'return=minimal'),
      body: JSON.stringify({ published: true })
    }).catch(() => {});
    return { ok: true, winner: { ...existing[0], published: true }, candidates_count: 0, already_exists: true };
  }

  const entriesRes = await fetch(`${ctx.sbUrl}/rest/v1/draw_entries?draw_id=eq.${encodeURIComponent(drawId)}&select=user_id,entries`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const entries = entriesRes.ok ? await entriesRes.json() : [];
  const grouped = new Map();
  entries.forEach((entry) => grouped.set(entry.user_id, (grouped.get(entry.user_id) || 0) + Number(entry.entries || 0)));
  let candidates = [...grouped.entries()].map(([user_id, entries_weight]) => ({ user_id, entries_weight }));

  // Si filtre badge actif, r\u00e9cup\u00e9rer les d\u00e9tenteurs du badge
  let badgeHolderIds = null;
  if (draw.eligibility_badge_slug) {
    const badgeRes = await fetch(`${ctx.sbUrl}/rest/v1/badges?slug=eq.${encodeURIComponent(draw.eligibility_badge_slug)}&select=id&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    const badgeRows = badgeRes.ok ? await badgeRes.json() : [];
    if (badgeRows.length) {
      const ubRes = await fetch(`${ctx.sbUrl}/rest/v1/user_badges?badge_id=eq.${encodeURIComponent(badgeRows[0].id)}&select=user_id&limit=5000`, { headers: sbHeaders(ctx.sbKey) });
      const ubRows = ubRes.ok ? await ubRes.json() : [];
      badgeHolderIds = new Set(ubRows.map(r => r.user_id));
    }
  }

  if (badgeHolderIds !== null) {
    candidates = candidates.filter(c => badgeHolderIds.has(c.user_id));
  }

  if (!candidates.length && draw.auto_include_all_users !== false) {
    let profilesRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?select=id,email,role,suspendu&limit=2000`, {
      headers: sbHeaders(ctx.sbKey)
    });
    let profiles = profilesRes.ok ? await profilesRes.json() : [];
    if (!profilesRes.ok) {
      profilesRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?select=id,email,role&limit=2000`, {
        headers: sbHeaders(ctx.sbKey)
      });
      profiles = profilesRes.ok ? await profilesRes.json() : [];
    }
    if (!profilesRes.ok) {
      const details = await profilesRes.json().catch(() => ({}));
      return { ok: false, status: 400, error: 'Lecture participants impossible', details };
    }
    candidates = profiles.filter((profile) => {
      const role = normalizeText(profile.role).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (profile.id && profile.suspendu !== true && role !== 'admin') {
        return badgeHolderIds === null || badgeHolderIds.has(profile.id);
      }
      return false;
    }).map((profile) => ({
      user_id: profile.id,
      entries_weight: 1,
      user_email: profile.email,
      user_role: profile.role
    }));
  }
  if (!candidates.length) return { ok: false, status: 409, error: draw.eligibility_badge_slug ? `Aucun d\u00e9tenteur du badge "${draw.eligibility_badge_slug}" admissible` : 'Aucun participant admissible' };

  const winner = pickWeightedWinner(candidates);
  const profileRes = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(winner.user_id)}&select=id,email,role&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const profiles = profileRes.ok ? await profileRes.json() : [];
  const profile = profiles[0] || {};

  const winnerPayload = {
    draw_id: drawId,
    user_id: winner.user_id,
    prize_title: draw.title || 'Tirage PorteaPorte',
    published: true,
    entries_weight: winner.entries_weight || 1,
    user_email: profile.email || winner.user_email || '',
    user_role: profile.role || winner.user_role || '',
    selected_by: ctx.session.id
  };

  let winnerRes = await insertWithSchemaFallback(
    `${ctx.sbUrl}/rest/v1/draw_winners`,
    sbHeaders(ctx.sbKey),
    winnerPayload,
    ['entries_weight', 'user_email', 'user_role', 'selected_by']
  );

  if (!winnerRes.ok) {
    const retryPayload = { ...winnerPayload };
    delete retryPayload.selected_by;
    delete retryPayload.user_id;
    winnerRes = await insertWithSchemaFallback(
      `${ctx.sbUrl}/rest/v1/draw_winners`,
      sbHeaders(ctx.sbKey),
      retryPayload,
      ['entries_weight', 'user_email', 'user_role']
    );
  }
  if (!winnerRes.ok) return { ok: false, status: 400, error: 'Enregistrement gagnant impossible', details: winnerRes.data };

  let drawPatchRes = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(drawId)}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ status: 'completed', winner_selected_at: new Date().toISOString() })
  }).catch(() => null);
  if (drawPatchRes && !drawPatchRes.ok) {
    await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(drawId)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey, 'return=minimal'),
      body: JSON.stringify({ status: 'completed' })
    }).catch(() => {});
  }

  return { ok: true, winner: Array.isArray(winnerRes.data) ? winnerRes.data[0] : winnerRes.data, candidates_count: candidates.length };
}

async function adminRewards(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  if (req.method === 'GET' || body.mode === 'list') {
    const [missionsRes, drawsRes, winnersRes, txRes] = await Promise.all([
      fetch(`${ctx.sbUrl}/rest/v1/missions?select=*&order=created_at.desc&limit=100`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?select=*&order=draw_date.desc&limit=50`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/draw_winners?select=*&order=created_at.desc&limit=50`, { headers: sbHeaders(ctx.sbKey) }).catch(() => null),
      fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount&limit=1000`, { headers: sbHeaders(ctx.sbKey) })
    ]);
    const missions = missionsRes.ok ? await missionsRes.json() : [];
    const draws = drawsRes.ok ? await drawsRes.json() : [];
    const winners = winnersRes?.ok ? await winnersRes.json() : [];
    const txs = txRes.ok ? await txRes.json() : [];
    return res.status(200).json({
      success: true,
      missions,
      draws,
      winners,
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
      rules_url: body.rules_url || '/reglements-concours.html',
      auto_include_all_users: body.auto_include_all_users !== false,
      admin_note: String(body.admin_note || '').trim().slice(0, 500),
      eligibility_badge_slug: body.eligibility_badge_slug || null
    };
    if (!payload.title || !payload.draw_date) return res.status(400).json({ error: 'Titre et date requis' });
    const insert = await insertWithSchemaFallback(
      `${ctx.sbUrl}/rest/v1/monthly_draws`,
      sbHeaders(ctx.sbKey),
      payload,
      ['auto_include_all_users', 'admin_note', 'eligibility_badge_slug']
    );
    if (!insert.ok) return res.status(400).json({ error: 'Creation tirage impossible', details: insert.data });
    return res.status(200).json({ success: true, draw: Array.isArray(insert.data) ? insert.data[0] : insert.data });
  }

  if (body.mode === 'update_draw_status') {
    const id = body.id || body.draw_id;
    const status = String(body.status || '').trim();
    const allowed = new Set(['draft', 'active', 'closed', 'completed', 'cancelled']);
    if (!id || !allowed.has(status)) return res.status(400).json({ error: 'id et statut valide requis' });
    let r = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    let data = await r.json().catch(() => ({}));
    if (!r.ok && missingColumn(data) === 'updated_at') {
      r = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: sbHeaders(ctx.sbKey),
        body: JSON.stringify({ status })
      });
      data = await r.json().catch(() => ({}));
    }
    if (!r.ok) return res.status(400).json({ error: 'Mise a jour tirage impossible', details: data });
    return res.status(200).json({ success: true, draw: Array.isArray(data) ? data[0] : data });
  }

  if (body.mode === 'run_draw') {
    const id = body.id || body.draw_id;
    if (!id) return res.status(400).json({ error: 'draw_id requis' });
    const result = await runMonthlyDraw(ctx, id);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error, details: result.details });
    return res.status(200).json({ success: true, winner: result.winner, candidates_count: result.candidates_count, already_exists: Boolean(result.already_exists) });
  }

  if (body.mode === 'delete_draw') {
    const id = body.id;
    if (!id) return res.status(400).json({ error: 'id requis' });
    // Supprimer les entrées liées d'abord
    await fetch(`${ctx.sbUrl}/rest/v1/draw_entries?draw_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders(ctx.sbKey, 'return=minimal') }).catch(() => {});
    const r = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders(ctx.sbKey, 'return=minimal') });
    if (!r.ok) return res.status(400).json({ error: 'Suppression tirage impossible' });
    return res.status(200).json({ success: true });
  }

  if (body.mode === 'update_draw') {
    const id = body.id;
    if (!id) return res.status(400).json({ error: 'id requis' });
    const patch = {};
    if (body.title !== undefined)                  patch.title = String(body.title).trim().slice(0, 140);
    if (body.description !== undefined)            patch.description = String(body.description).trim().slice(0, 800);
    if (body.draw_date !== undefined)              patch.draw_date = body.draw_date;
    if (body.eligibility_badge_slug !== undefined) patch.eligibility_badge_slug = body.eligibility_badge_slug || null;
    if (body.admin_note !== undefined)             patch.admin_note = String(body.admin_note).trim().slice(0, 500);
    patch.updated_at = new Date().toISOString();
    const r = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(patch) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Modification tirage impossible', details: data });
    return res.status(200).json({ success: true });
  }

  if (body.mode === 'duplicate_draw') {
    const id = body.id;
    if (!id) return res.status(400).json({ error: 'id requis' });
    const srcRes = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    const srcRows = srcRes.ok ? await srcRes.json() : [];
    if (!srcRows.length) return res.status(404).json({ error: 'Tirage introuvable' });
    const src = srcRows[0];
    const copy = { title: src.title + ' (copie)', description: src.description, draw_date: src.draw_date, status: 'draft', rules_url: src.rules_url, auto_include_all_users: src.auto_include_all_users, eligibility_badge_slug: src.eligibility_badge_slug || null };
    const r = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws`, { method: 'POST', headers: sbHeaders(ctx.sbKey), body: JSON.stringify(copy) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Duplication tirage impossible', details: data });
    return res.status(200).json({ success: true, draw: Array.isArray(data) ? data[0] : data });
  }

  return res.status(400).json({ error: 'Mode rewards inconnu' });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  // Rate limit global : 120 requêtes / minute par IP
  const _ip = getClientIp(req);
  const { allowed: _ipOk } = await checkRateLimit(`ip:${_ip}:platform`, 120, 60);
  if (!_ipOk) {
    return res.status(429).json({
      error: 'Trop de requêtes. Réessayez dans une minute.',
      code: 'RATE_LIMIT',
    });
  }

  let endpoint = 'unknown';
  try {
    const body = req.body || {};
    endpoint = endpointFromReq(req, body);
    const sbUrl = sanitizeEnv(process.env.SUPABASE_URL);
    const sbKey = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);
    if (!sbUrl || !sbKey) return res.status(503).json({ error: 'Supabase non configure' });
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const internalHeader = req.headers['x-internal-notifier-secret'];
    const internal = Boolean(internalSecret && internalHeader && internalHeader === internalSecret);

    if (endpoint === 'impact-public') {
      return await impactPublic(req, res, { sbUrl, sbKey });
    }
    if (endpoint === 'impact-feedback') {
      try {
        const payload = {
          points:       String(body.points       || '').slice(0,20),
          transparence: String(body.transparence || '').slice(0,20),
          sans_impact:  String(body.sans_impact  || '').slice(0,20),
          source:       String(body.source       || 'unknown').slice(0,40),
          created_at:   new Date().toISOString()
        };
        await fetch(`${sbUrl}/rest/v1/impact_mode_feedback`, {
          method: 'POST',
          headers: sbHeaders(sbKey),
          body: JSON.stringify(payload)
        }).catch(() => {});
        return res.status(200).json({ success: true });
      } catch (_) {
        return res.status(200).json({ success: true }); // silencieux
      }
    }
    if (endpoint === 'platform-claim-free') {
      try {
        const r = await fetch(`${sbUrl}/rest/v1/rpc/platform_claim_free_days`, {
          method: 'POST',
          headers: { ...sbHeaders(sbKey), 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const days = r.ok ? await r.json() : 0;
        return res.status(200).json({ success: true, days: Math.max(0, Number(days) || 0) });
      } catch (_) {
        return res.status(200).json({ success: true, days: 0 });
      }
    }
    if (endpoint === 'impact-application') {
      return await impactApplicationPublic(req, res, { sbUrl, sbKey }, body);
    }

    // ── maps-config (public, clé Google Maps) ──────────────────────
    if (endpoint === 'maps-config') {
      const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
      if (!key) {
        return res.status(200).json({
          success: true,
          provider: 'leaflet',
          key: null,
          warning: 'GOOGLE_MAPS_API_KEY non configuree; repli Leaflet/OpenStreetMap actif'
        });
      }
      return res.status(200).json({ success: true, provider: 'google', key });
    }

    // ── recipient-review (public, avis destinataire sans auth) ──────
    if (endpoint === 'ride-search') {
      return await rideSearch(req, res, { sbUrl, sbKey, session: null, profile: null }, body);
    }
    if (endpoint === 'ride-detail') {
      return await rideDetail(req, res, { sbUrl, sbKey, session: null, profile: null }, body);
    }
    if (endpoint === 'safe-meeting-points') {
      return await safeMeetingPoints(req, res, { sbUrl, sbKey, session: null, profile: null }, body);
    }
    if (endpoint === 'ride-settings') {
      const settings = await getRideSettings({ sbUrl, sbKey });
      return res.status(200).json({
        success: true,
        settings: {
          ride_platform_fee: 1.5,
          ride_fee_luggage: 5,
          ride_fee_pet: 8,
          ride_fee_stop: 3,
          ride_fee_package_base: 8,
          ride_fee_package_per_kg: 1.5,
          ...settings,
        },
      });
    }

    if (endpoint === 'recipient-review') {
      return await recipientReview(req, res, sbUrl, sbKey, body);
    }

    // ── tracking-public (public, suivi sans auth) ───────────────────
    if (endpoint === 'tracking-public') {
      const STATUS_LABELS_PUB = {
        en_attente: { label: 'En attente de livreur', icon: '⏳', step: 1 },
        acceptee:   { label: 'Livreur assigné',        icon: '✅', step: 2 },
        en_route:   { label: 'En route',               icon: '🚗', step: 3 },
        livree:     { label: 'Livrée',                 icon: '📦', step: 4 },
        confirmee:  { label: 'Livraison confirmée',    icon: '🎉', step: 5 },
        annulee:    { label: 'Annulée',                icon: '❌', step: 0 },
        litige:     { label: 'En litige',              icon: '⚠️', step: 0 },
      };
      let tpCode;
      if (req.method === 'GET') {
        const u = new URL(req.url, siteOrigin());
        tpCode = u.searchParams.get('code') || u.searchParams.get('id');
      } else {
        tpCode = (body || {}).code || (body || {}).id;
      }
      tpCode = String(tpCode || '').trim().toUpperCase();
      if (!tpCode) return res.status(400).json({ error: 'Code de suivi requis' });
      const isUuid = /^[0-9a-f-]{36}$/i.test(tpCode);
      const tpFilter = isUuid ? `id=eq.${encodeURIComponent(tpCode)}` : `code=eq.${encodeURIComponent(tpCode)}`;
      try {
        const tr = await fetch(
          `${sbUrl}/rest/v1/livraisons?${tpFilter}&select=id,code,statut,ville_depart,ville_arrivee,type,type_colis,created_at,cree_le&limit=1`,
          { headers: sbHeaders(sbKey) }
        );
        if (!tr.ok) return res.status(400).json({ error: 'Suivi indisponible' });
        const tpRows = await tr.json().catch(() => []);
        if (!tpRows.length) return res.status(404).json({ error: 'Code de suivi introuvable. Vérifiez le code et réessayez.' });
        const liv = tpRows[0];
        const si = STATUS_LABELS_PUB[liv.statut] || { label: liv.statut, icon: '📋', step: 1 };
        let position = null;
        if (liv.statut === 'en_route') {
          const gr = await fetch(
            `${sbUrl}/rest/v1/delivery_locations?livraison_id=eq.${liv.id}&select=latitude,longitude,recorded_at&order=recorded_at.desc&limit=1`,
            { headers: sbHeaders(sbKey) }
          );
          if (gr.ok) {
            const gRows = await gr.json().catch(() => []);
            if (gRows[0]) {
              position = {
                lat: Math.round(gRows[0].latitude  * 100) / 100,
                lng: Math.round(gRows[0].longitude * 100) / 100,
                updated_at: gRows[0].recorded_at,
              };
            }
          }
        }
        return res.status(200).json({
          success: true,
          tracking: {
            code: liv.code || tpCode,
            statut: liv.statut,
            statut_label: si.label,
            statut_icon: si.icon,
            statut_step: si.step,
            ville_depart:  liv.ville_depart  || '—',
            ville_arrivee: liv.ville_arrivee || '—',
            type: liv.type || liv.type_colis || 'colis',
            created_at: liv.created_at || liv.cree_le,
            position,
            steps: Object.values(STATUS_LABELS_PUB).filter(s => s.step > 0).sort((a, b) => a.step - b.step),
            current_step: si.step,
          }
        });
      } catch (tpErr) {
        return res.status(500).json({ error: 'Erreur de suivi', details: tpErr.message });
      }
    }

    // ── Préférences de réception destinataire (public, identifié par livraison_id) ──
    if (endpoint === 'recipient-preferences') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
      const livId = body.livraison_id;
      if (!livId) return res.status(400).json({ error: 'livraison_id requis' });
      // Vérifier que la livraison existe et n'est pas finale
      const lr = await fetch(`${sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livId)}&select=id,statut`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
      });
      const lrows = lr.ok ? await lr.json().catch(() => []) : [];
      if (!lrows[0]) return res.status(404).json({ error: 'Livraison introuvable' });
      if (['payee', 'paid', 'annule', 'rembourse'].includes(lrows[0].statut)) {
        return res.status(409).json({ error: 'Livraison cloturee — modifications impossibles' });
      }
      const patch = {
        reception_mode: body.reception_mode || null,
        reception_heure_debut: body.reception_heure_debut || null,
        reception_heure_fin: body.reception_heure_fin || null,
        reception_photo_obligatoire: Boolean(body.reception_photo_obligatoire),
        reception_lieu_repli: body.reception_lieu_repli || null,
        reception_note_livreur: body.reception_note_livreur || null,
        reception_preferences_set_at: new Date().toISOString()
      };
      const pr = await fetch(`${sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livId)}`, {
        method: 'PATCH',
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      });
      if (!pr.ok) {
        const errData = await pr.json().catch(() => ({}));
        return res.status(400).json({ error: 'Sauvegarde impossible', details: errData });
      }
      return res.status(200).json({ success: true });
    }

    if (endpoint === 'push-send' && internal) {
      const ctx = {
        sbUrl,
        sbKey,
        stripeKey: sanitizeEnv(process.env.STRIPE_SECRET_KEY),
        session: { id: 'internal', email: 'internal@porteaporte.site' },
        profile: { role: 'admin', suspendu: false },
        internal: true
      };
      return await pushSend(req, res, ctx, body);
    }

    const session = await getSession(req, sbUrl, sbKey);
    if (!session) return res.status(401).json({ error: 'Session requise' });
    const profile = await getProfile(session.id, sbUrl, sbKey);
    if (endpoint === 'set-role') {
      if (profile && (profile.suspendu || profile.verification_status === 'suspended')) {
        return res.status(403).json({ error: 'Profil suspendu' });
      }
      return await setUserRole(req, res, { sbUrl, sbKey, stripeKey: sanitizeEnv(process.env.STRIPE_SECRET_KEY), session, profile }, body);
    }
    if (!profile || profile.suspendu || profile.verification_status === 'suspended') {
      return res.status(403).json({ error: 'Profil invalide ou suspendu' });
    }

    const ctx = { sbUrl, sbKey, stripeKey: sanitizeEnv(process.env.STRIPE_SECRET_KEY), session, profile };

    if (endpoint === 'create-livraison') return await createLivraison(req, res, ctx, body);
    if (endpoint === 'assign-driver') return await assignDriver(req, res, ctx, body);
    if (endpoint === 'livraison-imprevu') return await livraisonImprevu(req, res, ctx, body);
    if (endpoint === 'gps-update') return await gpsUpdate(req, res, ctx, body);
    if (endpoint === 'confirm-delivery') return await confirmDelivery(req, res, ctx, body);
    if (endpoint === 'delivery-proof') return await submitDeliveryProof(req, res, ctx, body);
    if (endpoint === 'available-livraisons') return await availableLivraisons(req, res, ctx, body);
    if (endpoint === 'my-livraisons') return await myLivraisons(req, res, ctx, body);
    if (endpoint === 'my-driver-livraisons') return await myDriverLivraisons(req, res, ctx, body);
    if (endpoint === 'admin-dashboard') return await adminDashboard(req, res, ctx, body);
    if (endpoint === 'admin-delivery-proof') return await adminDeliveryProof(req, res, ctx, body);
    if (endpoint === 'admin-disputes') return await adminDisputes(req, res, ctx);
    if (endpoint === 'admin-dispute-action') return await adminDisputeAction(req, res, ctx, body);
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
    if (endpoint === 'ride-driver-profile')  return await rideDriverProfile(req, res, ctx);
    if (endpoint === 'ride-create')          return await rideCreate(req, res, ctx, body);
    if (endpoint === 'ride-search')          return await rideSearch(req, res, ctx, body);
    if (endpoint === 'ride-detail')          return await rideDetail(req, res, ctx, body);
    if (endpoint === 'ride-book')            return await rideBook(req, res, ctx, body);
    if (endpoint === 'ride-cancel')          return await rideCancel(req, res, ctx, body);
    if (endpoint === 'ride-my-rides')        return await rideMyRides(req, res, ctx, body);
    if (endpoint === 'ride-admin')           return await rideAdmin(req, res, ctx, body);
    if (endpoint === 'ride-report')          return await rideReport(req, res, ctx, body);
    if (endpoint === 'ride-package-book')    return await ridePackageBook(req, res, ctx, body);
    if (endpoint === 'safe-meeting-points')  return await safeMeetingPoints(req, res, ctx, body);
    if (endpoint === 'cov-dashboard') return await covDashboard(req, res, ctx, body);
    if (endpoint === 'cov-onboard')   return await covOnboard(req, res, ctx, body);
    if (endpoint === 'cov-progress')  return await covProgress(req, res, ctx, body);
    // ── Systèmes de croissance v2 ──────────────────────────────
    if (endpoint === 'growth-dashboard')   return await growthDashboard(req, res, ctx);
    if (endpoint === 'referral-get')       return await referralGet(req, res, ctx);
    if (endpoint === 'referral-use')       return await referralUse(req, res, ctx, body);
    if (endpoint === 'badges-list')        return await badgesList(req, res, ctx);
    if (endpoint === 'badges-grant')       return await badgesGrant(req, res, ctx, body);
    if (endpoint === 'xp-history')         return await xpHistory(req, res, ctx);
    if (endpoint === 'points-history')     return await pointsHistory(req, res, ctx);
    if (endpoint === 'admin-growth')         return await adminGrowth(req, res, ctx, body);
    if (endpoint === 'badge-campaigns')      return await badgeCampaigns(req, res, ctx);
    if (endpoint === 'badge-campaign-save')  return await badgeCampaignSave(req, res, ctx, body);
    if (endpoint === 'badge-campaign-toggle')return await badgeCampaignToggle(req, res, ctx, body);
    if (endpoint === 'badge-benefit-status') return await badgeBenefitStatus(req, res, ctx, body);
    if (endpoint === 'stripe-connect-onboard')   return await stripeConnectOnboard(req, res, ctx, body);
    if (endpoint === 'stripe-connect-status')    return await stripeConnectStatus(req, res, ctx);
    if (endpoint === 'stripe-connect-dashboard') return await stripeConnectDashboard(req, res, ctx);
    if (endpoint === 'stripe-connect-payout')    return await stripeConnectPayout(req, res, ctx, body);
    if (endpoint === 'livreur-earnings')         return await livreurEarnings(req, res, ctx);
    if (endpoint === 'subscription-create')      return await subscriptionCreate(req, res, ctx);
    if (endpoint === 'subscription-status')      return await subscriptionStatus(req, res, ctx);
    // ── admin-push-broadcast ────────────────────────────────────────
    if (endpoint === 'admin-push-broadcast') {
      if (ctx.profile.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux admins' });
      const webpush = require('web-push');
      const vapidPublic  = (process.env.VAPID_PUBLIC_KEY  || '').trim();
      const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
      const vapidEmail   = process.env.VAPID_EMAIL || 'mailto:admin@porteaporte.site';
      if (!vapidPublic || !vapidPrivate) return res.status(500).json({ error: 'VAPID non configuré' });
      const { title: pbTitle, body: pbBody, url: pbUrl, role: pbRole } = body || {};
      if (!pbTitle || !pbBody) return res.status(400).json({ error: 'title et body sont requis' });
      webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
      let subsUrl = `${sbUrl}/rest/v1/push_subscriptions?select=id,subscription,user_id`;
      if (pbRole) {
        const prRes = await fetch(`${sbUrl}/rest/v1/profiles?role=eq.${pbRole}&select=id`, { headers: sbHeaders(sbKey) });
        if (!prRes.ok) return res.status(500).json({ error: 'Erreur lecture profils' });
        const pbProfiles = await prRes.json();
        const pbIds = (pbProfiles || []).map(p => p.id);
        if (!pbIds.length) return res.status(200).json({ success: true, sent: 0, failed: 0, message: 'Aucun abonné dans ce rôle' });
        subsUrl += `&user_id=in.(${pbIds.join(',')})`;
      }
      const subsRes = await fetch(subsUrl, { headers: sbHeaders(sbKey) });
      if (!subsRes.ok) return res.status(500).json({ error: 'Erreur lecture abonnements' });
      const pbSubs = await subsRes.json();
      if (!pbSubs?.length) return res.status(200).json({ success: true, sent: 0, failed: 0, message: 'Aucun abonné' });
      const pbPayload = JSON.stringify({ title: pbTitle, body: pbBody, icon: '/logo.svg', badge: '/logo.svg', tag: 'pap-admin-broadcast', data: { url: pbUrl || '/' } });
      let pbSent = 0, pbFailed = 0;
      const pbStale = [];
      await Promise.all(pbSubs.map(async (row) => {
        let sub;
        try { sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription; } catch { pbFailed++; return; }
        try { await webpush.sendNotification(sub, pbPayload); pbSent++; }
        catch (e) { pbFailed++; if (e.statusCode === 410 || e.statusCode === 404) pbStale.push(row.id); }
      }));
      if (pbStale.length) {
        await fetch(`${sbUrl}/rest/v1/push_subscriptions?id=in.(${pbStale.join(',')})`, { method: 'DELETE', headers: sbHeaders(sbKey) }).catch(() => {});
      }
      return res.status(200).json({ success: true, sent: pbSent, failed: pbFailed, total: pbSubs.length, stale_removed: pbStale.length });
    }
    return res.status(400).json({ error: 'Endpoint plateforme inconnu: ' + endpoint });
  } catch (err) {
    console.error('[platform]', endpoint, err.message, err.stack);
    return res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
};

