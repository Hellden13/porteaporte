(function () {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.db;

  if (!client) {
    console.error('âŒ erreur GPS: client Supabase indisponible');
    return;
  }

  let activeChannel = null;
  let lastSentAt = 0;
  let lastPoint = null;

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getLivraisonId() {
    return getParam('livraison_id') || getParam('id') || window.currentLivraisonId || null;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const r = 6371000;
    const dLat = (b.latitude - a.latitude) * Math.PI / 180;
    const dLng = (b.longitude - a.longitude) * Math.PI / 180;
    const lat1 = a.latitude * Math.PI / 180;
    const lat2 = b.latitude * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  async function getSessionUser() {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error('âŒ erreur GPS session:', error.message);
      return null;
    }
    return data.session ? data.session.user : null;
  }

  async function saveLocation(position) {
    const livraisonId = getLivraisonId();
    if (!livraisonId) {
      console.error('ERREUR GPS: livraison_id manquant dans URL');
      return { ok: false, reason: 'missing_livraison_id' };
    }

    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError || !data.session) {
      console.error('ERREUR GPS: session livreur requise');
      return { ok: false, reason: 'missing_session' };
    }

    const coords = position.coords || position;
    const point = {
      latitude: Number(coords.latitude),
      longitude: Number(coords.longitude),
      altitude: coords.altitude === null || coords.altitude === undefined ? null : Number(coords.altitude),
      accuracy: coords.accuracy === null || coords.accuracy === undefined ? null : Number(coords.accuracy),
      speed: coords.speed === null || coords.speed === undefined ? null : Number(coords.speed),
      heading: coords.heading === null || coords.heading === undefined ? null : Number(coords.heading)
    };

    const now = Date.now();
    if (now - lastSentAt < 2500 && distanceMeters(lastPoint, point) < 8) {
      return { ok: true, skipped: true };
    }

    lastSentAt = now;
    lastPoint = point;

    const res = await fetch('/api/gps-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + data.session.access_token
      },
      body: JSON.stringify({ livraison_id: livraisonId, ...point })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('ERREUR GPS API:', result.error || res.status);
      return { ok: false, error: result };
    }

    // console.log('OK connecte: position GPS envoyee', livraisonId);
    return { ok: true, payload: result.location || point };
  }

  async function loadLatest(livraisonId) {
    const { data } = await client.auth.getSession();
    if (!data || !data.session) {
      console.error('ERREUR GPS lecture: session requise');
      return null;
    }

    const res = await fetch('/api/tracking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + data.session.access_token
      },
      body: JSON.stringify({ code: livraisonId })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('ERREUR GPS lecture:', result.error || res.status);
      return null;
    }

    return result.latest_location || null;
  }

  function subscribe(livraisonId, onLocation) {
    if (!livraisonId) {
      console.error('âŒ erreur Realtime: livraison_id manquant');
      return null;
    }

    if (activeChannel) {
      client.removeChannel(activeChannel);
      activeChannel = null;
    }

    activeChannel = client
      .channel('delivery_locations:' + livraisonId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_locations',
          filter: 'livraison_id=eq.' + livraisonId
        },
        (payload) => {
          // console.log('âœ… connectÃ©: position GPS reÃ§ue', livraisonId);
          onLocation(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // console.log('âœ… connectÃ©: Realtime GPS actif', livraisonId);
        }
      });

    return activeChannel;
  }

  function unsubscribe() {
    if (activeChannel) {
      client.removeChannel(activeChannel);
      activeChannel = null;
    }
  }

  window.PorteGPS = {
    getLivraisonId,
    saveLocation,
    loadLatest,
    subscribe,
    unsubscribe
  };
})();


