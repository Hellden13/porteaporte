const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const { normalizeRole } = require('../lib/_lib');

const RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1000;

function hashCode(value, salt) {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(`${String(value || '').trim()}|${String(salt || '')}`)
    .digest('hex');
}

async function getSessionUser(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;

  const r = await fetch(sbUrl + '/auth/v1/user', {
    headers: { apikey: sbKey, Authorization: 'Bearer ' + token }
  });
  return r.ok ? r.json() : null;
}

async function isAdmin(userId, sbUrl, sbKey) {
  const r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=role,suspendu`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
  });
  const rows = r.ok ? await r.json() : [];
  return normalizeRole(rows[0]?.role) === 'admin' && !rows[0]?.suspendu;
}

async function stripeRequest(method, path, stripeKey, body, idempotencyKey) {
  const headers = {
    Authorization: 'Bearer ' + stripeKey,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-04-10',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const r = await fetch('https://api.stripe.com' + path, { method, headers, body: body || undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function sbHeaders(sbKey, prefer = 'return=minimal') {
  return {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
    Prefer: prefer
  };
}

async function patchSupabase(url, sbKey, patch) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(sbKey),
    body: JSON.stringify(patch)
  });
  const text = await r.text().catch(() => '');
  return { ok: r.ok, status: r.status, text };
}

async function insertAudit(sbUrl, sbKey, payload) {
  await fetch(`${sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify({
      ...payload,
      retention_until: payload.retention_until || new Date(Date.now() + RETENTION_MS).toISOString()
    })
  }).catch(() => {});
}

async function fetchJson(url, sbKey) {
  const r = await fetch(url, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } });
  const data = await r.json().catch(() => []);
  return { ok: r.ok, status: r.status, data };
}

async function safePatchLivraisonPaid(sbUrl, sbKey, livraisonId, confirmationPatch = {}) {
  const candidates = [
    { statut: 'payee', livre_le: new Date().toISOString(), ...confirmationPatch },
    { statut: 'payee', ...confirmationPatch },
    { statut: 'paid', ...confirmationPatch },
    { statut: 'payee', livre_le: new Date().toISOString() },
    { statut: 'payee' },
    { statut: 'paid' },
    { statut: 'livre', livre_le: new Date().toISOString() }
  ];

  for (const patch of candidates) {
    const r = await patchSupabase(`${sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}`, sbKey, patch);
    if (r.ok) return true;
  }
  return false;
}

async function getPaymentTransaction(sbUrl, sbKey, livraisonId) {
  let r = await fetchJson(
    `${sbUrl}/rest/v1/transactions?livraison_id=eq.${encodeURIComponent(livraisonId)}&type=eq.paiement_livraison&select=id,stripe_payment_intent,montant,statut,metadata,type&order=created_at.desc&limit=1`,
    sbKey
  );
  if (r.ok && Array.isArray(r.data) && r.data[0]) return r.data[0];

  r = await fetchJson(
    `${sbUrl}/rest/v1/transactions?livraison_id=eq.${encodeURIComponent(livraisonId)}&select=id,stripe_payment_intent,montant,statut,metadata,type&order=created_at.desc&limit=1`,
    sbKey
  );
  return r.ok && Array.isArray(r.data) ? (r.data[0] || null) : null;
}

