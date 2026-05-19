// api/set-role.js — Met à jour le rôle du profil utilisateur

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const ROLES_VALIDES = ['livreur', 'expediteur', 'les deux', 'marchand'];

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase non configuré' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Token requis' });

  // Vérifier le token
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Session invalide' });
  const user = await userRes.json();

  const { role } = req.body || {};
  if (!role || !ROLES_VALIDES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide. Valeurs acceptées: ' + ROLES_VALIDES.join(', ') });
  }

  // Mettre à jour le profil
  const updateRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ role })
  });

  if (!updateRes.ok) {
    const txt = await updateRes.text().catch(() => '');
    return res.status(500).json({ error: 'Erreur mise à jour profil', details: txt });
  }

  return res.status(200).json({ success: true, role });
};
