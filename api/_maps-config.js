// Clé Maps lue depuis GOOGLE_MAPS_API_KEY (Vercel) — ne pas committer la clé dans HTML.
module.exports = async function handler(req, res) {
  const ALLOW = process.env.ALLOWED_ORIGIN || 'https://porteaporte.site';
  res.setHeader('Access-Control-Allow-Origin', ALLOW);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Methode non autorisee' });

  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) {
    return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY non configuree sur Vercel' });
  }
  return res.status(200).json({ key });
};
