/**
 * PorteàPorte — Compteur d'impact live
 * Affiche des stats temps réel (livraisons, $ aux causes, CO2, livreurs)
 * À injecter dans n'importe quelle page : <div id="pap-impact-counter"></div>
 */
(function() {
  if (window.__papImpact) return;
  window.__papImpact = true;

  function injectStyles() {
    if (document.getElementById('pap-impact-styles')) return;
    const s = document.createElement('style');
    s.id = 'pap-impact-styles';
    s.textContent = `
      .pap-impact-wrap { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; padding: 28px 20px; background: linear-gradient(135deg, rgba(0,217,255,.05), rgba(184,245,62,.06)); border: 1px solid rgba(184,245,62,.25); border-radius: 16px; margin: 24px 0; }
      .pap-impact-stat { text-align: center; padding: 14px; }
      .pap-impact-icon { font-size: 2.2rem; margin-bottom: 6px; }
      .pap-impact-val { font-size: 2.2rem; font-weight: 900; color: #b8f53e; line-height: 1; margin-bottom: 4px; transition: all .8s ease; font-variant-numeric: tabular-nums; }
      .pap-impact-lbl { font-size: .82rem; color: #a8b0ba; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
      .pap-impact-pulse { position: relative; }
      .pap-impact-pulse::after { content: ''; position: absolute; top: 6px; right: -8px; width: 8px; height: 8px; background: #5dbfff; border-radius: 50%; box-shadow: 0 0 0 0 rgba(93,191,255,.5); animation: papPulse 2s infinite; }
      @keyframes papPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(93,191,255,.5); } 50% { box-shadow: 0 0 0 8px rgba(93,191,255,0); } }
      .pap-impact-title { text-align: center; color: #b8f53e; font-weight: 900; font-size: .85rem; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 6px; }
      .pap-impact-subtitle { text-align: center; color: #a8b0ba; font-size: .85rem; margin-bottom: 18px; }
    `;
    document.head.appendChild(s);
  }

  function animateNumber(el, target, suffix = '') {
    const start = Number(el.dataset.current || 0);
    const duration = 1200;
    const startTime = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + (target - start) * eased);
      el.textContent = value.toLocaleString('fr-CA') + suffix;
      if (progress < 1) requestAnimationFrame(tick);
      else el.dataset.current = String(target);
    }
    requestAnimationFrame(tick);
  }

  async function render(container) {
    container.innerHTML = `
      <div class="pap-impact-title">📊 Impact en temps réel <span class="pap-impact-pulse"></span></div>
      <div class="pap-impact-subtitle">Chaque trajet citoyen compte. Voici notre empreinte collective au Québec.</div>
      <div class="pap-impact-wrap">
        <div class="pap-impact-stat"><div class="pap-impact-icon">📦</div><div class="pap-impact-val" id="imp-livs">—</div><div class="pap-impact-lbl">Livraisons solidaires</div></div>
        <div class="pap-impact-stat"><div class="pap-impact-icon">🚗</div><div class="pap-impact-val" id="imp-livreurs">—</div><div class="pap-impact-lbl">Livreurs vérifiés</div></div>
        <div class="pap-impact-stat"><div class="pap-impact-icon">❤️</div><div class="pap-impact-val" id="imp-dons">—</div><div class="pap-impact-lbl">$ aux causes</div></div>
        <div class="pap-impact-stat"><div class="pap-impact-icon">🌱</div><div class="pap-impact-val" id="imp-co2">—</div><div class="pap-impact-lbl">CO₂ évité</div></div>
      </div>
    `;
    try {
      const res = await fetch('/api/platform?endpoint=public-impact-stats');
      const stats = await res.json();
      animateNumber(document.getElementById('imp-livs'), stats.livraisons || 0);
      animateNumber(document.getElementById('imp-livreurs'), stats.livreurs || 0);
      animateNumber(document.getElementById('imp-dons'), stats.dons_cause || 0, ' $');
      animateNumber(document.getElementById('imp-co2'), stats.co2_evite_kg || 0, ' kg');
    } catch (e) {
      // Fallback : valeurs initiales (pour effet beta même sans données)
      animateNumber(document.getElementById('imp-livs'), 0);
      animateNumber(document.getElementById('imp-livreurs'), 0);
      animateNumber(document.getElementById('imp-dons'), 0, ' $');
      animateNumber(document.getElementById('imp-co2'), 0, ' kg');
    }
  }

  function init() {
    injectStyles();
    document.querySelectorAll('#pap-impact-counter, .pap-impact-counter').forEach(render);
    // Refresh toutes les 60 sec
    setInterval(() => {
      document.querySelectorAll('#pap-impact-counter, .pap-impact-counter').forEach(render);
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
