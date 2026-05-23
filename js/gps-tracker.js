/**
 * PorteàPorte — GPS Tracker
 * Suit la position du livreur en background pendant les livraisons actives
 * Envoie une position toutes les 30 sec à /api/gps-update
 */
(function() {
  if (window.__papGpsTracker) return; // déjà initialisé
  window.__papGpsTracker = true;

  let watchId = null;
  let activeDeliveryIds = [];
  let lastSentAt = 0;
  const MIN_INTERVAL_MS = 25000; // au moins 25s entre 2 envois
  let consecutiveErrors = 0;

  async function getActiveDeliveries() {
    try {
      const db = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase;
      const { data: sess } = await db.auth.getSession();
      if (!sess?.session) return [];
      const userId = sess.session.user.id;
      const { data } = await db
        .from('livraisons')
        .select('id,statut')
        .eq('livreur_id', userId)
        .in('statut', ['confirme', 'en_route', 'ramasse', 'picked_up', 'in_transit', 'accepted']);
      return (data || []).map(d => d.id);
    } catch (e) { return []; }
  }

  async function sendPosition(coords) {
    if (!activeDeliveryIds.length) return;
    if (Date.now() - lastSentAt < MIN_INTERVAL_MS) return;
    lastSentAt = Date.now();
    try {
      const db = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase;
      const { data: sess } = await db.auth.getSession();
      if (!sess?.session) return;
      for (const livraisonId of activeDeliveryIds) {
        await fetch('/api/gps-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sess.session.access_token },
          body: JSON.stringify({
            livraison_id: livraisonId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy_m: coords.accuracy,
            speed: coords.speed,
            heading: coords.heading
          })
        }).catch(() => {});
      }
      consecutiveErrors = 0;
    } catch (e) { consecutiveErrors++; }
  }

  function showWarning(message) {
    const id = 'pap-gps-warning';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(255,90,90,.95);color:#fff;padding:14px 22px;border-radius:10px;font-weight:800;font-size:.95rem;box-shadow:0 8px 30px rgba(0,0,0,.4);max-width:90%;text-align:center;cursor:pointer';
      el.onclick = () => el.remove();
      document.body.appendChild(el);
    }
    el.innerHTML = '⚠️ ' + message + '<br><span style="font-weight:500;font-size:.78rem">Clique pour fermer</span>';
  }

  function clearWarning() {
    document.getElementById('pap-gps-warning')?.remove();
  }

  function showStatus(msg, color) {
    const id = 'pap-gps-status';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:99998;background:rgba(10,14,20,.92);color:#fff;padding:8px 14px;border-radius:8px;font-size:.78rem;font-weight:700;backdrop-filter:blur(6px);border:1px solid rgba(184,245,62,.3)';
      document.body.appendChild(el);
    }
    el.style.borderColor = color || 'rgba(184,245,62,.3)';
    el.innerHTML = msg;
  }

  function clearStatus() {
    document.getElementById('pap-gps-status')?.remove();
  }

  async function start() {
    activeDeliveryIds = await getActiveDeliveries();
    if (!activeDeliveryIds.length) { stop(); return; }

    if (!('geolocation' in navigator)) {
      showWarning('GPS non supporté par ton navigateur. Tu ne peux pas livrer sans GPS.');
      return;
    }

    if (watchId != null) return; // déjà démarré

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        clearWarning();
        showStatus('📍 GPS actif · ' + activeDeliveryIds.length + ' livraison(s)', 'rgba(184,245,62,.4)');
        sendPosition(pos.coords);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          showWarning('GPS BLOQUÉ — Tu dois autoriser la géolocalisation pour livrer. L\'expéditeur peut signaler ton compte.');
          showStatus('🚫 GPS bloqué', 'rgba(255,90,90,.6)');
        } else {
          showStatus('⚠️ GPS erreur', 'rgba(255,200,0,.5)');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  function stop() {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    clearStatus();
  }

  // Re-vérifie toutes les minutes s'il faut tracker ou non
  setInterval(async () => {
    const newList = await getActiveDeliveries();
    activeDeliveryIds = newList;
    if (newList.length && watchId == null) start();
    if (!newList.length && watchId != null) stop();
  }, 60000);

  // Auto-start au chargement de la page
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Exposer pour debug
  window.papGps = { start, stop, getActiveDeliveries };
})();
