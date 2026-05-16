// api/stripe-webhook.js - WITH AUDIT LOGS
const { log } = require('./logger');

const getRawBody = (req) => {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });
};

function verifyStripeSignature(rawBody, signature, secret) {
  const crypto = require('crypto');
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return `t=${Date.now()},v1=${hash}`.split(',').some(part => {
    const [version, sig] = part.split('=');
    return version === 'v1' && crypto.timingSafeEqual(sig, hash);
  });
}

async function tryClaimStripeEvent(sbUrl, sbKey, eventId, eventType) {
  if (!eventId) return true;
  const r = await fetch(`${sbUrl}/rest/v1/stripe_webhook_events`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ id: eventId, event_type: eventType || '' }),
  });
  if (r.ok) return true;
  if (r.status === 409) return false;
  return true;
}

module.exports = async function handler(req, res) {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!WEBHOOK_SECRET || !SB_URL || !SB_KEY) {
    log('ERROR', 'stripe_webhook_config_missing', null, {
      hasSecret: !!WEBHOOK_SECRET,
      hasSBUrl: !!SB_URL,
      hasSBKey: !!SB_KEY,
    });
    return res.status(503).json({ error: 'Configuration manquante' });
  }

  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      log('WARN', 'stripe_webhook_no_signature', null, {
        remoteIp: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      });
      return res.status(400).json({ error: 'Signature manquante' });
    }

    const rawBody = await getRawBody(req);

    // Vérifier signature
    if (!verifyStripeSignature(rawBody, signature, WEBHOOK_SECRET)) {
      log('WARN', 'stripe_webhook_invalid_signature', null, {
        remoteIp: req.headers['x-forwarded-for'],
      });
      return res.status(400).json({ error: 'Signature invalide' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch (e) {
      log('ERROR', 'stripe_webhook_json_parse_failed', null, {
        error: e.message,
      });
      return res.status(400).json({ error: 'JSON invalide' });
    }

    // Log reçu avec idempotence check
    log('INFO', 'stripe_webhook_received', null, {
      eventType: event.type,
      eventId: event.id,
    });

    // Vérifier idempotence
    if (event.id) {
      const firstTime = await tryClaimStripeEvent(SB_URL, SB_KEY, event.id, event.type);
      if (!firstTime) {
        log('INFO', 'stripe_webhook_duplicate', null, {
          eventId: event.id,
          eventType: event.type,
        });
        return res.json({ received: true, duplicate: true });
      }
    }

    // Traiter les events
    switch (event.type) {
      case 'payment_intent.succeeded':
        log('AUDIT', 'payment_succeeded', null, {
          eventId: event.id,
          amount: event.data.object.amount,
          currency: event.data.object.currency,
          customerId: event.data.object.customer,
        });
        // TODO: Update DB livraison status
        break;

      case 'payment_intent.payment_failed':
        log('AUDIT', 'payment_failed', null, {
          eventId: event.id,
          amount: event.data.object.amount,
          failureReason: event.data.object.last_payment_error?.message,
        });
        // TODO: Notify user
        break;

      case 'charge.refunded':
        log('AUDIT', 'payment_refunded', null, {
          eventId: event.id,
          chargeId: event.data.object.id,
          refundedAmount: event.data.object.amount_refunded,
        });
        // TODO: Update DB livraison status
        break;

      default:
        log('INFO', 'stripe_webhook_unhandled_event', null, {
          eventType: event.type,
          eventId: event.id,
        });
    }

    log('AUDIT', 'stripe_webhook_processed', null, {
      eventType: event.type,
      eventId: event.id,
      status: 'success',
    });

    return res.json({ received: true });

  } catch (error) {
    log('ERROR', 'stripe_webhook_failed', null, {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: error.message });
  }
};
