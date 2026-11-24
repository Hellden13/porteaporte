const GL = require('../lib/_grand-livre');
const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const { normalizeRole, alertAdmin, siteOrigin, internalHeaders } = require('../lib/_lib');
const { verifierCodeReception, insertAudit } = require('../lib/_codes-livraison');
const { apresCaptureLivraison } = require('../lib/_apres-capture');
const { verifierBadgesAuto, recompenserParrainage } = require('../lib/_recompenses');

// Protection du code de réception (5 essais par livraison) : voir lib/_codes-livraison.js.

async function getSessionUser(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;

  const r = await fetch(sbUrl + '/auth/v1/user', {
    headers: { apikey: sbKey, Authorization: 'Bearer ' + token }
  });
  return r.ok ? r.json() : null;
}

async function isAdmin(userId, sbUrl, sbKey) {
  const r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=role,suspendu`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
  });
  const rows = r.ok ? await r.json() : [];
  return normalizeRole(rows[0]?.role) === 'admin' && !rows[0]?.suspendu;
}

async function stripeRequest(method, path, stripeKey, body, idempotencyKey) {
  const headers = {
    Authorization: 'Bearer ' + stripeKey,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-04-10',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const r = await fetch('https://api.stripe.com' + path, { method, headers, body: body || undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function sbHeaders(sbKey, prefer = 'return=minimal') {
  return {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
    Prefer: prefer
  };
}

async function patchSupabase(url, sbKey, patch) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(sbKey),
    body: JSON.stringify(patch)
  });
  const text = await r.text().catch(() => '');
  return { ok: r.ok, status: r.status, text };
}

async function fetchJson(url, sbKey) {
  const r = await fetch(url, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } });
  const data = await r.json().catch(() => []);
  return { ok: r.ok, status: r.status, data };
}

async function safePatchLivraisonPaid(sbUrl, sbKey, livraisonId, confirmationPatch = {}) {
  const candidates = [
    { statut: 'payee', livre_le: new Date().toISOString(), ...confirmationPatch },
    { statut: 'payee', ...confirmationPatch },
    { statut: 'paid', ...confirmationPatch },
    { statut: 'payee', livre_le: new Date().toISOString() },
    { statut: 'payee' },
    { statut: 'paid' },
    { statut: 'livre', livre_le: new Date().toISOString() }
  ];

  for (const patch of candidates) {
    const r = await patchSupabase(`${sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}`, sbKey, patch);
    if (r.ok) return true;
  }
  return false;
}

// Grand livre réel (montant_cad, meta, stripe_id, cree_le) : voir lib/_grand-livre.js
async function getPaymentTransaction(sbUrl, sbKey, livraisonId) {
  const ctx = { sbUrl, sbKey };
  const id = encodeURIComponent(livraisonId);
  let r = await GL.lire(ctx, `livraison_id=eq.${id}&type=eq.paiement_livraison&order=cree_le.desc&limit=1`);
  if (r.rows[0]) return r.rows[0];
  r = await GL.lire(ctx, `livraison_id=eq.${id}&order=cree_le.desc&limit=1`);
  return r.rows[0] || null;
}

async function insertTransactionIfMissing(sbUrl, sbKey, payload) {
  return GL.ecrire({ sbUrl, sbKey }, payload);
}

function sanitizeEnv(s) {
  let v = (s || '').trim();
  while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1);
  return v.trim();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });

  const STRIPE_KEY = sanitizeEnv(process.env.STRIPE_SECRET_KEY);
  const SB_URL = sanitizeEnv(process.env.SUPABASE_URL);
  const SB_KEY = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);
  if (!STRIPE_KEY) return res.status(503).json({ error: 'Stripe non configure' });
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase non configure' });

  const { livraison_id, recipient_code, admin_override_reason } = req.body || {};
  if (!livraison_id) return res.status(400).json({ error: 'livraison_id requis' });

  /* Longueur minimale du code destinataire pour éviter le brute-force */
  if (recipient_code !== undefined && recipient_code !== null) {
    const codeStr = String(recipient_code).trim();
    if (codeStr.length < 6) {
      return res.status(400).json({ error: 'Code de reception invalide (trop court)' });
    }
  }

  const session = await getSessionUser(req, SB_URL, SB_KEY);
  if (!session && !recipient_code) return res.status(401).json({ error: 'Session ou code destinataire requis' });

  const codeFourni = recipient_code !== undefined && recipient_code !== null && String(recipient_code).trim() !== '';

  const livRes = await fetchJson(
    `${SB_URL}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraison_id)}&select=*&limit=1`,
    SB_KEY
  );
  const livraison = Array.isArray(livRes.data) ? livRes.data[0] : null;
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });

  if (!['livre', 'livree', 'delivered'].includes(livraison.statut)) {
    return res.status(409).json({ error: 'Livraison non livrée: capture Stripe bloquee' });
  }

  const admin = session ? await isAdmin(session.id, SB_URL, SB_KEY) : false;
  const confirmationHash = livraison.recipient_confirmation_hash || livraison.code_reception_hash || null;

  // Code de réception : même vérification partout (5 essais, journal, blocage), voir lib/_codes-livraison.
  let recipientCodeValid = false;
  if (codeFourni && confirmationHash) {
    const v = await verifierCodeReception({ sbUrl: SB_URL, sbKey: SB_KEY, livraison, code: recipient_code, req, acteurId: session?.id });
    if (!v.ok) return res.status(v.status).json(v.body);
    recipientCodeValid = true;
  }

  if (!recipientCodeValid && !admin && livraison.expediteur_id !== session?.id) {
    return res.status(403).json({ error: 'Code destinataire requis pour libérer ce paiement' });
  }

  if (confirmationHash) {
    if (!recipientCodeValid && !admin) {
      return res.status(403).json({
        error: 'Code de reception destinataire invalide. Le paiement reste protégé.'
      });
    }
    if (!recipientCodeValid && admin && !admin_override_reason) {
      return res.status(403).json({
        error: 'Code invalide. En tant qu\'admin, fournis une raison de validation manuelle (admin_override_reason).',
        requires_admin_override: true
      });
    }
  } else if (!admin || !admin_override_reason) {
    return res.status(409).json({
      error: 'Confirmation destinataire requise. Cette livraison n a pas de code de reception; validation admin requise.',
      requires_admin_override: true
    });
  }

  const recipientConfirmationPatch = {
    recipient_confirmed_at: new Date().toISOString(),
    recipient_confirmation_method: recipientCodeValid ? 'recipient_code' : 'admin_override'
  };

  let tx = await getPaymentTransaction(SB_URL, SB_KEY, livraison_id);
  const rawPaymentIntentId = tx?.stripe_payment_intent || livraison.stripe_payment_intent || livraison.payment_intent_id || null;

  // Détecte les placeholders/IDs invalides (ex: 'pi_XXX...', 'pi_TEST...', vides ou trop courts)
  const allowLocalFakeStripeIntent = STRIPE_KEY === 'sk_test_fake123' && /^pi_test_/i.test(String(rawPaymentIntentId || ''));
  const isPlaceholderPI = rawPaymentIntentId && !allowLocalFakeStripeIntent && (
    /pi_X{4,}/i.test(rawPaymentIntentId) ||
    /pi_TEST/i.test(rawPaymentIntentId) ||
    rawPaymentIntentId.length < 20
  );
  const paymentIntentId = isPlaceholderPI ? null : rawPaymentIntentId;

  // FALLBACK : si pas de PI valide mais admin valide → confirmation manuelle sans capture Stripe
  // (cas : livraison test/demo, paiement raté, PI placeholder type 'pi_XXX...')
  if (!paymentIntentId) {
    if (admin) {
      const livraisonUpdated = await safePatchLivraisonPaid(SB_URL, SB_KEY, livraison_id, recipientConfirmationPatch);
      await insertAudit(SB_URL, SB_KEY, {
        livraison_id,
        user_id: livraison.expediteur_id,
        actor_id: session?.id || null,
        event_type: 'manual_confirmation_no_stripe',
        amount_cents: 0,
        currency: 'cad',
        evidence: {
          source: 'api/capture-livraison',
          reason: isPlaceholderPI
            ? 'Placeholder PaymentIntent detected (ex: pi_XXX...). Likely test/demo livraison. Admin manual override.'
            : 'No PaymentIntent found, admin manual override.',
          raw_payment_intent_id: rawPaymentIntentId || null,
          admin_override_reason: admin_override_reason || null
        }
      });
      return res.status(200).json({
        success: true,
        manual_no_stripe: true,
        livraison_id,
        db_updated: livraisonUpdated,
        warning: isPlaceholderPI
          ? `Confirmation manuelle : PaymentIntent placeholder détecté (${rawPaymentIntentId}). Livraison marquée payée sans capture Stripe — aucun fonds réel transféré.`
          : 'Confirmation manuelle sans capture Stripe (PI absent)'
      });
    }
    return res.status(404).json({
      error: isPlaceholderPI
        ? `Cette livraison utilise un PaymentIntent de test (${rawPaymentIntentId}). Aucun vrai paiement Stripe n'a été enregistré. Seul un admin peut la libérer manuellement.`
        : 'PaymentIntent introuvable. Cette livraison n\'a pas de paiement enregistré. Contacte le support pour validation manuelle.',
      contact: 'bonjour@porteaporte.site',
      is_test_livraison: isPlaceholderPI
    });
  }

  const piPath = `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`;
  const existing = await stripeRequest('GET', piPath, STRIPE_KEY);
  if (!existing.ok) {
    return res.status(402).json({ error: existing.data?.error?.message || 'PaymentIntent Stripe introuvable' });
  }

  const intent = existing.data;
  if (intent.metadata?.livraison_id && intent.metadata.livraison_id !== livraison_id) {
    return res.status(409).json({ error: 'PaymentIntent ne correspond pas a cette livraison' });
  }
  if (intent.metadata?.expediteur_id && intent.metadata.expediteur_id !== livraison.expediteur_id) {
    return res.status(409).json({ error: 'PaymentIntent ne correspond pas a cet expéditeur' });
  }

  if (!tx) {
    const createdTx = await insertTransactionIfMissing(SB_URL, SB_KEY, {
      user_id: livraison.expediteur_id,
      livraison_id,
      type: 'paiement_livraison',
      montant: Number((intent.amount || intent.amount_received || 0) / 100),
      statut: intent.status,
      description: 'Transaction reconstruite depuis Stripe avant confirmation reception',
      stripe_payment_intent: intent.id,
      metadata: {
        reconstructed_from_stripe: true,
        reconstructed_at: new Date().toISOString()
      }
    });
    if (createdTx.ok) tx = createdTx.data;
  }

  if (intent.status === 'succeeded') {
    if (tx?.id) {
      await GL.majLignes({ sbUrl: SB_URL, sbKey: SB_KEY }, `id=eq.${encodeURIComponent(tx.id)}`, {
        statut: 'succeeded',
        metadata: { captured: true, reconciled_at: new Date().toISOString() },
      }).catch(() => false);
    }
    const livraisonUpdated = await safePatchLivraisonPaid(SB_URL, SB_KEY, livraison_id, recipientConfirmationPatch);
    return res.status(200).json({
      success: true,
      already_captured: true,
      livraison_id,
      payment_intent_id: intent.id,
      status: intent.status,
      amount_received: intent.amount_received,
      db_updated: livraisonUpdated
    });
  }

  if (intent.status !== 'requires_capture') {
    return res.status(409).json({
      error: 'Paiement Stripe non capturable',
      stripe_status: intent.status
    });
  }
  if (!intent.amount_capturable || intent.amount_capturable <= 0) {
    return res.status(409).json({ error: 'Aucun montant capturable disponible' });
  }

  const capture = await stripeRequest(
    'POST',
    `${piPath}/capture`,
    STRIPE_KEY,
    undefined,
    `capture-livraison-${livraison_id}-${paymentIntentId}`
  );
  const captured = capture.data;
  if (!capture.ok) return res.status(402).json({ error: captured.error?.message || 'Capture Stripe impossible' });

  const txUpdated = tx?.id ? await GL.majLignes({ sbUrl: SB_URL, sbKey: SB_KEY }, `id=eq.${encodeURIComponent(tx.id)}`, {
    statut: captured.status,
    metadata: { captured: true, captured_at: new Date().toISOString(), amount_captured: captured.amount_received },
  }).catch(() => false) : false;

  const livraisonUpdated = await safePatchLivraisonPaid(SB_URL, SB_KEY, livraison_id, recipientConfirmationPatch);

  await insertAudit(SB_URL, SB_KEY, {
    transaction_id: tx?.id || null,
    livraison_id,
    user_id: livraison.expediteur_id,
    actor_id: session?.id || null,
    event_type: 'payment_captured_after_delivery_confirmation',
    amount_cents: captured.amount_received,
    currency: captured.currency || 'cad',
    stripe_payment_intent: captured.id,
    status: captured.status,
    evidence: {
      source: 'api/capture-livraison',
      livraison_status_before_capture: livraison.statut,
      manual_capture: true,
      recipient_code_verified: Boolean(confirmationHash),
      admin_override_reason: admin_override_reason || null
    }
  });

  // Répartition réelle + gain du livreur + virement Stripe Connect + journal : lib/_apres-capture.js
  // (le même code sert à la capture après une preuve de dépôt, dans api/platform.js).
  const { repartition } = await apresCaptureLivraison({ sbUrl: SB_URL, sbKey: SB_KEY, stripeKey: STRIPE_KEY }, livraison, captured);

  // ── Notifier expéditeur + livreur : livraison complète, paiement libéré ──
  try {
    const origin = siteOrigin();
    const notifHeaders = internalHeaders();

    // Récupérer emails expéditeur + livreur
    const ids = [livraison.expediteur_id, livraison.livreur_id].filter(Boolean);
    const profRes = await fetch(
      `${SB_URL}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,email,nom,prenom`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const profiles = profRes.ok ? await profRes.json().catch(() => []) : [];
    const expProfile = profiles.find(p => p.id === livraison.expediteur_id);
    const livProfile = profiles.find(p => p.id === livraison.livreur_id);

    // Le montant du courriel est exactement celui versé (répartition ci-dessus).
    const netCents = (livraison.livreur_id && repartition) ? Math.min(captured.amount_received, repartition.livreurCents) : 0;

    await fetch(`${origin}/api/notifier`, {
      method: 'POST',
      headers: notifHeaders,
      body: JSON.stringify({
        type: 'livraison_complete',
        data: {
          expediteur_email: expProfile?.email,
          livreur_email:    livProfile?.email,
          code:             livraison.code,
          montant_livreur:  (netCents / 100).toFixed(2),
          ville_depart:     livraison.ville_depart,
          ville_arrivee:    livraison.ville_arrivee,
        }
      })
    }).catch(e => console.error('[notifier livraison_complete fetch]', e.message));
  } catch (e) {
    console.error('[livraison_complete notify error]', e.message);
  }

  // ── RÉCOMPENSES : badges dont la condition est remplie (une seule fois chacun) + parrainage ──
  try {
    const ctxR = { sbUrl: SB_URL, sbKey: SB_KEY };
    if (livraison.livreur_id) {
      await verifierBadgesAuto(ctxR, livraison.livreur_id);
      await recompenserParrainage(ctxR, livraison.livreur_id, 'premiere_livraison');
    }
    if (livraison.expediteur_id) {
      await verifierBadgesAuto(ctxR, livraison.expediteur_id);
      await recompenserParrainage(ctxR, livraison.expediteur_id, 'premiere_livraison');
    }
  } catch (e) { console.error('[récompenses]', e.message); }

  // 🎉 Alerte admin (Denis) : livraison capturée avec succès — bonne nouvelle
  alertAdmin(
    `Livraison capturée : ${livraison.code || livraison_id.slice(0,8)}`,
    `Le paiement a été libéré. Le livreur recevra son virement Stripe Connect selon le calendrier configuré.`,
    {
      severity: 'success',
      details: {
        'Livraison': livraison.code || livraison_id.slice(0, 8),
        'Trajet': `${livraison.ville_depart || '?'} → ${livraison.ville_arrivee || '?'}`,
        'Montant capturé': `${((captured.amount_received || captured.amount || 0) / 100).toFixed(2)} $`,
        'Statut Stripe': captured.status || '?'
      },
      cta_url: 'https://porteaporte.site/admin/operations.html',
      cta_label: '🎉 Voir l\'opération →'
    }
  );

  return res.status(200).json({
    success: true,
    livraison_id,
    payment_intent_id: captured.id,
    status: captured.status,
    amount_received: captured.amount_received,
    db_updated: txUpdated && livraisonUpdated
  });
};
