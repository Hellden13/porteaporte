/* js/reglement-fetes.js — Règlement du Concours des Fêtes : date du lancement remplie automatiquement.
   La date est celle du clic sur « Lancer le concours » (monthly_draws.created_at), lue par l'API publique
   concours-fetes-public. Tant que le concours n'est pas lancé : « à venir ». */
(function () {
  'use strict';
  function dateLongue(iso) {
    var t = new Date(iso);
    if (!iso || !isFinite(t.getTime())) return null;
    // « 23 novembre 2026 », à l'heure du Québec.
    var texte = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric' }).format(t);
    return texte.replace(/^1 /, '1er '); // « 1er décembre 2026 »
  }
  function remplir(info) {
    var el = document.getElementById('date-lancement');
    if (!el) return;
    var d = info && info.lance_le ? dateLongue(info.lance_le) : null;
    el.textContent = d || 'à venir';
  }
  window.PAPReglementFetes = { dateLongue: dateLongue, remplir: remplir };
  fetch('/api/platform?endpoint=concours-fetes-public')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(remplir)
    .catch(function () { remplir(null); });
})();
