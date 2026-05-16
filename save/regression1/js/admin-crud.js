(function () {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.db;

  if (!client) {
    console.error('âŒ erreur adminCRUD: client Supabase indisponible');
    return;
  }

  const state = {
    users: [],
    deliveries: [],
    drivers: [],
    expediteurs: [],
    transactions: []
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback || '-';
    return String(value);
  }

  function html(value, fallback) {
    return text(value, fallback)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fullName(row) {
    return text([row.prenom, row.nom].filter(Boolean).join(' '), row.full_name || row.nom_complet || row.email);
  }

  function date(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('fr-CA');
  }

  function money(value) {
    if (value === null || value === undefined || value === '') return '-';
    const amount = Number(value);
    if (Number.isNaN(amount)) return html(value);
    return amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function setRows(tbodyId, rows, emptyMessage, colspan) {
    const tbody = byId(tbodyId);
    if (!tbody) {
      console.error('âŒ erreur adminCRUD: element manquant #' + tbodyId);
      return;
    }
    tbody.innerHTML = rows.length
      ? rows.join('')
      : `<tr><td colspan="${colspan || 6}">${html(emptyMessage)}</td></tr>`;
  }

  function logOk(scope, count) {
    // console.log(`âœ… connectÃ©: ${scope} (${count})`);
  }

  function reportError(scope, error) {
    const message = error && error.message ? error.message : String(error);
    console.error(`âŒ erreur ${scope}:`, message);
    return [];
  }

  async function sessionToken() {
    const { data } = await client.auth.getSession();
    return data && data.session && data.session.access_token;
  }

  async function updateDriverStatus(userId, status) {
    const token = await sessionToken();
    if (!token) throw new Error('Session admin requise');
    const res = await fetch('/api/platform', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        endpoint: 'admin-update-driver-status',
        user_id: userId,
        driver_status: status
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Mise a jour impossible');
    // console.log('âœ… connectÃ©: statut livreur mis a jour', userId, status);
    await loadUsers();
    return payload;
  }

  async function loadUsers() {
    const { data, error } = await client
      .from('profiles')
      .select('*');

    if (error) return reportError('loadUsers', error);

    state.users = data || [];
    state.drivers = state.users.filter((user) => user.role === 'livreur' || user.role === 'les deux');
    state.expediteurs = state.users.filter((user) => user.role === 'expediteur' || user.role === 'les deux');

    setText('users-badge', state.users.length);
    setText('drivers-badge', state.drivers.length);
    setText('total-users', state.users.length);
    setText('total-livreurs', state.drivers.length);
    setText('total-expediteurs', state.expediteurs.length);
    setText('total-coins', state.users.reduce((sum, user) => sum + Number(user.coins || 0), 0));

    setRows('users-list', state.users.map((user) => `
      <tr>
        <td>${html(fullName(user))}</td>
        <td>${html(user.email)}</td>
        <td><span class="badge ${user.role === 'livreur' ? 'badge-livreur' : 'badge-expediteur'}">${html(user.role, 'expediteur')}</span></td>
        <td>${html(user.coins || 0)}</td>
        <td>${html(user.xp || 0)}</td>
        <td><button class="btn" type="button" onclick="adminCRUD.viewProfile('${html(user.id)}')">Details</button></td>
      </tr>
    `), 'Aucun utilisateur trouve.', 6);

    setRows('livreurs-list', state.drivers.map((driver) => `
      <tr>
        <td>${html(fullName(driver))}</td>
        <td>${html(driver.email)}</td>
        <td>${html(driver.coins || 0)}</td>
        <td>${html(driver.livraisons || driver.livraisons_count || driver.total_livraisons || 0)}</td>
        <td>${html(driver.score || driver.score_confiance || driver.rating || driver.xp || 0)}</td>
        <td>${html(driver.driver_status || 'not_started')}</td>
        <td>
          <button class="btn" type="button" onclick="adminCRUD.updateDriverStatus('${html(driver.id)}','verified')">Verifier</button>
          <button class="btn" type="button" onclick="adminCRUD.updateDriverStatus('${html(driver.id)}','rejected')">Rejeter</button>
          <button class="btn" type="button" onclick="adminCRUD.updateDriverStatus('${html(driver.id)}','suspended')">Suspendre</button>
        </td>
      </tr>
    `), 'Aucun livreur trouve.', 7);

    setRows('expediteurs-list', state.expediteurs.map((expediteur) => `
      <tr>
        <td>${html(fullName(expediteur))}</td>
        <td>${html(expediteur.email)}</td>
        <td>${html(expediteur.coins || 0)}</td>
        <td>${html(expediteur.envois || expediteur.livraisons || 0)}</td>
      </tr>
    `), 'Aucun expediteur trouve.', 4);

    logOk('loadUsers', state.users.length);
    return state.users;
  }

  async function loadDeliveries() {
    const { data, error } = await client
      .from('livraisons')
      .select('*')
      .limit(100);

    if (error) return reportError('loadDeliveries', error);

    state.deliveries = data || [];
    setText('deliveries-badge', state.deliveries.length);

    setRows('deliveries-list', state.deliveries.map((delivery) => `
      <tr>
        <td>${html(delivery.client_nom || delivery.expediteur_email || delivery.expediteur_id || delivery.user_id)}</td>
        <td>${html(delivery.livreur_nom || delivery.livreur_email || delivery.livreur_id || delivery.driver_id)}</td>
        <td>${html(delivery.statut || delivery.status || 'publie')}</td>
        <td>${money(delivery.prix_total || delivery.prix || delivery.montant || delivery.price)}</td>
        <td>${date(delivery.created_at || delivery.cree_le || delivery.date_creation)}</td>
      </tr>
    `), 'Aucune livraison trouvee.', 5);

    logOk('loadDeliveries', state.deliveries.length);
    return state.deliveries;
  }

  async function loadDrivers() {
    if (!state.users.length) {
      await loadUsers();
    }
    logOk('loadDrivers', state.drivers.length);
    return state.drivers;
  }

  async function loadTransactions() {
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .limit(100);

    if (error) return reportError('loadTransactions', error);

    state.transactions = data || [];
    setText('transactions-badge', state.transactions.length);

    setRows('transactions-list', state.transactions.map((tx) => `
      <tr>
        <td>${html(tx.email || tx.user_email || tx.user_id || tx.profile_id)}</td>
        <td>${html(tx.type || tx.kind || 'transaction')}</td>
        <td>${money(tx.montant || tx.amount || tx.montant_coins || tx.coins)}</td>
        <td>${html(tx.statut || tx.status || 'complete')}</td>
        <td>${date(tx.created_at || tx.cree_le || tx.date_creation)}</td>
      </tr>
    `), 'Aucune transaction trouvee.', 5);

    logOk('loadTransactions', state.transactions.length);
    return state.transactions;
  }

  async function createUser(profile) {
    const payload = Object.assign({ role: 'expediteur', coins: 50, xp: 0 }, profile || {});
    const { data, error } = await client
      .from('profiles')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('âŒ erreur createUser:', error.message);
      throw error;
    }

    // console.log('âœ… connectÃ©: profil cree', data.id);
    await loadUsers();
    return data;
  }

  async function viewProfile(id) {
    const profile = state.users.find((user) => user.id === id);
    if (!profile) return;
    showError(`${fullName(profile)}\n${profile.email || ''}\nRole: ${profile.role || '-'}`);
  }

  async function refreshAll() {
    await loadUsers();
    await Promise.all([loadDeliveries(), loadTransactions()]);
    await loadDrivers();
  }

  window.loadUsers = loadUsers;
  window.loadDeliveries = loadDeliveries;
  window.loadDrivers = loadDrivers;
  window.loadTransactions = loadTransactions;

  window.adminCRUD = {
    client,
    state,
    loadUsers,
    loadDeliveries,
    loadDrivers,
    loadTransactions,
    createUser,
    updateDriverStatus,
    viewProfile,
    refreshAll
  };

  // console.log('âœ… connectÃ©: fonctions admin CRUD chargees');
})();


