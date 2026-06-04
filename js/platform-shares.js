/* PorteàPorte — synchronise les pourcentages de répartition (source unique).
   Source : /api/platform?endpoint=platform-settings-get → settings.pct_*
   Usage :
     - Affichage : <span data-share="livreur">60</span> → rempli automatiquement.
       (clé = suffixe après "pct_", ex. data-share="livreur" lit pct_livreur)
     - Calcul    : window.PlatformShares.ready.then(s => { ... s.pct_livreur ... })
*/
(function () {
  'use strict';
  var DEFAULTS = {
    pct_livreur: 60, pct_communaute: 5, pct_protection: 8,
    pct_urgence: 5, pct_developpement: 5, pct_marketing: 5,
    pct_operations: 4, pct_profit: 10
  };
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
        var s = (d && d.settings) ? d.settings : DEFAULTS;
        apply(s);
        return s;
      })
      .catch(function () { apply(DEFAULTS); return DEFAULTS; })
  };
})();
