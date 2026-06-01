/**
 * PorteàPorte — App Launcher universel
 * Bouton flottant présent sur TOUTES les pages.
 * Permet à n'importe quel user (passager, conducteur, expéditeur, livreur)
 * de naviguer entre tous les rôles sans repasser par le dashboard.
 *
 * Inclusion : <script src="/js/app-launcher.js" defer></script>
 */
(function () {
  if (window.__papLauncher) return;
  window.__papLauncher = true;

  // ─── Liens disponibles (tous rôles confondus) ─────────────────────────────
  const SECTIONS = [
    { group: 'Mon espace', items: [
      { href: '/dashboard.html',            icon: '✨', label: 'Mon dashboard',       desc: 'Tout en un seul endroit' },
      { href: '/profile.html',              icon: '👤', label: 'Mon profil',          desc: 'Photo, infos, préférences' },
    ]},
    { group: 'Covoiturage', items: [
      { href: '/covoiturage.html',          icon: '🔍', label: 'Chercher un trajet',  desc: 'Trouver un lift' },
      { href: '/covoiturage-publier.html',  icon: '🚗', label: 'Publier un trajet',   desc: 'J\'ai de la place dans mon auto' },
    ]},
    { group: 'Livraison de colis', items: [
      { href: '/create-mission.html',       icon: '📦', label: 'Envoyer un colis',    desc: 'Créer une mission' },
      { href: '/browse-missions.html',      icon: '🚚', label: 'Livrer des colis',    desc: 'Missions disponibles' },
    ]},
    { group: 'Autres', items: [
      { href: '/badges.html',               icon: '🎖️', label: 'Mes badges',          desc: 'Récompenses et progression' },
      { href: '/parrainage.html',           icon: '🤝', label: 'Parrainage',          desc: 'Inviter des amis' },
      { href: '/index.html',                icon: '🏠', label: 'Accueil',             desc: 'Page d\'accueil' },
    ]},
  ];

  // ─── CSS ──────────────────────────────────────────────────────────────────
  const css = `
    .pap-launcher-btn {
      position: fixed; bottom: 22px; right: 22px; z-index: 99990;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #5dbfff 0%, #3da9ff 100%);
      color: #051022; border: none; cursor: pointer;
      box-shadow: 0 8px 24px rgba(93,191,255,0.4), 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 900; transition: transform .2s, box-shadow .2s;
    }
    .pap-launcher-btn:hover { transform: scale(1.08); box-shadow: 0 12px 32px rgba(93,191,255,0.55); }
    .pap-launcher-btn:active { transform: scale(0.95); }
    .pap-launcher-btn .pap-dot {
      position: absolute; top: 8px; right: 8px; width: 10px; height: 10px;
      background: #ff7a7a; border-radius: 50%; border: 2px solid #051022;
      display: none;
    }
    @media (max-width: 768px) {
      .pap-launcher-btn { bottom: 86px; right: 16px; width: 52px; height: 52px; }
    }

    .pap-launcher-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.78);
      backdrop-filter: blur(10px); z-index: 99989;
      display: none; align-items: center; justify-content: center;
      padding: 20px; animation: papFadeIn .2s ease;
    }
    .pap-launcher-overlay.open { display: flex; }
    @keyframes papFadeIn { from { opacity: 0 } to { opacity: 1 } }

    .pap-launcher-panel {
      background: #0a0f17; border: 1px solid #1e2535; border-radius: 22px;
      padding: 28px; max-width: 720px; width: 100%; max-height: 88vh; overflow-y: auto;
      box-shadow: 0 24px 80px rgba(0,0,0,0.7);
      animation: papSlideUp .25s ease;
    }
    @keyframes papSlideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

    .pap-launcher-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #1e2535;
    }
    .pap-launcher-header h2 {
      margin: 0; font-size: 1.25rem; color: #fff; font-weight: 800;
    }
    .pap-launcher-header h2 small {
      display: block; font-size: 0.78rem; font-weight: 500;
      color: #a8b0ba; margin-top: 4px;
    }
    .pap-launcher-close {
      background: rgba(255,255,255,0.06); border: 1px solid #1e2535;
      color: #fff; width: 36px; height: 36px; border-radius: 50%;
      cursor: pointer; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .pap-launcher-close:hover { background: rgba(255,90,90,0.18); border-color: #ff7a7a; }

    .pap-launcher-group { margin-bottom: 22px; }
    .pap-launcher-group:last-child { margin-bottom: 0; }
    .pap-launcher-group-title {
      font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.1em; color: #5dbfff; margin: 0 0 12px 4px;
    }
    .pap-launcher-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }
    .pap-launcher-tile {
      background: rgba(255,255,255,0.03); border: 1px solid #1e2535;
      border-radius: 14px; padding: 14px 12px; text-decoration: none;
      color: #fff; transition: all .15s ease; cursor: pointer;
      display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
    }
    .pap-launcher-tile:hover {
      background: rgba(93,191,255,0.08); border-color: rgba(93,191,255,0.45);
      transform: translateY(-2px);
    }
    .pap-launcher-tile.active {
      background: rgba(93,191,255,0.12); border-color: #5dbfff;
    }
    .pap-launcher-tile .ic { font-size: 1.6rem; line-height: 1; }
    .pap-launcher-tile .lbl { font-weight: 800; font-size: 0.92rem; }
    .pap-launcher-tile .dsc { font-size: 0.76rem; color: #a8b0ba; line-height: 1.3; }
    .pap-launcher-tile.active .badge-here {
      position: absolute; top: 6px; right: 8px; font-size: 0.62rem;
      background: #5dbfff; color: #051022; padding: 2px 6px; border-radius: 6px;
      font-weight: 900;
    }
    .pap-launcher-tile { position: relative; }
  `;
  const style = document.createElement('style');
  style.id = 'pap-launcher-css';
  style.textContent = css;
  document.head.appendChild(style);

  // ─── HTML ─────────────────────────────────────────────────────────────────
  function buildHtml() {
    const here = location.pathname.replace(/\/$/, '') || '/index.html';
    let html = '';
    SECTIONS.forEach(grp => {
      html += `<div class="pap-launcher-group">
        <div class="pap-launcher-group-title">${grp.group}</div>
        <div class="pap-launcher-grid">`;
      grp.items.forEach(it => {
        const isActive = here === it.href || here === it.href.replace('.html','');
        html += `<a class="pap-launcher-tile${isActive ? ' active' : ''}" href="${it.href}">
          ${isActive ? '<span class="badge-here">ici</span>' : ''}
          <span class="ic">${it.icon}</span>
          <span class="lbl">${it.label}</span>
          <span class="dsc">${it.desc}</span>
        </a>`;
      });
      html += `</div></div>`;
    });
    return html;
  }

  // Bouton flottant
  const btn = document.createElement('button');
  btn.className = 'pap-launcher-btn';
  btn.setAttribute('aria-label', 'Menu navigation');
  btn.title = 'Ouvrir le menu de navigation';
  btn.innerHTML = '⋮⋮⋮<span class="pap-dot"></span>';
  btn.style.fontSize = '20px';
  btn.style.letterSpacing = '-2px';
  // Icône "grille" plus jolie en SVG
  btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>`;

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'pap-launcher-overlay';
  overlay.innerHTML = `
    <div class="pap-launcher-panel" role="dialog" aria-modal="true">
      <div class="pap-launcher-header">
        <h2>Où veux-tu aller ?<small>Tu peux jouer plusieurs rôles : passager, conducteur, expéditeur, livreur.</small></h2>
        <button class="pap-launcher-close" aria-label="Fermer">✕</button>
      </div>
      <div id="pap-launcher-body"></div>
    </div>
  `;

  function open() {
    document.getElementById('pap-launcher-body').innerHTML = buildHtml();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', open);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('pap-launcher-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  // Inject (attendre body)
  function inject() {
    if (!document.body) { setTimeout(inject, 50); return; }
    // Ne pas afficher sur la page login / signup
    const skip = ['/login.html', '/signup.html', '/role-choice.html', '/offline.html'];
    if (skip.includes(location.pathname)) return;
    document.body.appendChild(btn);
    document.body.appendChild(overlay);
  }
  inject();

  // API publique
  window.PapLauncher = { open, close };
})();
