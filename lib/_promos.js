// lib/_promos.js — Codes promotionnels PorteàPorte
'use strict';

const { sbHeaders, roleIn } = require('./_lib');

const VALID_TYPES = ['fixed_price', 'discount_pct', 'discount_cad', 'insurance_upgrade', 'free_delivery'];

// ─── RPC helper local ─────────────────────────────────────────────────────────
async function sbRpc(ctx, fnName, params) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return { ok: r.ok };
}

// ─── Calcul du rabais ─────────────────────────────────────────────────────────
function computeDiscount(promo, baseTotal) {
  const val = Number(promo.value) || 0;
  switch (promo.type) {
    case 'fixed_price':
      return { type: 'fixed_price', fixed_total: val, amount: Math.max(0, baseTotal - val), label: `Prix fixe : ${val.toFixed(2)} $` };
    case 'free_delivery':
      return { type: 'fixed_price', fixed_total: 0, amount: baseTotal, label: 'Livraison gratuite' };
    case 'discount_pct': {
      const amount = Math.min(baseTotal, baseTotal * val / 100);
      return { type: 'discount_pct', amount, pct: val, label: `-${val} %` };
    }
    case 'discount_cad': {
      const amount = Math.min(baseTotal, val);
      return { type: 'discount_cad', amount, label: `-${val.toFixed(2)} $` };
    }
    case 'insurance_upgrade':
      return { type: 'insurance_upgrade', amount: 0, label: 'Assurance Plus offerte', insurance_level: 'plus' };
    default:
      return { type: 'unknown', amount: 0, label: '' };
  }
}

// ─── Validation d'un code (réutilisée dans validate ET createLivraison) ───────
async function validateCode(ctx, code, userId, opts = {}) {
  const { distance_km, base_price } = opts;

  const r = await fetch(
    `${ctx.sbUrl}/rest/v1/promo_codes?code=eq.${encodeURIComponent(code.toUpperCase())}&active=eq.true&select=*&limit=1`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return { error: 'Code invalide ou expiré' };

  const promo = rows[0];
  const now = new Date();
  if (promo.valid_until && new Date(promo.valid_until) < now) return { error: 'Ce code est expiré' };
  if (promo.valid_from && new Date(promo.valid_from) > now) return { error: 'Ce code n\'est pas encore actif' };
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) return { error: 'Ce code a atteint son nombre maximum d\'utilisations' };

  // Vérifier usage par utilisateur
  const ur = await fetch(
    `${ctx.sbUrl}/rest/v1/promo_code_uses?promo_code_id=eq.${promo.id}&user_id=eq.${userId}&select=id`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const uses = ur.ok ? await ur.json() : [];
  if (uses.length >= (promo.per_user_limit || 1)) return { error: 'Tu as déjà utilisé ce code' };

  // Vérifier conditions
  const conds = promo.conditions || {};
  if (conds.max_distance_km && distance_km !== undefined && Number(distance_km) > Number(conds.max_distance_km)) {
    return { error: `Ce code est valide uniquement pour les livraisons de moins de ${conds.max_distance_km} km` };
  }
  if (conds.min_price && base_price !== undefined && Number(base_price) < Number(conds.min_price)) {
    return { error: `Ce code est valide pour les livraisons de ${conds.min_price} $ et plus` };
  }

  return { promo };
}

// ─── Endpoint : promo-validate ─────────────────────────────────────────────────
async function promoValidate(req, res, ctx, body) {
  if (!ctx.session) return res.status(401).json({ error: 'Connexion requise' });
  const { code, base_price } = body;
  if (!code) return res.status(400).json({ error: 'Code requis' });

  const { promo, error } = await validateCode(ctx, code, ctx.session.id, { base_price });
  if (error) return res.status(400).json({ error });

  const discount = computeDiscount(promo, Number(base_price) || 0);
  return res.status(200).json({
    success: true,
    promo: {
      id: promo.id,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      description: promo.description,
      partner_name: promo.partner_name,
      conditions: promo.conditions,
    },
    discount,
  });
}

// ─── Appliquer un code (appelé depuis createLivraison) ────────────────────────
async function applyPromoCode(ctx, promoId, userId, livraisonId, discountAmount) {
  await fetch(`${ctx.sbUrl}/rest/v1/promo_code_uses`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ promo_code_id: promoId, user_id: userId, livraison_id: livraisonId, discount_applied: discountAmount })
  });
  await sbRpc(ctx, 'increment_promo_uses', { p_promo_id: promoId });
}

// ─── Admin : lister les codes ──────────────────────────────────────────────────
async function adminPromoList(req, res, ctx) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const r = await fetch(`${ctx.sbUrl}/rest/v1/promo_codes?select=*&order=created_at.desc`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const codes = r.ok ? await r.json() : [];
  return res.status(200).json({ success: true, codes });
}

// ─── Admin : créer un code ─────────────────────────────────────────────────────
async function adminPromoCreate(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const { code, type, value, description, partner_name, max_uses, valid_until, conditions, per_user_limit } = body;
  if (!code || !type) return res.status(400).json({ error: 'code et type requis' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Type invalide' });

  const r = await fetch(`${ctx.sbUrl}/rest/v1/promo_codes`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({
      code: code.toUpperCase().trim(),
      type,
      value: Number(value) || 0,
      description: description || null,
      partner_name: partner_name || null,
      max_uses: max_uses ? Number(max_uses) : null,
      valid_until: valid_until || null,
      conditions: conditions || {},
      per_user_limit: Number(per_user_limit) || 1,
      active: true,
    })
  });
  const data = r.ok ? await r.json().catch(() => null) : null;
  if (!r.ok) return res.status(400).json({ error: 'Création impossible', details: data });
  return res.status(200).json({ success: true, promo: Array.isArray(data) ? data[0] : data });
}

// ─── Admin : toggle actif/inactif ─────────────────────────────────────────────
async function adminPromoToggle(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const { id, active } = body;
  if (!id) return res.status(400).json({ error: 'id requis' });
  const r = await fetch(`${ctx.sbUrl}/rest/v1/promo_codes?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ active: Boolean(active) })
  });
  if (!r.ok) return res.status(400).json({ error: 'Mise à jour impossible' });
  return res.status(200).json({ success: true });
}

module.exports = { computeDiscount, validateCode, promoValidate, applyPromoCode, adminPromoList, adminPromoCreate, adminPromoToggle };
