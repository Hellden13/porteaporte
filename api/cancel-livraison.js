// api/cancel-livraison.js - WITH AUDIT LOGGING
const { log } = require('./logger');

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function getSessionUser(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${token}`
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

  if (req.method !== 'POST') {
    log('WARN', 'cancel_livraison_invalid_method', null, { method: req.method });
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_KEY) {
    log('ERROR', 'stripe_key_missing', null, {});
    return res.status(503).json({ error: 'Stripe non configuré' });
  }

  if (!SB_URL || !SB_KEY) {
    log('ERROR', 'supabase_config_missing', null, { hasSBUrl: !!SB_URL, hasSBKey: !!SB_KEY });
    return res.status(503).json({ error: 'Supabase non configuré' });
  }

  try {
    const session = await getSessionUser(req, SB_URL, SB_KEY);
    if (!session) {
      log('WARN', 'cancel_livraison_unauthorized', null, {
        ip: req.headers['x-forwarded-for'],
      });
      return res.status(401).json({ error: 'Session requise' });
    }

    const { livraison_id, raison } = req.body || {};

    if (!livraison_id) {
      log('WARN', 'cancel_livraison_missing_id', session.id, {});
      return res.status(400).json({ error: 'livraison_id requis' });
    }

    log('INFO', 'cancel_livraison_started', session.id, {
      livraison_id,
      raison: raison || 'no reason provided',
    });

    // Récupérer la livraison
    const livRes = await fetch(
      `${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}&select=id,expediteur_id,livreur_id,statut,prix_total,stripe_payment_intent`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`
        }
      }
    );

    const livraisons = livRes.ok ? await livRes.json() : [];
    const livraison = livraisons[0];

    if (!livraison) {
      log('WARN', 'cancel_livraison_not_found', session.id, { livraison_id });
      return res.status(404).json({ error: 'Livraison non trouvée' });
    }

    // Vérifier droits
    const isExpeditor = livraison.expediteur_id === session.id;
    const isDriver = livraison.livreur_id === session.id;

    if (!isExpeditor && !isDriver) {
      log('WARN', 'cancel_livraison_unauthorized_user', session.id, {
        livraison_id,
        role: isExpeditor ? 'expediteur' : isDriver ? 'livreur' : 'unknown',
      });
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Vérifier statut
    if (!['pending', 'accepted', 'in_transit'].includes(livraison.statut)) {
      log('WARN', 'cancel_livraison_invalid_status', session.id, {
        livraison_id,
        currentStatus: livraison.statut,
      });
      return res.status(400).json({ error: `Impossible d'annuler une livraison avec le statut: ${livraison.statut}` });
    }

    // Rembourser via Stripe si nécessaire
    if (livraison.stripe_payment_intent) {
      const stripe = require('stripe')(STRIPE_KEY);
      try {
        const refund = await stripe.refunds.create({
          payment_intent: livraison.stripe_payment_intent,
        });

        log('AUDIT', 'delivery_refunded', session.id, {
          livraison_id,
          refundId: refund.id,
          amount: livraison.prix_total,
          raison,
        });
      } catch (e) {
        log('ERROR', 'stripe_refund_failed', session.id, {
          livraison_id,
          error: e.message,
        });
        return res.status(500).json({ error: 'Erreur remboursement Stripe' });
      }
    }

    // Marquer comme annulée
    const cancelRes = await fetch(
      `${SB_URL}/rest/v1/livraisons?id=eq.${livraison_id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statut: 'cancelled',
          mis_a_jour_le: new Date().toISOString(),
        }),
      }
    );

    if (!cancelRes.ok) {
      log('ERROR', 'cancel_livraison_db_update_failed', session.id, {
        livraison_id,
        status: cancelRes.status,
      });
      return res.status(500).json({ error: 'Erreur mise à jour BDD' });
    }

    log('AUDIT', 'delivery_cancelled', session.id, {
      livraison_id,
      canceller: isExpeditor ? 'expediteur' : 'livreur',
      raison: raison || 'no reason',
      refunded: !!livraison.stripe_payment_intent,
    });

    return res.json({
      success: true,
      message: 'Livraison annulée',
      livraison_id,
    });

  } catch (error) {
    log('ERROR', 'cancel_livraison_failed', req.headers['x-user-id'] || null, {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: error.message });
  }
};
