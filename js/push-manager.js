// PorteàPorte — Push Notification Manager
// Gère l'abonnement aux notifications push Web

const VAPID_PUBLIC_KEY = 'BKjn4lgdxgSGPJhWE-gJ2hqz6fgV7D2fEAJti489TnDMy4HbJ60n_xCbxny-NFo2cvSXnmu1mxpzJYOWWkhseqg';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

async function registerPush(userId) {
  if (!('serviceWorker' in navigator)) {
    console.warn('[push] serviceWorker non supporté');
    return null;
  }
  if (!('PushManager' in window)) {
    console.warn('[push] PushManager non supporté (navigateur incompatible)');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    console.log('[push] Permission :', permission);
    if (permission !== 'granted') return null;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    console.log('[push] Abonnement :', sub.endpoint.slice(0, 60) + '…');

    // Enregistrer l'abonnement côté serveur
    const token = (await window.getSupabaseClient().auth.getSession())?.data?.session?.access_token;
    const r = await fetch('/api/push-subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ userId, subscription: sub.toJSON() })
    });
    if (!r.ok) console.warn('[push] Erreur API push-subscribe :', r.status, await r.text());

    return sub;
  } catch (err) {
    console.warn('[push] Abonnement échoué :', err.message);
    return null;
  }
}

async function unregisterPush(userId) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      const token = (await window.getSupabaseClient().auth.getSession())?.data?.session?.access_token;
      await fetch('/api/push-subscribe', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ userId, endpoint: sub.endpoint })
      });
    }
  } catch (err) {
    console.warn('[push] Désabonnement échoué :', err.message);
  }
}

window.PapPush = { registerPush, unregisterPush };
