// api/cancel-livraison.js - WITH AUDIT LOGGING + REFUND POLICY + ADMIN ALERT
const { log } = require('../lib/logger');
const { normalizeRole, alertAdmin, callNotifier } = require('../lib/_lib');

// Politique de remboursement intelligente.
// `tier` sert à appliquer une part « fonds de sécurité » configurable (carvée dans le dédommagement livreur).
function computeRefundPolicy(statut, isAdmin) {
  if (isAdmin) return { refund_pct: 100, livreur_compensation_pct: 0, tier: 'none', allowed: true, reason: 'Admin override' };
  switch (statut) {
    case 'en_attente':
    case 'publie':
    case 'paiement_autorise':
      return { refund_pct: 100, livreur_compensation_pct: 0, tier: 'none', allowed: true, reason: 'Annulation avant assignation - remboursement total' };
    case 'requires_capture':
    case 'pending':
      return { refund_pct: 100, livreur_compensation_pct: 0, tier: 'none', allowed: true, reason: 'Aucun livreur assigné encore - remboursement total' };
    case 'confirme':
    case 'accepted':
      return { refund_pct: 90, livreur_compensation_pct: 10, tier: 'assigned', allowed: true, reason: 'Livreur assigné mais pas encore parti - 10% compensation livreur (temps perdu)' };
    case 'in_transit':
    case 'en_route':
      return { refund_pct: 50, livreur_compensation_pct: 50, tier: 'transit', allowed: true, reason: 'Livreur déjà parti - 50% compensation livreur (essence + temps)' };
    case 'livre':
    case 'livree':
    case 'payee':
    case 'paid':
    case 'confirmee':
      return { refund_pct: 0, livreur_compensation_pct: 0, tier: 'none', allowed: false, reason: 'Livraison déjà complétée - utiliser le système de manquement à la place' };
    case 'annule':
    case 'annulee':
      return { refund_pct: 0, livreur_compensation_pct: 0, tier: 'none', allowed: false, reason: 'Déjà annulée' };
    default:
      return { refund_pct: 100, livreur_compensation_pct: 0, tier: 'none', allowed: true, reason: 'Annulation autorisée' };
  }
}

