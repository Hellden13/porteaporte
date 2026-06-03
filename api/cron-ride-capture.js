/**
 * Cron Vercel : capture automatique des paiements covoiturage
 * Schedule : 1×/jour à 4h du matin (limite plan Hobby)
 * Configuré dans vercel.json
 */
const { rideCaptureEligible } = require('../lib/_rides');

function sanitize(s) {
  let v = (s || '').trim();
  while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1);
  return v.trim();
}

module.exports = async function handler(req, res) {
  // Sécurité : Vercel cron envoie un header Authorization=Bearer CRON_SECRET (si configuré)
  const cronSecret = sanitize(process.env.CRON_SECRET);
  if (cronSecret) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== 'Bearer ' + cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const sbUrl = sanitize(process.env.SUPABASE_URL);
  const sbKey = sanitize(process.env.SUPABASE_SERVICE_KEY);
  const stripeKey = sanitize(process.env.STRIPE_SECRET_KEY);

  if (!sbUrl || !sbKey || !stripeKey) {
    return res.status(503).json({ error: 'Config manquante' });
  }

  const ctx = {
    sbUrl, sbKey, stripeKey,
    session: { id: '__cron__' },
    profile: { role: 'admin' }
  };

  let captured = null;
  const fakeRes = {
    status: (code) => ({
      json: (data) => { captured = { code, data }; return data; }
    })
  };

  try {
    await rideCaptureEligible({ url: '/api/cron-ride-capture' }, fakeRes, ctx, { grace_hours: 4 });
  } catch (e) {
    console.error('[cron-ride-capture] crash:', e.message);
    return res.status(500).json({ error: 'Cron crash', details: e.message });
  }

  const result = (captured && captured.data) || {};
  console.log('[cron-ride-capture]', JSON.stringify({
    total: result.total || 0,
    captured: (result.captured || []).length,
    skipped: (result.skipped || []).length,
    errors: (result.errors || []).length,
  }));

  return res.status(200).json({
    success: true,
    ran_at: new Date().toISOString(),
    ...result
  });
};
