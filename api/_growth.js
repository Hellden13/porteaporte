// api/_growth.js — Systèmes de croissance v2 : Points Impact, Badges, Parrainage, XP
'use strict';

const { sbHeaders, roleIn, defaultRewardMissions } = require('./_lib');

// ─── Helpers internes ─────────────────────────────────────────────────────────

async function sbRpc(ctx, fnName, params) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify(params)
  });
  return { ok: r.ok, data: r.ok ? await r.json().catch(() => null) : null };
}

async function getPointsBalance(ctx, userId) {
  const r = await fetch(
    `${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount&user_id=eq.${userId}&limit=2000`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const txs = r.ok ? await r.json() : [];
  return txs.reduce((s, t) => s + Number(t.amount || 0), 0);
}

async function getUserXP(ctx, userId) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${userId}&select=xp&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const rows = r.ok ? await r.json() : [];
  return Number(rows[0]?.xp || 0);
}

function computeLevel(xp) {
  const levels = [
    { level: 1, name: 'Nouveau',           min_xp: 0,    next_xp: 200,  icon: '🟢', benefit: 'Accès aux missions de base.' },
    { level: 2, name: 'Fiable',            min_xp: 200,  next_xp: 500,  icon: '🔵', benefit: 'Meilleure visibilité sur les missions.' },
    { level: 3, name: 'Habitué',           min_xp: 500,  next_xp: 1000, icon: '🟩', benefit: 'Missions prioritaires et badges avancés.' },
    { level: 4, name: 'Ambassadeur',       min_xp: 1000, next_xp: 2000, icon: '🟡', benefit: 'Missions exclusives, support prioritaire.' },
    { level: 5, name: 'Capitaine régional',min_xp: 2000, next_xp: null, icon: '⭐', benefit: 'Priorité trajets groupés, reconnaissance publique.' }
  ];
  const current = [...levels].reverse().find(l => xp >= l.min_xp) || levels[0];
  const next = levels.find(l => l.level === current.level + 1) || null;
  const progress = next
    ? Math.min(100, Math.round(((xp - current.min_xp) / (next.min_xp - current.min_xp)) * 100))
    : 100;
  return { current, next, xp, progress };
}

