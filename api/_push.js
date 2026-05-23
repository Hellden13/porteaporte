// api/_push.js — Push notifications PorteaPorte
'use strict';

const { sbHeaders } = require('./_lib');

async function pushSubscribe(req, res, ctx, body) {
  const { subscription } = body;
  const userId = ctx.session.id;
  if (req.method === 'DELETE') {
    const ep = body.endpoint;
    if (!ep) return res.status(400).json({ error: 'endpoint requis' });
    await fetch(`${ctx.sbUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
      method: 'DELETE', headers: sbHeaders(ctx.sbKey)
    });
    return res.status(200).json({ ok: true });
  }
  if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription requise' });
  const r = await fetch(`${ctx.sbUrl}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: { ...sbHeaders(ctx.sbKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id:    userId,
      endpoint:   subscription.endpoint,
      p256dh:     subscription.keys?.p256dh,
      auth:       subscription.keys?.auth,
      created_at: new Date().toISOString()
    })
  });
  return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
}

async function deliverPush(ctx, body) {
  const webpush = require('web-push');
  const vapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!vapidPublic || !vapidPrivate) {
    return { ok: false, status: 503, error: 'VAPID non configure', sent: 0, failed: 0 };
  }

  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:bonjour@porteaporte.site',
    vapidPublic,
    vapidPrivate
  );

  const TEMPLATES = {
    nouvelle_mission: d => ({ title: '📦 Nouvelle mission !', body: `${d.ville_depart} → ${d.ville_arrivee} · ${d.prix_total} $`, tag: 'mission-' + d.id, data: { url: '/browse-missions.html' } }),
    mission_assignee: d => ({ title: '✅ Mission confirmée !', body: `Livraison ${d.code}`, tag: 'assigned-' + d.id, data: { url: '/map.html?id=' + d.id } }),
    kyc_approuve:     () => ({ title: '🎉 Vérification approuvée !', body: 'Tu peux maintenant accepter des livraisons.', tag: 'kyc-ok', data: { url: '/dashboard-livreur.html' } }),
    kyc_rejete:       d  => ({ title: '⚠️ Dossier KYC refusé', body: d.raison || 'Consulte ta messagerie.', tag: 'kyc-ko', data: { url: '/kyc.html' } }),
    message_recu:     d  => ({ title: '💬 Nouveau message', body: (d.expediteur || 'Client') + ' : ' + (d.apercu || ''), tag: 'msg-' + d.conv_id, data: { url: '/messagerie.html?conv=' + d.conv_id } }),
    paiement_libere:  d  => ({ title: '💰 Paiement libéré !', body: `${d.montant} $ déposés sur ton compte.`, tag: 'pay-' + d.livraison_id, data: { url: '/dashboard-livreur.html' } })
  };

  const { type, data = {}, userIds = null } = body;
  if (!type || !TEMPLATES[type]) return { ok: false, status: 400, error: 'type invalide', sent: 0, failed: 0 };
  const payload = TEMPLATES[type](data);

  let targetUserIds = Array.isArray(userIds) ? userIds : null;
  if (!targetUserIds && type === 'nouvelle_mission') {
    const driversRes = await fetch(
      `${ctx.sbUrl}/rest/v1/profiles?select=id&role=in.(livreur,les%20deux)&suspendu=eq.false&driver_status=eq.verified&disponible=eq.true&limit=500`,
      { headers: sbHeaders(ctx.sbKey) }
    );
    const drivers = driversRes.ok ? await driversRes.json() : [];
    targetUserIds = drivers.map((driver) => driver.id).filter(Boolean);
    if (!targetUserIds.length) return { ok: true, sent: 0, failed: 0, targeted: 0 };
  }

  let url = `${ctx.sbUrl}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`;
  if (targetUserIds?.length) url += `&user_id=in.(${targetUserIds.join(',')})`;
  const r   = await fetch(url, { headers: sbHeaders(ctx.sbKey) });
  const subs = r.ok ? await r.json() : [];
  if (!subs.length) return { ok: true, sent: 0, failed: 0, targeted: targetUserIds?.length || null };

  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(payload)
    ).catch(async err => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await fetch(`${ctx.sbUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
          method: 'DELETE', headers: sbHeaders(ctx.sbKey)
        });
      }
      throw err;
    }))
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return { ok: true, sent, failed: results.length - sent, targeted: targetUserIds?.length || null };
}

async function pushSend(req, res, ctx, body) {
  if (!ctx.internal && !['admin', 'expediteur'].includes(ctx.profile?.role)) {
    return res.status(403).json({ error: 'Non autorise' });
  }

  const result = await deliverPush(ctx, body);
  return res.status(result.status || (result.ok ? 200 : 400)).json(result);
}

module.exports = { pushSubscribe, deliverPush, pushSend };
