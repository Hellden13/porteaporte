// PorteàPorte — Widget cloche de notifications in-app
// Usage : <script src="/js/notif-bell.js"></script>
// S'injecte automatiquement dans .topbar-right (avant le bouton Déconnecter)

(function () {
  'use strict';

  const POLL_INTERVAL = 30000; // 30 secondes
  let _db = null;
  let _userId = null;
  let _pollTimer = null;
  let _open = false;

  // ── Styles ────────────────────────────────────────────────────────────────
  const CSS = `
#notif-bell-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
#notif-bell-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 8px;
  color: inherit;
  position: relative;
  transition: background 0.15s;
}
#notif-bell-btn:hover { background: rgba(255,255,255,0.12); }
#notif-bell-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #ef4444;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 99px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  pointer-events: none;
  display: none;
}
#notif-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 320px;
  max-width: 92vw;
  background: #1e1e2e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  z-index: 9999;
  overflow: hidden;
  display: none;
  flex-direction: column;
}
#notif-dropdown.open { display: flex; }
#notif-dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-size: 0.85rem;
  font-weight: 600;
  color: #a0a0b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
#notif-mark-all {
  background: none;
  border: none;
  cursor: pointer;
  color: #6366f1;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 6px;
  transition: background 0.15s;
}
#notif-mark-all:hover { background: rgba(99,102,241,0.15); }
#notif-list {
  overflow-y: auto;
  max-height: 360px;
}
.notif-item {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: background 0.12s;
  text-decoration: none;
  color: inherit;
}
.notif-item:last-child { border-bottom: none; }
.notif-item:hover { background: rgba(255,255,255,0.05); }
.notif-item.unread { background: rgba(99,102,241,0.08); }
.notif-item.unread:hover { background: rgba(99,102,241,0.14); }
.notif-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
  margin-top: 2px;
}
.notif-body { flex: 1; min-width: 0; }
.notif-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e0e0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notif-item.unread .notif-title { color: #fff; }
.notif-text {
  font-size: 0.78rem;
  color: #a0a0b8;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.notif-time {
  font-size: 0.7rem;
  color: #606080;
  margin-top: 4px;
}
.notif-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #6366f1;
  flex-shrink: 0;
  margin-top: 6px;
  visibility: hidden;
}
.notif-item.unread .notif-dot { visibility: visible; }
#notif-empty {
  padding: 32px 16px;
  text-align: center;
  color: #606080;
  font-size: 0.85rem;
}
#notif-footer {
  padding: 10px 16px;
  border-top: 1px solid rgba(255,255,255,0.08);
  text-align: center;
}
#notif-footer a {
  color: #6366f1;
  font-size: 0.8rem;
  text-decoration: none;
  font-weight: 600;
}
#notif-footer a:hover { text-decoration: underline; }
`;

  // ── Icônes par type ───────────────────────────────────────────────────────
  const ICONS = {
    livraison: '📦',
    covoiturage: '🚗',
    paiement: '💳',
    badge: '🏅',
    parrainage: '🤝',
    kyc: '🪪',
    system: '🔔',
    default: '🔔'
  };

  function iconFor(type) {
    return ICONS[type] || ICONS.default;
  }

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
    return new Date(dateStr).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('notif-bell-styles')) return;
    const style = document.createElement('style');
    style.id = 'notif-bell-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildWidget() {
    const wrap = document.createElement('div');
    wrap.id = 'notif-bell-wrap';
    wrap.innerHTML = `
      <button id="notif-bell-btn" aria-label="Notifications" title="Notifications">
        🔔
        <span id="notif-bell-badge"></span>
      </button>
      <div id="notif-dropdown">
        <div id="notif-dropdown-header">
          <span>Notifications</span>
          <button id="notif-mark-all" title="Tout marquer comme lu">Tout lire</button>
        </div>
        <div id="notif-list">
          <div id="notif-empty">Aucune notification</div>
        </div>
        <div id="notif-footer">
          <a href="/compte.html#notifications">Voir toutes les notifications</a>
        </div>
      </div>
    `;
    return wrap;
  }

  function renderList(notifications) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!notifications.length) {
      list.innerHTML = '<div id="notif-empty">Aucune notification</div>';
      return;
    }

    list.innerHTML = notifications.map(n => {
      const icon = iconFor(n.notif_type);
      const unread = !n.read_at ? 'unread' : '';
      const url = n.action_url || '#';
      return `
        <a class="notif-item ${unread}" data-id="${n.id}" href="${url}">
          <div class="notif-icon">${icon}</div>
          <div class="notif-body">
            <div class="notif-title">${escHtml(n.title || 'Notification')}</div>
            ${n.body ? `<div class="notif-text">${escHtml(n.body)}</div>` : ''}
            <div class="notif-time">${timeAgo(n.created_at)}</div>
          </div>
          <div class="notif-dot"></div>
        </a>
      `;
    }).join('');

    // Marquer comme lu au clic
    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.dataset.id;
        if (el.classList.contains('unread')) {
          markRead([id]);
          el.classList.remove('unread');
          el.querySelector('.notif-dot').style.visibility = 'hidden';
          refreshBadge();
        }
      });
    });
  }

  function refreshBadge() {
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-bell-badge');
    if (!list || !badge) return;
    const unread = list.querySelectorAll('.notif-item.unread').length;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Supabase calls ────────────────────────────────────────────────────────
  async function fetchNotifications() {
    if (!_db || !_userId) return [];
    const { data, error } = await _db
      .from('notifications')
      .select('id, title, body, notif_type, action_url, read_at, created_at')
      .eq('user_id', _userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) { console.error('[notif] Erreur Supabase:', JSON.stringify(error)); return []; }
    return data || [];
  }

  async function markRead(ids) {
    if (!_db || !_userId || !ids.length) return;
    await _db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
      .eq('user_id', _userId)
      .is('read_at', null);
  }

  async function markAllRead() {
    if (!_db || !_userId) return;
    await _db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', _userId)
      .is('read_at', null);
    const list = document.getElementById('notif-list');
    if (list) {
      list.querySelectorAll('.notif-item.unread').forEach(el => {
        el.classList.remove('unread');
        const dot = el.querySelector('.notif-dot');
        if (dot) dot.style.visibility = 'hidden';
      });
    }
    refreshBadge();
  }

  // ── Poll ──────────────────────────────────────────────────────────────────
  async function poll() {
    const notifs = await fetchNotifications();
    renderList(notifs);
    refreshBadge();
  }

  function startPolling() {
    poll();
    _pollTimer = setInterval(poll, POLL_INTERVAL);
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ── Toggle dropdown ───────────────────────────────────────────────────────
  function toggleDropdown() {
    _open = !_open;
    const dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    if (_open) {
      dd.classList.add('open');
      poll(); // refresh à l'ouverture
    } else {
      dd.classList.remove('open');
    }
  }

  function closeDropdown() {
    _open = false;
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.classList.remove('open');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(db, userId) {
    _db = db;
    _userId = userId;

    injectStyles();

    // Trouver le point d'injection : .topbar-right, sinon body
    const container = document.querySelector('.topbar-right') || document.querySelector('header') || document.body;
    const widget = buildWidget();

    // Insérer avant le premier bouton "Déconnecter" ou en premier enfant
    const logoutBtn = container.querySelector('button[onclick*="logout"]');
    if (logoutBtn) {
      container.insertBefore(widget, logoutBtn);
    } else {
      container.prepend(widget);
    }

    // Events
    document.getElementById('notif-bell-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    document.getElementById('notif-mark-all').addEventListener('click', (e) => {
      e.stopPropagation();
      markAllRead();
    });

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('notif-bell-wrap');
      if (wrap && !wrap.contains(e.target)) closeDropdown();
    });

    startPolling();
  }

  // ── API publique ──────────────────────────────────────────────────────────
  window.NotifBell = { init, poll, stopPolling };

})();
