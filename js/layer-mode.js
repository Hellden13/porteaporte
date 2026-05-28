/**
 * PorteàPorte — Système de Couches d'Engagement
 * Couche 1 (simple)    : trouver/publier trajet, profils, prix
 * Couche 2 (discovery) : colis, récompenses, communauté, historique, badges
 * Couche 3 (immersion) : missions, IA, optimisation, impact, niveaux, automatisation
 *
 * Marquage HTML :
 *   <section data-layer="2">...</section>  → caché en mode Simple
 *   <section data-layer="3">...</section>  → caché en modes Simple + Découverte
 */
(function () {
  if (window.__PP_LAYER_LOADED__) return;
  window.__PP_LAYER_LOADED__ = true;

  const STORAGE_KEY = 'pp_layer_mode';
  const MODES = [
    { id: 'simple',    name: '🎯 Mode Simple',       desc: 'Covoit. Prix. Profils. C\'est tout.' },
    { id: 'discovery', name: '✨ Découverte',         desc: 'Ajoute colis, récompenses, communauté.' },
    { id: 'immersion', name: '🚀 Immersion',          desc: 'Tout l\'écosystème : missions, IA, impact.' }
  ];

  function getMode() {
    try { return localStorage.getItem(STORAGE_KEY) || 'simple'; }
    catch { return 'simple'; }
  }
  function setMode(id) {
    if (!MODES.find(m => m.id === id)) return;
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
    document.body.dataset.layerMode = id;
    updatePillLabel(id);
    updateMenuActive(id);
    // Hook PWA : sync au profil Supabase si dispo
    syncToProfile(id);
  }
  async function syncToProfile(mode) {
    try {
      if (!window.supa && !window.db) return;
      const client = window.supa || window.db;
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;
      // Best-effort : update colonne layer_mode si elle existe
      await client.from('profiles').update({ layer_mode: mode }).eq('id', session.user.id);
    } catch {}
  }

  function buildPill() {
    if (document.getElementById('pp-layer-pill')) return;
    const pill = document.createElement('button');
    pill.id = 'pp-layer-pill';
    pill.className = 'pp-layer-pill';
    pill.type = 'button';
    pill.setAttribute('aria-label', 'Changer le niveau d\'expérience');
    pill.innerHTML = `
      <span>Niveau</span>
      <span class="pp-layer-label" id="pp-layer-label">Simple</span>
      <span class="pp-layer-chevron">⇅</span>
    `;
    document.body.appendChild(pill);

    const menu = document.createElement('div');
    menu.id = 'pp-layer-menu';
    menu.className = 'pp-layer-menu';
    menu.innerHTML = MODES.map(m => `
      <div class="pp-layer-opt" data-mode="${m.id}">
        <span class="pp-layer-opt-name">${m.name}</span>
        <span class="pp-layer-opt-desc">${m.desc}</span>
      </div>
    `).join('');
    document.body.appendChild(menu);

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.pp-layer-opt');
      if (!opt) return;
      const id = opt.dataset.mode;
      setMode(id);
      menu.classList.remove('open');
      showToast('Niveau changé : ' + (MODES.find(m => m.id === id)?.name || id));
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
  }
  function updatePillLabel(id) {
    const el = document.getElementById('pp-layer-label');
    if (!el) return;
    const m = MODES.find(x => x.id === id);
    el.textContent = m ? m.name.replace(/^[^\s]+\s/, '') : id;
  }
  function updateMenuActive(id) {
    document.querySelectorAll('.pp-layer-opt').forEach(o => {
      o.classList.toggle('active', o.dataset.mode === id);
    });
  }
  function showToast(msg) {
    const existing = document.querySelector('.pp-layer-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'pp-layer-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function init() {
    const mode = getMode();
    document.body.dataset.layerMode = mode;
    buildPill();
    updatePillLabel(mode);
    updateMenuActive(mode);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Expose API publique
  window.PPLayer = {
    get: getMode,
    set: setMode,
    modes: MODES
  };
})();
