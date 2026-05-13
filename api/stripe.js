// ============================================================
// PORTEÀPORTE — Backend Stripe Production
// Fichier : api/stripe.js
// ============================================================
// VARIABLES VERCEL REQUISES :
//   STRIPE_SECRET_KEY  = configured in Vercel environment variables
//   SUPABASE_URL       = https://miqrircrfpzkmvvacgwt.supabase.co
//   SUPABASE_SERVICE_KEY = eyJ... (service_role key — PAS anon)
// ============================================================

// ── DÉTECTION AUTOMATIQUE TEST / LIVE ──
// En test: utilise les clés test, paiements simulés
// En live: utilise les vraies clés après activation

module.exports = async function handler(req, res) {
  // Déterminer le mode
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const IS_LIVE = STRIPE_KEY && STRIPE_KEY.startsWith('sk_live_');
  const IS_TEST = STRIPE_KEY && STRIPE_KEY.startsWith('sk_test_');
  
  if (!STRIPE_KEY) {
    console.log('⚠️ STRIPE_SECRET_KEY manquante — mode simulation');
  } else {
    console.log(IS_LIVE ? '🟢 Stripe LIVE activé' : '🔴 Stripe TEST mode');
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://porteaporte.site');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'Action manquante' });

  if (!STRIPE_KEY) return res.status(500).json({ error: 'STRIPE_SECRET_KEY manquante — Ajoutez-la dans Vercel Settings' });

  try {
    switch (action) {

      // ── CRÉER UN PAYMENT INTENT (livraison ou PorteCoins) ──
      case 'create_payment_intent': {
        return res.status(410).json({
          error: 'Action desactivee',
          message: 'Utiliser achat_coins ou /api/paiement-livraison pour un montant calcule serveur.'
        });
        /*
        const { montant_cents, description, metadata, customer_email } = req.body;
        if (!montant_cents || montant_cents < 50) {
          return res.status(400).json({ error: 'Montant invalide (minimum 0,50 $)' });
        }

        const intent = await stripeRequest('POST', '/v1/payment_intents', {
          amount: Math.round(montant_cents),
          currency: 'cad',
          description: description || 'PorteàPorte — Livraison',
          receipt_email: customer_email || '',
          automatic_payment_methods: { enabled: 'true' },
          metadata: {
            plateforme: 'porteaporte',
            ...metadata
          }
        }, STRIPE_KEY);

        return res.status(200).json({
          client_secret: intent.client_secret,
          payment_intent_id: intent.id,
          montant: intent.amount,
          devise: intent.currency
        });
        */
      }

      // ── ACHAT PORTECOIN ──
      case 'achat_coins': {
        const { forfait, email_acheteur, email_destinataire, message_cadeau } = req.body;

        const FORFAITS = {
          starter:  { coins: 100,  prix_cents: 999,  label: 'Starter' },
          populaire:{ coins: 325,  prix_cents: 1999, label: 'Populaire ⭐' },
          pro:      { coins: 900,  prix_cents: 3999, label: 'Pro' },
          premium:  { coins: 3000, prix_cents: 7999, label: 'Premium 💎' }
        };

        const pack = FORFAITS[forfait];
        if (!pack) return res.status(400).json({ error: 'Forfait invalide' });

        const intent = await stripeRequest('POST', '/v1/payment_intents', {
          amount: pack.prix_cents,
          currency: 'cad',
          description: `PorteàPorte — ${pack.coins} PorteCoins (${pack.label})`,
          receipt_email: email_acheteur,
          automatic_payment_methods: { enabled: 'true' },
          metadata: {
            plateforme: 'porteaporte',
            type: 'achat_coins',
            forfait: forfait,
            coins: String(pack.coins),
            email_acheteur,
            email_destinataire: email_destinataire || email_acheteur,
            message_cadeau: message_cadeau || '',
            cadeau: email_destinataire && email_destinataire !== email_acheteur ? 'oui' : 'non'
          }
        }, STRIPE_KEY);

        return res.status(200).json({
          client_secret: intent.client_secret,
          payment_intent_id: intent.id,
          coins: pack.coins,
          prix_cents: pack.prix_cents,
          label: pack.label
        });
      }

      // ── CONFIRMER PAIEMENT ET CRÉDITER COINS ──
      case 'confirmer_coins': {
        const internalSecret = process.env.INTERNAL_API_SECRET;
        if (!internalSecret || req.headers['x-internal-webhook-secret'] !== internalSecret) {
          return res.status(403).json({ error: 'Action reservee au webhook Stripe' });
        }

        const { payment_intent_id } = req.body;
        if (!payment_intent_id) return res.status(400).json({ error: 'payment_intent_id manquant' });

        // Vérifier que le paiement est bien succeeded
        const intent = await stripeRequest('GET', `/v1/payment_intents/${payment_intent_id}`, null, STRIPE_KEY);

        if (intent.status !== 'succeeded') {
          return res.status(400).json({ error: 'Paiement non complété: ' + intent.status });
        }

        const meta = intent.metadata;
        const coins = parseInt(meta.coins || '0');
        const emailDest = meta.email_destinataire || meta.email_acheteur;

        // Créditer les coins dans Supabase via service_role
        const SB_URL = process.env.SUPABASE_URL;
        const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

        if (SB_URL && SB_KEY) {
          // Trouver le user_id par email
          const userRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
            headers: {
              'apikey': SB_KEY,
              'Authorization': `Bearer ${SB_KEY}`
            }
          });
          const users = await userRes.json();
          const user = users.users?.find(u => u.email === emailDest);

          if (user) {
            // Appeler la fonction ajouter_coins via RPC Supabase
            await fetch(`${SB_URL}/rest/v1/rpc/ajouter_coins`, {
              method: 'POST',
              headers: {
                'apikey': SB_KEY,
                'Authorization': `Bearer ${SB_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                p_user_id: user.id,
                p_montant: coins,
                p_type: 'achat_coins',
                p_description: `Achat ${meta.forfait} — ${coins} PC · Stripe ${payment_intent_id.slice(-8)}`
              })
            });
          }
        }

        // Envoyer notification courriel
        const notifierHeaders = { 'Content-Type': 'application/json' };
        const intSec = process.env.INTERNAL_API_SECRET;
        if (intSec) notifierHeaders['x-internal-notifier-secret'] = intSec;
        const origin = process.env.PUBLIC_SITE_ORIGIN || 'https://porteaporte.site';
        await fetch(`${origin}/api/notifier`, {
          method: 'POST',
          headers: notifierHeaders,
          body: JSON.stringify({
            type: 'achat_coins',
            data: {
              email: meta.email_acheteur,
              forfait: meta.label || meta.forfait,
              coins: coins,
              prix: (intent.amount / 100).toFixed(2),
              stripe_id: payment_intent_id,
              gift_email: meta.cadeau === 'oui' ? meta.email_destinataire : null
            }
          })
        }).catch(() => {});

        return res.status(200).json({ success: true, coins_credites: coins, email: emailDest });
      }

      // ── WEBHOOK STRIPE (livraisons, remboursements) ──
      case 'webhook': {
        // Pour les webhooks Stripe → utilise l'endpoint /api/stripe-webhook séparé
        return res.status(200).json({ received: true });
      }

      // ── CRÉER REMBOURSEMENT ──
      case 'remboursement': {
        const isAdmin = await requireAdmin(req);
        if (!isAdmin.ok) return res.status(isAdmin.status).json({ error: isAdmin.error });

        const { payment_intent_id, montant_cents, raison } = req.body;

        const params = {
          payment_intent: payment_intent_id,
          reason: 'requested_by_customer'
        };
        if (montant_cents) params.amount = Math.round(montant_cents);

        const refund = await stripeRequest('POST', '/v1/refunds', params, STRIPE_KEY);

        return res.status(200).json({
          success: true,
          refund_id: refund.id,
          montant_rembourse: refund.amount,
          statut: refund.status
        });
      }

      // ── VÉRIFIER STATUT PAIEMENT ──
      case 'statut': {
        const { payment_intent_id } = req.body;
        if (!payment_intent_id) {
          return res.status(400).json({ error: 'payment_intent_id manquant' });
        }
        const intent = await stripeRequest('GET', `/v1/payment_intents/${payment_intent_id}`, null, STRIPE_KEY);
        return res.status(200).json({
          statut: intent.status,
          montant: intent.amount,
          devise: intent.currency,
          recu_url: intent.charges?.data?.[0]?.receipt_url || null
        });
      }

      default:
        return res.status(400).json({ error: 'Action inconnue: ' + action });
    }

  } catch (err) {
    console.error('Erreur Stripe:', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
}

// ── HELPER : Appel API Stripe ──
async function stripeRequest(method, path, body, secretKey) {
  const url = `https://api.stripe.com${path}`;
  const headers = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const options = { method, headers };

  if (body && method !== 'GET') {
    options.body = new URLSearchParams(flattenParams(body)).toString();
  }

  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe erreur ${res.status}`);
  }

  return data;
}

// Aplatir les objets imbriqués pour Stripe (ex: metadata[key]=val)
async function requireAdmin(req) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!SB_URL || !SB_KEY) return { ok: false, status: 500, error: 'Supabase service non configure' };
  if (!token) return { ok: false, status: 401, error: 'Session requise' };

  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!userRes.ok) return { ok: false, status: 401, error: 'Session invalide' };

  const user = await userRes.json();
  const profileRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  const profiles = profileRes.ok ? await profileRes.json() : [];
  if (profiles[0]?.role !== 'admin') return { ok: false, status: 403, error: 'Role admin requis' };

  return { ok: true, user };
}

function flattenParams(obj, prefix = '') {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val !== null && val !== undefined && val !== '') {
      if (typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(result, flattenParams(val, fullKey));
      } else {
        result[fullKey] = String(val);
      }
    }
  }
  return result;
}