async function insertTransactionIfMissing(sbUrl, sbKey, payload) {
  const r = await fetch(`${sbUrl}/rest/v1/transactions`, {
    method: 'POST',
    headers: sbHeaders(sbKey, 'return=representation'),
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data: Array.isArray(data) ? data[0] : data };
}

async function autoGrantBadges(sbUrl, sbKey, livreurId, livraison) {
  // Compter livraisons totales du livreur
  let totalLivs = 0;
  try {
    const r = await fetch(`${sbUrl}/rest/v1/livraisons?livreur_id=eq.${livreurId}&statut=in.(payee,paid)&select=id,taille_colis`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, Prefer: 'count=exact' }
    });
    const livs = r.ok ? await r.json() : [];
    totalLivs = livs.length;
    var xlCount = livs.filter(l => l.taille_colis === 'xl').length;
  } catch (e) { return; }

  // Liste des badges à attribuer selon seuils
  const slugsToGrant = [];
  if (totalLivs >= 1) slugsToGrant.push('premier_pas');
  if (totalLivs >= 10) slugsToGrant.push('regulier_10');
  if (totalLivs >= 50) slugsToGrant.push('pro_50');
  if (totalLivs >= 100) slugsToGrant.push('centurion_100');
  if (totalLivs >= 500) slugsToGrant.push('legende_500');
  if (totalLivs >= 1000) slugsToGrant.push('maitre_1000');
  if (livraison.taille_colis === 'xl') slugsToGrant.push('costaud');
  if (xlCount >= 10) slugsToGrant.push('specialiste_xl');
  if (livraison.rescue_livreur_original) slugsToGrant.push('sauveur');

  // Récupérer IDs des badges
  if (!slugsToGrant.length) return;
  const slugList = slugsToGrant.map(s => `"${s}"`).join(',');
  const bRes = await fetch(`${sbUrl}/rest/v1/badges?slug=in.(${slugList})&select=id,slug,xp_reward`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
  });
  const badges = bRes.ok ? await bRes.json() : [];
  if (!badges.length) return;

  // Insérer dans user_badges (avec ON CONFLICT pour éviter doublons)
  for (const badge of badges) {
    await fetch(`${sbUrl}/rest/v1/user_badges?on_conflict=user_id,badge_id`, {
      method: 'POST',
      headers: {
        apikey: sbKey, Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify({ user_id: livreurId, badge_id: badge.id, granted_at: new Date().toISOString(), granted_by: 'system_auto' })
    }).catch(() => {});
  }

  // Ajouter XP cumulé des badges
  const totalXp = badges.reduce((s, b) => s + (b.xp_reward || 0), 0);
  if (totalXp > 0) {
    const pr = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${livreurId}&select=xp`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    });
    const profData = pr.ok ? await pr.json() : [];
    const currentXp = Number(profData[0]?.xp || 0);
    await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${livreurId}`, {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ xp: currentXp + totalXp })
    }).catch(() => {});
  }
}

