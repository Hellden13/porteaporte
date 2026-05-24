/**
 * PorteàPorte — Système de notation 5 étoiles
 *
 * Usage 1 : Afficher la note d'un livreur
 *   <div data-livreur-rating="UUID-DU-LIVREUR"></div>
 *   (auto-rendu au chargement)
 *
 * Usage 2 : Ouvrir le modal de notation après livraison
 *   window.PapRating.openModal({
 *     livraisonId: 'uuid',
 *     livreurId: 'uuid',
 *     livreurName: 'Jean',
 *     accessToken: 'jwt-token'
 *   })
 */
(function () {
  if (window.PapRating) return;

  // ───────── CSS ─────────
  function injectCss() {
    if (document.getElementById('pap-rating-css')) return;
    const s = document.createElement('style');
    s.id = 'pap-rating-css';
    s.textContent = `
      .pap-stars { display:inline-flex; gap:2px; align-items:center; font-size:1rem; line-height:1; }
      .pap-star { color:#3a4350; transition:color .15s; user-select:none; }
      .pap-star.on { color:#ffd700; text-shadow:0 0 4px rgba(255,215,0,.4); }
      .pap-stars.lg .pap-star { font-size:2.4rem; cursor:pointer; }
      .pap-stars.lg .pap-star:hover, .pap-stars.lg .pap-star:hover ~ .pap-star { color:#3a4350; }
      .pap-stars.lg:hover .pap-star { color:#ffd700; }
      .pap-rating-card { display:inline-flex; gap:10px; align-items:center; padding:6px 12px; background:rgba(255,215,0,.08); border:1px solid rgba(255,215,0,.3); border-radius:99px; font-size:.85rem; color:#ffd700; font-weight:700; }
      .pap-rating-card .num { font-variant-numeric:tabular-nums; font-weight:900; }
      .pap-rating-card .count { color:#a8b0ba; font-weight:500; font-size:.78rem; }

      .pap-rating-overlay { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:99997; display:none; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(8px); }
      .pap-rating-overlay.open { display:flex; }
      .pap-rating-modal { background:#0a0f17; border:1px solid #1e2535; border-radius:18px; padding:32px 28px; max-width:480px; width:100%; box-shadow:0 24px 80px rgba(0,0,0,.6); }
      .pap-rating-modal h2 { margin:0 0 8px; color:#fff; font-size:1.4rem; font-weight:900; text-align:center; }
      .pap-rating-modal .sub { color:#a8b0ba; font-size:.92rem; text-align:center; margin:0 0 24px; line-height:1.5; }
      .pap-rating-modal .stars-wrap { text-align:center; margin:0 0 20px; }
      .pap-rating-modal textarea { width:100%; box-sizing:border-box; padding:12px 14px; background:#05080c; border:1px solid #1e2535; border-radius:10px; color:#fff; font:inherit; min-height:80px; resize:vertical; margin-bottom:18px; }
      .pap-rating-modal .actions { display:flex; gap:10px; }
      .pap-rating-modal button { flex:1; padding:14px 20px; border:none; border-radius:10px; font-weight:900; cursor:pointer; font-size:.92rem; }
      .pap-rating-modal .submit { background:#b8f53e; color:#071006; }
      .pap-rating-modal .submit:disabled { opacity:.5; cursor:not-allowed; }
      .pap-rating-modal .cancel { background:rgba(255,255,255,.05); color:#a8b0ba; border:1px solid #1e2535; }
      .pap-rating-msg { padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:.88rem; display:none; }
      .pap-rating-msg.ok { display:block; background:rgba(0,255,159,.1); color:#7dffc1; border:1px solid rgba(0,255,159,.3); }
      .pap-rating-msg.err { display:block; background:rgba(255,90,90,.1); color:#ff9999; border:1px solid rgba(255,90,90,.3); }
      .pap-thanks { text-align:center; padding:20px 0; color:#7dffc1; font-weight:700; font-size:1rem; }
      .pap-thanks .big { font-size:3rem; line-height:1; margin-bottom:10px; }
    `;
    document.head.appendChild(s);
  }
  injectCss();

  // ───────── Render stars (display only) ─────────
  function renderStars(rating, max = 5) {
    let html = '<span class="pap-stars">';
    for (let i = 1; i <= max; i++) {
      html += `<span class="pap-star${i <= Math.round(rating) ? ' on' : ''}">★</span>`;
    }
    html += '</span>';
    return html;
  }

  // ───────── Auto-fetch + render livreur rating badge ─────────
  async function renderRatingBadge(el) {
    const livreurId = el.dataset.livreurRating;
    if (!livreurId) return;
    el.innerHTML = '<span class="pap-rating-card"><span class="num">—</span><span>★</span></span>';
    try {
      const r = await fetch('/api/platform?endpoint=livreur-ratings-get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'livreur-ratings-get', livreur_id: livreurId })
      });
      const out = await r.json();
      if (!out.success) throw new Error();
      if (out.count === 0) {
        el.innerHTML = '<span class="pap-rating-card" style="background:rgba(255,255,255,.04);color:#a8b0ba;border-color:#1e2535"><span>★</span><span class="count">Nouveau livreur</span></span>';
        return;
      }
      el.innerHTML = `<span class="pap-rating-card">
        ${renderStars(out.average)}
        <span class="num">${out.average.toFixed(1)}</span>
        <span class="count">(${out.count} avis)</span>
      </span>`;
    } catch (_) {
      el.innerHTML = '';
    }
  }

  // ───────── Modal de notation ─────────
  let currentSelected = 0;
  function buildModal() {
    if (document.getElementById('pap-rating-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pap-rating-overlay';
    overlay.className = 'pap-rating-overlay';
    overlay.innerHTML = `
      <div class="pap-rating-modal">
        <h2 id="pap-rating-title">Évalue ta livraison</h2>
        <p class="sub" id="pap-rating-sub">Comment s'est passée la livraison ? Ta note aide la communauté.</p>
        <div class="stars-wrap">
          <div class="pap-stars lg" id="pap-rating-stars" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
            ${[1,2,3,4,5].map(i => `<span class="pap-star" data-val="${i}" role="radio" aria-checked="false" tabindex="0">★</span>`).join('')}
          </div>
        </div>
        <textarea id="pap-rating-comment" placeholder="Commentaire (optionnel) — ce qui a été bien ou ce qui peut s'améliorer"></textarea>
        <div id="pap-rating-msg" class="pap-rating-msg"></div>
        <div class="actions">
          <button class="cancel" onclick="PapRating.closeModal()">Plus tard</button>
          <button class="submit" id="pap-rating-submit" onclick="PapRating._submit()" disabled>Envoyer ⭐</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    // Stars interaction
    const stars = overlay.querySelectorAll('.pap-star[data-val]');
    stars.forEach(s => {
      s.addEventListener('click', () => selectStars(Number(s.dataset.val)));
      s.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStars(Number(s.dataset.val)); }
      });
    });
  }

  function selectStars(n) {
    currentSelected = n;
    const stars = document.querySelectorAll('#pap-rating-stars .pap-star');
    stars.forEach((s, idx) => {
      s.classList.toggle('on', idx < n);
      s.setAttribute('aria-checked', String(idx < n));
    });
    document.getElementById('pap-rating-submit').disabled = n === 0;
    // CSS hover off
    document.getElementById('pap-rating-stars').style.pointerEvents = 'auto';
  }

  let currentContext = null;
  function openModal(opts) {
    buildModal();
    currentContext = opts || {};
    currentSelected = 0;
    document.getElementById('pap-rating-title').textContent = opts.title || `Évalue ta livraison`;
    document.getElementById('pap-rating-sub').textContent = opts.sub || (opts.livreurName ? `Comment s'est passée la livraison avec ${opts.livreurName} ?` : `Comment s'est passée ta livraison ?`);
    document.getElementById('pap-rating-comment').value = '';
    document.getElementById('pap-rating-msg').className = 'pap-rating-msg';
    document.getElementById('pap-rating-submit').disabled = true;
    selectStars(0);
    document.getElementById('pap-rating-overlay').classList.add('open');
  }

  function closeModal() {
    const o = document.getElementById('pap-rating-overlay');
    if (o) o.classList.remove('open');
    if (currentContext?.livraisonId) {
      try { localStorage.setItem('pap_rating_dismissed_' + currentContext.livraisonId, '1'); } catch (_) {}
    }
  }

  async function _submit() {
    if (!currentSelected || !currentContext) return;
    const msg = document.getElementById('pap-rating-msg');
    const btn = document.getElementById('pap-rating-submit');
    btn.disabled = true;
    btn.textContent = 'Envoi...';
    msg.className = 'pap-rating-msg';
    try {
      const body = {
        endpoint: 'create-review',
        livraison_id: currentContext.livraisonId,
        rating: currentSelected,
        comment: document.getElementById('pap-rating-comment').value.trim(),
        reviewer_role: currentContext.reviewerRole || 'expediteur'
      };
      const r = await fetch('/api/platform?endpoint=create-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentContext.accessToken ? { 'Authorization': 'Bearer ' + currentContext.accessToken } : {})
        },
        body: JSON.stringify(body)
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Erreur envoi');
      try { localStorage.setItem('pap_rating_done_' + currentContext.livraisonId, '1'); } catch (_) {}
      // Animation merci
      document.querySelector('.pap-rating-modal').innerHTML = `
        <div class="pap-thanks">
          <div class="big">🙏</div>
          <div>Merci pour ton avis !</div>
          <div style="color:#a8b0ba;font-weight:400;margin-top:6px;font-size:.88rem">Ça aide la communauté à grandir.</div>
        </div>
      `;
      setTimeout(closeModal, 2500);
    } catch (e) {
      msg.className = 'pap-rating-msg err';
      msg.textContent = '❌ ' + e.message;
      btn.disabled = false;
      btn.textContent = 'Envoyer ⭐';
    }
  }

  // ───────── Public API ─────────
  window.PapRating = {
    openModal,
    closeModal,
    renderStars,
    _submit,
    // Aide pour vérifier si une livraison a déjà été notée (ou skip)
    isHandled(livraisonId) {
      try {
        return localStorage.getItem('pap_rating_done_' + livraisonId) === '1' ||
               localStorage.getItem('pap_rating_dismissed_' + livraisonId) === '1';
      } catch (_) { return false; }
    }
  };

  // ───────── Auto-render badges ─────────
  function autoRender() {
    document.querySelectorAll('[data-livreur-rating]:not([data-rendered])').forEach(el => {
      el.setAttribute('data-rendered', '1');
      renderRatingBadge(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoRender);
  else autoRender();
  // Re-scan toutes les 2s pour les éléments ajoutés dynamiquement
  setInterval(autoRender, 2000);
})();
