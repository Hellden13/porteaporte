// api/matching.js - Matching et publication livraison, schema Supabase production.

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function headers(key) {
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function getSessionUser(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;

  const r = await fetch(sbUrl + '/auth/v1/user', {
    headers: {
      apikey: sbKey,
      Authorization: 'Bearer ' + token
    }
  });
  return r.ok ? r.json() : null;
}

async function getProfile(userId, sbUrl, sbKey) {
  let r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,role,suspendu,email_verified,driver_status,verification_status`, {
    headers: headers(sbKey)
  });
  if (!r.ok) {
    r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,role,suspendu`, {
      headers: headers(sbKey)
    });
  }
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

function isEmailVerified(session, profile) {
  return Boolean(profile?.email_verified || session?.email_confirmed_at || session?.confirmed_at);
}

function isVerifiedDriver(session, profile) {
  return Boolean(
    profile &&
    !profile.suspendu &&
    isEmailVerified(session, profile) &&
    (profile.role === 'admin' || (
      ['livreur', 'les deux'].includes(profile.role) &&
      profile.driver_status === 'verified'
    ))
  );
}

function normalizeCity(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function estimatePrice({ ville_depart = '', ville_arrivee = '', poids_kg = 5, type_colis = 'Petit colis' }) {
  const distances = {
    'levis-montreal': 270,
    'quebec-montreal': 265,
    'montreal-sherbrooke': 145,
    'montreal-gatineau': 200,
    'quebec-sherbrooke': 215,
    'levis-sherbrooke': 230,
    'montreal-toronto': 540,
    'quebec-toronto': 790,
    'montreal-ottawa': 200,
    'levis-quebec': 15,
    'montreal-laval': 20,
    'montreal-longueuil': 15,
    'quebec-levis': 15,
    'montreal-brossard': 18,
    'montreal-verdun': 12,
  };

  const key = normalizeCity(ville_depart) + '-' + normalizeCity(ville_arrivee);
  const reverse = normalizeCity(ville_arrivee) + '-' + normalizeCity(ville_depart);
  const distance = distances[key] || distances[reverse] || 200;

  let base = Math.round(distance * 0.15 + Number(poids_kg || 5) * 1.5 + 15);
  if (/vehicule/i.test(type_colis)) base = Math.round(base * 2.5);
  else if (/meuble/i.test(type_colis)) base = Math.round(base * 1.6);
  else if (/electronique/i.test(normalizeCity(type_colis))) base = Math.round(base * 1.3);

  base = Math.max(base, 25);
  const commission = Math.round(base * 0.12 * 100) / 100;
  const tps = Math.round(base * 0.05 * 100) / 100;
  const tvq = Math.round(base * 0.09975 * 100) / 100;

  return {
    prix_base: base,
    prix_min: Math.round(base * 0.7),
    prix_max: Math.round(base * 1.3),
    commission_pp: commission,
    tps,
    tvq,
    total_estime: Math.round((base + commission + tps + tvq) * 100) / 100,
    distance_km: distance,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const { action, ...p } = req.body || {};

  if (action === 'calculer_prix') {
    return res.status(200).json({ success: true, ...estimatePrice(p) });
  }

  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase non configure' });

  const session = await getSessionUser(req, SB_URL, SB_KEY);
  const profile = session ? await getProfile(session.id, SB_URL, SB_KEY) : null;

  try {
    if (action === 'trouver_livreurs') {
      if (!session) return res.status(401).json({ error: 'Session requise' });
      if (!profile || profile.suspendu) return res.status(403).json({ error: 'Profil invalide ou suspendu' });

      const villeDepart = p.ville_depart || '';
      const villeArrivee = p.ville_arrivee || '';
      if (!villeDepart || !villeArrivee) return res.status(400).json({ error: 'Villes requises' });

      const r = await fetch(
        `${SB_URL}/rest/v1/profiles?role=in.(livreur,les%20deux)&suspendu=eq.false&select=id,prenom,nom,score_confiance,vehicule,trajet_principal,livraisons,xp&limit=25`,
        { headers: headers(SB_KEY) }
      );
      if (!r.ok) return res.status(502).json({ error: 'Lecture livreurs impossible' });

      const drivers = await r.json();
      const scored = drivers.map((driver) => {
        let score = Number(driver.score_confiance || driver.xp || 75);
        const route = String(driver.trajet_principal || '').toLowerCase();
        const dep = villeDepart.toLowerCase();
        const arr = villeArrivee.toLowerCase();
        if (route.includes(dep) && route.includes(arr)) score += 20;
        else if (route.includes(dep) || route.includes(arr)) score += 10;

        return {
          id: driver.id,
          prenom: driver.prenom,
          nom_initial: (driver.nom || '?').slice(0, 1) + '.',
          score_confiance: driver.score_confiance || score,
          score_matching: Math.min(Math.round(score), 100),
          vehicule: driver.vehicule || 'Non precise',
          livraisons: driver.livraisons || 0,
          eta_minutes: null
        };
      }).sort((a, b) => b.score_matching - a.score_matching).slice(0, 5);

      return res.status(200).json({ success: true, livreurs: scored, algo_version: '2.0-profiles' });
    }

    if (action === 'publier_colis') {
      if (!session) return res.status(401).json({ error: 'Session requise' });
      if (!profile || profile.suspendu || !['expediteur', 'les deux', 'admin'].includes(profile.role)) {
        return res.status(403).json({ error: 'Role expediteur requis' });
      }

      const pricing = estimatePrice({
        ville_depart: p.ville_depart,
        ville_arrivee: p.ville_arrivee,
        poids_kg: p.poids_kg,
        type_colis: p.type_colis
      });

      const payload = {
        expediteur_id: session.id,
        type: 'colis',
        description: p.description || '',
        ville_depart: p.ville_depart || '',
        ville_arrivee: p.ville_arrivee || '',
        adresse_depart: p.adresse_depart || p.address || '',
        adresse_arrivee: p.adresse_arrivee || '',
        poids_kg: p.poids_kg === undefined ? null : Number(p.poids_kg),
        type_colis: p.type_colis || 'Petit colis',
        prix_total: Number(p.prix_total || p.prix || pricing.total_estime),
        notes: p.notes || null
      };

      const r = await fetch(`${SB_URL}/rest/v1/livraisons`, {
        method: 'POST',
        headers: headers(SB_KEY),
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(400).json({ error: 'Creation livraison impossible', details: data });

      const livraison = Array.isArray(data) ? data[0] : data;
      return res.status(200).json({
        success: true,
        livraison_id: livraison.id,
        code: livraison.code,
        statut: livraison.statut,
        prix_total: livraison.prix_total,
        message: 'Livraison publiee',
      });
    }

    if (action === 'accepter_livreur') {
      if (!session) return res.status(401).json({ error: 'Session requise' });
      if (!isVerifiedDriver(session, profile)) {
        return res.status(403).json({ error: 'Livreur verifie requis' });
      }

      const livraisonId = p.livraison_id || p.colis_id;
      const livreurId = p.livreur_id || session.id;
      if (!livraisonId || !livreurId) return res.status(400).json({ error: 'livraison_id et livreur_id requis' });

      if (livreurId !== session.id) return res.status(403).json({ error: 'Un livreur ne peut accepter que pour lui-meme' });

      const r = await fetch(`${SB_URL}/rest/v1/rpc/accepter_livraison`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_livraison_id: livraisonId })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(400).json({ error: 'Acceptation impossible', details: data });

      return res.status(200).json({
        success: true,
        livraison: data,
        gps_url: `https://porteaporte.site/suivi-livraison.html?id=${livraisonId}`
      });
    }

    return res.status(400).json({ error: 'Action inconnue: ' + action });
  } catch (err) {
    console.error('[matching]', err.message);
    return res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
};


