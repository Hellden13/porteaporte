/* js/code-securite.js — Code de sécurité du trajet, créé par PorteàPorte (règle de Denis, 23 nov. 2026).
   PAPCodeSecurite.afficher(conteneur, { session, bookingId })
   Affiche le code en gros, pour le PASSAGER seulement (le serveur refuse tout autre compte), avec la
   phrase « Donne ce code au conducteur à l'arrivée… ». Rien n'est affiché tant que le paiement n'est pas
   autorisé. Le passager ne crée plus son code lui-même. */
(function () {
  'use strict';
  if (window.PAPCodeSecurite) return;

  var PHRASE = 'Donne ce code au conducteur à l’arrivée pour confirmer que tu es bien arrivé(e).';

  function css() {
    if (document.getElementById('pap-code-securite-css')) return;
    var s = document.createElement('style');
    s.id = 'pap-code-securite-css';
    s.textContent =
      '.pap-cs{border-radius:14px;padding:18px 16px;margin:0 0 16px;font:400 15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;background:rgba(255,200,0,.1);border:2px solid rgba(255,200,0,.6);color:#fff3c4}' +
      '.pap-cs .titre{margin:0 0 8px;font-size:.85rem;font-weight:900;letter-spacing:.08em;color:#ffd23f}' +
      '.pap-cs .code{font:900 2.6rem/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.3em;color:#fff;margin:4px 0 10px;padding-left:.3em}' +
      '.pap-cs p{margin:0 0 4px}' +
      '.pap-cs .petit{font-size:.82rem;color:#c9b977}';
    document.head.appendChild(s);
  }

  async function afficher(conteneur, opts) {
    opts = opts || {};
    if (!conteneur || !opts.session || !opts.bookingId) return false;
    var d;
    try {
      var r = await fetch('/api/platform?endpoint=ride-code-trajet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + opts.session.access_token },
        body: JSON.stringify({ endpoint: 'ride-code-trajet', booking_id: opts.bookingId }),
      });
      d = await r.json().catch(function () { return {}; });
      if (!r.ok) { conteneur.textContent = ''; return false; }
    } catch (_) {
      conteneur.textContent = '';
      return false;
    }
    if (!d || !d.disponible) { conteneur.textContent = ''; return false; }
    css();
    var boite = document.createElement('section');
    boite.className = 'pap-cs';
    boite.id = 'code-securite';
    var titre = document.createElement('div');
    titre.className = 'titre';
    titre.textContent = '🔐 TON CODE DE SÉCURITÉ POUR CE TRAJET';
    boite.appendChild(titre);
    if (d.code) {
      var code = document.createElement('div');
      code.className = 'code';
      code.textContent = d.code;
      code.setAttribute('aria-label', 'Code de sécurité : ' + String(d.code).split('').join(' '));
      boite.appendChild(code);
      var p = document.createElement('p');
      p.textContent = PHRASE;
      boite.appendChild(p);
      var petit = document.createElement('p');
      petit.className = 'petit';
      petit.textContent = 'Ne le donne pas avant d’être arrivé(e) à destination.';
      boite.appendChild(petit);
    } else {
      var p2 = document.createElement('p');
      p2.textContent = d.phrase || 'Tu as choisi ton propre code : donne-le au conducteur à l’arrivée.';
      boite.appendChild(p2);
    }
    conteneur.textContent = '';
    conteneur.appendChild(boite);
    return true;
  }

  window.PAPCodeSecurite = { afficher: afficher, PHRASE: PHRASE };
})();