function sanitizeEnv(s) {
  let v = (s || '').trim();
  while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1);
  return v.trim();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });

  const STRIPE_KEY = sanitizeEnv(process.env.STRIPE_SECRET_KEY);
  const SB_URL = sanitizeEnv(process.env.SUPABASE_URL);
  const SB_KEY = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);
  if (!STRIPE_KEY) return res.status(503).json({ error: 'Stripe non configure' });
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase non configure' });

  const { livraison_id, recipient_code, admin_override_reason } = req.body || {};
  if (!livraison_id) return res.status(400).json({ error: 'livraison_id requis' });

  /* Longueur minimale du code destinataire pour éviter le brute-force */
  if (recipient_code !== undefined && recipient_code !== null) {
    const codeStr = String(recipient_code).trim();
    if (codeStr.length < 6) {
      return res.status(400).json({ error: 'Code de reception invalide (trop court)' });
    }
  }

  const session = await getSessionUser(req, SB_URL, SB_KEY);
  if (!session && !recipient_code) return res.status(401).json({ error: 'Session ou code destinataire requis' });

  const livRes = await fetchJson(
    `${SB_URL}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraison_id)}&select=*&limit=1`,
    SB_KEY
  );
  const livraison = Array.isArray(livRes.data) ? livRes.data[0] : null;
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });

  if (!['livre', 'livree', 'delivered'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Livraison non livree: capture Stripe bloquee' });
  }

  const admin = session ? await isAdmin(session.id, SB_URL, SB_KEY) : false;
  const confirmationHash = livraison.recipient_confirmation_hash || livraison.code_reception_hash || null;
  const suppliedHash = confirmationHash ? hashCode(recipient_code, livraison.id) : null;
  const recipientCodeValid = Boolean(confirmationHash && recipient_code && suppliedHash === confirmationHash);

  if (!recipientCodeValid && !admin && livraison.expediteur_id !== session?.id) {
    return res.status(403).json({ error: 'Code destinataire requis pour liberer ce paiement' });
  }

  if (confirmationHash) {
    if (!recipientCodeValid && !admin) {
      return res.status(403).json({
        error: 'Code de reception destinataire invalide. Le paiement reste protege.'
      });
    }
    if (!recipientCodeValid && admin && !admin_override_reason) {
      return res.status(403).json({
        error: 'Code invalide. En tant qu\'admin, fournis une raison de validation manuelle (admin_override_reason).',
        requires_admin_override: true
      });
    }
  } else if (!admin || !admin_override_reason) {
    return res.status(409).json({
      error: 'Confirmation destinataire requise. Cette livraison n a pas de code de reception; validation admin requise.',
      requires_admin_override: true
    });
  }

  const recipientConfirmationPatch = {
    recipient_confirmed_at: new Date().toISOString(),
    recipient_confirmation_method: recipientCodeValid ? 'recipient_code' : 'admin_override'
  };

  let tx = await getPaymentTransaction(SB_URL, SB_KEY, livraison_id);
  const paymentIntentId = tx?.stripe_payment_intent || livraison.stripe_payment_intent || livraison.payment_intent_id || null;

  // FALLBACK : si pas de PI mais admin valide → confirmation manuelle sans capture Stripe (ex: paiement raté/test)
  if (!paymentIntentId) {
    if (admin) {
      const livraisonUpdated = await safePatchLivraisonPaid(SB_URL, SB_KEY, livraison_id, recipientConfirmationPatch);
      await insertAudit(SB_URL, SB_KEY, {
        livraison_id,
        user_id: livraison.expediteur_id,
        actor_id: session?.id || null,
        event_type: 'manual_confirmation_no_stripe',
        amount_cents: 0,
        currency: 'cad',
        evidence: { source: 'api/capture-livraison', reason: 'No PaymentIntent found, admin manual override' }
      });
      return res.status(200).json({
        success: true,
        manual_no_stripe: true,
        livraison_id,
        db_updated: livraisonUpdated,
        warning: 'Confirmation manuelle sans capture Stripe (PI absent)'
      });
    }
    return res.status(404).json({
      error: 'PaymentIntent introuvable. Cette livraison n\'a pas de paiement enregistré. Contacte le support pour validation manuelle.',
      contact: 'denismorneaubtc@gmail.com'
    });
  }

  const piPath = `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`;
  const existing = await stripeRequest('GET', piPath, STRIPE_KEY);
  if (!existing.ok) {
    return res.status(402).json({ error: existing.data?.error?.message || 'PaymentIntent Stripe introuvable' });
  }

  const intent = existing.data;
  if (intent.metadata?.livraison_id && intent.metadata.livraison_id !== livraison_id) {
    return res.status(409).json({ error: 'PaymentIntent ne correspond pas a cette livraison' });
  }
  if (intent.metadata?.expediteur_id && intent.metadata.expediteur_id !== livraison.expediteur_id) {
    return res.status(409).json({ error: 'PaymentIntent ne correspond pas a cet expediteur' });
  }

  if (!tx) {
    const createdTx = await insertTransactionIfMissing(SB_URL, SB_KEY, {
      user_id: livraison.expediteur_id,
      livraison_id,
      type: 'paiement_livraison',
      montant: Number((intent.amount || intent.amount_received || 0) / 100),
      statut: intent.status,
      description: 'Transaction reconstruite depuis Stripe avant confirmation reception',
      stripe_payment_intent: intent.id,
      metadata: {
        reconstructed_from_stripe: true,
        reconstructed_at: new Date().toISOString()
      }
    });
    if (createdTx.ok) tx = createdTx.data;
  }

  if (intent.status === 'succeeded') {
    if (tx?.id) {
      await patchSupabase(`${SB_URL}/rest/v1/transactions?id=eq.${encodeURIComponent(tx.id)}`, SB_KEY, {
        statut: 'succeeded',
        metadata: { ...(tx.metadata || {}), captured: true, reconciled_at: new Date().toISOString() }
      }).catch(() => false);
    }
    const livraisonUpdated = await safePatchLivraisonPaid(SB_URL, SB_KEY, livraison_id, recipientConfirmationPatch);
    return res.status(200).json({
      success: true,
      already_captured: true,
      livraison_id,
      payment_intent_id: intent.id,
      status: intent.status,
      amount_received: intent.amount_received,
      db_updated: livraisonUpdated
    });
  }

  if (intent.status !== 'requires_capture') {
    return res.status(409).json({
      error: 'Paiement Stripe non capturable',
      stripe_status: intent.status
    });
  }
  if (!intent.amount_capturable || intent.amount_capturable <= 0) {
    return res.status(409).json({ error: 'Aucun montant capturable disponible' });
  }

  const capture = await stripeRequest(
    'POST',
    `${piPath}/capture`,
    STRIPE_KEY,
    undefined,
    `capture-livraison-${livraison_id}-${paymentIntentId}`
  );
  const captured = capture.data;
  if (!capture.ok) return res.status(402).json({ error: captured.error?.message || 'Capture Stripe impossible' });

  const txUpdated = tx?.id ? await patchSupabase(`${SB_URL}/rest/v1/transactions?id=eq.${encodeURIComponent(tx.id)}`, SB_KEY, {
    statut: captured.status,
    metadata: {
      ...(tx.metadata || {}),
      captured: true,
      captured_at: new Date().toISOString(),
      amount_captured: captured.amount_received
    }
  }).then(r => r.ok).catch(() => false) : false;

  const livraisonUpdated = await safePatchLivraisonPaid(SB_URL, SB_KEY, livraison_id, recipientConfirmationPatch);

  await insertAudit(SB_URL, SB_KEY, {
    transaction_id: tx?.id || null,
    livraison_id,
    user_id: livraison.expediteur_id,
    actor_id: session?.id || null,
    event_type: 'payment_captured_after_delivery_confirmation',
    amount_cents: captured.amount_received,
    currency: captured.currency || 'cad',
    stripe_payment_intent: captured.id,
    status: captured.status,
    evidence: {
      source: 'api/capture-livraison',
      livraison_status_before_capture: livraison.statut,
      manual_capture: true,
      recipient_code_verified: Boolean(confirmationHash),
      admin_override_reason: admin_override_reason || null
    }
  });

  // Créditer les gains du livreur (60% + bonus rescue + bonus fidélité)
  if (livraison.livreur_id && captured.amount_received > 0) {
    const grossCents = captured.amount_received;
    // Lire bonus fidélité depuis profile
    let loyaltyBonus = 0;
    try {
      const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(livraison.livreur_id)}&select=loyalty_bonus_pct`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
      });
      const profileData = pr.ok ? await pr.json() : [];
      loyaltyBonus = Number(profileData[0]?.loyalty_bonus_pct || 0);
      if (loyaltyBonus > 10) loyaltyBonus = 10; // safety cap
    } catch (e) {}
    // Part de base = 60% + bonus fidélité (max 70%)
    const basePct = 60 + loyaltyBonus;
    const baseNetCents = Math.floor(grossCents * (basePct / 100));
    const rescuePct = livraison.rescue_livreur_original ? (Number(livraison.rescue_bonus_pct) || 20) : 0;
    const bonusCents = rescuePct > 0 ? Math.floor(baseNetCents * (rescuePct / 100)) : 0;
    const netCents = baseNetCents + bonusCents;
    const feeCents = grossCents - netCents;
    await fetch(`${SB_URL}/rest/v1/livreur_earnings`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id:               livraison.livreur_id,
        livraison_id,
        gross_amount:          grossCents / 100,
        platform_fee:          feeCents   / 100,
        net_amount:            netCents   / 100,
        currency:              captured.currency || 'cad',
        status:                'available',
        available_after:       new Date().toISOString(),
        stripe_payment_intent: captured.id,
        type:                  rescuePct > 0 ? 'rescue_bonus' : (loyaltyBonus > 0 ? 'loyalty_bonus' : 'livraison'),
        notes:                 [
          rescuePct > 0 ? `Rescue +${rescuePct}%` : null,
          loyaltyBonus > 0 ? `Fidélité +${loyaltyBonus}% (part ${basePct}%)` : null
        ].filter(Boolean).join(' · ') || null,
        created_at:            new Date().toISOString()
      })
    }).catch(e => console.error('[livreur_earnings insert]', e.message));
  }

  // ── Notifier expéditeur + livreur : livraison complète, paiement libéré ──
  try {
    const origin = (process.env.PUBLIC_SITE_ORIGIN || process.env.ALLOWED_ORIGIN || 'https://porteaporte.site').replace(/\/$/, '');
    const notifHeaders = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_API_SECRET) notifHeaders['x-internal-notifier-secret'] = process.env.INTERNAL_API_SECRET;

    // Récupérer emails expéditeur + livreur
    const ids = [livraison.expediteur_id, livraison.livreur_id].filter(Boolean);
    const profRes = await fetch(
      `${SB_URL}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,email,nom,prenom`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const profiles = profRes.ok ? await profRes.json().catch(() => []) : [];
    const expProfile = profiles.find(p => p.id === livraison.expediteur_id);
    const livProfile = profiles.find(p => p.id === livraison.livreur_id);

    const netCents = (livraison.livreur_id && captured.amount_received > 0)
      ? Math.floor(captured.amount_received * 0.60)
      : 0;

    await fetch(`${origin}/api/notifier`, {
      method: 'POST',
      headers: notifHeaders,
      body: JSON.stringify({
        type: 'livraison_complete',
        data: {
          expediteur_email: expProfile?.email,
          livreur_email:    livProfile?.email,
          code:             livraison.code,
          montant_livreur:  (netCents / 100).toFixed(2),
          ville_depart:     livraison.ville_depart,
          ville_arrivee:    livraison.ville_arrivee,
        }
      })
    }).catch(e => console.error('[notifier livraison_complete fetch]', e.message));
  } catch (e) {
    console.error('[livraison_complete notify error]', e.message);
  }

  // ── AUTO-ATTRIBUTION DES BADGES ──
  if (livraison.livreur_id) {
    try {
      await autoGrantBadges(SB_URL, SB_KEY, livraison.livreur_id, livraison);
    } catch (e) { console.error('[badges auto-grant]', e.message); }
  }

  return res.status(200).json({
    success: true,
    livraison_id,
    payment_intent_id: captured.id,
    status: captured.status,
    amount_received: captured.amount_received,
    db_updated: txUpdated && livraisonUpdated
  });
};
