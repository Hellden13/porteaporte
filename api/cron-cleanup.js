// api/cron-cleanup.js — Nettoyage périodique des tables temporaires
// Appelé par Vercel Cron (voir vercel.json) — toutes les heures
'use strict';

const { sanitizeEnv, sbHeaders, alertAdmin } = require('../lib/_lib');

module.exports = async function handler(req, res) {
  // Sécurité : seulement Vercel Cron ou secret interne
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const sbUrl = sanitizeEnv(process.env.SUPABASE_URL);
  const sbKey = sanitizeEnv(process.env.SUPABASE_SERVICE_KEY);
  if (!sbUrl || !sbKey) return res.status(503).json({ error: 'Config manquante' });

  const results = {};

  // 1. Nettoyer rate_limits expirés (> 1h)
  try {
    const r = await fetch(`${sbUrl}/rest/v1/rpc/cleanup_rate_limits`, {
      method: 'POST',
      headers: { ...sbHeaders(sbKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    results.rate_limits = r.ok ? 'ok' : `erreur ${r.status}`;
  } catch (e) {
    results.rate_limits = 'exception: ' + e.message;
  }

  // 2. Nettoyer les sessions GPS > 48h (gps_updates orphelins)
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const r = await fetch(
      `${sbUrl}/rest/v1/gps_updates?created_at=lt.${cutoff}`,
      { method: 'DELETE', headers: sbHeaders(sbKey) }
    );
    results.gps_updates = r.ok ? 'ok' : `erreur ${r.status}`;
  } catch (e) {
    results.gps_updates = 'exception: ' + e.message;
  }

  // 3. Auto-cancel XL livraisons : demande > 15 min sans réponse
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const r = await fetch(
      `${sbUrl}/rest/v1/livraisons?xl_confirmation_demande_at=lt.${cutoff}&xl_confirmation_recue_at=is.null&taille_colis=eq.xl&statut=in.(confirme,en_route)&select=id,code,livreur_id,prix_total,expediteur_id`,
      { headers: sbHeaders(sbKey) }
    );
    const livs = r.ok ? await r.json() : [];
    let cancelled = 0;
    for (const liv of livs) {
      // Patch status retour expéditeur
      await fetch(`${sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(liv.id)}`, {
        method: 'PATCH',
        headers: sbHeaders(sbKey),
        body: JSON.stringify({
          statut: 'retour_expediteur',
          imprevu_raison: 'XL : destinataire n\'a pas confirmé sa présence dans les 15 min',
          imprevu_demande_le: new Date().toISOString()
        })
      });
      // Compensation livreur 30% (forfait XL imprévu)
      if (liv.livreur_id && Number(liv.prix_total) > 0) {
        const grossCad = Number(liv.prix_total) * 0.50;
        const netCad = grossCad * 0.60;
        await fetch(`${sbUrl}/rest/v1/livreur_earnings`, {
          method: 'POST',
          headers: { ...sbHeaders(sbKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            user_id: liv.livreur_id,
            livraison_id: liv.id,
            gross_amount: Number(grossCad.toFixed(2)),
            platform_fee: Number((grossCad - netCad).toFixed(2)),
            net_amount: Number(netCad.toFixed(2)),
            currency: 'cad',
            status: 'available',
            available_after: new Date().toISOString(),
            type: 'compensation_xl_timeout',
            notes: 'Compensation auto : XL timeout 15 min',
            created_at: new Date().toISOString()
          })
        }).catch(() => {});
      }
      cancelled++;
    }
    results.xl_auto_cancel = `${cancelled} livraisons annulées`;
  } catch (e) {
    results.xl_auto_cancel = 'exception: ' + e.message;
  }

  // ─── 4. RÉSUMÉ QUOTIDIEN ENVOYÉ À L'ADMIN ───
  try {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const since24h = yesterday.toISOString();
    const h = { ...sbHeaders(sbKey), Prefer: 'count=exact' };

    async function countSince(table, dateCol = 'created_at', extra = '') {
      try {
        const r = await fetch(`${sbUrl}/rest/v1/${table}?select=id&${dateCol}=gte.${since24h}${extra}`, { headers: h });
        const cr = r.headers.get('content-range') || '0-0/0';
        return Number(cr.split('/')[1]) || 0;
      } catch (_) { return 0; }
    }

    const [newLivraisons, newInscriptions, paidLivraisons, openManquements] = await Promise.all([
      countSince('livraisons', 'cree_le'),
      countSince('profiles', 'created_at'),
      countSince('livraisons', 'cree_le', '&statut=in.(payee,paid,livre,confirmee)'),
      countSince('manquements', 'created_at', '&statut=eq.signale')
    ]);

    // Revenu de la journée
    let revenueCad = 0;
    try {
      const r = await fetch(`${sbUrl}/rest/v1/livraisons?select=prix_total&statut=in.(payee,paid,livre,confirmee)&cree_le=gte.${since24h}`, { headers: sbHeaders(sbKey) });
      const livs = r.ok ? await r.json() : [];
      revenueCad = livs.reduce((s, l) => s + (Number(l.prix_total) || 0), 0);
    } catch (_) {}

    const founderShare = revenueCad * 0.05;
    const hasActivity = newLivraisons > 0 || newInscriptions > 0 || openManquements > 0;

    if (hasActivity || (new Date().getDay() === 1)) { // Activité OU lundi matin (récap silencieux)
      const severity = openManquements > 0 ? 'warning' : (paidLivraisons > 0 ? 'success' : 'info');
      alertAdmin(
        `Résumé quotidien — ${yesterday.toLocaleDateString('fr-CA')}`,
        `Voici ce qui s'est passé sur PorteàPorte depuis 24 heures.`,
        {
          severity,
          details: {
            '📦 Nouvelles livraisons': newLivraisons,
            '✅ Livraisons payées': paidLivraisons,
            '👤 Nouvelles inscriptions': newInscriptions,
            '⚠️ Manquements ouverts': openManquements,
            '💰 Revenu 24h': revenueCad.toFixed(2) + ' $',
            '👑 Ta part fondateur (5%)': founderShare.toFixed(2) + ' $'
          },
          cta_url: 'https://porteaporte.site/admin/operations.html',
          cta_label: '📊 Centre Opérations →'
        }
      );
      results.daily_summary = 'envoyé';
    } else {
      results.daily_summary = 'aucune activité — pas d\'email';
    }
  } catch (e) {
    results.daily_summary = 'exception: ' + e.message;
  }

  console.log('[cron-cleanup]', results);
  return res.status(200).json({ success: true, results, ts: new Date().toISOString() });
};