async function generateReferralCode(userId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Growth Dashboard ─────────────────────────────────────────────────────────

async function growthDashboard(req, res, ctx) {
  const uid = ctx.session.id;

  const [ptBalance, userXp, badgesRes, refCodeRes, refRes, missionsRes, drawsRes, txRes] = await Promise.all([
    getPointsBalance(ctx, uid),
    getUserXP(ctx, uid),
    fetch(`${ctx.sbUrl}/rest/v1/user_badges?select=granted_at,badge_id,badges(slug,name,icon,category,description)&user_id=eq.${uid}&order=granted_at.desc`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/referral_codes?select=code,total_uses,total_rewarded&user_id=eq.${uid}&limit=1`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/referrals?select=*&referrer_id=eq.${uid}&order=created_at.desc&limit=20`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/missions?select=*&status=eq.active&order=created_at.desc&limit=20`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?select=*&status=eq.active&order=draw_date.asc&limit=5`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount,reason,created_at&user_id=eq.${uid}&order=created_at.desc&limit=15`, { headers: sbHeaders(ctx.sbKey) })
  ]);

  const badges     = badgesRes.ok     ? await badgesRes.json()  : [];
  const refCodes   = refCodeRes.ok    ? await refCodeRes.json() : [];
  const referrals  = refRes.ok        ? await refRes.json()     : [];
  const missions   = missionsRes.ok   ? await missionsRes.json(): defaultRewardMissions();
  const draws      = drawsRes.ok      ? await drawsRes.json()   : [];
  const recentTx   = txRes.ok         ? await txRes.json()      : [];

  let entries = [];
  const drawIds = draws.map(d => d.id);
  if (drawIds.length) {
    const eRes = await fetch(`${ctx.sbUrl}/rest/v1/draw_entries?select=draw_id,entries&user_id=eq.${uid}&draw_id=in.(${drawIds.join(',')})`, { headers: sbHeaders(ctx.sbKey) });
    entries = eRes.ok ? await eRes.json() : [];
  }

  const allBadgesRes = await fetch(`${ctx.sbUrl}/rest/v1/badges?select=slug,name,icon,description,category&active=eq.true&order=xp_reward.asc`, { headers: sbHeaders(ctx.sbKey) });
  const allBadges = allBadgesRes.ok ? await allBadgesRes.json() : [];
  const earnedSlugs = new Set(badges.map(b => b.badges?.slug).filter(Boolean));
  const nextBadges  = allBadges.filter(b => !earnedSlugs.has(b.slug)).slice(0, 3);

  // ── Claim-free streak ─────────────────────────────────────────────────────
  const CLAIM_MILESTONES = [
    { key: '7j',   days: 7,   label: 'Semaine propre',       emoji: '🌱', points: 25 },
    { key: '30j',  days: 30,  label: 'Mois irréprochable',   emoji: '⭐', points: 100 },
    { key: '90j',  days: 90,  label: 'Livreur fiable',       emoji: '🏆', points: 250 },
    { key: '180j', days: 180, label: 'Livreur de confiance', emoji: '💎', points: 500 },
    { key: '365j', days: 365, label: 'Livreur élite',        emoji: '🚀', points: 1000 },
  ];
  let claimFree = { days: 0, milestones: CLAIM_MILESTONES.map(m => ({ ...m, reached: false, current: false })), next: CLAIM_MILESTONES[0] };
  try {
    const cfRes = await fetch(`${ctx.sbUrl}/rest/v1/rpc/get_claim_free_days`, {
      method: 'POST',
      headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_driver_id: uid })
    });
    if (cfRes.ok) {
      const cfData = await cfRes.json();
      const cfDays = cfData.claim_free_days || 0;
      const reached = cfData.milestones_reached || [];

      // Auto-attribution des jalons non encore donnés (fire & forget)
      for (const m of CLAIM_MILESTONES) {
        if (cfDays >= m.days && !reached.includes(m.key)) {
          fetch(`${ctx.sbUrl}/rest/v1/rpc/award_claim_free_milestone`, {
            method: 'POST',
            headers: { ...sbHeaders(ctx.sbKey), 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_driver_id: uid, p_milestone_key: m.key, p_points: m.points })
          }).catch(() => {});
          reached.push(m.key);
        }
      }

      const next = CLAIM_MILESTONES.find(m => !reached.includes(m.key)) || null;
      claimFree = {
        days: cfDays,
        milestones: CLAIM_MILESTONES.map(m => ({
          ...m, reached: reached.includes(m.key), current: cfDays >= m.days
        })),
        next: next ? { ...next, days_remaining: Math.max(0, next.days - cfDays) } : null
      };
    }
  } catch (_) {}

  return res.status(200).json({
    success: true,
    points_balance: ptBalance,
    points_label: 'Points Impact',
    xp: userXp,
    level: computeLevel(userXp),
    badges_earned: badges,
    badges_next: nextBadges,
    claim_free: claimFree,
    badges_count: badges.length,
    referral_code: refCodes[0] || null,
    referrals,
    missions,
    draws,
    entries,
    recent_transactions: recentTx,
    legal_notice: 'Les Points Impact n\'ont aucune valeur monétaire et ne peuvent être échangés contre de l\'argent. Les tirages sont soumis aux règlements officiels. Aucun achat requis lorsque requis par la loi.',
    rename_notice: 'PorteCoins est maintenant appelé Points Impact.'
  });
}

// ─── Referral GET ─────────────────────────────────────────────────────────────

async function referralGet(req, res, ctx) {
  const uid = ctx.session.id;

  const r = await fetch(`${ctx.sbUrl}/rest/v1/referral_codes?select=*&user_id=eq.${uid}&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const existing = r.ok ? await r.json() : [];
  if (existing.length) return res.status(200).json({ success: true, referral: existing[0] });

  let code, tries = 0;
  while (tries < 5) {
    const candidate = await generateReferralCode(uid);
    const check = await fetch(`${ctx.sbUrl}/rest/v1/referral_codes?code=eq.${candidate}&select=id&limit=1`, { headers: sbHeaders(ctx.sbKey) });
    const rows = check.ok ? await check.json() : [1];
    if (!rows.length) { code = candidate; break; }
    tries++;
  }
  if (!code) return res.status(500).json({ error: 'Impossible de générer un code unique' });

  const ins = await fetch(`${ctx.sbUrl}/rest/v1/referral_codes`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ user_id: uid, code })
  });
  const created = ins.ok ? await ins.json().catch(() => ({})) : {};
  const ref = Array.isArray(created) ? created[0] : created;
  return res.status(200).json({ success: true, referral: { user_id: uid, code, total_uses: 0, total_rewarded: 0, ...ref } });
}

// ─── Referral USE ─────────────────────────────────────────────────────────────

async function referralUse(req, res, ctx, body) {
  const uid  = ctx.session.id;
  const code = String(body.code || '').toUpperCase().trim();
  if (!code) return res.status(400).json({ error: 'Code de parrainage requis' });

  const alreadyRes = await fetch(`${ctx.sbUrl}/rest/v1/referrals?referee_id=eq.${uid}&select=id&limit=1`, { headers: sbHeaders(ctx.sbKey) });
  const already = alreadyRes.ok ? await alreadyRes.json() : [];
  if (already.length) return res.status(409).json({ error: 'Tu as déjà utilisé un code de parrainage' });

  const codeRes = await fetch(`${ctx.sbUrl}/rest/v1/referral_codes?code=eq.${code}&select=user_id,code,total_uses&limit=1`, { headers: sbHeaders(ctx.sbKey) });
  const codes = codeRes.ok ? await codeRes.json() : [];
  if (!codes.length) return res.status(404).json({ error: 'Code invalide ou expiré' });
  const { user_id: referrerId } = codes[0];

  if (referrerId === uid) return res.status(409).json({ error: 'Tu ne peux pas utiliser ton propre code' });

  const insRes = await fetch(`${ctx.sbUrl}/rest/v1/referrals`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ referrer_id: referrerId, referee_id: uid, code, status: 'pending' })
  });
  if (!insRes.ok) {
    const err = await insRes.json().catch(() => ({}));
    return res.status(400).json({ error: 'Enregistrement parrainage impossible', details: err });
  }

  await fetch(`${ctx.sbUrl}/rest/v1/referral_codes?code=eq.${code}`, {
    method: 'PATCH',
    headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ total_uses: (codes[0].total_uses || 0) + 1 })
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: 'Code accepté ! La récompense sera attribuée après ta première livraison ou ton premier trajet covoiturage.',
    referrer_rewarded_on: 'first_completed_action'
  });
}

