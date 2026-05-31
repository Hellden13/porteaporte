/**
 * PorteàPorte — Mini carte Leaflet pour points safe d'un trajet
 *
 * Usage:
 *   PapSafeMap.render(containerEl, { pickup: {...}, dropoff: {...} });
 *
 * Requiert que Leaflet soit chargé (cdn.jsdelivr.net/npm/leaflet@1.9.4)
 * Si non chargé, le widget charge le script + CSS lui-même.
 */
(function () {
  if (window.PapSafeMap) return;

  const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_JS  = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';

  function loadCss(href) {
    return new Promise((resolve) => {
      if (document.querySelector(`link[href="${href}"]`)) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = resolve; l.onerror = resolve;
      document.head.appendChild(l);
    });
  }
  function loadJs(src) {
    return new Promise((resolve, reject) => {
      if (window.L) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureLeaflet() {
    if (window.L) return;
    await loadCss(LEAFLET_CSS);
    await loadJs(LEAFLET_JS);
  }

  function gmapsUrl(p) {
    if (p?.lat && p?.lng) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    if (p?.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`;
    return null;
  }

  const TYPE_ICON = {
    restaurant: '☕', commerce: '🛒', station_essence: '⛽',
    gare: '🚆', metro: '🚆', stationnement: '🅿️', autre: '📍'
  };

  function makeCustomIcon(color, emoji) {
    return window.L.divIcon({
      className: 'pap-safe-marker',
      html: `<div style="background:${color};width:38px;height:38px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;border:3px solid #fff;">
        <span style="transform:rotate(45deg);font-size:18px;line-height:1;">${emoji}</span>
      </div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
    });
  }

  async function render(container, opts) {
    if (!container) return;
    const pickup  = opts?.pickup  || null;
    const dropoff = opts?.dropoff || null;

    // Si AUCUN point n'a de coordonnées, on affiche juste les adresses texte
    const hasGps = (pickup?.lat && pickup?.lng) || (dropoff?.lat && dropoff?.lng);
    if (!hasGps) {
      container.innerHTML = `
        ${pickup ? `<div style="padding:10px 12px;background:rgba(93,191,255,.08);border:1px solid rgba(93,191,255,.3);border-radius:10px;margin-bottom:8px"><strong>📍 Embarquement :</strong> ${pickup.name || pickup.address || '—'}</div>` : ''}
        ${dropoff ? `<div style="padding:10px 12px;background:rgba(125,255,193,.08);border:1px solid rgba(125,255,193,.3);border-radius:10px"><strong>🏁 Débarquement :</strong> ${dropoff.name || dropoff.address || '—'}</div>` : ''}
      `;
      return;
    }

    await ensureLeaflet();
    const L = window.L;

    // Render conteneur carte + adresses
    container.innerHTML = `
      <div id="pap-safe-map" style="width:100%;height:320px;border-radius:14px;overflow:hidden;border:1px solid #1e2535;margin-bottom:12px"></div>
      <div id="pap-safe-cards" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>
    `;

    const mapEl = container.querySelector('#pap-safe-map');
    const map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    const bounds = [];
    if (pickup?.lat && pickup?.lng) {
      const ic = makeCustomIcon('#5dbfff', TYPE_ICON[pickup.type] || '📍');
      L.marker([pickup.lat, pickup.lng], { icon: ic })
        .bindPopup(`<strong>${pickup.name}</strong><br>${pickup.address || ''}`)
        .addTo(map);
      bounds.push([pickup.lat, pickup.lng]);
    }
    if (dropoff?.lat && dropoff?.lng) {
      const ic = makeCustomIcon('#7dffc1', TYPE_ICON[dropoff.type] || '🏁');
      L.marker([dropoff.lat, dropoff.lng], { icon: ic })
        .bindPopup(`<strong>${dropoff.name}</strong><br>${dropoff.address || ''}`)
        .addTo(map);
      bounds.push([dropoff.lat, dropoff.lng]);
    }
    // Ligne entre les deux points
    if (bounds.length === 2) {
      L.polyline(bounds, { color: '#5dbfff', weight: 3, opacity: 0.6, dashArray: '8 6' }).addTo(map);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    }

    // Force redraw au cas où le conteneur était caché
    setTimeout(() => map.invalidateSize(), 100);

    // Cartes texte sous la carte
    const cards = container.querySelector('#pap-safe-cards');
    const cardHtml = (label, color, p) => {
      if (!p) return '<div></div>';
      const url = gmapsUrl(p);
      const badges = [];
      if (p.has_cameras) badges.push('📹');
      if (p.well_lit) badges.push('💡');
      if (p.parking_free) badges.push('🅿️');
      return `<div style="padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid ${color};border-radius:12px">
        <div style="font-size:.78rem;color:${color};font-weight:800;letter-spacing:.05em;margin-bottom:6px">${label}</div>
        <div style="font-weight:800;color:#fff;margin-bottom:4px">${TYPE_ICON[p.type]||'📍'} ${p.name||'—'}</div>
        <div style="color:#a8b0ba;font-size:.85rem;margin-bottom:6px">${p.address||''}${p.sector?' · '+p.sector:''}</div>
        ${p.hours ? `<div style="color:#a8b0ba;font-size:.78rem;margin-bottom:6px">🕒 ${p.hours}</div>` : ''}
        ${badges.length ? `<div style="font-size:.85rem;margin-bottom:8px">${badges.join(' ')}</div>` : ''}
        ${url ? `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;background:rgba(93,191,255,.15);color:#5dbfff;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:.78rem;font-weight:700;border:1px solid rgba(93,191,255,.4)">🗺️ Itinéraire Google Maps</a>` : ''}
      </div>`;
    };
    cards.innerHTML = cardHtml('📍 EMBARQUEMENT', 'rgba(93,191,255,.5)', pickup) +
                      cardHtml('🏁 DÉBARQUEMENT', 'rgba(125,255,193,.5)', dropoff);

    // Responsive : empile les cartes sur petit écran
    if (window.innerWidth < 640) cards.style.gridTemplateColumns = '1fr';
  }

  window.PapSafeMap = { render };
})();