// Part « fonds de sécurité » (% du total) carvée dans le dédommagement livreur, selon le palier.
// Configurable via impact_settings (admin). Plafonnée pour ne jamais dépasser le dédommagement.
function fundPctForTier(tier, settings) {
  const s = settings || {};
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  if (tier === 'assigned') return Math.max(0, num(s.delivery_cancel_assigned_fund_pct, 2));
  if (tier === 'transit')  return Math.max(0, num(s.delivery_cancel_transit_fund_pct, 5));
  return 0;
}

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

  const sanitizeEnv = s => { let v = (s || '').trim(); while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1); return v.trim(); };
  const STRIPE_KEY = sanitizeEnv(process.env.STRIPE_SECRET_KEY);
  const SB_URL = sanitizeEnv(process.env.SUPABASE_URL);
  const SB_KEY = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);

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

    // Vérifier droits (admin peut annuler n'importe quelle livraison)
    const isExpeditor = livraison.expediteur_id === session.id;
    const isDriver = livraison.livreur_id === session.id;

    // Vérifier si l'utilisateur est admin
    const profileRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${session.id}&select=role`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    const profileRows = profileRes.ok ? await profileRes.json() : [];
    const isAdmin = normalizeRole(profileRows[0]?.role) === 'admin';

    if (!isExpeditor && !isDriver && !isAdmin) {
      log('WARN', 'cancel_livraison_unauthorized_user', session.id, { livraison_id });
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Réglages plateforme (part fonds de sécurité configurable depuis l'admin)
    let platformSettings = {};
    try {
      const setRes = await fetch(`${SB_URL}/rest/v1/impact_settings?id=eq.default&select=*&limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
      });
      platformSettings = setRes.ok ? ((await setRes.json())[0] || {}) : {};
    } catch (_) { platformSettings = {}; }

    // ─── POLITIQUE DE REMBOURSEMENT ───
    const policy = computeRefundPolicy(livraison.statut, isAdmin);
    if (!policy.allowed) {
      log('WARN', 'cancel_livraison_not_allowed', session.id, { livraison_id, currentStatus: livraison.statut, reason: policy.reason });
      return res.status(400).json({ error: `Annulation impossible : ${policy.reason}`, statut: livraison.statut, policy });
    }

    // Rembourser via Stripe selon la politique
    let refundCents = 0;
    let livreurCompensationCents = 0;
    let fundCents = 0;
    const totalCents = Math.round(Number(livraison.prix_total || 0) * 100);
    if (livraison.stripe_payment_intent && totalCents > 0) {
      if (!STRIPE_KEY) {
        log('ERROR', 'stripe_key_missing', session.id, { livraison_id });
        return res.status(503).json({ error: 'Remboursement impossible : Stripe non configuré' });
      }
      refundCents = Math.round(totalCents * policy.refund_pct / 100);
      const retainedCents = Math.round(totalCents * policy.livreur_compensation_pct / 100);
      // Part fonds de sécurité carvée dans le dédommagement (jamais plus que le dédommagement)
      const fundPct = fundPctForTier(policy.tier, platformSettings);
      fundCents = Math.min(retainedCents, Math.round(totalCents * fundPct / 100));
      livreurCompensationCents = Math.max(0, retainedCents - fundCents);

      // Trace la part fonds de sécurité dans le grand livre (table transactions)
      if (fundCents > 0) {
        await fetch(`${SB_URL}/rest/v1/transactions`, {
          method: 'POST',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: null,
            livraison_id: livraison.id,
            type: 'fond_securite_livraison',
            montant: fundCents / 100,
            statut: 'complete',
            description: `Fonds de sécurité — annulation livraison (${policy.tier})`,
            stripe_payment_intent: livraison.stripe_payment_intent,
            metadata: { livraison_id: livraison.id, tier: policy.tier, refund_pct: policy.refund_pct }
          })
        }).catch(() => {});
      }

      if (refundCents > 0) {
        const stripe = require('stripe')(STRIPE_KEY);
        try {
          const refund = await stripe.refunds.create({
            payment_intent: livraison.stripe_payment_intent,
            amount: refundCents
          });
          log('AUDIT', 'delivery_refunded', session.id, {
            livraison_id, refundId: refund.id, amount_cents: refundCents,
            total_cents: totalCents, refund_pct: policy.refund_pct, raison,
          });
        } catch (e) {
          log('ERROR', 'stripe_refund_failed', session.id, { livraison_id, error: e.message });
          return res.status(500).json({ error: 'Erreur remboursement Stripe : ' + e.message });
        }
      }

      // Crédit compensation au livreur si applicable
      if (livreurCompensationCents > 0 && livraison.livreur_id) {
        await fetch(`${SB_URL}/rest/v1/livreur_earnings`, {
          method: 'POST',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            livreur_id: livraison.livreur_id,
            livraison_id: livraison.id,
            gross_amount: livreurCompensationCents / 100,
            net_amount: livreurCompensationCents / 100,
            currency: 'cad',
            status: 'available',
            type: 'compensation_annulation',
            notes: `Compensation annulation (${policy.refund_pct}% remboursé) : ${raison || 'sans raison'}`,
            created_at: new Date().toISOString()
          })
        }).catch(() => {});
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
          statut: 'annule',
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
      canceller: isExpeditor ? 'expediteur' : isAdmin ? 'admin' : 'livreur',
      raison: raison || 'no reason',
      refund_cents: refundCents,
      livreur_compensation_cents: livreurCompensationCents
    });

    // 🚨 Alerte admin (Denis) : annulation a eu lieu
    const canceller = isExpeditor ? 'Expéditeur' : isAdmin ? 'Admin' : 'Livreur';
    const sev = livreurCompensationCents > 0 ? 'warning' : 'info';
    alertAdmin(
      `Annulation livraison`,
      `${canceller} a annulé une livraison. ${refundCents > 0 ? `Remboursement ${(refundCents/100).toFixed(2)} $ traité` : 'Pas de remboursement (pas encore payée).'}`,
      {
        severity: sev,
        details: {
          'Livraison': livraison.id?.slice(0, 8) || '?',
          'Annulée par': canceller,
          'Raison': raison || '(non précisée)',
          'Statut au moment': livraison.statut,
          'Prix total': `${Number(livraison.prix_total || 0).toFixed(2)} $`,
          'Remboursement client': `${(refundCents/100).toFixed(2)} $ (${policy.refund_pct}%)`,
          'Compensation livreur': `${(livreurCompensationCents/100).toFixed(2)} $`,
          'Fonds de sécurité': `${(fundCents/100).toFixed(2)} $`
        },
        cta_url: 'https://porteaporte.site/admin/operations.html',
        cta_label: '📋 Voir Operations →'
      }
    );

    // Notifier le livreur si assigné
    if (livraison.livreur_id && livraison.livreur_id !== session.id) {
      try {
        const lvr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${livraison.livreur_id}&select=email,prenom`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
        });
        const lvrProfile = lvr.ok ? (await lvr.json())[0] : null;
        if (lvrProfile?.email) {
          callNotifier('livraison_annulee_livreur', {
            email: lvrProfile.email,
            prenom: lvrProfile.prenom || '',
            livraison_id,
            canceller,
            raison: raison || '',
            compensation_cad: livreurCompensationCents / 100
          }).catch(() => {});
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      message: 'Livraison annulée',
      livraison_id,
      refund_cents: refundCents,
      refund_pct: policy.refund_pct,
      livreur_compensation_cents: livreurCompensationCents,
      security_fund_cents: fundCents,
      policy_reason: policy.reason
    });

  } catch (error) {
    log('ERROR', 'cancel_livraison_failed', req.headers['x-user-id'] || null, {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: error.message });
  }
};
