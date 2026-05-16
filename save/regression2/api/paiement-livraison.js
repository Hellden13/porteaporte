// api/paiement-livraison.js - PaymentIntent Stripe escrow pour une livraison.

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const STRIPE_OPEN = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_capture',
  'requires_action',
  'processing',
]);

async function stripeGetPaymentIntent(piId, stripeKey) {
  const r = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}`, {
    headers: {
      Authorization: 'Bearer ' + stripeKey,
      'Stripe-Version': '2024-04-10',
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return null;
  return j;
}

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

  const body = req.body || {};
  const livraisonId = body.livraison_id || body.livraisonId;
  if (!livraisonId) return res.status(400).json({ error: 'livraison_id requis' });

  const livraisonRes = await fetch(
    `${SB_URL}/rest/v1/livraisons?id=eq.${livraisonId}&select=id,code,expediteur_id,livreur_id,prix_total,statut`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    }
  );
  const livraisons = livraisonRes.ok ? await livraisonRes.json() : [];
  const livraison = livraisons[0];

  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });
  if (livraison.expediteur_id !== session.id) {
    return res.status(403).json({ error: 'Seul l expediteur peut payer cette livraison' });
  }

  if (livraison.statut === 'payee' || livraison.statut === 'paid') {
    return res.status(409).json({ error: 'Livraison deja payee' });
  }

  const montantDollars = Number(livraison.prix_total || 0);
  const montantCents = Math.round(montantDollars * 100);
  if (!montantCents || Number.isNaN(montantCents) || montantCents < 50) {
    return res.status(400).json({ error: 'Montant livraison invalide' });
  }

  const colisId = livraison.code || livraison.id;
  const currency = (body.currency || 'cad').toLowerCase();
  const desc = 'Livraison PorteaPorte - ' + colisId;

  try {
    const txListRes = await fetch(
      `${SB_URL}/rest/v1/transactions?livraison_id=eq.${livraison.id}&type=eq.paiement_livraison&select=stripe_payment_intent,created_at&order=created_at.desc&limit=5`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const txRows = txListRes.ok ? await txListRes.json() : [];
    for (const row of txRows) {
      const piId = row.stripe_payment_intent;
      if (!piId) continue;
      const existing = await stripeGetPaymentIntent(piId, STRIPE_KEY);
      if (!existing) continue;
      if (existing.amount === montantCents && existing.currency === currency && STRIPE_OPEN.has(existing.status)) {
        return res.status(200).json({
          success: true,
          client_secret: existing.client_secret,
          payment_intent_id: existing.id,
          montant: montantCents,
          montant_dollars: (montantCents / 100).toFixed(2),
          currency: existing.currency,
          colis_id: colisId,
          livraison_id: livraison.id,
          status: existing.status,
          reused: true,
        });
      }
      if (existing.status === 'succeeded') {
        return res.status(409).json({ error: 'Paiement livraison deja complete pour ce dossier', payment_intent_id: existing.id });
      }
    }

    const params = new URLSearchParams({
      amount: String(montantCents),
      currency,
      description: desc,
      receipt_email: session.email || '',
      'metadata[type]': 'livraison',
      'metadata[plateforme]': 'porteaporte',
      'metadata[colis_id]': colisId,
      'metadata[livraison_id]': livraison.id,
      'metadata[expediteur_id]': session.id,
      'automatic_payment_methods[enabled]': 'true',
      capture_method: 'manual',
    });

    const stripeResp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + STRIPE_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-04-10',
        'Idempotency-Key': `paiement-livraison-${livraison.id}-${montantCents}-${currency}`,
      },
      body: params.toString(),
    });

    const intent = await stripeResp.json();
    if (!stripeResp.ok) {
      console.error('[paiement-livraison] Stripe error:', intent);
      return res.status(402).json({ error: intent.error?.message || 'Erreur Stripe' });
    }

    await fetch(`${SB_URL}/rest/v1/transactions`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        user_id: session.id,
        livraison_id: livraison.id,
        type: 'paiement_livraison',
        montant: montantDollars,
        statut: intent.status,
        description: 'Autorisation escrow livraison ' + colisId,
        stripe_payment_intent: intent.id,
        metadata: {
          capture_method: 'manual',
          client_secret_created: true
        }
      })
    }).catch((err) => console.error('[paiement-livraison] transaction:', err.message));

    await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${livraison.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ statut: 'paiement_autorise' })
    }).catch((err) => console.error('[paiement-livraison] statut:', err.message));

    return res.status(200).json({
      success: true,
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      montant: montantCents,
      montant_dollars: (montantCents / 100).toFixed(2),
      currency: intent.currency,
      colis_id: colisId,
      livraison_id: livraison.id,
      status: intent.status,
    });
  } catch (err) {
    console.error('[paiement-livraison]', err.message);
    return res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
};

