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

  const stripeResp = await fetch(`https://api.stripe.com/v1/payment_intents/${tx.stripe_payment_intent}/capture`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + STRIPE_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-04-10',
    }
  });
  const captured = await stripeResp.json();
  if (!stripeResp.ok) return res.status(402).json({ error: captured.error?.message || 'Capture Stripe impossible' });

  await fetch(`${SB_URL}/rest/v1/transactions?id=eq.${tx.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ statut: captured.status, metadata: { captured: true, captured_at: new Date().toISOString() } })
  }).catch(() => {});

  await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ statut: 'payee', livre_le: new Date().toISOString() })
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    livraison_id,
    payment_intent_id: captured.id,
    status: captured.status,
    amount_received: captured.amount_received
  });
};


