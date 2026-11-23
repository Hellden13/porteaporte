/* js/session-expiree.js — Session expirée : retour à la page de connexion (test complet, point 41).
   Sur une page réservée aux membres, si la session n'est plus valide (Supabase annonce la déconnexion,
   ou une route /api/ répond 401 à une demande authentifiée), on renvoie vers /login.html (ou
   /admin/login.html) avec ?expiree=1&next=<page>. Après la connexion, la page d'origine se rouvre.
   Une déconnexion volontaire (bouton « Se déconnecter ») ne déclenche rien. */
(function () {
  'use strict';
  if (window.__papSessionExpiree) return;
  window.__papSessionExpiree = true;

  var PROTEGEES = /^\/(admin\/(?!login).*|dashboard[a-z-]*|compte|profile|paiement|create-mission|browse-missions|gps-tracker|messagerie|kyc|historique-paiements|covoiturage-publier|conducteur-paiements|mes-donnees|parrainage|depot-preuve|pickup-confirm|livreur-card|confirmation)(\.html)?$/;
  function protegee() { return PROTEGEES.test(window.location.pathname); }

  function versConnexion() {
    if (!protegee() || window.__papDeconnexionVolontaire || window.__papRedirige) return false;
    window.__papRedirige = true;
    var p = window.location.pathname;
    var dest = /^\/admin\//.test(p) ? '/admin/login.html' : '/login.html';
    window.location.replace(dest + '?expiree=1&next=' + encodeURIComponent(p + window.location.search));
    return true;
  }
  window.PAPSession = { versConnexion: versConnexion, protegee: protegee };

  // 1. Une route /api/ répond 401 à une demande qui envoyait un jeton : la session n'est plus valide.
  var fetchOrigine = window.fetch;
  if (typeof fetchOrigine === 'function') {
    window.fetch = function (entree, init) {
      return fetchOrigine.apply(this, arguments).then(function (r) {
        try {
          var url = typeof entree === 'string' ? entree : (entree && entree.url) || '';
          var h = (init && init.headers) || (entree && entree.headers) || {};
          var jeton = typeof h.get === 'function' ? h.get('Authorization') : (h.Authorization || h.authorization);
          if (r && r.status === 401 && jeton && /\/api\//.test(url)) versConnexion();
        } catch (_) {}
        return r;
      });
    };
  }

  // 2. Supabase annonce la fin de la session (jeton impossible à renouveler).
  var surveille = false;
  function surveiller() {
    if (surveille) return true;
    var c = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.db;
    if (!c || !c.auth || typeof c.auth.onAuthStateChange !== 'function') return false;
    surveille = true;
    if (typeof c.auth.signOut === 'function') {
      var sortir = c.auth.signOut.bind(c.auth);
      c.auth.signOut = function () { window.__papDeconnexionVolontaire = true; return sortir.apply(null, arguments); };
    }
    c.auth.onAuthStateChange(function (evenement, session) {
      if (evenement === 'SIGNED_OUT' || (evenement === 'TOKEN_REFRESHED' && !session)) versConnexion();
    });
    return true;
  }
  if (!surveiller()) {
    document.addEventListener('DOMContentLoaded', surveiller);
    [500, 1500, 4000].forEach(function (ms) { setTimeout(surveiller, ms); });
  }

  // 3. Sur la page de connexion : dire pourquoi on est là.
  function messageConnexion() {
    if (!/\/login(\.html)?$/.test(window.location.pathname)) return;
    if (!/[?&]expiree=1\b/.test(window.location.search)) return;
    if (document.getElementById('pap-session-expiree')) return;
    var m = document.createElement('div');
    m.id = 'pap-session-expiree';
    m.setAttribute('role', 'status');
    m.textContent = 'Ta session a expiré. Reconnecte-toi pour continuer : tu reviendras à la page où tu étais.';
    m.style.cssText = 'margin:12px auto;max-width:520px;padding:12px 14px;border-radius:10px;background:rgba(255,200,0,.12);border:1px solid rgba(255,200,0,.45);color:#ffe08a;font:600 14px/1.5 system-ui,sans-serif;text-align:center';
    var cible = document.querySelector('main') || document.body;
    if (cible) cible.insertBefore(m, cible.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', messageConnexion);
  else messageConnexion();
})();
