/**
 * PorteàPorte — PWA Install Prompt + Service Worker register
 * - Enregistre le service worker
 * - Injecte les meta tags Apple (iOS home screen)
 * - Affiche un bandeau "Installer l'app" si éligible
 */
(function() {
  if (window.__papPwa) return;
  window.__papPwa = true;

  // ── Meta tags Apple (iOS Safari home screen) ──────────────────────────────
  function setMeta(name, content) {
    var existing = document.querySelector('meta[name="' + name + '"]');
    if (existing) return;
    var m = document.createElement('meta');
    m.name = name; m.content = content;
    document.head.appendChild(m);
  }
  function setLink(rel, href, sizes) {
    if (document.querySelector('link[rel="' + rel + '"]')) return;
    var l = document.createElement('link');
    l.rel = rel; l.href = href;
    if (sizes) l.setAttribute('sizes', sizes);
    document.head.appendChild(l);
  }
  setMeta('apple-mobile-web-app-capable', 'yes');
  setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  setMeta('apple-mobile-web-app-title', 'PorteàPorte');
  setMeta('mobile-web-app-capable', 'yes');
  setMeta('application-name', 'PorteàPorte');
  setLink('manifest', '/manifest.json');
  setLink('apple-touch-icon', '/icons/icon-192.png', '192x192');

  // ── Service Worker ────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').catch(function(err) {
        console.warn('[PWA] SW register failed:', err);
      });
    });
  }

  // ── Install Banner ────────────────────────────────────────────────────────
  var deferredPrompt = null;
  var DISMISS_KEY = 'pap_pwa_dismissed';
  var wasDismissed = !!localStorage.getItem(DISMISS_KEY);
  var dismissedDays = wasDismissed
    ? Math.floor((Date.now() - Number(localStorage.getItem(DISMISS_KEY))) / 86400000)
    : null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    // Ne pas ré-afficher si rejeté il y a moins de 7 jours
    if (wasDismissed && dismissedDays < 7) return;
    // Ne pas afficher si déjà installé
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (document.getElementById('pap-install-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'pap-install-banner';
    banner.style.cssText = [
      'position:fixed;bottom:16px;left:50%;transform:translateX(-50%)',
      'z-index:99997;width:calc(100% - 32px);max-width:460px',
      'background:linear-gradient(135deg,#0a0e14,#001828)',
      'border:1px solid rgba(184,245,62,.4)',
      'border-radius:14px;padding:14px 16px',
      'box-shadow:0 16px 50px rgba(0,0,0,.5),0 0 30px rgba(184,245,62,.15)',
      'display:flex;align-items:center;gap:12px;animation:papSlideUp .4s ease'
    ].join(';');
    banner.innerHTML =
      '<div style="font-size:28px;flex-shrink:0">📲</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:900;color:#fff;font-size:.92rem">Installer PorteàPorte</div>' +
        '<div style="color:#a8b0ba;font-size:.78rem;margin-top:2px">Accès rapide depuis ton écran d\'accueil</div>' +
      '</div>' +
      '<button id="pap-install-btn" style="background:linear-gradient(135deg,#b8f53e,#78d900);color:#071006;border:none;padding:10px 16px;border-radius:8px;font-weight:900;cursor:pointer;font-size:.85rem">Installer</button>' +
      '<button id="pap-install-dismiss" style="background:transparent;color:#a8b0ba;border:none;font-size:1.5rem;cursor:pointer;padding:0 6px;line-height:1">×</button>';

    if (!document.querySelector('style[data-papPwa]')) {
      var style = document.createElement('style');
      style.dataset.papPwa = '1';
      style.textContent = '@keyframes papSlideUp{from{transform:translate(-50%,100%);opacity:0}to{transform:translate(-50%,0);opacity:1}}';
      document.head.appendChild(style);
    }
    document.body.appendChild(banner);

    document.getElementById('pap-install-btn').onclick = function() {
      if (!deferredPrompt) { banner.remove(); return; }
      banner.remove();
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(choice) {
        if (choice.outcome !== 'accepted') {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        }
        deferredPrompt = null;
      });
    };
    document.getElementById('pap-install-dismiss').onclick = function() {
      banner.remove();
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };
  }

  window.addEventListener('appinstalled', function() {
    localStorage.removeItem(DISMISS_KEY);
  });
})();
