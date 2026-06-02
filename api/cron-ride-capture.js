/**
 * Cron Vercel : capture automatique des paiements covoiturage
 * Schedule : toutes les heures (configuré dans vercel.json)
 *
 * Cherche les ride_bookings :
 *   - status = 'confirme'
 *   - paid_at IS NULL
 *   - departure_time + 4h < NOW()
 * Pour chaque : capture le PaymentIntent + transfer Stripe vers le conducteur.
 *
 * Sécurité : Vercel cron envoie un header Authorization avec le CRON_SECRET.
 */
const { rideCaptureEligible } = require('../lib/_rides');

function sanitize(s) {
  let v = (s || '').trim();
  while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1);
  return v.trim();
}

module.exports = async function handler(req, res) {
  // Vercel cron envoie un User-Agent particulier + Authorization avec CRON_SECRET
  const cronSecret = sanitize(process.env.CRON_SECRET);
  const authHeader = req.headers.authorization || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sbUrl = sanitize(process.env.SUPABASE_URL);
  const sbKey = sanitize(process.env.SUPABASE_SERVICE_KEY);
  const stripeKey = sanitize(process.env.STRIPE_SECRET_KEY);

  if (!sbUrl || !sbKey || !stripeKey) {
    return res.status(503).json({ error: 'Config manquante', has: { sbUrl: !!sbUrl, sbKey: !!sbKey, stripe: !!stripeKey } });
  }

  // Fake session "admin" pour passer le check is_admin dans rideCaptureEligible
  const ctx = {
    sbUrl, sbKey, stripeKey,
    session: { id: '__cron__' },
    profile: { role: 'admin' }
  };

  // Wrapper minimal pour simuler res.status().json()
  let captured = null;
  const fakeRes = {
    status: (code) => ({
      json: (data) => { captured = { code, data }; return data; }
    })
  };

  const fakeReq = { url: '/api/cron-ride-capture' };
  await rideCaptureEligible(fakeReq, fakeRes, ctx, { grace_hours: 4 });

  const result = captured?.data || {};
  console.log('[cron-ride-capture]', JSON.stringify({
    total: result.total || 0,
    captured: result.captured?.length || 0,
    skipped: result.skipped?.length || 0,
    errors: result.errors?.length || 0,
  }));

  return res.status(200).json({
    success: true,
    ran_at: new Date().toISOString(),
    ...result
  });
};
