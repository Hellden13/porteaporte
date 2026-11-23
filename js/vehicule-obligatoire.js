/* js/vehicule-obligatoire.js — Membres livreurs ou conducteurs : enregistrement du véhicule obligatoire
   à la prochaine connexion (décision de Denis). Le serveur dit si c'est requis (endpoint vehicules-mes). */
(function () {
  'use strict';
  if (window.__papVehiculeObligatoire) return;
  window.__papVehiculeObligatoire = true;
  async function verifier() {
    try {
      var c = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.db;
      if (!c || !c.auth) return;
      var s = (await c.auth.getSession()).data.session;
      if (!s) return;
      var r = await fetch('/api/platform?endpoint=vehicules-mes', { headers: { Authorization: 'Bearer ' + s.access_token } });
      if (!r.ok) return;
      var d = await r.json();
      if (d && d.doit_enregistrer) window.location.href = '/vehicules.html?obligatoire=1';
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verifier); else verifier();
})();
