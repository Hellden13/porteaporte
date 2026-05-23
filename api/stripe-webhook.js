/**
 * api/stripe-webhook.js
 * Vercel serverless — webhook Stripe (events Connect)
 * Variables requises : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *                      SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function sbH(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
}

async function sbPatch(url, key, table, filter, body) {
  return fetch(`${url}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: sbH(key), body: JSON.stringify(body) });
}
async function sbPost(url, key, table, body) {
  return fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: sbH(key), body: JSON.stringify(body) });
}
async function sbGet(url, key, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: sbH(key) });
  return r.ok ? r.json() : [];
}

/* Verification signature Stripe (HMAC-SHA256) */
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  const parts = sigHeader.split(',');
  const ts    = parts.find(p => p.startsWith('t=')).slice(2);
  const v1    = parts.find(p => p.startsWith('v1=')).slice(3);

  const enc     = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(`${ts}.${rawBody}`);

  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig       = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const computed  = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== v1) throw new Error('Signature invalide');

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts)) > 300) throw new Error('Webhook expire');
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Methode non autorisee' });

  const _san = s => { let v = (s || '').trim(); while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1); return v.trim(); };
  const sbUrl    = _san(process.env.SUPABASE_URL);
  const sbKey    = _san(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
  const whSecret = _san(process.env.STRIPE_WEBHOOK_SECRET);

  if (!whSecret) return res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET non configure' });

  /* Lire le body brut */
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody  = Buffer.concat(chunks).toString('utf8');
  const sigHeader = req.headers['stripe-signature'];

  try {
    await verifyStripeSignature(rawBody, sigHeader, whSecret);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'JSON invalide' }); }

  const type = event.type;
  const obj  = event.data?.object;

  /* ── account.updated ───────────────────────────────────── */
  if (type === 'account.updated') {
    const acctId = obj.id;
    const status =
      obj.charges_enabled && obj.payouts_enabled ? 'active'
      : obj.details_submitted ? 'onboarding'
      : 'pending';

    await sbPatch(sbUrl, sbKey, 'stripe_connect_accounts',
      `stripe_account_id=eq.${acctId}`,
      {
        status,
        charges_enabled:   obj.charges_enabled   || false,
        payouts_enabled:   obj.payouts_enabled    || false,
        details_submitted: obj.details_submitted  || false,
      });

    /* Notification in-app si compte activé */
    if (status === 'active') {
      const rows = await sbGet(sbUrl, sbKey, `stripe_connect_accounts?stripe_account_id=eq.${acctId}&select=user_id`);
      if (rows.length) {
        await sbPost(sbUrl, sbKey, 'notifications', {
          user_id: rows[0].user_id,
          type: 'system',
          title: 'Paiements activés !',
          message: 'Ton compte Stripe est maintenant actif. Tu peux recevoir des virements.',
        }).catch(() => {});
      }
    }
  }

  /* ── transfer.created ──────────────────────────────────── */
  /* Virement créé vers le compte connecté livreur            */
  if (type === 'transfer.created') {
    await sbPatch(sbUrl, sbKey, 'payout_requests',
      `stripe_transfer_id=eq.${obj.id}`,
      { status: 'paid', processed_at: new Date().toISOString() });
  }

  /* ── transfer.reversed ──────────────────────────────────── */
  /* Virement annulé / remboursé                              */
  if (type === 'transfer.reversed') {
    await sbPatch(sbUrl, sbKey, 'payout_requests',
      `stripe_transfer_id=eq.${obj.id}`,
      { status: 'failed', failure_reason: 'Virement inversé par Stripe', processed_at: new Date().toISOString() });

    /* Remettre les gains en available */
    await sbPatch(sbUrl, sbKey, 'livreur_earnings',
      `stripe_transfer_id=eq.${obj.id}`,
      { status: 'available', stripe_transfer_id: null });
  }

  /* ── payout.paid ────────────────────────────────────────── */
  /* Virement arrivé sur le compte bancaire du livreur        */
  if (type === 'payout.paid') {
    await sbPatch(sbUrl, sbKey, 'payout_requests',
      `stripe_transfer_id=eq.${obj.id}`,
      { status: 'paid', processed_at: new Date().toISOString() });
  }

  /* ── payout.failed ──────────────────────────────────────── */
  /* Échec du virement bancaire                               */
  if (type === 'payout.failed') {
    await sbPatch(sbUrl, sbKey, 'payout_requests',
      `stripe_transfer_id=eq.${obj.id}`,
      { status: 'failed', failure_reason: obj.failure_message || 'Echec virement bancaire', processed_at: new Date().toISOString() });

    await sbPatch(sbUrl, sbKey, 'livreur_earnings',
      `stripe_transfer_id=eq.${obj.id}`,
      { status: 'available', stripe_transfer_id: null });
  }

  /* ── customer.subscription.created / updated ───────────── */
  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    const supabaseId = obj.metadata?.supabase_id;
    if (supabaseId) {
      const plan   = obj.metadata?.plan || null;
      const status = obj.status || 'active';
      const endAt  = obj.current_period_end
        ? new Date(obj.current_period_end * 1000).toISOString()
        : null;
      await sbPatch(sbUrl, sbKey, 'profiles', `id=eq.${supabaseId}`, {
        subscription_plan:   status === 'active' ? plan : null,
        subscription_status: status,
        subscription_end_at: endAt,
        stripe_customer_id:  obj.customer || null,
      }).catch(() => {});
    }
  }

  /* ── customer.subscription.deleted ─────────────────────── */
  if (type === 'customer.subscription.deleted') {
    const supabaseId = obj.metadata?.supabase_id;
    if (supabaseId) {
      await sbPatch(sbUrl, sbKey, 'profiles', `id=eq.${supabaseId}`, {
        subscription_plan:   null,
        subscription_status: 'canceled',
        subscription_end_at: obj.current_period_end
          ? new Date(obj.current_period_end * 1000).toISOString()
          : null,
      }).catch(() => {});
    }
  }

  return res.status(200).json({ received: true, type });
};