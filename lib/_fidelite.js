// lib/_fidelite.js — Bonus fidélité du livreur (0 à 10 points de % en plus des 60 %).
// Un seul calcul, utilisé par l'écran (loyalty-bonus-get) ET par le paiement réel (capture-livraison),
// qui le recalcule à chaque capture : le bonus affiché est celui versé.
// Le bonus est pris sur la part de la plateforme, jamais sur celle du livreur.
'use strict';

const BONUS_MAX = 10;
const LIVRAISONS_AVANT_BONUS = 10;

function h(sbKey, extra) {
  return { apikey: sbKey, Authorization: `Bearer ${sbKey}`, ...(extra || {}) };
}

async function compter(url, sbKey) {
  const r = await fetch(url, { headers: h(sbKey, { Prefer: 'count=exact', Range: '0-0' }) });
  if (!r.ok) return 0;
  const cr = r.headers.get('content-range') || '0-0/0';
  return Number(cr.split('/')[1]) || 0;
}

// Règles affichées au livreur (et payées) : 60 % exact jusqu'à 10 livraisons payées, ensuite
//   fiabilité ≥ 95 +2 · 3 badges +1 · 10 mois membre +1 · 50 livraisons payées +2 · bonus admin (manuel). Plafond 10.
async function calculerBonusFidelite({ sbUrl, sbKey }, profil, { enregistrer = false } = {}) {
  const userId = profil?.id;
  const stats = { livraisons: 0, fiabilite: 100, badges: 0, mois: 0 };
  if (!userId) return { bonus: 0, breakdown: [], stats };
  try { stats.livraisons = await compter(`${sbUrl}/rest/v1/livraisons?livreur_id=eq.${encodeURIComponent(userId)}&statut=in.(payee,paid)&select=id`, sbKey); } catch (_) {}
  try {
    const fr = await fetch(`${sbUrl}/rest/v1/v_user_fiabilite?id=eq.${encodeURIComponent(userId)}&select=score`, { headers: h(sbKey) });
    const fdata = fr.ok ? await fr.json() : [];
    stats.fiabilite = fdata[0]?.score ?? 100;
  } catch (_) {}
  try { stats.badges = await compter(`${sbUrl}/rest/v1/user_badges?user_id=eq.${encodeURIComponent(userId)}&select=id`, sbKey); } catch (_) {}
  const cree = profil.cree_le || profil.created_at;
  stats.mois = cree ? Math.floor((Date.now() - new Date(cree).getTime()) / (30 * 86400000)) : 0;

  const breakdown = [];
  let bonus = 0;
  if (stats.livraisons >= 50) { bonus += 2; breakdown.push({ icon: '🌟', label: '50+ livraisons', pts: 2 }); }
  // Décision de Denis : tout le monde commence à 60 % exact. Les bonus automatiques
  // (fiabilité, badges, ancienneté) commencent seulement après 10 livraisons payées.
  const experimente = stats.livraisons >= LIVRAISONS_AVANT_BONUS;
  if (experimente && stats.fiabilite >= 95) { bonus += 2; breakdown.push({ icon: '⭐', label: 'Fiabilité ≥ 95 (après 10 livraisons payées)', pts: 2 }); }
  if (experimente && stats.badges >= 3) { bonus += 1; breakdown.push({ icon: '🏆', label: '3+ badges', pts: 1 }); }
  if (experimente && stats.mois >= 10) { bonus += 1; breakdown.push({ icon: '📅', label: '10+ mois membre', pts: 1 }); }
  const manuel = Math.max(0, Number(profil.loyalty_bonus_manual || 0));
  if (manuel > 0) { bonus += manuel; breakdown.push({ icon: '🎁', label: 'Bonus admin', pts: manuel }); }
  bonus = Math.min(BONUS_MAX, bonus);

  if (enregistrer) {
    await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: h(sbKey, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ loyalty_bonus_pct: bonus, loyalty_updated_at: new Date().toISOString() }),
    }).catch(() => {});
  }
  return { bonus, breakdown, stats };
}

module.exports = { calculerBonusFidelite, BONUS_MAX, LIVRAISONS_AVANT_BONUS };
