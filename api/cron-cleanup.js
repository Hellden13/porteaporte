// api/cron-cleanup.js — Nettoyage périodique des tables temporaires
// Appelé par Vercel Cron (voir vercel.json) — toutes les heures
'use strict';

const { sanitizeEnv, sbHeaders } = require('./_lib');

module.exports = async function handler(req, res) {
  // Sécurité : seulement Vercel Cron ou secret interne
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const sbUrl = sanitizeEnv(process.env.SUPABASE_URL);
  const sbKey = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);
  if (!sbUrl || !sbKey) return res.status(503).json({ error: 'Config manquante' });

  const results = {};

  // 1. Nettoyer rate_limits expirés (> 1h)
  try {
    const r = await fetch(`${sbUrl}/rest/v1/rpc/cleanup_rate_limits`, {
      method: 'POST',
      headers: { ...sbHeaders(sbKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    results.rate_limits = r.ok ? 'ok' : `erreur ${r.status}`;
  } catch (e) {
    results.rate_limits = 'exception: ' + e.message;
  }

  // 2. Nettoyer les sessions GPS > 48h (gps_updates orphelins)
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const r = await fetch(
      `${sbUrl}/rest/v1/gps_updates?created_at=lt.${cutoff}`,
      { method: 'DELETE', headers: sbHeaders(sbKey) }
    );
    results.gps_updates = r.ok ? 'ok' : `erreur ${r.status}`;
  } catch (e) {
    results.gps_updates = 'exception: ' + e.message;
  }

  console.log('[cron-cleanup]', results);
  return res.status(200).json({ success: true, results, ts: new Date().toISOString() });
};
