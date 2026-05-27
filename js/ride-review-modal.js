/**
 * Modal d'évaluation bidirectionnelle covoiturage
 * Usage :
 *   RideReview.open({
 *     ride_id: 'xxx',
 *     target_user_id: 'yyy',          // requis si tu es chauffeur
 *     target_name: 'Marie T.',
 *     role: 'driver' | 'passenger',    // qui tu évalues
 *     onSuccess: () => {...}
 *   });
 */
(function () {
  const STYLE = `
    .rr-overlay { position: fixed; inset: 0; background: rgba(5,8,16,.85); backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .rr-box { background: #0f1320; border: 1px solid rgba(184,245,62,.3); border-radius: 18px; padding: 28px 24px; max-width: 460px; width: 100%; color: #e9edf4; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
    .rr-box h3 { margin: 0 0 6px; font-size: 1.3rem; color: #b8f53e; }
    .rr-box .who { color: #aab2c5; font-size: .95rem; margin-bottom: 22px; }
    .rr-stars { display: flex; justify-content: center; gap: 6px; margin: 12px 0 18px; }
    .rr-star { cursor: pointer; font-size: 2.2rem; line-height: 1; color: #444c5e; transition: transform .15s, color .15s; user-select: none; }
    .rr-star:hover { transform: scale(1.15); }
    .rr-star.active { color: #ffd166; text-shadow: 0 0 14px rgba(255,209,102,.5); }
    .rr-rating-label { text-align: center; color: #b8f53e; font-weight: 800; margin-bottom: 14px; min-height: 1.2em; }
    .rr-comment { width: 100%; min-height: 90px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 12px; color: #e9edf4; font-family: inherit; font-size: .95rem; resize: vertical; box-sizing: border-box; }
    .rr-comment:focus { outline: none; border-color: rgba(184,245,62,.5); }
    .rr-actions { display: flex; gap: 10px; margin-top: 16px; }
    .rr-btn { flex: 1; padding: 12px 16px; border-radius: 10px; border: 0; font-weight: 800; cursor: pointer; transition: opacity .2s, transform .15s; font-size: .95rem; }
    .rr-btn:hover { transform: translateY(-1px); }
    .rr-btn-primary { background: linear-gradient(135deg, #b8f53e, #9ce326); color: #071006; }
    .rr-btn-primary:disabled { opacity: .4; cursor: not-allowed; transform: none; }
    .rr-btn-ghost { background: transparent; color: #aab2c5; border: 1px solid rgba(255,255,255,.15); }
    .rr-err { color: #ff8c8c; font-size: .85rem; margin-top: 8px; min-height: 1em; }
    .rr-ok { color: #b8f53e; text-align: center; padding: 20px 0; font-weight: 800; font-size: 1.05rem; }
  `;
  const RATING_LABELS = ['', '😞 Très décevant', '😕 Décevant', '😐 Correct', '😊 Bien', '🤩 Excellent !'];

  function injectStyle() {
    if (document.getElementById('rr-style')) return;
    const s = document.createElement('style');
    s.id = 'rr-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function close() {
    const o = document.getElementById('rr-overlay');
    if (o) o.remove();
  }

  async function submit(opts, rating, comment, errEl, btn) {
    btn.disabled = true;
    errEl.textContent = '';
    try {
      // Récupère la session
      let token = null;
      if (window.db && window.db.auth) {
        const { data: { session } } = await window.db.auth.getSession();
        token = session?.access_token || null;
      }
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const body = {
        endpoint: 'ride-review-create',
        ride_id: opts.ride_id,
        rating,
        comment: comment.trim()
      };
      if (opts.target_user_id) body.target_user_id = opts.target_user_id;

      const r = await fetch('/api/platform?endpoint=ride-review-create', {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) {
        errEl.textContent = data.error || 'Erreur lors de l\'envoi';
        btn.disabled = false;
        return;
      }
      // Succès
      const box = document.querySelector('#rr-overlay .rr-box');
      if (box) box.innerHTML = '<div class="rr-ok">✅ Merci pour votre évaluation !</div>';
      setTimeout(() => { close(); if (typeof opts.onSuccess === 'function') opts.onSuccess(); }, 1500);
    } catch (e) {
      errEl.textContent = 'Erreur réseau : ' + (e.message || e);
      btn.disabled = false;
    }
  }

  function open(opts) {
    if (!opts || !opts.ride_id) { console.error('[RideReview] ride_id requis'); return; }
    injectStyle();
    close();

    const targetLabel = opts.role === 'driver'
      ? `Évaluez votre passager ${opts.target_name ? '— ' + opts.target_name : ''}`
      : `Évaluez votre chauffeur ${opts.target_name ? '— ' + opts.target_name : ''}`;

    const overlay = document.createElement('div');
    overlay.id = 'rr-overlay';
    overlay.className = 'rr-overlay';
    overlay.innerHTML = `
      <div class="rr-box" role="dialog" aria-modal="true">
        <h3>⭐ Comment s'est passé le trajet ?</h3>
        <div class="who">${targetLabel}</div>
        <div class="rr-stars" id="rr-stars">
          ${[1,2,3,4,5].map(n => `<span class="rr-star" data-n="${n}" role="button" tabindex="0" aria-label="${n} étoile${n>1?'s':''}">★</span>`).join('')}
        </div>
        <div class="rr-rating-label" id="rr-label">&nbsp;</div>
        <textarea class="rr-comment" id="rr-comment" placeholder="Un commentaire (optionnel, max 800 caractères)..." maxlength="800"></textarea>
        <div class="rr-err" id="rr-err"></div>
        <div class="rr-actions">
          <button class="rr-btn rr-btn-ghost" id="rr-cancel">Plus tard</button>
          <button class="rr-btn rr-btn-primary" id="rr-submit" disabled>Envoyer mon avis</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let rating = 0;
    const stars = overlay.querySelectorAll('.rr-star');
    const label = overlay.querySelector('#rr-label');
    const submitBtn = overlay.querySelector('#rr-submit');
    const errEl = overlay.querySelector('#rr-err');
    const commentEl = overlay.querySelector('#rr-comment');

    function paint(n) {
      stars.forEach(s => s.classList.toggle('active', Number(s.dataset.n) <= n));
      label.textContent = RATING_LABELS[n] || ' ';
      submitBtn.disabled = n < 1;
    }
    stars.forEach(s => {
      s.addEventListener('click', () => { rating = Number(s.dataset.n); paint(rating); });
      s.addEventListener('mouseover', () => paint(Number(s.dataset.n)));
      s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rating = Number(s.dataset.n); paint(rating); }});
    });
    overlay.querySelector('#rr-stars').addEventListener('mouseleave', () => paint(rating));

    overlay.querySelector('#rr-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }});

    submitBtn.addEventListener('click', () => submit(opts, rating, commentEl.value, errEl, submitBtn));
  }

  /**
   * Récupère la note moyenne d'un user et l'injecte dans un élément.
   * Usage : RideReview.injectBadge(elementOrSelector, userId);
   */
  async function injectBadge(target, userId) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el || !userId) return;
    try {
      const r = await fetch('/api/platform?endpoint=ride-user-rating', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'ride-user-rating', user_id: userId })
      });
      const d = await r.json();
      if (!r.ok) return;
      if (d.badge) {
        const avg = d.avg_rating ? `${d.avg_rating}⭐` : '';
        const cnt = d.count ? `(${d.count} avis)` : '';
        el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;background:${d.badge.color}22;border:1px solid ${d.badge.color}55;color:${d.badge.color};padding:4px 10px;border-radius:999px;font-weight:700;font-size:.82rem;">${d.badge.label} ${avg} ${cnt}</span>`;
      } else {
        el.innerHTML = '<span style="color:#888;font-size:.82rem;">🌱 Nouveau membre</span>';
      }
    } catch (e) { /* silent */ }
  }

  window.RideReview = { open, close, injectBadge };
})();
