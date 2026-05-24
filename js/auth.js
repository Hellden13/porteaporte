(function () {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.db;

  if (!client) {
    console.error('ERREUR auth: client Supabase indisponible');
    return;
  }

  function roleMatches(actual, expected) {
    actual = normalizeRole(actual);
    expected = Array.isArray(expected) ? expected.map(normalizeRole) : normalizeRole(expected);
    if (!expected) return true;
    if (Array.isArray(expected)) return expected.some((role) => roleMatches(actual, role));
    if (expected === 'livreur') return actual === 'livreur' || actual === 'les deux' || actual === 'admin';
    if (expected === 'expediteur') return actual === 'expediteur' || actual === 'les deux' || actual === 'admin';
    return actual === expected;
  }

  function normalizeRole(role) {
    const value = String(role || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
    if (['admin', 'administrator', 'administrateur'].includes(value)) return 'admin';
    if (['livreur', 'driver'].includes(value)) return 'livreur';
    if (['expediteur', 'sender'].includes(value)) return 'expediteur';
    if (['les deux', 'both', 'livreur expediteur', 'expediteur livreur'].includes(value)) return 'les deux';
    return value;
  }

  function isEmailVerified(session, profile) {
    return Boolean(
      profile?.email_verified ||
      session?.user?.email_confirmed_at ||
      session?.user?.confirmed_at
    );
  }

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error('ERREUR session:', error.message);
      return null;
    }
    return data.session || null;
  }

  async function getProfile(userId) {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('ERREUR profile:', error.message);
      return null;
    }

    return data;
  }

  function showError(msg) {
    if (typeof window.showError === 'function') { window.showError(msg); return; }
    const el = document.getElementById('error-message') || document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    else console.error('[auth]', msg);
  }

  async function requireSession(redirectTo) {
    const session = await getSession();
    if (!session) {
      console.error('ERREUR auth: aucune session');
      window.location.href = redirectTo || '/login.html';
      return null;
    }
    // console.log('OK connecte:', session.user.email || session.user.id);
    return session;
  }

  async function requireProfile(redirectTo) {
    const session = await requireSession(redirectTo);
    if (!session) return null;

    const profile = await getProfile(session.user.id);
    if (!profile) {
      console.error('ERREUR auth: profil introuvable');
      window.location.href = redirectTo || '/role-choice.html';
      return null;
    }

    if (profile.suspendu || profile.verification_status === 'suspended' || profile.driver_status === 'suspended') {
      console.error('ERREUR auth: profil suspendu');
      window.location.href = '/login.html';
      return null;
    }

    return { session, profile };
  }

  async function requireEmailVerified(redirectTo) {
    const ctx = await requireProfile(redirectTo);
    if (!ctx) return null;

    if (!isEmailVerified(ctx.session, ctx.profile)) {
      console.error('ERREUR auth: email non confirme');
      showError('Confirme ton email avant d acceder aux donnees sensibles.');
      window.location.href = redirectTo || '/login.html';
      return null;
    }

    return ctx;
  }

  async function requireRole(role, redirectTo) {
    const ctx = await requireEmailVerified(redirectTo);
    if (!ctx) return null;

    if (!roleMatches(ctx.profile.role, role)) {
      console.error('ERREUR auth: role requis', role);
      window.location.href = redirectTo || '/role-choice.html';
      return null;
    }

    // console.log('OK role:', ctx.profile.role);
    return ctx.session;
  }

  async function requireVerifiedDriver(redirectTo) {
    const ctx = await requireEmailVerified(redirectTo || '/livreur.html');
    if (!ctx) return null;

    if (!roleMatches(ctx.profile.role, 'livreur')) {
      console.error('ERREUR livreur: role livreur requis');
      window.location.href = '/role-choice.html';
      return null;
    }

    if (ctx.profile.driver_status !== 'verified' && normalizeRole(ctx.profile.role) !== 'admin') {
      console.error('ERREUR livreur: verification requise');
      showError('Ton compte livreur doit etre verifie avant de voir ou accepter des colis.');
      window.location.href = redirectTo || '/livreur.html';
      return null;
    }

    return ctx.session;
  }

  async function requireAdmin(redirectTo) {
    return requireRole('admin', redirectTo || '/login.html');
  }

  async function logout() {
    const { error } = await client.auth.signOut();
    if (error) console.error('ERREUR deconnexion:', error.message);
    window.location.href = '/login.html';
  }

  window.PorteAuth = {
    getSession,
    getProfile,
    requireSession,
    requireProfile,
    requireEmailVerified,
    requireRole,
    requireVerifiedDriver,
    requireAdmin,
    logout,
    isEmailVerified,
    roleMatches
  };

  if (!window.logout) window.logout = logout;
})();

