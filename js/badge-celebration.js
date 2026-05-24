/**
 * PorteàPorte — Modal célébration badge obtenu
 * Détecte les nouveaux badges du user et affiche un modal de célébration
 * Sauvegarde les badges vus dans localStorage
 */
(function() {
  if (window.__papBadgeCeleb) return;
  window.__papBadgeCeleb = true;

  const SEEN_KEY = 'pap_seen_badges_v1';
  let db = null, session = null;

  function getSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function saveSeen(set) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }

  function showCelebration(badge) {
    if (document.getElementById('pap-badge-celeb')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pap-badge-celeb';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,.9);
      z-index: 999999; display: grid; place-items: center; padding: 20px;
      animation: papFadeIn .4s ease;
    `;
    overlay.innerHTML = `
      <div style="max-width:420px;width:100%;background:linear-gradient(160deg,#0e1620,#001828);border:3px solid rgba(184,245,62,.6);border-radius:24px;padding:40px 32px;text-align:center;position:relative;overflow:hidden;box-shadow:0 30px 100px rgba(184,245,62,.2)">
        <div style="position:absolute;inset:0;background-image:radial-gradient(circle at 30% 30%,rgba(184,245,62,.15) 0%,transparent 50%),radial-gradient(circle at 70% 70%,rgba(0,217,255,.12) 0%,transparent 50%);pointer-events:none"></div>

        <div style="font-size:.85rem;color:var(--brand-lime);font-weight:900;letter-spacing:.2em;text-transform:uppercase;margin-bottom:12px;position:relative">🎉 Badge débloqué !</div>

        <div style="font-size:6rem;line-height:1;margin:14px 0;animation:papBadgeBounce .8s ease;position:relative">${badge.icon || '🏆'}</div>

        <h2 style="margin:0 0 8px;font-size:1.8rem;color:#fff;position:relative">${badge.name}</h2>
        <p style="color:#a8b0ba;font-size:.95rem;line-height:1.6;margin:0 0 18px;position:relative">${badge.description || ''}</p>

        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:24px;position:relative">
          <span style="padding:5px 12px;background:rgba(168,176,186,.15);color:#a8b0ba;border-radius:999px;font-size:.78rem;font-weight:800;text-transform:uppercase">${badge.rarity || 'common'}</span>
          ${badge.xp_reward ? `<span style="padding:5px 12px;background:rgba(184,245,62,.15);color:var(--brand-lime);border-radius:999px;font-size:.78rem;font-weight:800">+${badge.xp_reward} XP</span>` : ''}
        </div>

        <button id="pap-celeb-close" style="padding:14px 32px;background:linear-gradient(135deg,#00d9ff,#b8f53e);color:#001828;border:none;border-radius:12px;font-weight:900;font-size:.95rem;cursor:pointer;position:relative">🎊 Génial !</button>

        <div style="margin-top:14px;font-size:.78rem;color:#6d7886;position:relative">
          <a href="/badges.html" style="color:#7de4ff;text-decoration:none">Voir tous mes badges →</a>
        </div>
      </div>
    `;
    if (!document.querySelector('style[data-papCeleb]')) {
      const s = document.createElement('style');
      s.dataset.papCeleb = '1';
      s.textContent = `
        @keyframes papFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes papBadgeBounce { 0% { transform: scale(0) rotate(-180deg); } 60% { transform: scale(1.2) rotate(10deg); } 100% { transform: scale(1) rotate(0); } }
      `;
      document.head.appendChild(s);
    }
    document.body.appendChild(overlay);

    // Confettis simples avec emojis
    for (let i = 0; i < 20; i++) {
      const c = document.createElement('div');
      c.textContent = ['🎉','✨','🌟','💚','🏆'][Math.floor(Math.random() * 5)];
      c.style.cssText = `position:fixed;left:${Math.random()*100}%;top:-30px;font-size:24px;pointer-events:none;animation:papFall ${2 + Math.random() * 2}s linear;z-index:999998`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }
    if (!document.querySelector('style[data-papFall]')) {
      const s = document.createElement('style');
      s.dataset.papFall = '1';
      s.textContent = '@keyframes papFall { from { transform: translateY(0) rotate(0); } to { transform: translateY(110vh) rotate(720deg); } }';
      document.head.appendChild(s);
    }

    overlay.querySelector('#pap-celeb-close').onclick = () => {
      overlay.style.animation = 'papFadeIn .3s reverse';
      setTimeout(() => overlay.remove(), 280);
    };
  }

  async function checkBadges() {
    try {
      if (!session) return;
      const { data } = await db.from('user_badges')
        .select('badge_id,granted_at,badges(slug,name,description,icon,rarity,xp_reward)')
        .eq('user_id', session.user.id)
        .order('granted_at', { ascending: false });
      const seen = getSeen();
      const newOnes = (data || []).filter(b => !seen.has(b.badge_id));
      // Limiter à 1 modal à la fois (afficher le plus récent)
      if (newOnes.length > 0) {
        const latest = newOnes[0];
        if (latest.badges) {
          showCelebration(latest.badges);
          // Marquer tous comme vus
          newOnes.forEach(b => seen.add(b.badge_id));
          saveSeen(seen);
        }
      } else if (seen.size === 0 && data?.length) {
        // Premier load : marquer tout comme vu sans afficher
        const ids = data.map(b => b.badge_id);
        saveSeen(new Set(ids));
      }
    } catch (e) {}
  }

  async function init() {
    db = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase;
    if (!db) return;
    const { data: s } = await db.auth.getSession();
    if (!s?.session) return;
    session = s.session;
    setTimeout(checkBadges, 2000); // Initial check
    setInterval(checkBadges, 60000); // Toutes les minutes
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PapBadgeCeleb = { check: checkBadges, show: showCelebration };
})();
