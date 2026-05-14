// Endpoint neutralise.
// Le CRUD admin frontend vit dans /js/admin-crud.js.
// Les operations serveur admin doivent passer par des endpoints dedies proteges.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://porteaporte.site');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(410).json({
    error: 'Endpoint admin-crud desactive',
    message: 'Utiliser /js/admin-crud.js cote navigateur ou creer un endpoint admin protege.'
  });
};
