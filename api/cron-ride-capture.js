/**
 * Cron Vercel : capture automatique des paiements covoiturage
 * Schedule : 1×/jour à 4h du matin (limite plan Hobby)
 * Configuré dans vercel.json
 */
const { rideCaptureEligible, rideComplete, adminCleanupPhantomBookings } = require('../lib/_rides');
const { sbHeaders } = require('../lib/_lib');

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
  let cleanup = null;
  try {
    const cleanupRes = {
      status: (code) => ({
        json: (data) => { cleanup = { code, data }; return data; }
      })
    };
    await adminCleanupPhantomBookings({ url: '/api/cron-ride-capture' }, cleanupRes, ctx, {});
  } catch (e) {
    cleanup = { code: 500, data: { error: e.message } };
  }
  const autoValidated = [];
  const autoErrors = [];
  try {
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const url = `${sbUrl}/rest/v1/ride_bookings?status=eq.driver_completed&updated_at=lt.${encodeURIComponent(cutoff)}&safety_alert_triggered=eq.false&select=id&limit=100`;
    const pendingRes = await fetch(url, { headers: sbHeaders(sbKey) });
    const pending = pendingRes.ok ? await pendingRes.json().catch(() => []) : [];
    for (const booking of pending) {
      let done = null;
      const completeRes = {
        status: (code) => ({
          json: (data) => { done = { code, data }; return data; }
        })
      };
      try {
        await rideComplete({ url: '/api/cron-ride-capture' }, completeRes, ctx, {
          booking_id: booking.id,
          actor: 'auto_timeout'
        });
        if (done && done.code >= 200 && done.code < 300) {
          console.log(`Auto-validé après 4h sans confirmation passager — booking_id: ${booking.id}`);
          autoValidated.push(booking.id);
        } else {
          autoErrors.push({ booking_id: booking.id, error: done?.data?.error || 'auto-validation failed' });
        }
      } catch (e) {
        autoErrors.push({ booking_id: booking.id, error: e.message });
      }
    }
  } catch (e) {
    autoErrors.push({ booking_id: null, error: e.message });
  }

  console.log('[cron-ride-capture]', JSON.stringify({
    total: result.total || 0,
    captured: (result.captured || []).length,
    skipped: (result.skipped || []).length,
    errors: (result.errors || []).length,
    auto_validated: autoValidated.length,
    auto_errors: autoErrors.length,
    phantom_cleaned: cleanup?.data?.cleaned || 0,
  }));

  return res.status(200).json({
    success: true,
    ran_at: new Date().toISOString(),
    phantom_cleanup: cleanup?.data || null,
    auto_validated: autoValidated,
    auto_errors: autoErrors,
    ...result
  });
};
