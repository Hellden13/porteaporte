/* js/fetes.js — Thème et Concours des Fêtes PorteàPorte (jusqu'au 6 janvier 2027 inclus).
   Léger : aucune image, aucune police, aucune musique. Un seul appel (concours-fetes-public, mis en cache 5 min).
   Accueil : <script src="/js/fetes.js" data-fetes="accueil" defer></script> (flocons + compte à rebours).
   Autres pages : <script src="/js/fetes.js" defer></script> (bannière seulement). */
(function () {
  'use strict';

  var FIN_CONCOURS = Date.parse('2027-01-01T04:59:59.999Z'); // 31 déc. 2026 23 h 59, heure du Québec
  var FIN_THEME = Date.parse('2027-01-07T05:00:00.000Z');    // coupé le 7 janvier 2027 à 0 h (Québec)
  var maintenant = function () { return (window.__fetesNow ? window.__fetesNow() : Date.now()); };

  // Garde-fou côté navigateur : après le 6 janvier, rien du tout, même si le serveur ne répond pas.
  if (maintenant() >= FIN_THEME) return;

  var script = document.currentScript;
  var accueil = !!(script && script.getAttribute('data-fetes') === 'accueil');

  function css() {
    if (document.getElementById('fetes-css')) return;
    var s = document.createElement('style');
    s.id = 'fetes-css';
    s.textContent =
      ':root{--fetes-rouge:#c8102e;--fetes-vert:#1f6f43}' +
      '.fetes-banniere{position:relative;z-index:50;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 12px;' +
      'padding:10px 16px;background:linear-gradient(90deg,var(--fetes-vert),#14532d 45%,var(--fetes-rouge));color:#fff;' +
      'font:600 .95rem/1.35 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;border-bottom:2px solid #f5d061}' +
      '.fetes-banniere a{color:#fff;text-decoration:underline;font-weight:800;white-space:nowrap}' +
      '.fetes-decompte{display:inline-block;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.18);font-variant-numeric:tabular-nums;white-space:nowrap}' +
      'body.theme-fetes .btn-primary,body.theme-fetes .btn-go{box-shadow:0 0 0 2px rgba(200,16,46,.35)}' +
      'body.theme-fetes h1{text-shadow:0 2px 14px rgba(31,111,67,.35)}' +
      '.fetes-neige{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:40}' +
      '.fetes-neige i{position:absolute;top:-40px;font-style:normal;line-height:1;color:#fff;opacity:.9;' +
      'text-shadow:0 0 6px rgba(190,225,255,.9);animation:fetes-chute linear infinite;will-change:transform}' +
      '@keyframes fetes-chute{0%{transform:translate3d(0,0,0) rotate(0)}50%{transform:translate3d(var(--dx,20px),55vh,0) rotate(180deg)}' +
      '100%{transform:translate3d(0,112vh,0) rotate(360deg)}}' +
      'body.theme-fetes .hero{position:relative}' +
      '.fetes-guirlande{position:absolute;left:0;right:0;top:6px;height:34px;display:flex;justify-content:space-around;pointer-events:none;z-index:2}' +
      '.fetes-guirlande::before{content:"";position:absolute;left:0;right:0;top:-14px;height:26px;border-bottom:2px solid #2b4a35;border-radius:0 0 50% 50%/0 0 100% 100%}' +
      '.fetes-guirlande b{position:relative;width:11px;height:17px;border-radius:50% 50% 45% 45%;margin-top:9px;' +
      'background:var(--c);box-shadow:0 0 10px 2px var(--c);animation:fetes-scintille 3.2s ease-in-out infinite}' +
      '.fetes-guirlande b::before{content:"";position:absolute;left:3px;top:-4px;width:5px;height:5px;border-radius:1px;background:#3b3b3b}' +
      '@keyframes fetes-scintille{0%,100%{opacity:1;filter:brightness(1.15)}50%{opacity:.45;filter:brightness(.7)}}' +
      '.fetes-voeux{list-style:none;margin-top:10px;font-weight:700;color:#ffd7d7}' +
      'body.theme-fetes .brand{position:relative}' +
      '.fetes-sapin{position:absolute;left:24px;top:-7px;font-size:15px;line-height:1;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}' +
      'a.btn.fetes-rouge{background:linear-gradient(180deg,#e0303f,#a40f22)!important;color:#fff!important;border-color:#f5d061!important;' +
      'box-shadow:0 6px 20px rgba(200,16,46,.45)!important}' +
      '@media (prefers-reduced-motion: reduce){.fetes-guirlande b{animation:none}}' +
      '@media (max-width:560px){.fetes-banniere{font-size:.8rem;padding:7px 10px;gap:4px 8px}}' +
      '@media (prefers-reduced-motion: reduce){.fetes-neige{display:none}}';
    document.head.appendChild(s);
  }

  function texteDecompte() {
    var reste = FIN_CONCOURS - maintenant();
    if (reste <= 0) return '';
    var j = Math.floor(reste / 86400000);
    var h = Math.floor((reste % 86400000) / 3600000);
    var m = Math.floor((reste % 3600000) / 60000);
    return j > 0 ? ('J-' + j + ' · ' + h + ' h') : (h + ' h ' + (m < 10 ? '0' : '') + m + ' min');
  }

  function banniere(info) {
    if (document.querySelector('.fetes-banniere')) return;
    var b = document.createElement('div');
    b.className = 'fetes-banniere';
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', 'Concours des Fêtes');
    var ouvert = maintenant() <= FIN_CONCOURS && info.concours_ouvert !== false;
    var span = document.createElement('span');
    span.textContent = ouvert
      ? '🎄 Concours des Fêtes : chaque livraison ou trajet = 1 chance de gagner une carte-cadeau de 100 $ !'
      : '🎄 Concours des Fêtes terminé : merci ! Le tirage aura lieu bientôt.';
    b.appendChild(span);
    if (accueil && ouvert) {
      var d = document.createElement('span');
      d.className = 'fetes-decompte';
      d.setAttribute('aria-label', 'Temps restant avant la fin du concours');
      d.textContent = '⏳ ' + texteDecompte();
      b.appendChild(d);
      setInterval(function () { d.textContent = '⏳ ' + texteDecompte(); }, 60000);
    }
    var a = document.createElement('a');
    a.href = info.reglement || '/concours-fetes-reglement.html';
    a.textContent = 'Règlement';
    b.appendChild(a);
    document.body.insertBefore(b, document.body.firstChild);
  }

  function neige() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.querySelector('.fetes-neige')) return;
    var box = document.createElement('div');
    box.className = 'fetes-neige';
    box.setAttribute('aria-hidden', 'true');
    var petit = window.innerWidth && window.innerWidth < 600;
    var nombre = petit ? 9 : 14;
    for (var k = 0; k < nombre; k++) {
      var f = document.createElement('i');
      f.textContent = '❄';
      f.style.left = ((k + Math.random()) * 100 / nombre).toFixed(1) + '%';
      f.style.fontSize = (12 + Math.round(Math.random() * 16)) + 'px';
      f.style.opacity = (0.6 + Math.random() * 0.35).toFixed(2);
      f.style.animationDuration = (14 + Math.random() * 10).toFixed(1) + 's';
      f.style.animationDelay = (-Math.random() * 20).toFixed(1) + 's';
      f.style.setProperty('--dx', (Math.random() * 80 - 40).toFixed(0) + 'px');
      box.appendChild(f);
    }
    document.body.appendChild(box);
  }

  function decorerAccueil() {
    // Guirlande de lumières en haut de la section d'accueil (CSS seulement).
    var hero = document.querySelector('.hero');
    if (hero && !hero.querySelector('.fetes-guirlande')) {
      var g = document.createElement('div');
      g.className = 'fetes-guirlande';
      g.setAttribute('aria-hidden', 'true');
      var couleurs = ['#ff3b4e', '#34d17a', '#ffd24d', '#4fb3ff'];
      for (var n = 0; n < 22; n++) {
        var b = document.createElement('b');
        b.style.setProperty('--c', couleurs[n % couleurs.length]);
        b.style.animationDelay = (-(n % 7) * 0.45).toFixed(2) + 's';
        g.appendChild(b);
      }
      hero.insertBefore(g, hero.firstChild);
    }
    // Petite ligne de vœux sous « La communauté gagne. »
    var fil = document.querySelector('.hero-thread');
    if (fil && !fil.querySelector('.fetes-voeux')) {
      var li = document.createElement('li');
      li.className = 'fetes-voeux';
      li.textContent = '🎁 Joyeuses Fêtes de la part de l\'équipe PorteàPorte !';
      fil.appendChild(li);
    }
    // Petit sapin discret posé sur le coin du logo (ne change pas la mise en page).
    var marque = document.querySelector('.brand');
    if (marque && !marque.querySelector('.fetes-sapin')) {
      var sapin = document.createElement('span');
      sapin.className = 'fetes-sapin';
      sapin.setAttribute('aria-hidden', 'true');
      sapin.textContent = '🎄';
      marque.appendChild(sapin);
    }
    // Bouton « Trouver un trajet » en rouge festif.
    var bouton = document.querySelector('.hero-actions a[href="/covoiturage.html"]');
    if (bouton) bouton.classList.add('fetes-rouge');
  }

  function appliquer(info) {
    if (!info || !info.theme_actif || maintenant() >= FIN_THEME) return;
    css();
    document.body.classList.add('theme-fetes');
    banniere(info);
    if (accueil) { neige(); decorerAccueil(); }
  }

  function demarrer() {
    fetch('/api/platform?endpoint=concours-fetes-public')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(appliquer)
      .catch(function () { /* pas de thème si le serveur ne répond pas */ });
  }

  window.PAPFetes = { appliquer: appliquer, texteDecompte: texteDecompte, FIN_CONCOURS: FIN_CONCOURS, FIN_THEME: FIN_THEME };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
