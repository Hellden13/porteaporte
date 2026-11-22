/* js/codes-livraison.js — Affiche les deux codes d'une livraison à l'expéditeur.
   Les codes viennent du serveur (endpoint livraison-codes, réservé à l'expéditeur) : ce sont toujours
   les mêmes, créés avec la livraison.
   Utilisation : PAPCodes.afficher(conteneur, livraisonId) */
(function () {
  'use strict';
  if (window.PAPCodes) return;

  var NOMS = {
    ramassage: { titre: '🔑 Code de ramassage', aide: 'À donner au livreur quand il vient chercher le colis.' },
    reception: { titre: '📬 Code de réception', aide: 'À donner à la personne qui reçoit le colis. C\'est ce code qui libère le paiement.' }
  };

  function css() {
    if (document.getElementById('pap-codes-css')) return;
    var s = document.createElement('style');
    s.id = 'pap-codes-css';
    s.textContent =
      '.pap-codes{display:grid;gap:10px;margin:12px 0}' +
      '.pap-code{border:1px solid rgba(255,200,0,.4);background:rgba(255,200,0,.07);border-radius:10px;padding:12px 14px}' +
      '.pap-code-titre{font-weight:800;color:#ffd84d;font-size:.9rem}' +
      '.pap-code-valeur{font-size:1.7rem;font-weight:900;letter-spacing:.2em;color:#fff;margin:4px 0;font-variant-numeric:tabular-nums}' +
      '.pap-code-aide{color:#c9d1db;font-size:.84rem;line-height:1.4}' +
      '.pap-code-note{color:#c9d1db;font-size:.82rem}';
    document.head.appendChild(s);
  }

  async function jeton() {
    try {
      var db = window.db || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
      if (!db) return null;
      var r = await db.auth.getSession();
      return r && r.data && r.data.session ? r.data.session.access_token : null;
    } catch (_) { return null; }
  }

  function bloc(sorte, code) {
    var d = document.createElement('div');
    d.className = 'pap-code';
    var t = document.createElement('div'); t.className = 'pap-code-titre'; t.textContent = NOMS[sorte].titre;
    var v = document.createElement('div'); v.className = 'pap-code-valeur'; v.textContent = code || '—';
    v.setAttribute('data-code', sorte);
    var a = document.createElement('div'); a.className = 'pap-code-aide'; a.textContent = NOMS[sorte].aide;
    d.appendChild(t); d.appendChild(v); d.appendChild(a);
    return d;
  }

  async function lire(livraisonId) {
    var t = await jeton();
    if (!t) return null;
    var r = await fetch('/api/platform?endpoint=livraison-codes&livraison_id=' + encodeURIComponent(livraisonId), {
      headers: { Authorization: 'Bearer ' + t }
    }).catch(function () { return null; });
    if (!r || !r.ok) return null;
    return r.json().catch(function () { return null; });
  }

  async function afficher(conteneur, livraisonId) {
    if (!conteneur || !livraisonId) return null;
    css();
    var out = await lire(livraisonId);
    if (!out) return null;
    conteneur.textContent = '';
    var box = document.createElement('div');
    box.className = 'pap-codes';
    box.appendChild(bloc('ramassage', out.code_ramassage));
    box.appendChild(bloc('reception', out.code_reception));
    if (out.note) {
      var n = document.createElement('div'); n.className = 'pap-code-note'; n.textContent = out.note;
      box.appendChild(n);
    }
    conteneur.appendChild(box);
    return out;
  }

  window.PAPCodes = { afficher: afficher, lire: lire, NOMS: NOMS };
})();
