/* PorteàPorte — synchronise les pourcentages de répartition (source unique).
   Source : /api/platform?endpoint=platform-settings-get → settings.pct_*
   Usage :
     - Affichage : <span data-share="livreur">60</span> → rempli automatiquement.
       (clé = suffixe après "pct_", ex. data-share="livreur" lit pct_livreur)
     - Calcul    : window.PlatformShares.ready.then(s => { ... s.pct_livreur ... })
*/
(function () {
  'use strict';
  function ensureCanonicalDefaults() {
    if (window.PAP_PLATFORM_SETTINGS) return Promise.resolve(window.PAP_PLATFORM_SETTINGS);
    return new Promise(function (resolve) {
      var existing = document.querySelector('script[src="/js/platform-settings-defaults.js"]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.PAP_PLATFORM_SETTINGS || null); }, { once: true });
        existing.addEventListener('error', function () { resolve(null); }, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.src = '/js/platform-settings-defaults.js';
      s.onload = function () { resolve(window.PAP_PLATFORM_SETTINGS || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }
  function canonical(settings) {
    var api = window.PAP_PLATFORM_SETTINGS;
    return api ? api.canonicalPlatformSettings(settings) : (settings || {});
  }
  function apply(s) {
    window.__platformShares = s;
    var els = document.querySelectorAll('[data-share]');
    for (var i = 0; i < els.length; i++) {
      var key = 'pct_' + els[i].getAttribute('data-share');
      var v = s[key];
      if (v != null && !isNaN(Number(v))) {
        els[i].textContent = String(Math.round(Number(v) * 10) / 10);
      }
    }
    try { document.dispatchEvent(new CustomEvent('platform-shares', { detail: s })); } catch (e) {}
  }
  window.PlatformShares = {
    ready: fetch('/api/platform?endpoint=platform-settings-get')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        return ensureCanonicalDefaults().then(function () {
          var s = canonical(d && d.settings);
          apply(s);
          return s;
        });
      })
      .catch(function () {
        return ensureCanonicalDefaults().then(function () {
          var s = canonical();
          apply(s);
          return s;
        });
      })
  };
})();
