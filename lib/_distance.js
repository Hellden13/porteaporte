// lib/_distance.js — Distance d'une livraison (test complet du 22 nov. 2026, point 10).
//
// Méthode (sans service externe, même calcul dans le navigateur et sur le serveur) :
//  1. On prend le centre approximatif de la zone du code postal (les 3 premiers caractères, « RTA » :
//     G7A = Saint-Nicolas, G1V = Sainte-Foy / Place Laurier…). Sans code postal connu, le centre de la ville.
//  2. Si un point est sur la rive sud (Lévis) et l'autre sur la rive nord (Québec), le trajet passe
//     par les ponts (pont Pierre-Laporte) : distance A → ponts + ponts → B. Le traversier n'est pas compté.
//  3. Distance à vol d'oiseau × 1,35 (les routes ne sont pas droites), arrondie, minimum 2 km.
// Exemple : Saint-Nicolas (G7A) → Place Laurier (G1V) ≈ 17 km (avant : 3 km, la largeur du fleuve).
// Les centres de zone sont approximatifs (à ± 2 km près), assez précis pour un prix.
'use strict';

const { cityCoords, haversineKm, normalizeCity, estimateRouteKm } = require('./_lib');

const FACTEUR_ROUTE = 1.35;
const PONTS = [46.7458, -71.2875]; // pont Pierre-Laporte / pont de Québec

// Centres approximatifs des zones de codes postaux (RTA) de la zone bêta Québec–Lévis.
const RTA = {
  // Québec (rive nord)
  G1A: [46.808, -71.214], G1B: [46.872, -71.190], G1C: [46.885, -71.150], G1E: [46.852, -71.200],
  G1G: [46.860, -71.270], G1H: [46.880, -71.265], G1J: [46.835, -71.215], G1K: [46.813, -71.222],
  G1L: [46.830, -71.240], G1M: [46.823, -71.262], G1N: [46.810, -71.290], G1P: [46.830, -71.315],
  G1R: [46.806, -71.222], G1S: [46.795, -71.240], G1T: [46.781, -71.256], G1V: [46.771, -71.293],
  G1W: [46.760, -71.300], G1X: [46.762, -71.330], G1Y: [46.755, -71.360], G2A: [46.858, -71.350],
  G2B: [46.850, -71.330], G2C: [46.838, -71.318], G2E: [46.790, -71.360], G2G: [46.800, -71.385],
  G2J: [46.842, -71.300], G2K: [46.852, -71.310], G2L: [46.872, -71.292], G2M: [46.900, -71.370],
  G2N: [46.905, -71.300], G3A: [46.748, -71.460], G3E: [46.870, -71.430], G3G: [46.990, -71.370],
  G3J: [46.855, -71.420], G3K: [46.865, -71.395],
  // Lévis (rive sud)
  G6V: [46.808, -71.170], G6W: [46.780, -71.195], G6X: [46.712, -71.270], G6Y: [46.700, -71.235],
  G6Z: [46.725, -71.205], G6J: [46.660, -71.320], G6K: [46.700, -71.300], G6C: [46.770, -71.140],
  G7A: [46.690, -71.390],
};

// Rive sud : Lévis et ses secteurs (codes G6* et G7A).
const VILLES_RIVE_SUD = new Set(['levis', 'saintnicolas', 'stnicolas', 'charny', 'stromuald', 'saintromuald', 'pintendre',
  'saintredempteur', 'saintjean', 'breakeyville', 'saintjeanchrysostome', 'saintetiennedelauzon', 'lauzon', 'bernieres']);

function rta(codePostal) {
  const c = String(codePostal || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return /^[A-Z]\d[A-Z]$/.test(c) ? c : null;
}

function riveSud(point) {
  if (point.rta) return /^(G6|G7A)/.test(point.rta);
  return VILLES_RIVE_SUD.has(normalizeCity(point.ville || ''));
}

function localiser(ville, codePostal) {
  const r = rta(codePostal);
  if (r && RTA[r]) return { coords: RTA[r], rta: r, ville, source: 'code postal' };
  let coords = cityCoords(ville);
  if (!coords && typeof ville === 'string' && /[-–—,]/.test(ville)) {
    for (const p of ville.split(/[-–—,]/).map((x) => x.trim()).filter(Boolean)) {
      coords = cityCoords(p);
      if (coords) break;
    }
  }
  return coords ? { coords, rta: null, ville, source: 'ville' } : null;
}

// Distance routière estimée (km) entre deux points d'une livraison.
function distanceLivraison({ ville_depart, ville_arrivee, cp_depart, cp_arrivee } = {}) {
  const a = localiser(ville_depart, cp_depart);
  const b = localiser(ville_arrivee, cp_arrivee);
  // Sans aucun code postal reconnu : la table des villes (trajets connus, ex. Québec–Montréal 233 km).
  if (!a || !b || (!a.rta && !b.rta)) {
    const km = estimateRouteKm(ville_depart, ville_arrivee);
    return { km: km || 5, methode: 'ville → ville (table des villes)' };
  }
  const traverse = riveSud(a) !== riveSud(b);
  const volOiseau = traverse
    ? haversineKm(a.coords[0], a.coords[1], PONTS[0], PONTS[1]) + haversineKm(PONTS[0], PONTS[1], b.coords[0], b.coords[1])
    : haversineKm(a.coords[0], a.coords[1], b.coords[0], b.coords[1]);
  const km = Math.max(2, Math.round(volOiseau * FACTEUR_ROUTE));
  return { km, methode: `${a.source} → ${b.source}${traverse ? ', par les ponts' : ''}` };
}

module.exports = { distanceLivraison, rta, RTA, FACTEUR_ROUTE, PONTS };
