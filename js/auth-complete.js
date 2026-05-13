(function () {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.db;
  let currentUser = null;

  if (!client) {
    console.error('ERREUR auth: client Supabase indisponible');
    return;
  }

  if (!window.supabase || typeof window.supabase.from !== 'function') {
    window.supabase = client;
  }

  function roleMatches(actual, expected) {
    if (!expected) return true;
    if (Array.isArray(expected)) return expected.some((role) => roleMatches(actual, role));
    if (expected === 'livreur') return actual === 'livreur' || actual === 'les deux' || actual === 'admin';
    if (expected === 'expediteur') return actual === 'expediteur' || actual === 'les deux' || actual === 'admin';
    return actual === expected;
  }

  function isEmailVerified(session, profile) {
    return Boolean(profile?.email_verified || session?.user?.email_confirmed_at || session?.user?.confirmed_at);
  }

  function profileFromSession(session, profile) {
    const meta = session.user.user_metadata || {};
    return {
      id: session.user.id,
      email: session.user.email || '',
      prenom: profile?.prenom || profile?.first_name || meta.prenom || meta.first_name || '',
      nom: profile?.nom || profile?.last_name || meta.nom || meta.last_name || '',
      role: profile?.role || meta.role || '',
      email_verified: Boolean(profile?.email_verified || session.user.email_confirmed_at || session.user.confirmed_at),
      verification_status: profile?.verification_status || 'pending',
      driver_status: profile?.driver_status || 'not_started',
      suspendu: Boolean(profile?.suspendu),
      profile: profile || null,
      session
    };
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

  async function requireAuth(role) {
    const { data, error } = await client.auth.getSession();

    if (error || !data.session) {
      console.error('ERREUR auth: connexion requise', error?.message || '');
      window.location.href = 'login.html';
      return false;
    }

    const profile = await getProfile(data.session.user.id);
    currentUser = profileFromSession(data.session, profile);

    if (!profile) {
      console.error('ERREUR auth: profil introuvable');
      window.location.href = 'role-choice.html';
      return false;
    }

    if (currentUser.suspendu || currentUser.verification_status === 'suspended' || currentUser.driver_status === 'suspended') {
      console.error('ERREUR auth: profil suspendu');
      window.location.href = 'login.html';
      return false;
    }

    if (!isEmailVerified(data.session, profile)) {
      console.error('ERREUR auth: email non confirme');
      showError('Confirme ton email avant d acceder aux donnees sensibles.');
      window.location.href = 'login.html';
      return false;
    }

    if (role && !roleMatches(currentUser.role, role)) {
      console.error('ERREUR auth: role requis', role);
      window.location.href = 'role-choice.html';
      return false;
    }

    // console.log('OK connecte:', currentUser.email || currentUser.id);
    return true;
  }

  async function requireVerifiedDriver() {
    if (!await requireAuth('livreur')) return false;

    if (currentUser.role !== 'admin' && currentUser.driver_status !== 'verified') {
      console.error('ERREUR livreur: verification requise');
      showError('Ton compte livreur doit etre verifie avant de voir ou accepter des colis.');
      window.location.href = 'livreur.html';
      return false;
    }

    return true;
  }

  async function requireAdmin() {
    return requireAuth('admin');
  }

  function getUser() {
    return currentUser;
  }

  async function logout() {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('ERREUR deconnexion:', error.message);
      return;
    }
    // console.log('OK deconnecte');
    window.location.href = 'login.html';
  }

  window.AUTH_API = {
    requireAuth,
    requireVerifiedDriver,
    requireAdmin,
    getUser,
    logout
  };
})();