// ─── Badges LIST ──────────────────────────────────────────────────────────────

async function badgesList(req, res, ctx) {
  const uid = ctx.session.id;

  const [earnedRes, allRes] = await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/user_badges?select=granted_at,badge_id,badges(*)&user_id=eq.${uid}&order=granted_at.desc`, { headers: sbHeaders(ctx.sbKey) }),
    fetch(`${ctx.sbUrl}/rest/v1/badges?select=*&active=eq.true&order=category.asc,xp_reward.asc`, { headers: sbHeaders(ctx.sbKey) })
  ]);

  const earned = earnedRes.ok ? await earnedRes.json() : [];
  const all    = allRes.ok    ? await allRes.json()    : [];
  const earnedIds = new Set(earned.map(e => e.badge_id));
  const categorized = {};
  for (const b of all) {
    const cat = b.category || 'general';
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push({ ...b, earned: earnedIds.has(b.id), earned_at: earned.find(e => e.badge_id === b.id)?.granted_at || null });
  }

  return res.status(200).json({ success: true, badges_earned_count: earned.length, badges_total: all.length, categorized, earned });
}

// ─── Badges GRANT (admin) ─────────────────────────────────────────────────────

async function badgesGrant(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const { user_id, badge_slug } = body;
  if (!user_id || !badge_slug) return res.status(400).json({ error: 'user_id et badge_slug requis' });

  const result = await sbRpc(ctx, 'grant_badge', { p_user_id: user_id, p_badge_slug: badge_slug, p_granted_by: ctx.session.id });
  if (!result.ok) return res.status(400).json({ error: 'Échec attribution badge' });
  return res.status(200).json({ success: true, new_badge: result.data, badge_slug });
}

// ─── XP History ───────────────────────────────────────────────────────────────

async function xpHistory(req, res, ctx) {
  const uid = ctx.session.id;
  const r = await fetch(`${ctx.sbUrl}/rest/v1/xp_transactions?select=amount,reason,ref_type,created_at&user_id=eq.${uid}&order=created_at.desc&limit=50`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const txs  = r.ok ? await r.json() : [];
  const xp   = await getUserXP(ctx, uid);
  return res.status(200).json({ success: true, xp_total: xp, level: computeLevel(xp), history: txs });
}

// ─── Points History ───────────────────────────────────────────────────────────

async function pointsHistory(req, res, ctx) {
  const uid = ctx.session.id;
  const r = await fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount,reason,created_at,metadata&user_id=eq.${uid}&order=created_at.desc&limit=50`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const txs     = r.ok ? await r.json() : [];
  const balance = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
  return res.status(200).json({
    success: true,
    points_balance: balance,
    points_label: 'Points Impact',
    history: txs,
    legal: 'Les Points Impact n\'ont aucune valeur monétaire.'
  });
}

