/**
 * PorteàPorte — Auth state UI sync
 * Sur toutes les pages publiques : détecte la session Supabase et remplace
 * les boutons "Connexion / Commencer" par "Mon dashboard / Mon profil".
 *
 * Inclusion : <script src="/js/auth-state.js" defer></script>
 * Requiert : /js/supabase-config.js chargé avant.
 */
(function () {
  if (window.__papAuthState) return;
  window.__papAuthState = true;

  const DASH = {
    livreur:    '/dashboard.html',
    expediteur: '/dashboard.html',
    'les deux': '/dashboard.html',
    admin:      '/admin/dashboard-admin.html'
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureSupabase() {
    if (window.db) return window.db;
    try {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      }
      if (!window.db) {
        // Charge la config si pas encore là (définit window.db)
        if (!window.getSupabaseClient) {
          await loadScript('/js/supabase-config.js');
        }
      }
    } catch (_) {}
    return window.db || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
  }

  async function sync() {
    try {
      const db = await ensureSupabase();
      if (!db) return;
      const { data } = await db.auth.getSession();
      const session = data?.session;
      if (!session) return; // pas connecté → on laisse "Connexion / Commencer"

      // Récupérer le rôle pour bon dashboard
      let role = 'expediteur';
      try {
        const { data: profile } = await db.from('profiles').select('role,prenom').eq('id', session.user.id).single();
        if (profile?.role) role = profile.role;
        window.__papUserName = profile?.prenom || (session.user.email || '').split('@')[0];
      } catch (_) {}
      const dashUrl = DASH[role] || '/dashboard-expediteur.html';
      const firstName = window.__papUserName || 'Mon compte';

      // Trouver tous les liens vers login.html → remplacer par "Dashboard"
      document.querySelectorAll('a[href="/login.html"], a[href="login.html"]').forEach(a => {
        a.href = dashUrl;
        a.textContent = '📊 Dashboard';
        a.title = 'Mon tableau de bord';
      });

      // Trouver tous les liens vers role-choice / signup / "Commencer" → "Mon profil"
      document.querySelectorAll('a[href="/role-choice.html"], a[href="role-choice.html"], a[href="/signup.html"], a[href="signup.html"]').forEach(a => {
        // Ne pas modifier si c'est explicitement un CTA d'inscription (data-keep-cta)
        if (a.dataset.keepCta) return;
        a.href = '/profile.html';
        a.textContent = '👤 ' + firstName;
        a.title = 'Mon profil';
      });
    } catch (e) {
      // silencieux : on ne casse jamais l'UI publique
    }
  }

  // ─── Logout centralisé : remplace les 5+ implémentations dispersées ───
  // Usage : <button onclick="papLogout()">Se déconnecter</button>
  //        ou await window.papLogout({ skipConfirm: true })
  window.papLogout = async function (opts) {
    opts = opts || {};
    if (!opts.skipConfirm && !confirm('Es-tu sûr de vouloir te déconnecter ?')) return;
    try {
      const db = await (async () => {
        if (window.db) return window.db;
        if (typeof window.getSupabaseClient === 'function') return window.getSupabaseClient();
        return null;
      })();
      if (db?.auth) await db.auth.signOut();
    } catch (_) {}
    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('sb-refresh-token');
      sessionStorage.clear();
    } catch (_) {}
    window.location.href = opts.redirect || '/index.html';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }
})();
