// js/onglets-membre.js — Tableau de bord membre à 6 onglets (plan du site, étape 3 ; décision de Denis, 24 nov. 2026)
//
// Une seule adresse : /dashboard.html?onglet=…&vue=…
//  - dashboard.html (la coquille) va chercher la page de l'onglet (membre-*.html) et la remplace en entier
//    (document.open / write / close). Le contenu des anciennes pages est réutilisé TEL QUEL, et une seule
//    page est chargée à la fois : leurs scripts ne se marchent jamais dessus.
//  - Chaque page membre-*.html charge ce script en premier : il ajoute la barre des 6 onglets (tuiles 2 × 3
//    au cellulaire) et, si on ouvre la page directement, renvoie vers la coquille.
//  - Les 10 anciennes adresses (dashboard-livreur.html, profile.html, …) sont de petites pages qui renvoient
//    vers le bon onglet en gardant la requête (?mission=…) et l'ancre (#…).
(function () {
  'use strict';

  // page → onglet. La première page de chaque onglet est sa vue par défaut.
  var ONGLETS = [
    { id: 'accueil', ic: '🏠', nom: 'Accueil', vues: [['accueil', 'Accueil']] },
    { id: 'covoiturage', ic: '🚗', nom: 'Covoiturage', vues: [['covoiturage', 'Covoiturage']] },
    { id: 'envois', ic: '📦', nom: 'Mes envois', vues: [['envois', 'Envoyés'], ['recus', 'Reçus']] },
    { id: 'livrer', ic: '🚚', nom: 'Livrer', vues: [['livrer', 'Livrer']] },
    { id: 'paiements', ic: '💳', nom: 'Paiements', vues: [['paiements', 'Historique'], ['versements', 'Versements']] },
    { id: 'compte', ic: '👤', nom: 'Compte', vues: [['profil', 'Profil'], ['securite', 'Sécurité'], ['badges', 'Badges'], ['parrainage', 'Parrainage']] },
  ];
  var PAGE_ONGLET = {};
  ONGLETS.forEach(function (o) { o.vues.forEach(function (v) { PAGE_ONGLET[v[0]] = o; }); });

  function onglet(id) { for (var i = 0; i < ONGLETS.length; i++) if (ONGLETS[i].id === id) return ONGLETS[i]; return null; }

  // ?onglet=…&vue=… → clé de page (accueil par défaut ; vue inconnue → vue par défaut de l'onglet).
  function resoudre(search) {
    var p = new URLSearchParams(search || '');
    var o = onglet(p.get('onglet')) || ONGLETS[0];
    var v = p.get('vue');
    for (var i = 0; i < o.vues.length; i++) if (o.vues[i][0] === v) return v;
    return o.vues[0][0];
  }

  // Adresse de la coquille pour une page, en gardant les autres paramètres et l'ancre.
  function adresse(page, search, hash) {
    var o = PAGE_ONGLET[page] || ONGLETS[0];
    var p = new URLSearchParams(search || '');
    p.delete('onglet'); p.delete('vue');
    var reste = p.toString();
    return '/dashboard.html?onglet=' + o.id + (page !== o.vues[0][0] ? '&vue=' + page : '') + (reste ? '&' + reste : '') + (hash || '');
  }

  window.PAP_ONGLETS = { ONGLETS: ONGLETS, resoudre: resoudre, adresse: adresse };

  var html = document.documentElement;

  // 1) Ancienne adresse (petite page de renvoi) : <html data-pap-vers="livrer">
  if (html.getAttribute('data-pap-vers')) {
    location.replace(adresse(html.getAttribute('data-pap-vers'), location.search, location.hash));
    return;
  }

  // 2) Coquille dashboard.html : charge la page de l'onglet et la met à la place.
  if (html.hasAttribute('data-pap-coquille')) {
    var page = resoudre(location.search);
    window.__PAP_PAGE = page;
    var essai = function () {
      fetch('/membre-' + page + '.html', { credentials: 'same-origin', headers: { accept: 'text/html' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (texte) {
          var ecrire = function () { document.open(); document.write(texte); document.close(); };
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ecrire); else ecrire();
        })
        .catch(function () {
          var m = document.getElementById('pap-chargement');
          if (m) m.innerHTML = 'Impossible de charger cette page. Vérifie ta connexion. <button type="button" id="pap-reessayer">Réessayer</button>';
          var b = document.getElementById('pap-reessayer');
          if (b) b.onclick = function () { location.reload(); };
        });
    };
    essai();
    return;
  }

  // 3) Page membre-*.html
  var m = /\/membre-([a-z]+)\.html$/.exec(location.pathname);
  if (m && PAGE_ONGLET[m[1]]) {
    // Ouverte directement : on passe par la coquille (même adresse pour tout le monde).
    location.replace(adresse(m[1], location.search, location.hash));
    return;
  }
  var cle = window.__PAP_PAGE;
  if (!cle || !PAGE_ONGLET[cle] || window.__papOngletsPose === document) return;
  window.__papOngletsPose = document;
  var actif = PAGE_ONGLET[cle];

  var CSS = '' +
    '.pap-ong{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 16px;margin:0;background:#0A0F1E;border-bottom:1px solid #1E2A3A;box-sizing:border-box;width:100%;position:relative;z-index:40}' +
    '.pap-ong *{box-sizing:border-box}' +
    '.pap-ong a.pap-tuile{display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:58px;padding:4px 2px;border-radius:12px;' +
      'background:#111827!important;border:1px solid #1E2A3A!important;color:#E8EDF5!important;text-decoration:none!important;font:700 .92rem/1.2 -apple-system,"Inter","Segoe UI",sans-serif!important;text-align:center;margin:0}' +
    '.pap-ong a.pap-tuile .pap-ic{font-size:1.25rem;line-height:1}' +
    '.pap-ong a.pap-tuile[aria-current="page"]{background:rgba(93,191,255,.16)!important;border-color:#5dbfff!important;color:#5dbfff!important}' +
    '.pap-ong a.pap-tuile:focus-visible,.pap-vues a:focus-visible,.pap-vues button:focus-visible{outline:3px solid #5dbfff;outline-offset:2px}' +
    '.pap-ong a.pap-tuile[hidden]{display:none!important}' +
    '.pap-vues{display:flex;flex-wrap:wrap;gap:6px;padding:8px 16px 10px;margin:0;background:#0A0F1E;border-bottom:1px solid #1E2A3A;box-sizing:border-box;width:100%;position:relative;z-index:40}' +
    '.pap-vues a,.pap-vues button{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:46px;padding:0 14px;border-radius:12px;' +
      'background:#111827!important;border:1px solid #1E2A3A!important;color:#E8EDF5!important;text-decoration:none!important;font:700 .95rem/1.2 -apple-system,"Inter","Segoe UI",sans-serif!important;cursor:pointer;margin:0;white-space:nowrap}' +
    '.pap-vues [aria-current="page"],.pap-vues [aria-pressed="true"]{background:rgba(93,191,255,.16)!important;border-color:#5dbfff!important;color:#5dbfff!important}' +
    '@media (min-width:769px){.pap-ong{grid-template-columns:repeat(6,1fr);padding:12px 24px}.pap-ong a.pap-tuile{min-height:54px;flex-direction:row;gap:8px;font-size:1rem!important}.pap-vues{padding:8px 24px 12px}.pap-vues a,.pap-vues button{flex:0 0 auto}}';

  function livreurConnu() { try { return localStorage.getItem('pap_onglet_livrer') === '1'; } catch (_) { return false; } }

  function construire() {
    if (document.getElementById('pap-onglets')) return;
    var st = document.createElement('style');
    st.id = 'pap-onglets-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);

    var barre = document.createElement('div');
    barre.id = 'pap-onglets';
    barre.className = 'pap-ong';
    barre.setAttribute('role', 'navigation');
    barre.setAttribute('aria-label', 'Mon tableau de bord');
    ONGLETS.forEach(function (o) {
      var a = document.createElement('a');
      a.className = 'pap-tuile';
      a.href = '/dashboard.html?onglet=' + o.id;
      a.setAttribute('data-onglet', o.id);
      a.innerHTML = '<span class="pap-ic" aria-hidden="true">' + o.ic + '</span><span>' + o.nom + '</span>';
      if (o === actif) a.setAttribute('aria-current', 'page');
      // « Livrer » : seulement pour les livreurs (ou si on est déjà dessus).
      if (o.id === 'livrer' && o !== actif && !livreurConnu()) a.hidden = true;
      barre.appendChild(a);
    });

    var vues = null;
    if (actif.vues.length > 1) {
      vues = document.createElement('div');
      vues.className = 'pap-vues';
      vues.id = 'pap-vues';
      vues.setAttribute('role', 'navigation');
      vues.setAttribute('aria-label', actif.nom);
      actif.vues.forEach(function (v) {
        var a = document.createElement('a');
        a.href = adresse(v[0], '', '');
        a.textContent = v[1];
        if (v[0] === cle) a.setAttribute('aria-current', 'page');
        vues.appendChild(a);
      });
    } else if (cle === 'covoiturage') {
      // Covoiturage : raccourcis vers les sections existantes de la page (showSection).
      vues = document.createElement('div');
      vues.className = 'pap-vues';
      vues.id = 'pap-vues';
      vues.setAttribute('role', 'group');
      vues.setAttribute('aria-label', 'Covoiturage');
      [['trajets', 'Je conduis'], ['reservations', 'Je voyage'], ['avis', 'Avis']].forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = s[1];
        b.setAttribute('data-section', s[0]);
        b.setAttribute('aria-pressed', 'false');
        b.onclick = function () {
          if (typeof window.showSection === 'function') window.showSection(s[0]);
          Array.prototype.forEach.call(vues.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        };
        vues.appendChild(b);
      });
    }

    // Juste sous l'en-tête de la page (sinon tout en haut).
    var entete = document.querySelector('body > header, body > nav, body > .navbar, body > .topbar, body > div > header.topbar, body > div > nav.navbar, body > .container > header');
    var apres = entete && entete.getBoundingClientRect().top < 200 ? entete : null;
    var parent = apres ? apres.parentNode : document.body;
    var ref = apres ? apres.nextSibling : document.body.firstChild;
    parent.insertBefore(barre, ref);
    if (vues) parent.insertBefore(vues, barre.nextSibling);
    document.body.classList.add('pap-avec-onglets');
    verifierLivreur();
  }

  // Vrai rôle (même règle que la page livreur) ; mémorisé pour éviter que la tuile clignote.
  function verifierLivreur() {
    var db = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.db;
    if (!db || !db.auth) return;
    db.auth.getSession().then(function (r) {
      var uid = r && r.data && r.data.session && r.data.session.user && r.data.session.user.id;
      if (!uid) return null;
      return db.from('profiles').select('role,est_livreur').eq('id', uid).maybeSingle();
    }).then(function (r) {
      if (!r || r.error || !r.data) return;
      var role = String(r.data.role || '').toLowerCase();
      var oui = r.data.est_livreur === true || ['livreur', 'les deux', 'admin'].indexOf(role) >= 0;
      try { localStorage.setItem('pap_onglet_livrer', oui ? '1' : '0'); } catch (_) {}
      var t = document.querySelector('#pap-onglets [data-onglet="livrer"]');
      if (t && actif.id !== 'livrer') t.hidden = !oui;
    }).catch(function () {});
  }

  // Liens vers /login.html sans destination (ex. « Se connecter » de Parrainage, « Mon profil » de Badges) :
  // on ajoute ?next= pour revenir au même onglet après la connexion.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    try {
      var u = new URL(a.getAttribute('href'), location.href);
      if (u.origin !== location.origin || u.pathname !== '/login.html') return;
      if (u.searchParams.get('next') || u.searchParams.get('redirect') || u.searchParams.get('return')) return;
      u.searchParams.set('next', location.pathname + location.search);
      a.href = u.pathname + u.search + u.hash;
    } catch (_) {}
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', construire); else construire();
})();
