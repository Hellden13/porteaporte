/**
 * PorteàPorte — Cloche d'alerte admin
 *
 * Sur toutes les pages admin :
 *  - Pastille flottante avec total des items en attente (KYC, photos, manquements)
 *  - Notification navigateur quand un nouveau truc arrive (push sans serveur)
 *  - Flash du titre dans l'onglet ("(2) PorteàPorte")
 *  - Polling toutes les 60s via /api/platform?endpoint=admin-operations-pulse
 *
 * Inclusion : <script src="/js/admin-alert-bell.js" defer></script>
 */
(function () {
  if (window.__papAdminBell) return;
  window.__papAdminBell = true;

  const POLL_INTERVAL_MS = 60 * 1000;
  const ORIGINAL_TITLE = document.title;
  let lastTotal = parseInt(localStorage.getItem('pap_admin_last_total') || '0', 10);

  // ─── CSS ──────────────────────────────────────────────────────────────────
  const css = `
    .pap-admin-bell {
      position: fixed; top: 16px; right: 16px; z-index: 99988;
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(135deg, #5dbfff 0%, #3da9ff 100%);
      color: #051022; border: none; cursor: pointer;
      box-shadow: 0 6px 20px rgba(93,191,255,0.4), 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; transition: transform .2s;
    }
    .pap-admin-bell:hover { transform: scale(1.1); }
    .pap-admin-bell.has-alerts { background: linear-gradient(135deg, #ff7a7a 0%, #ff5252 100%); animation: papBellPulse 2s ease-in-out infinite; }
    @keyframes papBellPulse {
      0%, 100% { box-shadow: 0 6px 20px rgba(255,90,90,0.5), 0 0 0 0 rgba(255,90,90,0.7); }
      50% { box-shadow: 0 6px 20px rgba(255,90,90,0.5), 0 0 0 14px rgba(255,90,90,0); }
    }
    .pap-admin-bell-count {
      position: absolute; top: -4px; right: -4px;
      background: #fff; color: #ff5252;
      min-width: 22px; height: 22px; border-radius: 11px;
      padding: 0 6px; font-size: 12px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #051022;
    }
    .pap-admin-bell-panel {
      position: fixed; top: 78px; right: 16px; z-index: 99987;
      background: #0a0f17; border: 1px solid #1e2535; border-radius: 14px;
      padding: 14px; min-width: 280px; max-width: 360px;
      box-shadow: 0 16px 50px rgba(0,0,0,0.6);
      display: none; animation: papPanelSlide .2s ease;
    }
    .pap-admin-bell-panel.open { display: block; }
    @keyframes papPanelSlide { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
    .pap-admin-bell-panel h4 {
      margin: 0 0 10px; color: #fff; font-size: .92rem;
      display: flex; align-items: center; justify-content: space-between;
    }
    .pap-admin-bell-panel h4 .ts { font-size: .68rem; color: #a8b0ba; font-weight: 500; }
    .pap-bell-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; margin-bottom: 6px;
      background: rgba(255,255,255,0.03); border: 1px solid #1e2535;
      border-radius: 10px; text-decoration: none;
      color: #fff; font-size: .85rem; font-weight: 700;
      transition: all .15s;
    }
    .pap-bell-row:hover { background: rgba(93,191,255,0.08); border-color: #5dbfff; }
    .pap-bell-row.zero { opacity: .45; }
    .pap-bell-row .pap-bell-num {
      background: rgba(93,191,255,0.15); color: #5dbfff;
      min-width: 26px; text-align: center;
      padding: 2px 8px; border-radius: 999px; font-size: .85rem;
    }
    .pap-bell-row.alert .pap-bell-num { background: rgba(255,90,90,0.18); color: #ff7a7a; }
    .pap-bell-row.zero .pap-bell-num { background: rgba(125,255,193,0.12); color: #7dffc1; }
    .pap-bell-empty {
      text-align: center; padding: 14px; color: #7dffc1; font-size: .85rem;
    }
    .pap-bell-foot {
      margin-top: 10px; padding-top: 10px; border-top: 1px solid #1e2535;
      display: flex; align-items: center; justify-content: space-between;
      font-size: .72rem; color: #a8b0ba;
    }
    .pap-bell-foot button {
      background: transparent; border: 1px solid #1e2535;
      color: #a8b0ba; padding: 4px 10px; border-radius: 6px;
      cursor: pointer; font-size: .72rem;
    }
    .pap-bell-foot button:hover { color: #fff; border-color: #5dbfff; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ─── Bell button ──────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.className = 'pap-admin-bell';
  btn.title = 'Modération en attente';
  btn.setAttribute('aria-label', 'Modération en attente');
  btn.innerHTML = `🔔<span class="pap-admin-bell-count" id="pap-bell-count" style="display:none">0</span>`;

  // ─── Panel (dropdown au clic) ─────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'pap-admin-bell-panel';
  panel.id = 'pap-admin-bell-panel';
  panel.innerHTML = `
    <h4>Modération <span class="ts" id="pap-bell-ts">—</span></h4>
    <div id="pap-bell-rows">
      <div class="pap-bell-empty">⏳ Chargement…</div>
    </div>
    <div class="pap-bell-foot">
      <span id="pap-bell-status">Polling actif (60s)</span>
      <button id="pap-bell-notif-btn" onclick="__papBellAskNotif()">🔔 Activer notifs</button>
    </div>
  `;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('open');
  });

  // ─── Notification API ─────────────────────────────────────────────────────
  window.__papBellAskNotif = function () {
    if (!('Notification' in window)) { alert('Ton navigateur ne supporte pas les notifications'); return; }
    Notification.requestPermission().then(p => {
      const ok = p === 'granted';
      document.getElementById('pap-bell-notif-btn').textContent = ok ? '✅ Notifs activées' : '🔕 Refusées';
    });
  };

  function notify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body, icon: '/logo.svg', badge: '/logo.svg',
        tag: 'pap-admin-moderation', renotify: true,
        requireInteraction: false
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch(_) {}
  }

  // ─── Son discret au nouvel arrivage ───────────────────────────────────────
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.05;
      o.start(); o.stop(ctx.currentTime + 0.15);
    } catch(_) {}
  }

  // ─── Title flash ──────────────────────────────────────────────────────────
  function updateTitle(total) {
    document.title = total > 0 ? `(${total}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;
  }

  // ─── Poll ─────────────────────────────────────────────────────────────────
  let pollInflight = false;
  async function poll() {
    if (pollInflight) return;
    pollInflight = true;
    try {
      const db = window.db || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
      if (!db) return;
      const { data: { session } } = await db.auth.getSession();
      if (!session) return;
      const r = await fetch('/api/platform?endpoint=admin-operations-pulse', {
        headers: { Authorization: 'Bearer ' + session.access_token }
      });
      if (!r.ok) return;
      const d = await r.json();
      const a = d.pulse?.alerts || {};

      // Compte aussi les libérations en attente (livraisons +48h sans confirmation)
      let pendingReleases = 0;
      try {
        const rr = await fetch('/api/platform?endpoint=admin-auto-release-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ endpoint: 'admin-auto-release-list', grace_hours: 48 })
        });
        if (rr.ok) { const dd = await rr.json(); pendingReleases = dd.total || 0; }
      } catch(_) {}

      const items = [
        { label: '💰 Paiements à libérer', n: pendingReleases,            href: '/admin/auto-release.html' },
        { label: '🪪 KYC livreur',         n: a.kyc_livreur_pending || 0, href: '/admin/kyc-review.html' },
        { label: '📷 Photos profil',       n: a.photos_pending      || 0, href: '/admin/photos-moderation.html' },
        { label: '🐾 Photos animal',       n: a.pet_photos_pending  || 0, href: '/admin/photos-moderation.html' },
        { label: '⚠️ Manquements',         n: a.manquements_open    || 0, href: '/admin/manquements.html' },
      ];
      const total = items.reduce((s, i) => s + i.n, 0);

      // UI : pastille
      const countEl = document.getElementById('pap-bell-count');
      if (total > 0) {
        countEl.textContent = total > 99 ? '99+' : total;
        countEl.style.display = 'flex';
        btn.classList.add('has-alerts');
      } else {
        countEl.style.display = 'none';
        btn.classList.remove('has-alerts');
      }

      // UI : panel
      const rowsEl = document.getElementById('pap-bell-rows');
      if (total === 0) {
        rowsEl.innerHTML = '<div class="pap-bell-empty">✨ Tout est traité !</div>';
      } else {
        rowsEl.innerHTML = items.map(i => `
          <a class="pap-bell-row ${i.n > 0 ? 'alert' : 'zero'}" href="${i.href}">
            <span>${i.label}</span>
            <span class="pap-bell-num">${i.n}</span>
          </a>
        `).join('');
      }
      document.getElementById('pap-bell-ts').textContent = new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

      // Title flash
      updateTitle(total);

      // Notification si NOUVEAU truc arrivé depuis le dernier poll
      if (total > lastTotal && lastTotal !== null) {
        const delta = total - lastTotal;
        notify(
          `${delta} nouveau${delta>1?'x':''} item${delta>1?'s':''} à modérer`,
          `Total en attente : ${total}. Clique pour traiter.`
        );
        beep();
      }
      lastTotal = total;
      localStorage.setItem('pap_admin_last_total', String(total));
    } catch (e) {
      console.warn('[admin-bell] poll erreur:', e.message);
    } finally {
      pollInflight = false;
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    if (!document.body) { setTimeout(init, 50); return; }
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    // Init notif button state
    if ('Notification' in window) {
      const b = document.getElementById('pap-bell-notif-btn');
      if (Notification.permission === 'granted') b.textContent = '✅ Notifs activées';
      else if (Notification.permission === 'denied') b.textContent = '🔕 Notifs bloquées';
    }
    // Premier poll immédiat puis interval
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }
  init();

  // ─── Reset title when tab regains focus ───────────────────────────────────
  window.addEventListener('focus', () => updateTitle(0));

  window.PapAdminBell = { poll };
})();
