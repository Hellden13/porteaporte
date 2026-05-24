/**
 * PorteàPorte — Analytics Plausible (privacy-friendly, RGPD-compliant)
 * Compte officiel : porteaporte.site
 */
(function() {
  if (window.__papAnalytics) return;
  window.__papAnalytics = true;

  // Charger Plausible officiel (avec ton site ID unique)
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://plausible.io/js/pa-4AvYQwYZ3JIrAJUeOaezl.js';
  document.head.appendChild(s);

  // Init queue (avant chargement du script)
  window.plausible = window.plausible || function() {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };
  window.plausible.init = window.plausible.init || function(i) {
    window.plausible.o = i || {};
  };
  window.plausible.init();

  // Helper pour tracker des événements custom
  window.papTrack = function(eventName, props) {
    if (window.plausible) {
      window.plausible(eventName, { props: props || {} });
    }
  };

  // Auto-track des éléments avec [data-track]
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-track]');
    if (target) {
      const evt = target.dataset.track;
      const data = {};
      Object.keys(target.dataset).forEach(k => {
        if (k.startsWith('trackProp')) {
          data[k.replace('trackProp', '').toLowerCase()] = target.dataset[k];
        }
      });
      window.papTrack(evt, data);
    }
  });
})();
