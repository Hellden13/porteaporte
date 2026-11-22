// js/ride-delete.js — Bouton « Supprimer » d'un trajet (conducteur et admin), lot 1.
// Confirmation dans une fenêtre de la page (pas de window.confirm). Le serveur décide (endpoint ride-delete) :
// propriétaire ou admin seulement, refus si une réservation est payée ou en cours, suppression logique.
(function () {
  'use strict';

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function jeton() {
    try {
      const u = window.AUTH_API?.getUser?.();
      if (u?.session?.access_token) return u.session.access_token;
    } catch (_) {}
    try {
      const db = window.db || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
      const { data } = await db.auth.getSession();
      return data?.session?.access_token || null;
    } catch (_) {
      return null;
    }
  }

  function fenetre(libelle) {
    const ancien = document.getElementById('pap-ride-delete');
    if (ancien) ancien.remove();
    const fond = document.createElement('div');
    fond.id = 'pap-ride-delete';
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.setAttribute('aria-labelledby', 'pap-ride-delete-titre');
    fond.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px';
    fond.innerHTML =
      '<div style="background:#0f1520;border:1px solid rgba(255,90,90,.45);border-radius:14px;padding:22px;max-width:420px;width:100%;color:#fff;font-family:inherit">' +
        '<h2 id="pap-ride-delete-titre" style="margin:0 0 10px;font-size:1.15rem">🗑️ Supprimer ce trajet ?</h2>' +
        '<p style="margin:0 0 6px;color:#d8dde6"><strong>' + esc(libelle) + '</strong></p>' +
        '<p style="margin:0 0 14px;color:#A8B0BA;font-size:.88rem">Le trajet disparaîtra de la recherche et de « Mes trajets ». ' +
        'S\'il a une réservation payée ou en cours, il faut l\'annuler à la place.</p>' +
        '<div data-role="message" role="status" style="display:none;margin:0 0 12px;padding:10px 12px;border-radius:8px;font-size:.88rem"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">' +
          '<button type="button" data-role="annuler" style="background:transparent;color:#d8dde6;border:1px solid #3a4558;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer">Garder le trajet</button>' +
          '<button type="button" data-role="confirmer" style="background:#ff5a5a;color:#fff;border:0;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer">Supprimer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(fond);
    return fond;
  }

  // Ouvre la fenêtre ; résout true si le trajet a été supprimé, false sinon.
  function ouvrir(rideId, libelle, options) {
    const opts = options || {};
    return new Promise((resolve) => {
      const fond = fenetre(libelle || 'Trajet');
      const msg = fond.querySelector('[data-role="message"]');
      const btnOk = fond.querySelector('[data-role="confirmer"]');
      const btnNon = fond.querySelector('[data-role="annuler"]');
      let fini = false;
      const fermer = (val) => {
        if (fini) return;
        fini = true;
        document.removeEventListener('keydown', surTouche);
        fond.remove();
        resolve(val);
      };
      const surTouche = (e) => { if (e.key === 'Escape') fermer(false); };
      document.addEventListener('keydown', surTouche);
      fond.addEventListener('click', (e) => { if (e.target === fond) fermer(false); });
      btnNon.addEventListener('click', () => fermer(false));
      const afficher = (texte, ok) => {
        msg.style.display = 'block';
        msg.style.background = ok ? 'rgba(93,191,255,.12)' : 'rgba(255,90,90,.12)';
        msg.style.color = ok ? '#7dffc1' : '#ff9999';
        msg.textContent = texte;
      };
      btnOk.addEventListener('click', async () => {
        btnOk.disabled = true;
        btnOk.textContent = 'Suppression…';
        try {
          const token = await jeton();
          if (!token) throw new Error('Connexion requise');
          const res = await fetch('/api/platform?endpoint=ride-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ endpoint: 'ride-delete', ride_id: rideId }),
          });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) {
            afficher(out.error || ('Suppression impossible (erreur ' + res.status + ')'), false);
            btnOk.style.display = 'none';
            btnNon.textContent = 'Fermer';
            return;
          }
          afficher('✅ Trajet supprimé.', true);
          if (typeof opts.onDone === 'function') { try { await opts.onDone(); } catch (_) {} }
          setTimeout(() => fermer(true), 700);
        } catch (e) {
          afficher(e.message || 'Erreur réseau. Réessaie dans un instant.', false);
          btnOk.disabled = false;
          btnOk.textContent = 'Supprimer';
        }
      });
      btnNon.focus();
    });
  }

  window.PAPRideDelete = { ouvrir };
})();
