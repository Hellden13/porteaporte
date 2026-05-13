// Endpoint historique neutralise en production.
// Les operations d'installation/migration doivent passer par les fichiers SQL
// versionnes et par le dashboard Supabase, jamais par une route publique.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://porteaporte.site');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(410).json({
    error: 'Endpoint installer desactive',
    message: 'Utiliser supabase-production-schema.sql et supabase-gps-realtime.sql pour les migrations.'
  });
};
