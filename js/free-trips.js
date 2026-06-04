/* PorteàPorte — synchronise le nombre de trajets sans commission (franchise)
   Source unique : /api/impact-public → impact.ride_free_trips (réglable dans l'admin).
   Met à jour tout élément portant la classe .free-trips-count. */
(function () {
  'use strict';
  function apply(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    window.__freeTrips = n;
    document.querySelectorAll('.free-trips-count').forEach(function (el) {
      el.textContent = String(n);
    });
  }
  fetch('/api/impact-public')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var n = d && d.impact && Number(d.impact.ride_free_trips);
      apply(n);
    })
    .catch(function () { /* garde la valeur par défaut affichée dans le HTML */ });
})();
