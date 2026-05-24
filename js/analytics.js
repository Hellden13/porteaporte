/**
 * PorteàPorte — Analytics privacy-friendly
 * Plausible (RGPD-compliant, sans cookies, libre)
 * À injecter dans toutes les pages publiques via <script defer src="/js/analytics.js"></script>
 */
(function() {
  if (window.__papAnalytics) return;
  window.__papAnalytics = true;

  // Charger Plausible (gratuit jusqu'à 10k pageviews/mois, après ~10$/mo)
  const s = document.createElement('script');
  s.defer = true;
  s.dataset.domain = 'porteaporte.site';
  s.src = 'https://plausible.io/js/script.tagged-events.outbound-links.js';
  document.head.appendChild(s);

  // Helper pour track events custom
  window.papTrack = function(eventName, props) {
    if (window.plausible) {
      window.plausible(eventName, { props: props || {} });
    }
  };

  // Auto-track des évenements clé
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-track]');
    if (target) {
      const evt = target.dataset.track;
      const data = {};
      Object.keys(target.dataset).forEach(k => {
        if (k.startsWith('trackProp')) data[k.replace('trackProp', '').toLowerCase()] = target.dataset[k];
      });
      window.papTrack(evt, data);
    }
  });
})();
