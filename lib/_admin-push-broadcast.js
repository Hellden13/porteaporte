// PorteàPorte — Diffusion de notifications push (admin seulement)
// POST /api/admin-push-broadcast
// Body: { title, body, url, role? }

const webpush = require('web-push');

function sanitizeEnv(s) {
  let v = (s || '').trim();
  while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1);
  return v.trim();
}

function sbHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

async function verifyAdmin(token, sbUrl, sbKey) {
  const r = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const { id } = await r.json();
  if (!id) return null;

  const pr = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${id}&select=role`, {
    headers: sbHeaders(sbKey)
  });
  if (!pr.ok) return null;
  const [profile] = await pr.json();
  return profile?.role === 'admin' ? id : null;
}

module.exports = async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || 'https://porteaporte.site';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const sbUrl      = sanitizeEnv(process.env.SUPABASE_URL);
  const sbKey      = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);
  const vapidPublic  = sanitizeEnv(process.env.VAPID_PUBLIC_KEY);
  const vapidPrivate = sanitizeEnv(process.env.VAPID_PRIVATE_KEY);
  const vapidEmail   = process.env.VAPID_EMAIL || 'mailto:admin@porteaporte.site';

  if (!sbUrl || !sbKey || !vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'Configuration serveur manquante (Supabase ou VAPID)' });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requis' });

  const adminId = await verifyAdmin(token, sbUrl, sbKey);
  if (!adminId) return res.status(403).json({ error: 'Accès réservé aux admins' });

  const { title, body, url, role } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title et body sont requis' });

  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

  // Charger les abonnements (filtrés par rôle si précisé)
  let subsUrl = `${sbUrl}/rest/v1/push_subscriptions?select=id,subscription,user_id`;
  if (role) {
    // Récupérer d'abord les user_ids du rôle ciblé
    const prRes = await fetch(`${sbUrl}/rest/v1/profiles?role=eq.${role}&select=id`, {
      headers: sbHeaders(sbKey)
    });
    if (!prRes.ok) return res.status(500).json({ error: 'Erreur lecture profils' });
    const profiles = await prRes.json();
    const ids = (profiles || []).map(p => p.id);
    if (!ids.length) return res.status(200).json({ success: true, sent: 0, failed: 0, message: 'Aucun abonné dans ce rôle' });
    subsUrl += `&user_id=in.(${ids.join(',')})`;
  }

  const subsRes = await fetch(subsUrl, { headers: sbHeaders(sbKey) });
  if (!subsRes.ok) return res.status(500).json({ error: 'Erreur lecture abonnements' });
  const subs = await subsRes.json();

  if (!subs?.length) {
    return res.status(200).json({ success: true, sent: 0, failed: 0, message: 'Aucun abonné' });
  }

  const payload = JSON.stringify({
    title,
    body,
    icon:  '/logo.svg',
    badge: '/logo.svg',
    tag:   'pap-admin-broadcast',
    data:  { url: url || '/' }
  });

  let sent = 0, failed = 0;
  const staleIds = [];

  await Promise.all(subs.map(async (row) => {
    let subscription;
    try {
      subscription = typeof row.subscription === 'string'
        ? JSON.parse(row.subscription)
        : row.subscription;
    } catch {
      failed++;
      return;
    }
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (err) {
      failed++;
      // 410 Gone = abonnement révoqué → supprimer
      if (err.statusCode === 410 || err.statusCode === 404) {
        staleIds.push(row.id);
      }
    }
  }));

  // Nettoyer les abonnements expirés
  if (staleIds.length) {
    await fetch(`${sbUrl}/rest/v1/push_subscriptions?id=in.(${staleIds.join(',')})`, {
      method: 'DELETE',
      headers: sbHeaders(sbKey)
    }).catch(() => {});
  }

  return res.status(200).json({ success: true, sent, failed, total: subs.length, stale_removed: staleIds.length });
};
