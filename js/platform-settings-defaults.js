/* PorteaPorte - repartition officielle publique.
   Source de verite applicative: platform_settings.default.
   Ce fichier fournit seulement les valeurs de secours et les libelles canoniques. */
(function (root) {
  'use strict';

  // Silencer les logs de debug en production (navigateur uniquement)
  if (typeof window !== 'undefined' && window.location &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    ['log', 'warn', 'info', 'debug'].forEach(function (m) { console[m] = function () {}; });
  }

  const PLATFORM_ALLOCATION_DEFAULTS = Object.freeze({
    pct_livreur: 60,
    pct_stripe: 7,
    pct_developpement: 5,
    pct_protection: 10,
    pct_urgence: 6,
    pct_communaute: 5,
    pct_profit: 7,
    pct_marketing: 0,
    pct_operations: 0
  });

  const PLATFORM_ALLOCATION_POSTS = Object.freeze([
    { key: 'pct_livreur', slug: 'livreur', emoji: '🚗', label: 'Livreur québécois', color: '#5dbfff' },
    { key: 'pct_stripe', slug: 'stripe', emoji: '💳', label: 'Frais Stripe (traitement des paiements)', color: '#A8ACB1' },
    { key: 'pct_developpement', slug: 'developpement', emoji: '🔧', label: 'Infrastructure & développement', color: '#A8ACB1' },
    { key: 'pct_protection', slug: 'protection', emoji: '🛡️', label: 'Protection colis', color: '#00D9FF' },
    { key: 'pct_urgence', slug: 'urgence', emoji: '🆘', label: 'Fonds d’urgence', color: '#ffa500' },
    { key: 'pct_communaute', slug: 'communaute', emoji: '💚', label: 'Communauté (organismes d’ici)', color: '#7dffc1' },
    { key: 'pct_profit', slug: 'profit', emoji: '💪', label: 'Réserve / pérennité', color: '#A8ACB1' },
    { key: 'pct_marketing', slug: 'marketing', emoji: '📢', label: 'Marketing & croissance', color: '#A8ACB1' },
    { key: 'pct_operations', slug: 'operations', emoji: '🏛️', label: 'Opérations', color: '#A8ACB1' }
  ]);

  function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function canonicalPlatformSettings(settings) {
    const input = settings || {};
    const out = { ...PLATFORM_ALLOCATION_DEFAULTS };
    Object.keys(PLATFORM_ALLOCATION_DEFAULTS).forEach((key) => {
      out[key] = Math.max(0, finiteNumber(input[key], PLATFORM_ALLOCATION_DEFAULTS[key]));
    });
    return out;
  }

  function platformAllocationPosts(settings, options) {
    const opts = options || {};
    const values = canonicalPlatformSettings(settings);
    return PLATFORM_ALLOCATION_POSTS
      .map((post) => ({ ...post, pct: values[post.key] }))
      .filter((post) => opts.includeZero === true || post.pct > 0);
  }

  function platformAllocationTotal(settings, options) {
    return platformAllocationPosts(settings, { includeZero: options && options.includeZero })
      .reduce((sum, post) => sum + post.pct, 0);
  }

  const api = {
    PLATFORM_ALLOCATION_DEFAULTS,
    PLATFORM_ALLOCATION_POSTS,
    canonicalPlatformSettings,
    platformAllocationPosts,
    platformAllocationTotal
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PAP_PLATFORM_SETTINGS = api;
})(typeof window !== 'undefined' ? window : globalThis);
