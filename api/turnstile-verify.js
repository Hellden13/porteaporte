// ============================================================
// PORTEÀPORTE — Vercel Function : Vérification Turnstile
// Fichier : api/turnstile-verify.js
// Utilisé par : compte.html, parrainage.html, index.html
// ============================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://porteaporte.site');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { token, action } = req.body;
  const SECRET = process.env.TURNSTILE_SECRET;

  if (!SECRET) return res.status(500).json({ success: false, error: 'Config manquante' });
  if (!token) return res.status(400).json({ success: false, error: 'Token manquant' });

  try {
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '127.0.0.1';
    
    const formData = new FormData();
    formData.append('secret', SECRET);
    formData.append('response', token);
    formData.append('remoteip', ip);

    const verifyRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: formData }
    );

    const data = await verifyRes.json();

    if (data.success) {
      console.log(`✅ Turnstile OK — action: ${action || 'unknown'} · IP: ${ip}`);
      return res.status(200).json({ success: true });
    } else {
      console.log(`❌ Turnstile FAIL — codes: ${data['error-codes']?.join(', ')}`);
      return res.status(400).json({ success: false, error: 'Vérification échouée', codes: data['error-codes'] });
    }
  } catch (err) {
    console.error('Erreur Turnstile:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
