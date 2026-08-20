// api/qr-livraison.js — Génère un QR code SVG pour le pickup d'une livraison

const QRCode = require('qrcode');

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function sanitizeEnv(s) {
  let v = (s || '').trim();
  while (v.length > 0 && v.charCodeAt(0) > 127) v = v.slice(1);
  return v.trim();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET uniquement' });

  const SB_URL = sanitizeEnv(process.env.SUPABASE_URL);
  const SB_KEY = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);

  const livraisonId = req.query.id;
  if (!livraisonId) return res.status(400).json({ error: 'id requis' });

  // Vérifier auth
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Auth requise' });

  const userRes = await fetch(SB_URL + '/auth/v1/user', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token }
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Session invalide' });
  const user = await userRes.json();

  // Vérifier que l'utilisateur est l'expéditeur, le livreur ou admin
  const livRes = await fetch(`${SB_URL}/rest/v1/livraisons?id=eq.${encodeURIComponent(livraisonId)}&select=id,expediteur_id,livreur_id,code`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  const livraisons = livRes.ok ? await livRes.json() : [];
  const livraison = livraisons[0];
  if (!livraison) return res.status(404).json({ error: 'Livraison introuvable' });

  const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  const profRows = profRes.ok ? await profRes.json() : [];
  const role = profRows[0]?.role || '';
  const isAdmin = ['admin'].includes(role);

  if (!isAdmin && livraison.expediteur_id !== user.id && livraison.livreur_id !== user.id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  // URL encodée dans le QR — livreur scanne → ouvre pickup-confirm.html
  const origin = process.env.PUBLIC_SITE_ORIGIN || process.env.ALLOWED_ORIGIN || 'https://porteaporte.site';
  const pickupUrl = `${origin}/pickup-confirm.html?id=${encodeURIComponent(livraisonId)}`;

  const svg = await QRCode.toString(pickupUrl, {
    type: 'svg',
    margin: 2,
    color: { dark: '#071006', light: '#ffffff' },
    width: 300
  });

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).send(svg);
};
