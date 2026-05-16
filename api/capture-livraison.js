const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function getSessionUser(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;

  const r = await fetch(sbUrl + '/auth/v1/user', {
    headers: {
      apikey: sbKey,
      Authorization: 'Bearer ' + token
    }
  });
  return r.ok ? r.json() : null;
}

async function isAdmin(userId, sbUrl, sbKey) {
  const r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=role,suspendu`, {
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`
    }
  });
  const rows = r.ok ? await r.json() : [];
  return rows[0]?.role === 'admin' && !rows[0]?.suspendu;
}

async function stripeRequest(method, path, stripeKey, body, idempotencyKey) {
  const headers = {
    Authorization: 'Bearer ' + stripeKey,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-04-10',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const r = await fetch('https://api.stripe.com' + path, {
    method,
    headers,
    body: body || undefined
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function patchSupabase(url, sbKey, patch) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(patch)
  });
  return r.ok;
}

async function insertAudit(sbUrl, sbKey, payload) {
  await fetch(`${sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!STRIPE_KEY) return res.status(503).json({ error: 'Stripe non configure' });
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase non configure' });

  const session = await getSessionUser(req, SB_URL, SB_KEY);
  if (!session) return res.status(401).json({ error: 'Session requise' });

  const { livraison_id } = req.body || {};
  if (!livraison_id) return res.status(400).json({ error: 'livraison_id requis' });

  const livRes = await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}&select=id,code,expediteur_id,livreur_id,statut`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  const livraisons = livRes.ok ? await livRes.json() : [];
  const livraison = livraisons[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });

  const admin = await isAdmin(session.id, SB_URL, SB_KEY);
  if (!admin && livraison.expediteur_id !== session.id) {
    return res.status(403).json({ error: 'Seul admin ou expediteur peut capturer' });
  }
  if (!['livre', 'livree', 'delivered'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Livraison non livree: capture Stripe bloquee' });
  }

  const txRes = await fetch(`${SB_URL}/rest/v1/transactions?livraison_id=eq.${livraison_id}&type=eq.paiement_livraison&select=id,stripe_payment_intent,montant,statut,metadata&order=created_at.desc&limit=1`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  const txs = txRes.ok ? await txRes.json() : [];
  const tx = txs[0];
  if (!tx?.stripe_payment_intent) return res.status(404).json({ error: 'PaymentIntent introuvable' });
  if (tx.statut === 'succeeded') return res.status(409).json({ error: 'Paiement deja capture' });

  const piPath = `/v1/payment_intents/${encodeURIComponent(tx.stripe_payment_intent)}`;
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

  if (intent.status === 'succeeded') {
    await patchSupabase(`${SB_URL}/rest/v1/transactions?id=eq.${tx.id}`, SB_KEY, {
      statut: 'succeeded',
      metadata: { ...(tx.metadata || {}), captured: true, reconciled_at: new Date().toISOString() }
    }).catch(() => false);
    await patchSupabase(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}`, SB_KEY, { statut: 'payee' }).catch(() => false);
    return res.status(200).json({
      success: true,
      already_captured: true,
      livraison_id,
      payment_intent_id: intent.id,
      status: intent.status,
      amount_received: intent.amount_received
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
    `capture-livraison-${livraison_id}-${tx.stripe_payment_intent}`
  );
  const captured = capture.data;
  if (!capture.ok) return res.status(402).json({ error: captured.error?.message || 'Capture Stripe impossible' });

  const txUpdated = await patchSupabase(`${SB_URL}/rest/v1/transactions?id=eq.${tx.id}`, SB_KEY, {
    statut: captured.status,
    metadata: {
      ...(tx.metadata || {}),
      captured: true,
      captured_at: new Date().toISOString(),
      amount_captured: captured.amount_received
    }
  }).catch(() => false);

  const livraisonUpdated = await patchSupabase(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}`, SB_KEY, {
    statut: 'payee',
    livre_le: new Date().toISOString()
  }).catch(() => false);

  await insertAudit(SB_URL, SB_KEY, {
    transaction_id: tx.id,
    livraison_id,
    user_id: livraison.expediteur_id,
    actor_id: session.id,
    event_type: 'payment_captured_after_delivery_confirmation',
    amount_cents: captured.amount_received,
    currency: captured.currency || 'cad',
    stripe_payment_intent: captured.id,
    status: captured.status,
    evidence: {
      source: 'api/capture-livraison',
      livraison_status_before_capture: livraison.statut,
      manual_capture: true
    },
    retention_until: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  return res.status(200).json({
    success: true,
    livraison_id,
    payment_intent_id: captured.id,
    status: captured.status,
    amount_received: captured.amount_received,
    db_updated: txUpdated && livraisonUpdated
  });
};


