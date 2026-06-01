/**
 * PorteàPorte — Bannière paiement en attente GLOBALE
 *
 * S'affiche sur n'importe quel dashboard si l'user a une réservation en attente
 * de paiement. Évite que la réservation soit perdue parce qu'elle est sur le mauvais dashboard.
 *
 * Inclusion : <script src="/js/pending-payment-banner.js" defer></script>
 */
(function () {
  if (window.__papPendingPayment) return;
  window.__papPendingPayment = true;

  async function check() {
    try {
      const db = window.db || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
      if (!db) return;
      const { data: { session } } = await db.auth.getSession();
      if (!session) return;

      // Cherche les bookings en attente de paiement de l'user
      const { data: pending, error } = await db
        .from('ride_bookings')
        .select('id,ride_id,total_passenger,pickup_city,dropoff_city,created_at,status')
        .eq('passenger_id', session.user.id)
        .in('status', ['en_attente', 'pending', 'unpaid'])
        .order('created_at', { ascending: false });

      if (error || !pending?.length) return;

      const first = pending[0];
      const totalAmount = pending.reduce((s, b) => s + Number(b.total_passenger || 0), 0);

      // Construit la bannière
      const banner = document.createElement('div');
      banner.id = 'pap-pending-payment-banner';
      banner.style.cssText = `
        position: sticky; top: 0; z-index: 99988;
        background: linear-gradient(135deg, rgba(255,200,0,.15), rgba(255,160,0,.1));
        border-bottom: 2px solid rgba(255,200,0,.6);
        color: #fff; padding: 12px 20px;
        display: flex; align-items: center; justify-content: space-between;
        gap: 14px; flex-wrap: wrap;
        backdrop-filter: blur(12px);
        animation: papPulseGlow 2.5s ease-in-out infinite;
      `;
      if (!document.getElementById('pap-pending-css')) {
        const s = document.createElement('style');
        s.id = 'pap-pending-css';
        s.textContent = `
          @keyframes papPulseGlow {
            0%,100% { box-shadow: 0 0 0 rgba(255,200,0,0); }
            50% { box-shadow: 0 4px 24px rgba(255,200,0,0.3); }
          }
        `;
        document.head.appendChild(s);
      }
      banner.innerHTML = `
        <div style="flex:1;min-width:200px">
          <strong style="color:#ffd700;font-size:1rem">⚠️ ${pending.length} réservation${pending.length>1?'s':''} en attente de paiement (${totalAmount.toFixed(2)} $)</strong>
          <div style="color:rgba(255,255,255,0.85);font-size:.82rem;margin-top:3px">
            Ta place sera libérée si tu ne paies pas — ${first.pickup_city||'?'} → ${first.dropoff_city||'?'}
          </div>
        </div>
        <a href="/covoiturage-trajet.html?ride_id=${encodeURIComponent(first.ride_id)}&booking_id=${encodeURIComponent(first.id)}"
           style="padding:10px 20px;background:linear-gradient(135deg,#5dbfff,#3da9ff);color:#051022;border-radius:8px;font-weight:900;text-decoration:none;box-shadow:0 6px 16px rgba(93,191,255,.5);white-space:nowrap">
          💳 Payer maintenant
        </a>
        <button onclick="this.parentElement.style.display='none'" style="background:transparent;border:none;color:rgba(255,255,255,0.6);cursor:pointer;font-size:1.2rem;padding:4px 8px" title="Masquer">✕</button>
      `;

      // Insère en tout début du body (au-dessus du contenu)
      if (document.body.firstChild) {
        document.body.insertBefore(banner, document.body.firstChild);
      } else {
        document.body.appendChild(banner);
      }
    } catch (e) {
      console.warn('[pending-payment] erreur:', e.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
})();
