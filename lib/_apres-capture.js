// lib/_apres-capture.js — Ce qui suit TOUTE capture d'un paiement de livraison
// (api/capture-livraison.js après le code de réception, et api/platform.js après une preuve de dépôt).
//  1. Répartition réelle (js/repartition.js) : livreur 60 % du prix avant rabais + fidélité recalculée
//     + sauvetage ; frais Stripe réels ; postes de la plateforme. Écrite au journal une seule fois.
//  2. Gain du livreur (livreur_earnings) et virement Stripe Connect du montant exact de sa part.
'use strict';

const { calculerBonusFidelite } = require('./_fidelite');
const { fraisStripeReels, lireReglements, enregistrerRepartition, repartitionLivraison } = require('./_repartition-journal');

async function apresCaptureLivraison(ctx, livraison, captured) {
  const livraison_id = livraison.id;
  // Répartition réelle de ce paiement (js/repartition.js) : livreur 60 % du prix AVANT rabais
  // (+ fidélité recalculée maintenant, + sauvetage), frais Stripe réels, puis les postes de la plateforme.
  // Écrite au journal une seule fois ; c'est ce que la page Transparence additionne.
  let repartition = null;
  if (captured.amount_received > 0) {
    let rabaisCents = 0;
    try {
      const pr = await fetch(`${ctx.sbUrl}/rest/v1/promo_code_uses?livraison_id=eq.${encodeURIComponent(livraison_id)}&select=discount_applied&limit=5`, {
        headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}` }
      });
      const rows = pr.ok ? await pr.json() : [];
      rabaisCents = Math.round((Array.isArray(rows) ? rows : []).reduce((t, r) => t + (Number(r.discount_applied) || 0), 0) * 100);
    } catch (_) {}
    let loyaltyBonus = 0;
    if (livraison.livreur_id) {
      try {
        const pr = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(livraison.livreur_id)}&select=id,cree_le,loyalty_bonus_manual`, {
          headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}` }
        });
        const prof = pr.ok ? (await pr.json())[0] : null;
        if (prof) loyaltyBonus = (await calculerBonusFidelite(ctx, prof, { enregistrer: true })).bonus;
      } catch (_) {}
    }
    const chargeIdFrais = captured.latest_charge || captured.charges?.data?.[0]?.id;
    const fraisReels = await fraisStripeReels(ctx.stripeKey, chargeIdFrais);
    const reglages = await lireReglements(ctx);
    const rescuePctRep = livraison.rescue_livreur_original ? (Number(livraison.rescue_bonus_pct) || 20) : 0;
    repartition = repartitionLivraison({
      montantPayeCents: captured.amount_received,
      rabaisCents,
      settings: reglages.platform,
      fidelitePct: livraison.livreur_id ? loyaltyBonus : 0,
      sauvetagePct: rescuePctRep,
      fraisStripeCents: fraisReels,
      planProtection: livraison.assurance_plan,
    });
    if (!livraison.livreur_id) {
      // Pas de livreur (cas exceptionnel) : sa part reste à la plateforme, rien n'est versé.
      repartition = repartitionLivraison({ montantPayeCents: captured.amount_received, rabaisCents: 0, settings: reglages.platform, fraisStripeCents: fraisReels, planProtection: livraison.assurance_plan });
    }
    const j = await enregistrerRepartition(ctx, {
      sorte: 'livraison', refId: livraison_id, livraisonId: livraison_id, userId: livraison.expediteur_id,
      paymentIntent: captured.id, repartition,
    });
    if (!j.ok) console.error('[après-capture] répartition non écrite au journal :', j.raison);
  }

  // Créditer les gains du livreur : la part calculée ci-dessus (60 % + fidélité + sauvetage).
  // + TRANSFER STRIPE INSTANTANÉ avec source_transaction (contourne l'attente settlement)
  if (livraison.livreur_id && captured.amount_received > 0 && repartition) {
    const grossCents = captured.amount_received;
    const loyaltyBonus = repartition.livreurPct - 60;
    const rescuePct = livraison.rescue_livreur_original ? (Number(livraison.rescue_bonus_pct) || 20) : 0;
    const basePct = repartition.livreurPct;
    const netCents = Math.min(grossCents, repartition.livreurCents);
    const feeCents = grossCents - netCents;

    // ─── TRANSFER STRIPE AUTO avec source_transaction ───
    // Au lieu d'attendre la settlement (2j), on dit à Stripe "transfère depuis cette charge spécifique"
    // -> fonds disponibles immédiatement sur le compte Connect du livreur
    let earningStatus = 'available';
    let stripeTransferId = null;
    let transferError = null;
    try {
      const livAcctRes = await fetch(`${ctx.sbUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${encodeURIComponent(livraison.livreur_id)}&select=stripe_account_id,payouts_enabled,status&limit=1`, {
        headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}` }
      });
      const acctRows = livAcctRes.ok ? await livAcctRes.json() : [];
      const livAcct = acctRows[0];
      const chargeId = captured.latest_charge || captured.charges?.data?.[0]?.id;

      if (livAcct?.stripe_account_id && livAcct.status === 'active' && chargeId && ctx.stripeKey) {
        const transferParams = new URLSearchParams({
          amount: String(netCents),
          currency: captured.currency || 'cad',
          destination: livAcct.stripe_account_id,
          source_transaction: chargeId, // CLEF : permet transfer même si pas encore settled
          description: `PorteàPorte livraison ${livraison.code || String(livraison_id).slice(0,8)}`,
          'metadata[livraison_id]': livraison_id,
          'metadata[livreur_id]': livraison.livreur_id,
          'metadata[payment_intent]': captured.id
        });
        const transferResp = await fetch('https://api.stripe.com/v1/transfers', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + ctx.stripeKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': `transfer-${livraison_id}-${netCents}`
          },
          body: transferParams.toString()
        });
        const transferData = await transferResp.json();
        if (transferResp.ok) {
          earningStatus = 'transferred';
          stripeTransferId = transferData.id;
          console.log('[après-capture] ✓ Transfer Stripe automatique vers livreur OK:', transferData.id);
        } else {
          transferError = transferData.error?.message || 'Transfer failed';
          console.error('[après-capture] ⚠️ Transfer Stripe a échoué (earning marqué available pour payout manuel):', transferError);
        }
      } else {
        console.log('[après-capture] Pas de transfer auto (compte Connect inactif ou pas de charge)', {
          hasAcct: !!livAcct?.stripe_account_id, status: livAcct?.status, hasCharge: !!chargeId
        });
      }
    } catch (e) {
      console.error('[après-capture] Erreur transfer auto:', e.message);
      transferError = e.message;
    }

    await fetch(`${ctx.sbUrl}/rest/v1/livreur_earnings`, {
      method: 'POST',
      headers: { apikey: ctx.sbKey, Authorization: `Bearer ${ctx.sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id:               livraison.livreur_id,
        livraison_id,
        gross_amount:          grossCents / 100,
        platform_fee:          feeCents   / 100,
        net_amount:            netCents   / 100,
        currency:              captured.currency || 'cad',
        status:                earningStatus,
        available_after:       new Date().toISOString(),
        stripe_payment_intent: captured.id,
        stripe_transfer_id:    stripeTransferId,
        type:                  rescuePct > 0 ? 'rescue_bonus' : (loyaltyBonus > 0 ? 'loyalty_bonus' : 'livraison'),
        notes:                 [
          rescuePct > 0 ? `Rescue +${rescuePct}%` : null,
          loyaltyBonus > 0 ? `Fidélité +${loyaltyBonus}% (part ${basePct}%)` : null,
          stripeTransferId ? `Auto-transfer Stripe ${stripeTransferId}` : null,
          transferError ? `Auto-transfer FAILED: ${transferError} (payout manuel possible)` : null
        ].filter(Boolean).join(' · ') || null,
        created_at:            new Date().toISOString()
      })
    }).catch(e => console.error('[livreur_earnings insert]', e.message));
  }

  return { repartition, netCents: repartition && livraison.livreur_id ? Math.min(captured.amount_received, repartition.livreurCents) : 0 };
}

module.exports = { apresCaptureLivraison };
