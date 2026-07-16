/**
 * PorteàPorte — PWA Install Prompt + Service Worker register
 * - Enregistre le service worker
 * - Affiche un bandeau "Installer l'app" si éligible
 * - L'utilisateur peut installer en 1 clic comme une vraie app
 */
(function() {
  if (window.__papPwa) return;
  window.__papPwa = true;

  // Enregistrer le service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('[PWA] SW register failed:', err);
      });
    });
  }

  let deferredPrompt = null;
  const DISMISS_KEY = 'pap_pwa_dismissed';
  const dismissedDays = (() => {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return 0;
    return Math.floor((Date.now() - Number(v)) / (1000 * 60 * 60 * 24));
  })();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Re-proposer après 7 jours si dismissed
    if (dismissedDays >= 0 && dismissedDays < 7) return;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (document.getElementById('pap-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pap-install-banner';
    banner.style.cssText = `
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      z-index: 99997; width: calc(100% - 32px); max-width: 460px;
      background: linear-gradient(135deg, #0a0e14, #001828);
      border: 1px solid rgba(184,245,62,.4);
      border-radius: 14px; padding: 14px 16px;
      box-shadow: 0 16px 50px rgba(0,0,0,.5), 0 0 30px rgba(184,245,62,.15);
      display: flex; align-items: center; gap: 12px; animation: papSlideUp .4s ease;
    `;
    banner.innerHTML = `
      <div style="font-size:28px;flex-shrink:0">📲</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:900;color:#fff;font-size:.92rem">Installer PorteàPorte</div>
        <div style="color:#a8b0ba;font-size:.78rem;margin-top:2px">Accès rapide + notifications</div>
      </div>
      <button id="pap-install-btn" style="background:linear-gradient(135deg,#b8f53e,#78d900);color:#071006;border:none;padding:10px 16px;border-radius:8px;font-weight:900;cursor:pointer;font-size:.85rem">Installer</button>
      <button id="pap-install-dismiss" style="background:transparent;color:#a8b0ba;border:none;font-size:1.5rem;cursor:pointer;padding:0 6px;line-height:1">×</button>
    `;
    if (!document.querySelector('style[data-papPwa]')) {
      const style = document.createElement('style');
      style.dataset.papPwa = '1';
      style.textContent = `@keyframes papSlideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }`;
      document.head.appendChild(style);
    }
    document.body.appendChild(banner);
    document.getElementById('pap-install-btn').onclick = async () => {
      if (!deferredPrompt) { banner.remove(); return; }
      banner.remove();
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        if (window.PAP_DEBUG) console.log('[PWA] App installée');
      } else {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
      deferredPrompt = null;
    };
    document.getElementById('pap-install-dismiss').onclick = () => {
      banner.remove();
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };
  }

  // Détection installation réussie
  window.addEventListener('appinstalled', () => {
    if (window.PAP_DEBUG) console.log('[PWA] App installée avec succès');
    localStorage.removeItem(DISMISS_KEY);
  });
})();
