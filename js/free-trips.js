/* PorteàPorte — synchronise les valeurs covoiturage depuis la source unique.
   Source unique : /api/impact-public
     • impact.ride_free_trips   → éléments .free-trips-count (nombre de trajets sans commission)
     • impact.ride_platform_fee → éléments .ride-fee-amount   (frais plateforme par siège, ex. « 1,50 $ »)
   Tout est réglable dans l'admin → un seul endroit, partout cohérent. */
(function () {
  'use strict';
  function applyFreeTrips(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    window.__freeTrips = n;
    document.querySelectorAll('.free-trips-count').forEach(function (el) {
      el.textContent = String(n);
    });
  }
  function fmtMoney(v) {
    // 1.5 → "1,50 $"
    return v.toFixed(2).replace('.', ',') + ' $';
  }
  function applyRideFee(v) {
    if (!Number.isFinite(v) || v < 0) return;
    window.__rideFee = v;
    document.querySelectorAll('.ride-fee-amount').forEach(function (el) {
      el.textContent = fmtMoney(v);
    });
  }
  fetch('/api/impact-public')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var impact = d && d.impact;
      if (!impact) return;
      applyFreeTrips(Number(impact.ride_free_trips));
      applyRideFee(Number(impact.ride_platform_fee));
    })
    .catch(function () { /* garde les valeurs par défaut affichées dans le HTML */ });
})();
