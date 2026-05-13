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

async function getRole(userId, sbUrl, sbKey) {
  const r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=role`, {
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`
    }
  });
  const rows = r.ok ? await r.json() : [];
  return rows[0]?.role || null;
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

  const { livraison_id, raison } = req.body || {};
  if (!livraison_id) return res.status(400).json({ error: 'livraison_id requis' });

  const livRes = await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}&select=id,expediteur_id,livreur_id,statut`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  const livraisons = livRes.ok ? await livRes.json() : [];
  const livraison = livraisons[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });

  const role = await getRole(session.id, SB_URL, SB_KEY);
  const isAdmin = role === 'admin';
  const allowed = isAdmin || livraison.expediteur_id === session.id;
  if (!allowed) return res.status(403).json({ error: 'Seul admin ou expediteur peut annuler' });

  if (['livre', 'livree', 'payee', 'delivered', 'paid'].includes(livraison.statut) && !isAdmin) {
    return res.status(409).json({ error: 'Livraison deja livree/payee: ouverture litige requise' });
  }

  if (livraison.livreur_id && !isAdmin && !['paiement_autorise', 'confirme'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Livreur deja en route: annulation directe bloquee, contacter support' });
  }

  const txRes = await fetch(`${SB_URL}/rest/v1/transactions?livraison_id=eq.${livraison_id}&type=eq.paiement_livraison&select=id,stripe_payment_intent,statut,metadata&order=created_at.desc&limit=1`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  const txs = txRes.ok ? await txRes.json() : [];
  const tx = txs[0];
  if (!tx?.stripe_payment_intent) {
    await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ statut: 'annulee' })
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      livraison_id,
      status: 'annulee',
      stripe_action: 'none',
      message: 'Livraison annulee sans paiement Stripe a rembourser'
    });
  }

  const intentRes = await fetch(`https://api.stripe.com/v1/payment_intents/${tx.stripe_payment_intent}`, {
    headers: {
      Authorization: 'Bearer ' + STRIPE_KEY,
      'Stripe-Version': '2024-04-10',
    }
  });
  const intent = await intentRes.json();
  if (!intentRes.ok) return res.status(402).json({ error: intent.error?.message || 'Lecture Stripe impossible' });

  if (['succeeded'].includes(intent.status) && !isAdmin) {
    return res.status(409).json({ error: 'Paiement deja capture: remboursement admin/litige requis' });
  }

  if (['canceled', 'requires_payment_method'].includes(intent.status)) {
    await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ statut: 'annulee' })
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      livraison_id,
      payment_intent_id: intent.id,
      status: intent.status,
      stripe_action: 'already_closed'
    });
  }

  if (!['requires_capture', 'requires_confirmation', 'requires_action', 'processing'].includes(intent.status)) {
    return res.status(409).json({ error: 'Statut Stripe non annulable: ' + intent.status });
  }

  const stripeResp = await fetch(`https://api.stripe.com/v1/payment_intents/${tx.stripe_payment_intent}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + STRIPE_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-04-10',
    },
    body: new URLSearchParams({ cancellation_reason: 'requested_by_customer' }).toString()
  });
  const cancelled = await stripeResp.json();
  if (!stripeResp.ok) return res.status(402).json({ error: cancelled.error?.message || 'Annulation Stripe impossible' });

  await fetch(`${SB_URL}/rest/v1/transactions?id=eq.${tx.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ statut: cancelled.status, metadata: { cancelled: true, raison: raison || null, cancelled_at: new Date().toISOString() } })
  }).catch(() => {});

  await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ statut: 'annulee' })
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    livraison_id,
    payment_intent_id: cancelled.id,
    status: cancelled.status,
    stripe_action: 'cancelled_authorization'
  });
};
