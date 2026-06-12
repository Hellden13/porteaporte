/* PorteaPorte - synchronise les valeurs covoiturage publiques.
   Source: /api/platform?endpoint=platform-settings-get */
(function () {
  'use strict';

  function fmtMoney(v) {
    return Number(v || 0).toFixed(2).replace('.', ',') + ' $';
  }

  function applyFreeTrips(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    window.__freeTrips = n;
    document.querySelectorAll('.free-trips-count').forEach(function (el) {
      el.textContent = String(n);
    });
  }

  function applyRideFees(low, high, threshold) {
    if (!Number.isFinite(low) || low < 0) return;
    var hasHigh = Number.isFinite(high) && high > low;
    var actualHigh = hasHigh ? high : low;
    var actualThreshold = Number.isFinite(threshold) ? threshold : 15;
    var label = hasHigh ? (fmtMoney(low) + ' à ' + fmtMoney(actualHigh)) : fmtMoney(low);

    window.__rideFee = low;
    window.__rideFeeHigh = actualHigh;
    window.__rideFeeThreshold = actualThreshold;

    document.querySelectorAll('.ride-fee-amount').forEach(function (el) {
      el.textContent = label;
    });
    document.querySelectorAll('.ride-fee-low').forEach(function (el) {
      el.textContent = fmtMoney(low);
    });
    document.querySelectorAll('.ride-fee-high').forEach(function (el) {
      el.textContent = fmtMoney(actualHigh);
    });
    document.querySelectorAll('.ride-fee-threshold').forEach(function (el) {
      el.textContent = fmtMoney(actualThreshold);
    });
  }

  fetch('/api/platform?endpoint=platform-settings-get')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var settings = d && d.settings;
      if (!settings) return;
      applyFreeTrips(Number(settings.ride_free_trips));
      applyRideFees(
        Number(settings.ride_platform_fee),
        Number(settings.ride_platform_fee_high),
        Number(settings.ride_fee_threshold)
      );
    })
    .catch(function () {
      /* garde les valeurs par defaut affichees dans le HTML */
    });
})();
