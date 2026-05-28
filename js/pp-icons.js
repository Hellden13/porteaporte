/**
 * PorteàPorte — Système iconographique premium (Lucide-style)
 * Tous les icônes : 24x24, stroke 2, fill none, bleu électrique par défaut.
 *
 * Usage HTML : <i data-pp-icon="search"></i>  → remplacé par SVG au chargement
 * Usage JS    : el.innerHTML = PPIcons.search();
 */
(function () {
  if (window.PPIcons) return;

  const BASE = {
    width: 24,
    height: 24,
    stroke: 'currentColor',
    fill: 'none',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  function svg(inner, size) {
    const w = size || BASE.width;
    const h = size || BASE.height;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${w}" height="${h}" fill="${BASE.fill}" stroke="${BASE.stroke}" stroke-width="${BASE.strokeWidth}" stroke-linecap="${BASE.strokeLinecap}" stroke-linejoin="${BASE.strokeLinejoin}" aria-hidden="true">${inner}</svg>`;
  }

  const ICONS = {
    search:    (s) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', s),
    car:       (s) => svg('<path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>', s),
    package:   (s) => svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>', s),
    shield:    (s) => svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>', s),
    users:     (s) => svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', s),
    heart:     (s) => svg('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>', s),
    phone:     (s) => svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>', s),
    lock:      (s) => svg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', s),
    star:      (s) => svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', s),
    map:       (s) => svg('<path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', s),
    check:     (s) => svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>', s),
    arrow:     (s) => svg('<path d="M5 12h14M13 5l7 7-7 7"/>', s),
    card:      (s) => svg('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>', s),
    chat:      (s) => svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', s),
    bolt:      (s) => svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', s),
    leaf:      (s) => svg('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96a1 1 0 0 1 1.8.74 11.43 11.43 0 0 1-2.7 9.18C16 14.8 11 16 11 20z"/><path d="M2 22c0-3 1-5 5-9"/>', s),
    house:     (s) => svg('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', s),
    calendar:  (s) => svg('<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>', s),
    sparkle:   (s) => svg('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>', s),
    quebec:    (s) => svg('<path d="M12 2v20M2 12h20M5 5l14 14M19 5l-14 14"/>', s) // simple croix style fleurdelisée
  };

  function process() {
    document.querySelectorAll('[data-pp-icon]').forEach(el => {
      const name = el.dataset.ppIcon;
      const size = el.dataset.ppSize || null;
      if (ICONS[name]) {
        el.innerHTML = ICONS[name](size);
        el.style.display = 'inline-flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', process);
  else process();

  // Expose API
  window.PPIcons = { ...ICONS, process };
})();
