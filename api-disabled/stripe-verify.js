// ============================================================
// PORTEÃPORTE â Vercel Function : VÃ©rification paiement Stripe
// Fichier : api/stripe-verify.js
// Usage : VÃ©rifier cÃ´tÃ© serveur qu'un paiement est bien rÃ©ussi
// ============================================================
module.exports = async function handler(req, res) {
  const allow = process.env.ALLOWED_ORIGIN || 'https://porteaporte.site';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-internal-notifier-secret, x-internal-webhook-secret'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'MÃ©thode non autorisÃ©e' });

  const secretCfg = process.env.INTERNAL_API_SECRET;
  if (secretCfg && secretCfg.length >= 16) {
    const provided =
      req.headers['x-internal-notifier-secret'] || req.headers['x-internal-webhook-secret'];
    try {
      const crypto = require('crypto');
      const ba = Buffer.from(String(provided || ''));
      const bb = Buffer.from(secretCfg);
      if (ba.length !== bb.length || !crypto.timingSafeEqual(ba, bb)) {
        return res.status(403).json({ success: false, error: 'Secret interne invalide' });
      }
    } catch {
      return res.status(403).json({ success: false, error: 'Secret interne invalide' });
    }
  }

  const { payment_intent_id } = req.body;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

  if (!STRIPE_KEY) {
    return res.status(500).json({ success: false, error: 'STRIPE_SECRET_KEY manquante' });
  }

  if (!payment_intent_id) {
    return res.status(400).json({ success: false, error: 'payment_intent_id manquant' });
  }

  try {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${payment_intent_id}`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const intent = await stripeRes.json();

    if (!stripeRes.ok) {
      return res.status(400).json({ success: false, error: intent.error?.message });
    }

    const success = intent.status === 'succeeded';
    
    return res.status(200).json({
      success,
      status: intent.status,
      montant: intent.amount,
      devise: intent.currency,
      metadata: intent.metadata,
      recu: intent.charges?.data?.[0]?.receipt_url || null
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
