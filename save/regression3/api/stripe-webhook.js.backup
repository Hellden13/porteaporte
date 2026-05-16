// ============================================================
// PORTEÃ€PORTE â€” Webhook Stripe
// Fichier : api/stripe-webhook.js
// ============================================================
// VARIABLE VERCEL REQUISE :
//   STRIPE_WEBHOOK_SECRET = whsec_xxxxxxxxxxxxx
//   STRIPE_SECRET_KEY     = sk_live_xxxxxxxxxxxxx
// ============================================================

const crypto = require('crypto');

function siteOrigin() {
  return process.env.PUBLIC_SITE_ORIGIN || 'https://porteaporte.site';
}

function notifierHeaders() {
  const secret = process.env.INTERNAL_API_SECRET || '';
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-internal-notifier-secret'] = secret;
  return headers;
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
  const txt = await r.text().catch(() => '');
  console.warn('[stripe-webhook] Dedup stripe_webhook_events echouee', r.status, txt);
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET manquant');
    return res.status(500).json({ error: 'Webhook Stripe non configure' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    console.error('Signature webhook manquante');
    return res.status(400).json({ error: 'Signature manquante' });
  }

  const rawBody = await getRawBody(req);

  // VÃ©rifier la signature Stripe pour sÃ©curitÃ©
  if (!verifyStripeSignature(rawBody, signature, WEBHOOK_SECRET)) {
    console.error('Signature webhook invalide');
    return res.status(400).json({ error: 'Signature invalide' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (e) {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  // console.log('Webhook Stripe reÃ§u:', event.type);

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    if (SB_URL && SB_KEY && event.id) {
      const firstTime = await tryClaimStripeEvent(SB_URL, SB_KEY, event.id, event.type);
      if (!firstTime) {
        // console.log('[stripe-webhook] Evenement duplique (ignore):', event.id);
        return res.status(200).json({ received: true, duplicate: true });
      }
    }

    switch (event.type) {

      // â”€â”€ PAIEMENT RÃ‰USSI â”€â”€
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const meta = intent.metadata || {};

        if (meta.type === 'achat_coins') {
          // CrÃ©diter les coins automatiquement
          await creditCoinsFromIntent(intent);
          /*
          await fetch('https://porteaporte.site/api/stripe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-webhook-secret': process.env.INTERNAL_API_SECRET || ''
            },
            body: JSON.stringify({
              action: 'confirmer_coins',
              payment_intent_id: intent.id
            })
          });
          */
        }

        if (meta.type === 'livraison') {
          // Passer le paiement livraison en escrow
          // console.log('Livraison payÃ©e:', meta.livraison_code, 'â€” en escrow');
        }
        break;
      }

      // â”€â”€ PAIEMENT Ã‰CHOUÃ‰ â”€â”€
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const errMsg = intent.last_payment_error?.message || 'Raison inconnue';
        // console.log('Paiement Ã©chouÃ©:', intent.id, errMsg);

        // Notifier l'admin si paiement important
        if (intent.amount > 5000) {
          await fetch(`${siteOrigin()}/api/notifier`, {
            method: 'POST',
            headers: notifierHeaders(),
            body: JSON.stringify({
              type: 'litige',
              data: {
                code: intent.metadata?.livraison_code || intent.id,
                type_litige: 'Paiement Ã©chouÃ©',
                plaignant_email: intent.receipt_email || 'inconnu',
                montant: (intent.amount / 100).toFixed(2),
                description: errMsg
              }
            })
          }).catch(() => {});
        }
        break;
      }

      // â”€â”€ REMBOURSEMENT â”€â”€
      case 'charge.refunded': {
        const charge = event.data.object;
        // console.log('Remboursement effectuÃ©:', charge.id, charge.amount_refunded / 100, '$');
        break;
      }

      // â”€â”€ DISPUTE / LITIGE STRIPE â”€â”€
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        // console.log('DISPUTE STRIPE:', dispute.id, dispute.amount / 100, '$');

        await fetch(`${siteOrigin()}/api/notifier`, {
          method: 'POST',
          headers: notifierHeaders(),
          body: JSON.stringify({
            type: 'litige',
            data: {
              code: dispute.charge,
              type_litige: 'Dispute Stripe â€” ACTION URGENTE',
              plaignant_email: 'stripe@dispute.com',
              montant: (dispute.amount / 100).toFixed(2),
              description: `Dispute Stripe ouverte. Raison: ${dispute.reason}. DÃ©lai rÃ©ponse: 7 jours.`
            }
          })
        }).catch(() => {});
        break;
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Erreur webhook:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Lire le body brut (nÃ©cessaire pour vÃ©rifier la signature Stripe)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// VÃ©rifier signature HMAC Stripe
async function creditCoinsFromIntent(intent) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) throw new Error('Supabase service non configure');

  const meta = intent.metadata || {};
  const coins = parseInt(meta.coins || '0', 10);
  const emailDest = meta.email_destinataire || meta.email_acheteur;
  if (!coins || !emailDest) throw new Error('Metadata achat_coins incomplete');

  const claimRes = await fetch(`${SB_URL}/rest/v1/stripe_credits_applied`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ payment_intent_id: intent.id }),
  });
  if (claimRes.status === 409) {
    // console.log('[stripe-webhook] Credit coins deja applique:', intent.id);
    return;
  }
  if (!claimRes.ok && claimRes.status !== 404) {
    const t = await claimRes.text().catch(() => '');
    console.warn('[stripe-webhook] Claim stripe_credits_applied:', claimRes.status, t);
  }

  const usersRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  if (!usersRes.ok) throw new Error('Lecture utilisateurs Supabase impossible');

  const users = await usersRes.json();
  const user = users.users?.find(u => u.email === emailDest);
  if (!user) throw new Error('Utilisateur destinataire introuvable');

  const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/ajouter_coins`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_user_id: user.id,
      p_montant: coins,
      p_type: 'achat_coins',
      p_description: `Achat ${meta.forfait || ''} - ${coins} PC - Stripe ${intent.id.slice(-8)}`
    })
  });
  if (!rpcRes.ok) throw new Error('Credit PorteCoins impossible');
}

function verifyStripeSignature(payload, sigHeader, secret) {
  try {
    const parts = sigHeader.split(',');
    const tPart = parts.find(p => p.startsWith('t='));
    const v1Part = parts.find(p => p.startsWith('v1='));
    if (!tPart || !v1Part) return false;

    const timestamp = tPart.slice(2);
    const expectedSig = v1Part.slice(3);
    const signedPayload = `${timestamp}.${payload}`;

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

    const computed = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(String(expectedSig), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports.config = { api: { bodyParser: false } };