// ─── Admin Growth ─────────────────────────────────────────────────────────────

async function adminGrowth(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const mode = body.mode || 'stats';

  if (mode === 'stats') {
    const [badgesRes, refRes, xpRes, txRes, auditRes] = await Promise.all([
      fetch(`${ctx.sbUrl}/rest/v1/user_badges?select=badge_id&limit=2000`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/referrals?select=status&limit=2000`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/xp_transactions?select=amount&limit=5000`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions?select=amount&limit=5000`, { headers: sbHeaders(ctx.sbKey) }),
      fetch(`${ctx.sbUrl}/rest/v1/reward_audit_logs?select=action,created_at&order=created_at.desc&limit=100`, { headers: sbHeaders(ctx.sbKey) })
    ]);
    const badges   = badgesRes.ok ? await badgesRes.json() : [];
    const refs     = refRes.ok    ? await refRes.json()    : [];
    const xpTxs    = xpRes.ok     ? await xpRes.json()     : [];
    const ptTxs    = txRes.ok     ? await txRes.json()     : [];
    const audit    = auditRes.ok  ? await auditRes.json()  : [];
    return res.status(200).json({
      success: true,
      stats: {
        badges_granted_total: badges.length,
        referrals_total: refs.length,
        referrals_rewarded: refs.filter(r => r.status === 'rewarded').length,
        xp_issued_total: xpTxs.reduce((s, t) => s + Number(t.amount || 0), 0),
        points_issued_net: ptTxs.reduce((s, t) => s + Number(t.amount || 0), 0)
      },
      recent_audit: audit
    });
  }

  if (mode === 'grant_badge') {
    return badgesGrant(req, res, ctx, body);
  }

  if (mode === 'grant_points') {
    const { user_id, amount, reason } = body;
    if (!user_id || !amount || !reason) return res.status(400).json({ error: 'user_id, amount, reason requis' });
    const safeAmount = Math.min(Math.max(-9999, Math.round(Number(amount))), 9999);
    const ins = await fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions`, {
      method: 'POST',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ user_id, amount: safeAmount, reason, metadata: { admin_id: ctx.session.id } })
    });
    await fetch(`${ctx.sbUrl}/rest/v1/reward_audit_logs`, {
      method: 'POST',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ user_id, action: 'admin_points_grant', points_delta: safeAmount, admin_id: ctx.session.id, note: reason })
    }).catch(() => {});
    return ins.ok
      ? res.status(200).json({ success: true, amount: safeAmount })
      : res.status(400).json({ error: 'Impossible d\'attribuer les points' });
  }

  if (mode === 'cancel_reward') {
    const { audit_log_id, note } = body;
    if (!audit_log_id) return res.status(400).json({ error: 'audit_log_id requis' });
    const upd = await fetch(`${ctx.sbUrl}/rest/v1/reward_audit_logs?id=eq.${audit_log_id}`, {
      method: 'PATCH',
      headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ cancelled: true, note: note || 'Annulé par admin' })
    });
    return upd.ok
      ? res.status(200).json({ success: true })
      : res.status(400).json({ error: 'Annulation impossible' });
  }

  if (mode === 'batch_grant_badge') {
    const { badge_slug, dry_run } = body;
    if (!badge_slug) return res.status(400).json({ error: 'badge_slug requis' });
    const profRes = await fetch(
      `${ctx.sbUrl}/rest/v1/profiles?select=id&limit=5000`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    if (!profRes.ok) return res.status(500).json({ error: 'Impossible de lire les profils' });
    const profiles = await profRes.json();
    if (dry_run) return res.status(200).json({ dry_run: true, total_profiles: profiles.length, badge_slug });

    let granted = 0, skipped = 0, errors = 0;
    for (const p of profiles) {
      const r = await sbRpc(ctx, 'grant_badge', { p_user_id: p.id, p_badge_slug: badge_slug, p_granted_by: ctx.session.id });
      if (!r.ok) { errors++; continue; }
      if (r.data === true) granted++; else skipped++;
    }
    return res.status(200).json({ success: true, badge_slug, total: profiles.length, granted, skipped, errors });
  }

  return res.status(400).json({ error: 'Mode admin-growth inconnu: ' + mode });
}

