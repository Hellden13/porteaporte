// api/_connect.js — Stripe Connect Express + Abonnements PorteàPorte
'use strict';

const { sbHeaders, sanitizeEnv, roleIn, isVerifiedDriver } = require('./_lib');
const V = require('./_virements');

// ─── Helper Stripe Connect ────────────────────────────────────────────────────

async function stripeConnectRequest(method, path, body, secretKey, connectedAccountId, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-04-10',
  };
  if (connectedAccountId) headers['Stripe-Account'] = connectedAccountId;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
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
  if (!isVerifiedDriver(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Vérification livreur requise avant de configurer les paiements.' });
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
    refresh_url: `${baseUrl}/conducteur-paiements.html?stripe=refresh`,
    return_url:  `${baseUrl}/conducteur-paiements.html?stripe=success`,
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
  if (!isVerifiedDriver(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Vérification livreur requise avant les paiements.' });
  }

  const uid   = ctx.session.id;
  const sbUrl = ctx.sbUrl;
  const sbKey = ctx.sbKey;

  const rows = await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}&select=*`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  const account = rows[0] || null;

  // Solde calculé à partir des gains : seuls les gains d'un paiement réellement prélevé sont « disponibles ».
  const gainRows = await fetch(`${sbUrl}/rest/v1/livreur_earnings?user_id=eq.${uid}&select=net_amount,status,available_after,stripe_payment_intent`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);
  const solde = V.soldeLivreur(gainRows);
  const balance = { balance_available: solde.available, balance_pending: solde.pending, total_earned: solde.total_earned, total_transferred: solde.transferred, a_verifier: solde.a_verifier };

  const payouts = await fetch(`${sbUrl}/rest/v1/payout_requests?user_id=eq.${uid}&order=requested_at.desc&limit=10&select=*`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  let migrationDetected = false;
  if (account?.stripe_account_id && ctx.stripeKey) {
    try {
      const stripeAcct = await stripeConnectRequest('GET', `/v1/accounts/${account.stripe_account_id}`, null, ctx.stripeKey);
      const newStatus = V.statutDepuisStripe(stripeAcct);
      // Statut seulement : la table n'a pas de colonnes payouts_enabled / charges_enabled / details_submitted.
      if (newStatus && newStatus !== account.status) {
        await V.ecrireStatutConnect(ctx, `user_id=eq.${uid}`, newStatus);
        account.status = newStatus;
      }
      // Pour l'écran seulement (jamais écrit en base).
      account.charges_enabled   = !!stripeAcct.charges_enabled;
      account.payouts_enabled   = !!stripeAcct.payouts_enabled;
      account.details_submitted = !!stripeAcct.details_submitted;
    } catch (e) {
      // Détecte migration TEST→LIVE : nettoie l'ancien compte
      if (String(e.message || '').includes('No such account') || String(e.message || '').includes('resource_missing')) {
        await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}`, {
          method: 'DELETE', headers: sbHeaders(sbKey)
        }).catch(() => {});
        migrationDetected = true;
      }
    }
  }

  if (migrationDetected) {
    return res.status(200).json({
      success: true,
      account: null,
      balance: { available: parseFloat(balance.balance_available || 0), pending: 0, total_earned: parseFloat(balance.total_earned || 0), transferred: parseFloat(balance.total_transferred || 0) },
      recent_payouts: payouts,
      migration_notice: 'Ton ancien compte Stripe (mode TEST) a été nettoyé. Clique "⚡ Configurer mes paiements" pour créer ton vrai compte LIVE.'
    });
  }

  return res.status(200).json({
    success: true,
    account: account || null,
    balance: {
      available:    parseFloat(balance.balance_available || 0),
      a_verifier:   parseFloat(balance.a_verifier || 0),
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
  if (!isVerifiedDriver(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Vérification livreur requise avant les paiements.' });
  }
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const uid  = ctx.session.id;
  const rows = await fetch(`${ctx.sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}&select=stripe_account_id,status`, {
    headers: sbHeaders(ctx.sbKey)
  }).then(r => r.ok ? r.json() : []);

  if (!rows.length || !rows[0].stripe_account_id) {
    return res.status(404).json({ error: 'Compte Stripe non configuré. Clique "⚡ Configurer mes paiements" d\'abord.' });
  }

  const stripeAccountId = rows[0].stripe_account_id;
  const baseUrl = (process.env.BASE_URL || 'https://porteaporte.site').trim().replace(/\/+$/, '');

  // Si compte actif → login_link (accès au dashboard Stripe Express)
  // Si compte en cours → account_link pour CONTINUER l'onboarding
  if (rows[0].status === 'active') {
    try {
      const link = await stripeConnectRequest('POST', `/v1/accounts/${stripeAccountId}/login_links`, {}, ctx.stripeKey);
      return res.status(200).json({ success: true, url: link.url, type: 'login' });
    } catch (e) {
      // Fallback : si login_link échoue, on tente account_link
      if (String(e.message).includes('No such account')) {
        await fetch(`${ctx.sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}`, {
          method: 'DELETE', headers: sbHeaders(ctx.sbKey)
        }).catch(() => {});
        return res.status(400).json({ error: 'Compte introuvable chez Stripe. Reconfigurer.', action_required: 'onboarding' });
      }
    }
  }

  // Compte pas encore actif → renvoyer un account_link pour continuer l'onboarding
  try {
    const accountLink = await stripeConnectRequest('POST', '/v1/account_links', {
      account:     stripeAccountId,
      refresh_url: `${baseUrl}/conducteur-paiements.html?stripe=refresh`,
      return_url:  `${baseUrl}/conducteur-paiements.html?stripe=success`,
      type: 'account_onboarding',
    }, ctx.stripeKey);
    return res.status(200).json({ success: true, url: accountLink.url, type: 'onboarding', message: 'Ton compte Stripe nécessite encore des informations. Continue la configuration.' });
  } catch (e) {
    return res.status(502).json({ error: 'Stripe inaccessible : ' + e.message });
  }
}

// ─── Virement vers le livreur ─────────────────────────────────────────────────

async function stripeConnectPayout(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['livreur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  if (!isVerifiedDriver(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Vérification livreur requise avant de retirer des gains.' });
  }
  if (!ctx.stripeKey) return res.status(503).json({ error: 'Stripe non configure' });

  const uid   = ctx.session.id;
  const sbUrl = ctx.sbUrl;
  const sbKey = ctx.sbKey;

  const acctRows = await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}&select=*`, {
    headers: sbHeaders(sbKey)
  }).then(r => r.ok ? r.json() : []);

  const account = acctRows[0];
  if (!account?.stripe_account_id) {
    return res.status(400).json({
      error: 'Compte Stripe non configuré. Clique "⚡ Configurer mes paiements Stripe" sur ton dashboard pour démarrer.',
      action_required: 'onboarding',
      action_endpoint: 'stripe-connect-onboard'
    });
  }

  // ─── Auto-recovery : vérifier que le compte existe TOUJOURS sur Stripe ───
  // Si Stripe passé de TEST à LIVE, les anciens comptes TEST n'existent plus.
  let acctCheck = null;
  try {
    acctCheck = await V.lireCompteStripe(ctx.stripeKey, account.stripe_account_id);
    if (!acctCheck?.id) throw new Error('account_check_failed');
    // Statut seulement : la table n'a pas de colonnes payouts_enabled / charges_enabled.
    const nouveau = V.statutDepuisStripe(acctCheck);
    if (nouveau && nouveau !== account.status) {
      await V.ecrireStatutConnect(ctx, `user_id=eq.${uid}`, nouveau);
      account.status = nouveau;
    }
  } catch (e) {
    // Le compte n'existe plus sur Stripe (probablement TEST→LIVE) → on nettoie + force re-onboarding
    if (String(e.message).includes('No such account') || String(e.message).includes('resource_missing') || e.code === 'resource_missing' || String(e.message).includes('account_check_failed')) {
      await fetch(`${sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${uid}`, {
        method: 'DELETE', headers: sbHeaders(sbKey)
      }).catch(() => {});
      return res.status(400).json({
        error: 'Ton ancien compte Stripe n\'est plus accessible (probablement parce qu\'on est passés en mode LIVE). On a réinitialisé ta config — clique "⚡ Configurer mes paiements Stripe" pour créer ton vrai compte LIVE.',
        action_required: 'reonboarding',
        action_endpoint: 'stripe-connect-onboard',
        reason: 'account_migrated_test_to_live'
      });
    }
    return res.status(503).json({ error: 'Vérification du compte Stripe impossible pour le moment. Réessaie dans quelques minutes.' });
  }

  if (!acctCheck.payouts_enabled) {
    return res.status(400).json({
      error: 'Ton compte Stripe n\'est pas encore actif. Termine ta configuration (vérification identité + compte bancaire) sur Stripe pour activer les virements.',
      action_required: 'complete_onboarding',
      action_endpoint: 'stripe-connect-onboard'
    });
  }

  // Minimum configurable via platform_settings.payout_min_cad (default 5$)
  let MINIMUM = 5;
  try {
    const sr = await fetch(`${sbUrl}/rest/v1/platform_settings?id=eq.default&select=payout_min_cad`, {
      headers: sbHeaders(sbKey)
    });
    if (sr.ok) {
      const rows = await sr.json();
      if (rows[0]?.payout_min_cad != null) MINIMUM = Number(rows[0].payout_min_cad) || 5;
    }
  } catch (_) {}

  // Un virement par paiement source, borné par sa charge (lib/_virements.js).
  let r;
  try {
    r = await V.verserGainsLivreur(ctx, uid, account.stripe_account_id, { minimum: MINIMUM });
  } catch (e) {
    return res.status(503).json({ error: 'Lecture des gains impossible pour le moment : ' + e.message });
  }
  const $ = (c) => (c / 100).toFixed(2);
  if (r.code === 'solde_insuffisant') {
    return res.status(400).json({
      error: `Solde insuffisant. Minimum ${MINIMUM} $ requis pour un virement (disponible: ${$(r.totalCents)} $). Les petits virements coûtent cher en frais Stripe.`,
      disponible: r.totalCents / 100,
      a_verifier: r.sansPaiement,
    });
  }
  if (!r.ok) {
    return res.status(502).json({ error: 'Erreur Stripe : ' + r.echecs.map((x) => x.erreur).join(' ; '), echecs: r.echecs.length });
  }
  const verseCents = r.reussis.reduce((t, x) => t + x.cents, 0);

  await fetch(`${sbUrl}/rest/v1/notifications`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify({
      // Colonnes réelles : notif_type, title, body (pas type / message)
      user_id: uid,
      notif_type: 'system',
      title: 'Virement en cours',
      body: `${$(verseCents)} $ ont été envoyés à ton compte bancaire. Arrivée sous 2 jours ouvrables.`,
    })
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    partiel: r.code === 'partiel',
    amount:      verseCents / 100,
    currency:    'cad',
    transfer_ids: r.reussis.map((x) => x.transfer_id),
    transfer_id: r.reussis[0].transfer_id,
    echecs:      r.echecs.length,
    message:     r.code === 'partiel'
      ? `Virement de ${$(verseCents)} $ initie. ${r.echecs.length} paiement(s) n'ont pas pu etre verses ; l'admin est avise.`
      : `Virement de ${$(verseCents)} $ initie avec succes.`,
  });
}

// ─── Historique des gains livreur ─────────────────────────────────────────────

async function livreurEarnings(req, res, ctx) {
  if (!roleIn(ctx.profile, ['livreur', 'les deux', 'admin'])) {
    return res.status(403).json({ error: 'Role livreur requis' });
  }
  if (!isVerifiedDriver(ctx.session, ctx.profile)) {
    return res.status(403).json({ error: 'Vérification livreur requise avant de voir les gains.' });
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
  // Plans Pro fermés (test complet, point 3) : aucun avantage promis (priorité, frais offerts, commission
  // réduite) n'est appliqué par le code. On ne vend pas un abonnement dont les avantages n'existent pas.
  // Décision de Denis requise avant de les rouvrir. Aucun abonné actif au 22 nov. 2026.
  if (process.env.PAP_PLANS_PRO_OUVERTS !== 'oui') {
    return res.status(503).json({ error: 'Les plans Pro ne sont pas encore offerts. Aucun montant n’a été prélevé.' });
  }
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
