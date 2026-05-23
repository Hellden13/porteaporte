// api/_ratelimit.js — Rate limiting via Supabase RPC
// Comportement "fail open" : si la DB est injoignable, la requête passe.
'use strict';

const { sanitizeEnv, sbHeaders } = require('./_lib');

/**
 * checkRateLimit — vérifie + incrémente atomiquement le compteur via RPC Supabase.
 *
 * @param {string} key        — identifiant unique, ex: "ip:1.2.3.4:turnstile"
 * @param {number} max        — nombre max de requêtes autorisées dans la fenêtre
 * @param {number} windowSec  — durée de la fenêtre en secondes
 * @returns {Promise<{ allowed: boolean, retryAfter: number }>}
 */
async function checkRateLimit(key, max, windowSec) {
  const url      = sanitizeEnv(process.env.SUPABASE_URL);
  const serviceKey = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);

  // Si l'env n'est pas configuré → laisser passer (démarrage local, tests)
  if (!url || !serviceKey) return { allowed: true, retryAfter: 0 };

  try {
    const res = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { ...sbHeaders(serviceKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_key:            key,
        p_max:            max,
        p_window_seconds: windowSec,
      }),
    });

    // Erreur DB → fail open (éviter de bloquer les utilisateurs légitimes)
    if (!res.ok) return { allowed: true, retryAfter: 0 };

    const allowed = await res.json(); // la RPC retourne un BOOLEAN
    return {
      allowed:    Boolean(allowed),
      retryAfter: allowed ? 0 : windowSec,
    };
  } catch {
    return { allowed: true, retryAfter: 0 }; // réseau → fail open
  }
}

/**
 * getClientIp — extrait l'IP réelle depuis les headers Vercel / proxies.
 * Prend uniquement la première IP de x-forwarded-for (la plus fiable).
 *
 * @param {object} req — objet request Node.js / Vercel
 * @returns {string}
 */
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || '127.0.0.1';
}

module.exports = { checkRateLimit, getClientIp };