// ─── Badge Campaigns ──────────────────────────────────────────────────────────

async function badgeCampaigns(req, res, ctx) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const r = await fetch(
    `${ctx.sbUrl}/rest/v1/badge_campaign_status?order=created_at.desc`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  if (!r.ok) {
    const fallback = await fetch(`${ctx.sbUrl}/rest/v1/badges?order=category.asc,name.asc`, { headers: sbHeaders(ctx.sbKey) });
    const data = fallback.ok ? await fallback.json() : [];
    return res.status(200).json({ success: true, campaigns: data, fallback: true });
  }
  const data = await r.json();
  return res.status(200).json({ success: true, campaigns: data });
}

async function badgeCampaignSave(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const {
    id, slug, name, description, icon, category,
    points_reward, xp_reward,
    campaign_name, role_filter, auto_trigger,
    active_from, active_until,
    benefit_from, benefit_until,
    seasonal_months, max_recipients,
    active
  } = body;

  if (!slug || !name) return res.status(400).json({ error: 'slug et name requis' });

  const payload = {
    slug, name,
    description: description || null,
    icon: icon || '🏅',
    category: category || 'general',
    points_reward: Number(points_reward) || 0,
    xp_reward: Number(xp_reward) || 0,
    campaign_name: campaign_name || null,
    role_filter: role_filter || null,
    auto_trigger: auto_trigger || 'manual',
    active_from:  active_from  || null,
    active_until: active_until || null,
    benefit_from: benefit_from || null,
    benefit_until: benefit_until || null,
    seasonal_months: Array.isArray(seasonal_months) && seasonal_months.length ? seasonal_months : null,
    max_recipients: max_recipients ? Number(max_recipients) : null,
    active: active !== false,
    paused: false,
    condition_type: 'manual',
    condition_value: 1
  };

  let r;
  if (id) {
    r = await fetch(`${ctx.sbUrl}/rest/v1/badges?id=eq.${id}`, {
      method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=representation'),
      body: JSON.stringify(payload)
    });
  } else {
    r = await fetch(`${ctx.sbUrl}/rest/v1/badges`, {
      method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=representation'),
      body: JSON.stringify(payload)
    });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(400).json({ error: 'Sauvegarde impossible', details: data });
  return res.status(200).json({ success: true, badge: Array.isArray(data) ? data[0] : data });
}

async function badgeCampaignToggle(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const { id, action } = body;
  if (!id || !action) return res.status(400).json({ error: 'id et action requis' });

  let patch = {};
  if (action === 'pause')      patch = { paused: true };
  if (action === 'resume')     patch = { paused: false };
  if (action === 'activate')   patch = { active: true, paused: false };
  if (action === 'deactivate') patch = { active: false };

  const r = await fetch(`${ctx.sbUrl}/rest/v1/badges?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify(patch)
  });
  return r.ok
    ? res.status(200).json({ success: true, action })
    : res.status(400).json({ error: 'Mise à jour impossible' });
}

async function badgeBenefitStatus(req, res, ctx, body) {
  const { badge_slug } = body;
  if (!badge_slug) return res.status(400).json({ error: 'badge_slug requis' });
  const r = await fetch(
    `${ctx.sbUrl}/rest/v1/badges?slug=eq.${encodeURIComponent(badge_slug)}&select=slug,seasonal_months,benefit_from,benefit_until,active,paused`,
    { headers: sbHeaders(ctx.sbKey) }
  );
  const rows = r.ok ? await r.json() : [];
  const b = rows[0];
  if (!b) return res.status(404).json({ error: 'Badge introuvable' });

  const now = new Date();
  const month = now.getMonth() + 1;
  let benefitActive = false;
  if (b.seasonal_months && b.seasonal_months.includes(month)) benefitActive = true;
  if (b.benefit_from && !b.benefit_until) benefitActive = now >= new Date(b.benefit_from);
  if (b.benefit_from && b.benefit_until)  benefitActive = now >= new Date(b.benefit_from) && now <= new Date(b.benefit_until);
  if (!b.seasonal_months && !b.benefit_from) benefitActive = true;

  return res.status(200).json({
    success: true, slug: b.slug,
    benefit_active: benefitActive && b.active && !b.paused
  });
}

// ─── Récompense parrainage ────────────────────────────────────────────────────

async function rewardReferralIfPending(ctx, refereeId, actionType) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/referrals?referee_id=eq.${refereeId}&status=eq.pending&select=*&limit=1`, {
    headers: sbHeaders(ctx.sbKey)
  });
  const refs = r.ok ? await r.json() : [];
  if (!refs.length) return;
  const ref = refs[0];

  const POINTS_REWARD = 100;
  const XP_REWARD     = 50;

  await Promise.all([
    fetch(`${ctx.sbUrl}/rest/v1/porte_coins_transactions`, {
      method: 'POST', headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ user_id: ref.referrer_id, amount: POINTS_REWARD, reason: 'referral_reward', metadata: { referee_id: refereeId, action: actionType } })
    }),
    sbRpc(ctx, 'grant_xp', { p_user_id: ref.referrer_id, p_amount: XP_REWARD, p_reason: 'referral_reward', p_ref_type: 'referral', p_ref_id: ref.id })
  ]);

  const codeRes = await fetch(`${ctx.sbUrl}/rest/v1/referral_codes?user_id=eq.${ref.referrer_id}&select=total_rewarded&limit=1`, { headers: sbHeaders(ctx.sbKey) });
  const codes = codeRes.ok ? await codeRes.json() : [];
  const rewarded = (codes[0]?.total_rewarded || 0) + 1;
  await fetch(`${ctx.sbUrl}/rest/v1/referral_codes?user_id=eq.${ref.referrer_id}`, {
    method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ total_rewarded: rewarded })
  }).catch(() => {});
  if (rewarded === 1) {
    await sbRpc(ctx, 'grant_badge', { p_user_id: ref.referrer_id, p_badge_slug: 'parrain_actif', p_granted_by: 'system' }).catch(() => {});
  }

  await fetch(`${ctx.sbUrl}/rest/v1/referrals?id=eq.${ref.id}`, {
    method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ status: 'rewarded', action_type: actionType, rewarded_at: new Date().toISOString(), points_granted: POINTS_REWARD, xp_granted: XP_REWARD })
  }).catch(() => {});

  await fetch(`${ctx.sbUrl}/rest/v1/reward_audit_logs`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({ user_id: ref.referrer_id, action: 'referral_reward', points_delta: POINTS_REWARD, xp_delta: XP_REWARD, ref_type: 'referral', ref_id: ref.id })
  }).catch(() => {});
}

module.exports = {
  sbRpc,
  getPointsBalance,
  getUserXP,
  computeLevel,
  generateReferralCode,
  growthDashboard,
  referralGet,
  referralUse,
  badgesList,
  badgesGrant,
  xpHistory,
  pointsHistory,
  adminGrowth,
  badgeCampaigns,
  badgeCampaignSave,
  badgeCampaignToggle,
  badgeBenefitStatus,
  rewardReferralIfPending,
};
