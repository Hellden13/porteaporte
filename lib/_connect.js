// api/_connect.js — Stripe Connect Express + Abonnements PorteaPorte
'use strict';

const { sbHeaders, sanitizeEnv, roleIn } = require('./_lib');

// ─── Helper Stripe Connect ────────────────────────────────────────────────────

async function stripeConnectRequest(method, path, body, secretKey, connectedAccountId) {
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-04-10',
  };
  if (connectedAccountId) headers['Stripe-Account'] = connectedAccountId;
  const options = { method, headers };
  if (body && method !== 'GET') options.body = new URLSearchParams(body).toString();
  const r    = await fetch(`https://api.stripe.com${path}`, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `Stripe ${r.status}`);
  return data;
}

// ─── Onboarding Express ───────────────────────────────────────────────────────

async function stripeConnectOnboard(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['livreur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const uid   = ctx.session.id;
  const sbUrl = ctx.sbUrl;
  const sbKey = ctx.sbKey;

  const existing = await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}&select=*`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  let stripeAccountId = existing[0]?.stripe_account_id;

  if (!stripeAccountId) {
    const profileRows = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${uid}&select=email,prenom,nom`, {
      headers: sbHeaders(sbKey)
    }).then(r => r.ok ? r.json() : []);
    const email = profileRows[0]?.email || ctx.session.email || '';

    const account = await stripeConnectRequest('POST', '/v1/accounts', {
      type: 'express',
      country: 'CA',
      email,
      'capabilities[card_payments][requested]': 'true',
      'capabilities[transfers][requested]': 'true',
      'settings[payouts][schedule][interval]': 'weekly',
      'settings[payouts][schedule][weekly_anchor]': 'friday',
    }, ctx.stripeKey);

    stripeAccountId = account.id;

    await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts`, {
      method: 'POST',
      headers: sbHeaders(sbKey),
      body: JSON.stringify({
        user_id: uid,
        stripe_account_id: stripeAccountId,
        status: 'pending',
        country: 'CA',
      })
    });
  }

  const baseUrl = (process.env.BASE_URL || 'https://porteaporte.site').trim().replace(/\/+$/, '');
  const accountLink = await stripeConnectRequest('POST', '/v1/account_links', {
    account:     stripeAccountId,
    refresh_url: `${baseUrl}/dashboard-livreur.html?stripe=refresh`,
    return_url:  `${baseUrl}/dashboard-livreur.html?stripe=success`,
    type: 'account_onboarding',
  }, ctx.stripeKey);

  return res.status(200).json({
    success: true,
    onboarding_url: accountLink.url,
    stripe_account_id: stripeAccountId,
  });
}

// ─── Statut compte + solde ────────────────────────────────────────────────────

async function stripeConnectStatus(req, res, ctx) {
  if (!roleIn(ctx.profile, ['livreur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }

  const uid   = ctx.session.id;
  const sbUrl = ctx.sbUrl;
  const sbKey = ctx.sbKey;

  const rows = await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}&select=*`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  const account = rows[0] || null;

  const balRows = await fetch(`${sbUrl}/rest/v1/v_livreur_balance?user_id=eq.${uid}`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  const balance = balRows[0] || { balance_available: 0, balance_pending: 0, total_earned: 0, total_transferred: 0 };

  const payouts = await fetch(`${sbUrl}/rest/v1/payout_requests?user_id=eq.${uid}&order=requested_at.desc&limit=10&select=*`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  if (account?.stripe_account_id && ctx.stripeKey) {
    try {
      const stripeAcct = await stripeConnectRequest('GET', `/v1/accounts/${account.stripe_account_id}`, null, ctx.stripeKey);
      const newStatus = stripeAcct.charges_enabled && stripeAcct.payouts_enabled ? 'active'
                      : stripeAcct.details_submitted ? 'onboarding'
                      : 'pending';
      if (newStatus !== account.status) {
        await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}`, {
          method: 'PATCH',
          headers: sbHeaders(sbKey, 'return=minimal'),
          body: JSON.stringify({
            status:            newStatus,
            charges_enabled:   stripeAcct.charges_enabled,
            payouts_enabled:   stripeAcct.payouts_enabled,
            details_submitted: stripeAcct.details_submitted,
          })
        });
        account.status          = newStatus;
        account.charges_enabled = stripeAcct.charges_enabled;
        account.payouts_enabled = stripeAcct.payouts_enabled;
      }
    } catch (_) { /* Silencieux si Stripe inaccessible */ }
  }

  return res.status(200).json({
    success: true,
    account: account || null,
    balance: {
      available:    parseFloat(balance.balance_available || 0),
      pending:      parseFloat(balance.balance_pending   || 0),
      total_earned: parseFloat(balance.total_earned      || 0),
      transferred:  parseFloat(balance.total_transferred || 0),
    },
    recent_payouts: payouts,
  });
}

// ─── Lien dashboard Express ───────────────────────────────────────────────────

async function stripeConnectDashboard(req, res, ctx) {
  if (!roleIn(ctx.profile, ['livreur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const uid  = ctx.session.id;
  const rows = await fetch(`${ctx.sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}&select=stripe_account_id,status`, {
    headers: sbHeaders(ctx.sbKey)
  }).then(r => r.ok ? r.json() : []);

  if (!rows.length || !rows[0].stripe_account_id) {
    return res.status(404).json({ error: 'Compte Stripe non configure' });
  }
  if (rows[0].status !== 'active') {
    return res.status(400).json({ error: 'Compte non encore actif' });
  }

  const link = await stripeConnectRequest('POST', `/v1/accounts/${rows[0].stripe_account_id}/login_links`, {}, ctx.stripeKey);
  return res.status(200).json({ success: true, url: link.url });
}

// ─── Virement vers le livreur ─────────────────────────────────────────────────

async function stripeConnectPayout(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['livreur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const uid   = ctx.session.id;
  const sbUrl = ctx.sbUrl;
  const sbKey = ctx.sbKey;

  const acctRows = await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}&select=*`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  const account = acctRows[0];
  if (!account?.stripe_account_id)  return res.status(400).json({ error: 'Configure ton compte de paiement d\'abord' });
  if (!account.payouts_enabled)     return res.status(400).json({ error: 'Ton compte Stripe n\'est pas encore actif' });

  const earningRows = await fetch(
    `${sbUrl}/rest/v1/livreur_earnings?user_id=eq.${uid}&status=eq.available&available_after=lte.${new Date().toISOString()}&select=*`,
    { headers: sbHeaders(sbKey) }
  ).then(r => r.ok ? r.json() : []);

  const totalNet = earningRows.reduce((s, e) => s + parseFloat(e.net_amount || 0), 0);
  const MINIMUM  = 10;

  if (totalNet < MINIMUM) {
    return res.status(400).json({
      error: `Solde insuffisant. Minimum ${MINIMUM} $ requis (disponible: ${totalNet.toFixed(2)} $)`
    });
  }

  const amountCents = Math.floor(totalNet * 100);
  const earningIds  = earningRows.map(e => e.id);

  let transfer;
  try {
    transfer = await stripeConnectRequest('POST', '/v1/transfers', {
      amount:      amountCents,
      currency:    'cad',
      destination: account.stripe_account_id,
      description: `Gains PorteaPorte — ${new Date().toLocaleDateString('fr-CA')}`,
    }, ctx.stripeKey);
  } catch (e) {
    return res.status(502).json({ error: 'Erreur Stripe : ' + e.message });
  }

  await Promise.all(earningIds.map(id =>
    fetch(`${sbUrl}/rest/v1/livreur_earnings?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders(sbKey, 'return=minimal'),
      body: JSON.stringify({ status: 'transferred', stripe_transfer_id: transfer.id })
    })
  ));

  const payoutRow = {
    user_id:            uid,
    amount_cents:       amountCents,
    currency:           'cad',
    status:             'processing',
    stripe_transfer_id: transfer.id,
    requested_at:       new Date().toISOString(),
  };
  await fetch(`${sbUrl}/rest/v1/payout_requests`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify(payoutRow)
  });

  await fetch(`${sbUrl}/rest/v1/notifications`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify({
      user_id: uid,
      type: 'system',
      title: 'Virement en cours',
      message: `${(amountCents / 100).toFixed(2)} $ ont ete envoyes a ton compte bancaire. Arrive sous 2 jours ouvrables.`,
    })
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    amount:      amountCents / 100,
    currency:    'cad',
    transfer_id: transfer.id,
    message:     `Virement de ${(amountCents / 100).toFixed(2)} $ initie avec succes.`,
  });
}

// ─── Historique des gains livreur ─────────────────────────────────────────────

async function livreurEarnings(req, res, ctx) {
  if (!roleIn(ctx.profile, ['livreur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }

  const uid   = ctx.session.id;
  const limit = 50;

  const rows = await fetch(
    `${ctx.sbUrl}/rest/v1/livreur_earnings?user_id=eq.${uid}&order=created_at.desc&limit=${limit}&select=*`,
    { headers: sbHeaders(ctx.sbKey) }
  ).then(r => r.ok ? r.json() : []);

  return res.status(200).json({ success: true, earnings: rows, total: rows.length });
}

// ─── Abonnements ──────────────────────────────────────────────────────────────

async function subscriptionCreate(req, res, ctx) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  const body  = req.body || {};
  const plan  = String(body.plan || '');
  const PLANS = { conducteur_pro: 'STRIPE_PRICE_PRO', marchand_local: 'STRIPE_PRICE_MARCHAND' };
  if (!PLANS[plan]) return res.status(400).json({ error: 'Plan invalide.' });

  const priceId   = process.env[PLANS[plan]];
  const stripeKey = sanitizeEnv(process.env.STRIPE_SECRET_KEY);
  if (!priceId)   return res.status(503).json({ error: 'Ce plan n\'est pas encore disponible.' });
  if (!stripeKey) return res.status(500).json({ error: 'Paiement temporairement indisponible.' });

  const profileRows = await fetch(
    `${ctx.sbUrl}/rest/v1/profiles?id=eq.${ctx.session.id}&select=email,prenom,nom,stripe_customer_id`,
    { headers: sbHeaders(ctx.sbKey) }
  ).then(r => r.ok ? r.json() : []).catch(() => []);
  const profile = profileRows[0] || {};

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const custRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: profile.email || '',
        name: [profile.prenom, profile.nom].filter(Boolean).join(' ') || '',
        'metadata[supabase_id]': ctx.session.id,
      }).toString()
    }).catch(() => null);
    if (custRes?.ok) {
      const cust = await custRes.json();
      customerId = cust.id;
      await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${ctx.session.id}`, {
        method: 'PATCH',
        headers: sbHeaders(ctx.sbKey, 'return=minimal'),
        body: JSON.stringify({ stripe_customer_id: customerId })
      }).catch(() => {});
    }
  }

  const baseUrl = (process.env.BASE_URL || 'https://porteaporte.site').trim().replace(/\/+$/, '');
  const params  = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${baseUrl}/abonnements.html?success=1&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/abonnements.html?cancel=1`,
    'metadata[supabase_id]': ctx.session.id,
    'metadata[plan]': plan,
    'subscription_data[metadata][supabase_id]': ctx.session.id,
    'subscription_data[metadata][plan]': plan,
  });
  if (customerId) params.set('customer', customerId);

  const sessRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  }).catch(() => null);

  if (!sessRes?.ok) {
    const err = sessRes ? await sessRes.json().catch(() => ({})) : {};
    return res.status(500).json({ error: err.error?.message || 'Impossible de créer la session de paiement.' });
  }
  const sess = await sessRes.json();
  return res.status(200).json({ url: sess.url });
}

async function subscriptionStatus(req, res, ctx) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  const body      = req.body || {};
  const sessionId = body.session_id || req.query?.session_id || null;
  const stripeKey = sanitizeEnv(process.env.STRIPE_SECRET_KEY);

  if (sessionId && stripeKey) {
    const sessRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
      { headers: { Authorization: `Bearer ${stripeKey}` } }
    ).catch(() => null);
    if (sessRes?.ok) {
      const sess = await sessRes.json().catch(() => ({}));
      if (sess.payment_status === 'paid' && sess.subscription) {
        const sub  = typeof sess.subscription === 'object' ? sess.subscription : {};
        const plan = sess.metadata?.plan || null;
        await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${ctx.session.id}`, {
          method: 'PATCH',
          headers: sbHeaders(ctx.sbKey, 'return=minimal'),
          body: JSON.stringify({
            subscription_plan:   plan,
            subscription_status: sub.status || 'active',
            subscription_end_at: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString() : null,
            stripe_customer_id:  sub.customer || null,
          })
        }).catch(() => {});
        return res.status(200).json({
          active: sub.status === 'active',
          plan,
          current_period_end: sub.current_period_end || null,
        });
      }
    }
  }

  const rows = await fetch(
    `${ctx.sbUrl}/rest/v1/profiles?id=eq.${ctx.session.id}&select=subscription_plan,subscription_status,subscription_end_at`,
    { headers: sbHeaders(ctx.sbKey) }
  ).then(r => r.ok ? r.json() : []).catch(() => []);
  const p = rows[0] || {};
  return res.status(200).json({
    active: p.subscription_status === 'active',
    plan:   p.subscription_plan   || null,
    current_period_end: p.subscription_end_at || null,
  });
}

module.exports = {
  stripeConnectRequest,
  stripeConnectOnboard,
  stripeConnectStatus,
  stripeConnectDashboard,
  stripeConnectPayout,
  livreurEarnings,
  subscriptionCreate,
  subscriptionStatus,
};
