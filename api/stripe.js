// api/stripe.js - WITH AUDIT LOGGING
const { log } = require('./logger');

async function stripeRequest(method, path, body) {
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const url = `https://api.stripe.com${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const error = await response.json();
    log('ERROR', 'stripe_request_failed', null, {
      method,
      path,
      status: response.status,
      error: error.error?.message,
    });
    throw new Error(error.error?.message || 'Stripe API error');
  }
  return response.json();
}

module.exports = async function handler(req, res) {
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const IS_LIVE = STRIPE_KEY && STRIPE_KEY.startsWith('sk_live_');
  const IS_TEST = STRIPE_KEY && STRIPE_KEY.startsWith('sk_test_');

  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://porteaporte.site');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { action, montant_cents, description, email, user_id } = req.body;

  if (!action) {
    log('WARN', 'stripe_no_action', user_id, { ip: req.headers['x-forwarded-for'] });
    return res.status(400).json({ error: 'Action manquante' });
  }

  if (!STRIPE_KEY) {
    log('ERROR', 'stripe_key_missing', null, {});
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY manquante' });
  }

  try {
    log('INFO', `stripe_${action}_started`, user_id, {
      mode: IS_LIVE ? 'LIVE' : IS_TEST ? 'TEST' : 'UNKNOWN',
      montant: montant_cents,
      email,
    });

    switch (action) {
      // ── CRÉER UN PAYMENT INTENT ──
      case 'create_payment_intent': {
        if (!montant_cents || montant_cents < 50) {
          log('WARN', 'stripe_invalid_amount', user_id, { montant: montant_cents });
          return res.status(400).json({ error: 'Montant invalide (minimum 0,50 $)' });
        }

        const intent = await stripeRequest('POST', '/v1/payment_intents', {
          amount: Math.round(montant_cents),
          currency: 'cad',
          description: description || 'PorteàPorte – Livraison',
          receipt_email: email || '',
          automatic_payment_methods: { enabled: 'true' },
          metadata: {
            user_id: user_id || 'unknown',
            action: action,
          },
        });

        log('AUDIT', 'payment_intent_created', user_id, {
          intentId: intent.id,
          amount: intent.amount,
          status: intent.status,
        });

        return res.json({
          success: true,
          clientSecret: intent.client_secret,
          intentId: intent.id,
        });
      }

      // ── ACHAT COINS ──
      case 'achat_coins': {
        if (!montant_cents || montant_cents < 100) {
          log('WARN', 'stripe_coins_invalid_amount', user_id, { montant: montant_cents });
          return res.status(400).json({ error: 'Montant minimum: 1,00 $' });
        }

        const intent = await stripeRequest('POST', '/v1/payment_intents', {
          amount: montant_cents,
          currency: 'cad',
          description: 'PorteàPorte – Achat de Coins',
          receipt_email: email || '',
          automatic_payment_methods: { enabled: 'true' },
          metadata: {
            user_id,
            action: 'buy_coins',
          },
        });

        log('AUDIT', 'coins_purchase_initiated', user_id, {
          intentId: intent.id,
          amountCents: montant_cents,
          amountCAD: (montant_cents / 100).toFixed(2),
        });

        return res.json({
          success: true,
          clientSecret: intent.client_secret,
          intentId: intent.id,
        });
      }

      // ── LIVRAISON ──
      case 'livraison': {
        if (!montant_cents) {
          log('WARN', 'stripe_delivery_no_amount', user_id, {});
          return res.status(400).json({ error: 'Montant requis' });
        }

        const intent = await stripeRequest('POST', '/v1/payment_intents', {
          amount: montant_cents,
          currency: 'cad',
          description: 'PorteàPorte – Livraison',
          receipt_email: email || '',
          automatic_payment_methods: { enabled: 'true' },
          metadata: {
            user_id,
            action: 'delivery_payment',
          },
        });

        log('AUDIT', 'delivery_payment_initiated', user_id, {
          intentId: intent.id,
          amountCents: montant_cents,
        });

        return res.json({
          success: true,
          clientSecret: intent.client_secret,
          intentId: intent.id,
        });
      }

      default:
        log('WARN', 'stripe_unknown_action', user_id, { action });
        return res.status(400).json({ error: `Action inconnue: ${action}` });
    }

  } catch (error) {
    log('ERROR', `stripe_${action}_failed`, user_id, {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: error.message });
  }
};
