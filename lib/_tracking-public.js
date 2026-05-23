// api/tracking-public.js — Suivi public d'une livraison par code (sans auth)
// Expose uniquement les données non-sensibles : statut, villes, type, timestamps
'use strict';

const { sanitizeEnv, sbHeaders } = require('./_lib');

const CORS = {
  'Access-Control-Allow-Origin': '*', // public — pas de restriction d'origine
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const STATUS_LABELS = {
  en_attente:         { label: 'En attente de livreur',   icon: '⏳', step: 1 },
  acceptee:           { label: 'Livreur assigné',         icon: '✅', step: 2 },
  en_route:           { label: 'En route',                icon: '🚗', step: 3 },
  livree:             { label: 'Livrée',                  icon: '📦', step: 4 },
  confirmee:          { label: 'Livraison confirmée',     icon: '🎉', step: 5 },
  annulee:            { label: 'Annulée',                 icon: '❌', step: 0 },
  litige:             { label: 'En litige',               icon: '⚠️', step: 0 },
};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sbUrl = sanitizeEnv(process.env.SUPABASE_URL);
  const sbKey = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);
  if (!sbUrl || !sbKey) return res.status(503).json({ error: 'Service indisponible' });

  // Accepte GET ?code=XXX ou POST { code }
  let code;
  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://porteaporte.site');
    code = url.searchParams.get('code') || url.searchParams.get('id');
  } else {
    const body = req.body || {};
    code = body.code || body.id;
  }

  code = String(code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code de suivi requis' });

  // Identifier si c'est un UUID ou un code alphanumérique
  const isUuid = /^[0-9a-f-]{36}$/i.test(code);
  const filter = isUuid
    ? `id=eq.${encodeURIComponent(code)}`
    : `code=eq.${encodeURIComponent(code)}`;

  try {
    // Champs publics uniquement — pas d'IDs utilisateurs, pas de prix
    const r = await fetch(
      `${sbUrl}/rest/v1/livraisons?${filter}&select=id,code,statut,ville_depart,ville_arrivee,type,type_colis,created_at,cree_le&limit=1`,
      { headers: sbHeaders(sbKey) }
    );
    if (!r.ok) return res.status(400).json({ error: 'Suivi indisponible' });
    const rows = await r.json().catch(() => []);
    if (!rows.length) return res.status(404).json({ error: 'Code de suivi introuvable. Vérifiez le code et réessayez.' });

    const liv = rows[0];
    const statusInfo = STATUS_LABELS[liv.statut] || { label: liv.statut, icon: '📋', step: 1 };

    // Dernière position GPS (si en route) — seulement lat/lng arrondi (ville-level)
    let position = null;
    if (liv.statut === 'en_route') {
      const gpsRes = await fetch(
        `${sbUrl}/rest/v1/delivery_locations?livraison_id=eq.${liv.id}&select=latitude,longitude,recorded_at&order=recorded_at.desc&limit=1`,
        { headers: sbHeaders(sbKey) }
      );
      if (gpsRes.ok) {
        const gpsRows = await gpsRes.json().catch(() => []);
        if (gpsRows[0]) {
          position = {
            // Arrondi à 2 décimales (~1km) pour la vie privée du livreur
            lat: Math.round(gpsRows[0].latitude  * 100) / 100,
            lng: Math.round(gpsRows[0].longitude * 100) / 100,
            updated_at: gpsRows[0].recorded_at,
          };
        }
      }
    }

    return res.status(200).json({
      success: true,
      tracking: {
        code:          liv.code || code,
        statut:        liv.statut,
        statut_label:  statusInfo.label,
        statut_icon:   statusInfo.icon,
        statut_step:   statusInfo.step,
        ville_depart:  liv.ville_depart  || '—',
        ville_arrivee: liv.ville_arrivee || '—',
        type:          liv.type || liv.type_colis || 'colis',
        created_at:    liv.created_at || liv.cree_le,
        position,
        steps: Object.values(STATUS_LABELS)
          .filter(s => s.step > 0)
          .sort((a, b) => a.step - b.step),
        current_step: statusInfo.step,
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur de suivi', details: err.message });
  }
};
