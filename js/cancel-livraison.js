/**
 * PorteàPorte — Widget annulation livraison avec preview politique de remboursement
 *
 * Usage:
 *   PapCancel.openModal({
 *     livraisonId: 'uuid',
 *     accessToken: 'jwt-token',
 *     onSuccess: () => location.reload()
 *   });
 */
(function () {
  if (window.PapCancel) return;

  function injectCss() {
    if (document.getElementById('pap-cancel-css')) return;
    const s = document.createElement('style');
    s.id = 'pap-cancel-css';
    s.textContent = `
      .pc-overlay { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:99996; display:none; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(8px); }
      .pc-overlay.open { display:flex; }
      .pc-modal { background:#0a0f17; border:1px solid #1e2535; border-radius:18px; padding:28px; max-width:500px; width:100%; box-shadow:0 24px 80px rgba(0,0,0,.6); max-height:90vh; overflow-y:auto; }
      .pc-modal h2 { margin:0 0 8px; color:#fff; font-size:1.3rem; }
      .pc-modal .sub { color:#a8b0ba; font-size:.9rem; margin:0 0 20px; line-height:1.5; }
      .pc-status-card { padding:16px 18px; border-radius:12px; margin-bottom:18px; border:1px solid; }
      .pc-status-card.full { background:rgba(93,191,255,.08); border-color:rgba(93,191,255,.35); color:#7dffc1; }
      .pc-status-card.partial { background:rgba(255,200,0,.08); border-color:rgba(255,200,0,.35); color:#ffd700; }
      .pc-status-card.none { background:rgba(255,90,90,.08); border-color:rgba(255,90,90,.35); color:#ff9999; }
      .pc-status-card strong { display:block; font-size:1.1rem; margin-bottom:6px; }
      .pc-status-card .reason { font-size:.85rem; line-height:1.5; opacity:.9; }
      .pc-breakdown { background:rgba(255,255,255,.03); border:1px solid #1e2535; border-radius:10px; padding:12px 16px; margin-bottom:18px; font-size:.88rem; }
      .pc-breakdown .row { display:flex; justify-content:space-between; padding:6px 0; }
      .pc-breakdown .row:not(:last-child) { border-bottom:1px solid rgba(255,255,255,.05); }
      .pc-breakdown .lbl { color:#a8b0ba; }
      .pc-breakdown .val { color:#fff; font-weight:700; font-variant-numeric:tabular-nums; }
      .pc-breakdown .val.refund { color:#7dffc1; }
      .pc-breakdown .val.compensation { color:#ffd700; }
      .pc-modal textarea { width:100%; box-sizing:border-box; padding:12px 14px; background:#05080c; border:1px solid #1e2535; border-radius:10px; color:#fff; font:inherit; min-height:70px; resize:vertical; margin-bottom:18px; }
      .pc-actions { display:flex; gap:10px; }
      .pc-actions button { flex:1; padding:14px 18px; border:none; border-radius:10px; font-weight:900; cursor:pointer; font-size:.92rem; }
      .pc-confirm { background:#ff7a7a; color:#fff; }
      .pc-confirm:disabled { opacity:.5; cursor:not-allowed; }
      .pc-confirm:hover:not(:disabled) { background:#ff5a5a; }
      .pc-cancel-btn { background:rgba(255,255,255,.05); color:#a8b0ba; border:1px solid #1e2535; }
      .pc-msg { padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:.88rem; display:none; }
      .pc-msg.err { display:block; background:rgba(255,90,90,.1); color:#ff9999; border:1px solid rgba(255,90,90,.3); }
      .pc-loading { text-align:center; padding:30px; color:#a8b0ba; }
    `;
    document.head.appendChild(s);
  }
  injectCss();

  function fmt(cents) { return ((cents || 0) / 100).toLocaleString('fr-CA', { style:'currency', currency:'CAD' }); }
  function pct(n) { return Math.round(n) + ' %'; }

  let ctx = null;

  function buildModal() {
    const modalHtml = `
      <div class="pc-modal">
        <h2>❌ Annuler ma livraison</h2>
        <p class="sub">Vérifie la politique de remboursement applicable selon l'état actuel de ta livraison.</p>
        <div id="pc-content" class="pc-loading">Chargement de la politique...</div>
      </div>
    `;
    let o = document.getElementById('pc-overlay');
    if (o) {
      // Overlay existe déjà : on ré-injecte le contenu frais (sinon on garde le message d'annulation précédente)
      o.innerHTML = modalHtml;
      return;
    }
    o = document.createElement('div');
    o.id = 'pc-overlay';
    o.className = 'pc-overlay';
    o.innerHTML = modalHtml;
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o) closeModal(); });
  }

  async function loadPolicy() {
    try {
      const r = await fetch('/api/platform?endpoint=cancel-policy-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ctx.accessToken },
        body: JSON.stringify({ endpoint: 'cancel-policy-preview', livraison_id: ctx.livraisonId })
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Politique introuvable');
      renderPolicy(out);
    } catch (e) {
      document.getElementById('pc-content').innerHTML = `<div class="pc-msg err">❌ ${e.message}</div><div class="pc-actions"><button class="pc-cancel-btn" onclick="PapCancel.closeModal()">Fermer</button></div>`;
      document.getElementById('pc-content').className = '';
    }
  }

  function renderPolicy(data) {
    const p = data.policy;
    const cssClass = p.refund_pct === 100 ? 'full' : p.refund_pct > 0 ? 'partial' : 'none';
    const icon = p.refund_pct === 100 ? '✅' : p.refund_pct > 0 ? '⚠️' : '❌';
    const title = p.refund_pct === 100 ? 'Remboursement TOTAL' : p.refund_pct > 0 ? `Remboursement PARTIEL (${pct(p.refund_pct)})` : 'Annulation impossible';

    let html = `
      <div class="pc-status-card ${cssClass}">
        <strong>${icon} ${title}</strong>
        <div class="reason">${p.reason}</div>
      </div>
    `;

    if (data.prix_total_cents > 0) {
      html += `<div class="pc-breakdown">
        <div class="row"><span class="lbl">Prix payé</span><span class="val">${fmt(data.prix_total_cents)}</span></div>
        <div class="row"><span class="lbl">Remboursement à toi</span><span class="val refund">${fmt(data.refund_cents)} (${pct(p.refund_pct)})</span></div>
        ${data.livreur_compensation_cents > 0 ? `<div class="row"><span class="lbl">Compensation livreur</span><span class="val compensation">${fmt(data.livreur_compensation_cents)} (${pct(p.livreur_compensation_pct)})</span></div>` : ''}
      </div>`;
    }

    if (p.allowed) {
      html += `
        <label style="display:block;color:#d8dde6;font-weight:700;font-size:.88rem;margin-bottom:6px">Raison de l'annulation (optionnelle)</label>
        <textarea id="pc-reason" placeholder="Ex: changement d'adresse, plus besoin, erreur de saisie..."></textarea>
        <div id="pc-msg" class="pc-msg"></div>
        <div class="pc-actions">
          <button class="pc-cancel-btn" onclick="PapCancel.closeModal()">Garder ma livraison</button>
          <button class="pc-confirm" id="pc-confirm-btn" onclick="PapCancel._confirm()">${p.refund_pct === 100 ? '❌ Annuler et rembourser' : '❌ Confirmer l\'annulation'}</button>
        </div>
      `;
    } else {
      html += `
        <div class="pc-actions">
          <button class="pc-cancel-btn" onclick="PapCancel.closeModal()" style="flex:1">Fermer</button>
          ${data.statut && ['livre','livree','payee','paid','confirmee'].includes(data.statut) ? `<a class="pc-confirm" href="/dashboard-expediteur.html?tab=manquements" style="text-decoration:none;text-align:center;flex:1;display:inline-flex;align-items:center;justify-content:center">⚠️ Signaler un manquement</a>` : ''}
        </div>
      `;
    }
    document.getElementById('pc-content').innerHTML = html;
    document.getElementById('pc-content').className = '';
  }

  async function _confirm() {
    if (!ctx) return;
    const btn = document.getElementById('pc-confirm-btn');
    const msg = document.getElementById('pc-msg');
    const reason = document.getElementById('pc-reason')?.value?.trim() || '';
    if (!confirm('Es-tu CERTAIN(E) de vouloir annuler ?\nCette action est irréversible.')) return;
    btn.disabled = true;
    btn.textContent = 'Annulation en cours...';
    msg.className = 'pc-msg';
    try {
      const r = await fetch('/api/cancel-livraison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ctx.accessToken },
        body: JSON.stringify({ livraison_id: ctx.livraisonId, raison: reason })
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Annulation impossible');
      document.querySelector('.pc-modal').innerHTML = `
        <div style="text-align:center;padding:30px 10px">
          <div style="font-size:3rem;line-height:1;margin-bottom:14px">✅</div>
          <h2 style="margin:0 0 8px;color:#fff">Livraison annulée</h2>
          <p style="color:#a8b0ba;margin:0 0 8px;line-height:1.6">${out.refund_cents > 0 ? `Remboursement de <strong style="color:#7dffc1">${fmt(out.refund_cents)}</strong> traité par Stripe. Tu vas le voir sur ta carte d'ici 5-10 jours ouvrés.` : 'Livraison marquée comme annulée.'}</p>
          ${out.livreur_compensation_cents > 0 ? `<p style="color:#ffd700;font-size:.85rem;margin:8px 0 0">Une compensation de ${fmt(out.livreur_compensation_cents)} a été versée au livreur (${out.policy_reason}).</p>` : ''}
        </div>
      `;
      setTimeout(() => { closeModal(); if (typeof ctx?.onSuccess === 'function') ctx.onSuccess(out); }, 3500);
    } catch (e) {
      msg.className = 'pc-msg err';
      msg.textContent = '❌ ' + e.message;
      btn.disabled = false;
      btn.textContent = '❌ Confirmer l\'annulation';
    }
  }

  function openModal(opts) {
    if (!opts?.livraisonId || !opts?.accessToken) {
      console.error('[PapCancel] livraisonId + accessToken requis');
      return;
    }
    ctx = opts;
    buildModal();
    document.getElementById('pc-content').className = 'pc-loading';
    document.getElementById('pc-content').textContent = 'Chargement de la politique...';
    document.getElementById('pc-overlay').classList.add('open');
    loadPolicy();
  }

  function closeModal() {
    const o = document.getElementById('pc-overlay');
    if (o) {
      o.classList.remove('open');
      // Supprime du DOM pour garantir un état frais à la prochaine ouverture
      setTimeout(() => { try { o.remove(); } catch (_) {} }, 200);
    }
    ctx = null;
  }

  window.PapCancel = { openModal, closeModal, _confirm };
})();
