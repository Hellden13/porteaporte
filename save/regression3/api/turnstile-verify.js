// api/turnstile-verify.js - WITH AUDIT LOGGING
const { log } = require('./logger');

module.exports = async function handler(req, res) {
  const SECRET = process.env.TURNSTILE_SECRET;

  if (!SECRET) {
    log('ERROR', 'turnstile_config_missing', null, {});
    return res.status(500).json({ success: false, error: 'Config manquante' });
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://porteaporte.site');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    log('WARN', 'turnstile_invalid_method', null, { method: req.method });
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  const { token, action } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '127.0.0.1';

  if (!token) {
    log('WARN', 'turnstile_missing_token', null, {
      action: action || 'unknown',
      ip,
    });
    return res.status(400).json({ success: false, error: 'Token manquant' });
  }

  try {
    log('INFO', 'turnstile_verification_started', null, {
      action: action || 'unknown',
      ip,
      tokenLength: token.length,
    });

    const formData = new FormData();
    formData.append('secret', SECRET);
    formData.append('response', token);
    formData.append('remoteip', ip);

    const verifyRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: formData }
    );

    const data = await verifyRes.json();

    if (data.success) {
      log('AUDIT', 'turnstile_verification_success', null, {
        action: action || 'unknown',
        ip,
        challengeTs: data.challenge_ts,
        hostname: data.hostname,
        errorCodes: data.error_codes || [],
      });

      res.setHeader('Access-Control-Allow-Origin', 'https://porteaporte.site');
      return res.status(200).json({ success: true });

    } else {
      log('WARN', 'turnstile_verification_failed', null, {
        action: action || 'unknown',
        ip,
        errorCodes: data.error_codes || [],
        challengeTs: data.challenge_ts,
      });

      // Détecter patterns d'abus (trop d'échecs)
      if (data.error_codes?.includes('invalid_input_response')) {
        log('WARN', 'turnstile_invalid_token', null, {
          ip,
          action,
        });
      }

      if (data.error_codes?.includes('timeout-or-duplicate')) {
        log('WARN', 'turnstile_timeout_or_duplicate', null, {
          ip,
          action,
        });
      }

      res.setHeader('Access-Control-Allow-Origin', 'https://porteaporte.site');
      return res.status(400).json({
        success: false,
        error: 'Vérification échouée',
        errorCodes: data.error_codes,
      });
    }

  } catch (error) {
    log('ERROR', 'turnstile_verification_error', null, {
      error: error.message,
      action: action || 'unknown',
      ip,
      stack: error.stack,
    });

    res.setHeader('Access-Control-Allow-Origin', 'https://porteaporte.site');
    return res.status(500).json({
      success: false,
      error: 'Erreur de vérification',
    });
  }
};
