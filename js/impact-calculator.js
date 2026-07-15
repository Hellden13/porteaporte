/**
 * PorteaPorte - Calculateur d'impact public.
 * Affiche une repartition simple d'un paiement selon les parametres publics.
 */
(function () {
  if (window.__papCalc) return;
  window.__papCalc = true;

  const canon = window.PAP_PLATFORM_SETTINGS;
  let settings = {
    ...(canon ? canon.canonicalPlatformSettings() : {}),
    founder_revenue_pct: 0,
    ticket_moyen_cad: 15
  };

  function injectStyles() {
    if (document.getElementById('pap-calc-styles')) return;
    const s = document.createElement('style');
    s.id = 'pap-calc-styles';
    s.textContent = `
      .pap-calc {
        background: linear-gradient(160deg, rgba(184,245,62,.08), rgba(0,217,255,.05));
        border: 2px solid rgba(184,245,62,.35);
        border-radius: 20px;
        padding: 32px;
        margin: 32px 0;
        position: relative;
        overflow: hidden;
      }
      .pap-calc h3 { margin: 0 0 6px; font-size: 1.4rem; color: #fff; }
      .pap-calc .subtitle { color: #a8b0ba; margin-bottom: 20px; }
      .pap-calc .input-row { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
      .pap-calc .input-row label { color: #d8dde6; font-weight: 700; font-size: .9rem; }
      .pap-calc input[type=range] { flex: 1; min-width: 200px; accent-color: #b8f53e; }
      .pap-calc .amount-display { background: rgba(184,245,62,.15); border: 1px solid rgba(184,245,62,.4); padding: 10px 18px; border-radius: 8px; font-size: 1.5rem; font-weight: 900; color: #b8f53e; min-width: 100px; text-align: center; font-variant-numeric: tabular-nums; }
      .pap-calc .preset-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
      .pap-calc .preset-btn { padding: 8px 14px; background: rgba(255,255,255,.06); border: 1px solid #1e2535; color: #a8b0ba; border-radius: 8px; cursor: pointer; font-size: .82rem; font-weight: 700; transition: all .2s; }
      .pap-calc .preset-btn:hover, .pap-calc .preset-btn.active { border-color: #b8f53e; color: #b8f53e; background: rgba(184,245,62,.08); }
      .pap-calc .breakdown { display: grid; gap: 8px; margin-top: 18px; }
      .pap-calc .row { display: grid; grid-template-columns: 36px 1fr 90px; gap: 10px; align-items: center; padding: 10px 14px; background: rgba(0,0,0,.2); border-radius: 8px; border-left: 3px solid transparent; transition: all .3s; }
      .pap-calc .row:hover { background: rgba(255,255,255,.03); }
      .pap-calc .row.highlight { background: rgba(184,245,62,.1); border-left-color: #b8f53e; }
      .pap-calc .row.cause { border-left-color: #ff6b9d; }
      .pap-calc .row .icon { font-size: 1.3rem; }
      .pap-calc .row .info { min-width: 0; }
      .pap-calc .row .name { color: #fff; font-weight: 700; font-size: .92rem; }
      .pap-calc .row .pct { color: #6d7886; font-size: .75rem; margin-top: 1px; }
      .pap-calc .row .amount { color: #b8f53e; font-weight: 900; text-align: right; font-variant-numeric: tabular-nums; font-size: 1.05rem; }
      .pap-calc .comparison { margin-top: 20px; padding: 18px; background: rgba(255,90,90,.04); border: 1px solid rgba(255,90,90,.2); border-radius: 10px; }
      .pap-calc .comparison h4 { margin: 0 0 10px; color: #ffb0b0; font-size: .95rem; }
      .pap-calc .comparison .compare-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: .88rem; color: #d8dde6; }
      .pap-calc .comparison strong { color: #fff; text-align: right; }
      .pap-calc .footer-note { text-align: center; margin-top: 18px; font-size: .78rem; color: #6d7886; }
      .pap-calc .footer-note a { color: #b8f53e; text-decoration: none; }
      @media (max-width: 560px) {
        .pap-calc { padding: 22px; }
        .pap-calc .row { grid-template-columns: 28px 1fr; }
        .pap-calc .row .amount { grid-column: 2; text-align: left; }
        .pap-calc .comparison .compare-row { flex-direction: column; }
        .pap-calc .comparison strong { text-align: left; }
      }
    `;
    document.head.appendChild(s);
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/platform?endpoint=platform-settings-get');
      const data = await res.json();
      if (data.settings) settings = { ...settings, ...data.settings };
    } catch (e) {
      console.warn('[PorteaPorte] Impact calculator: parametres publics indisponibles', e);
    }
  }

  function render(container) {
    const amount = Number(container.dataset.amount || settings.ticket_moyen_cad || 15);
    container.innerHTML = `
      <div class="pap-calc">
        <h3>Ou va chaque dollar que tu paies?</h3>
        <div class="subtitle">Une repartition simple pour comprendre le modele PorteaPorte pendant la beta.</div>

        <div class="preset-row">
          <button class="preset-btn" type="button" onclick="window._papCalcSet(this, 5)">5 $ (mini)</button>
          <button class="preset-btn active" type="button" onclick="window._papCalcSet(this, 15)">15 $ (moyen)</button>
          <button class="preset-btn" type="button" onclick="window._papCalcSet(this, 25)">25 $ (regional)</button>
          <button class="preset-btn" type="button" onclick="window._papCalcSet(this, 50)">50 $ (gros)</button>
          <button class="preset-btn" type="button" onclick="window._papCalcSet(this, 100)">100 $ (XL)</button>
        </div>

        <div class="input-row">
          <label>Montant paye :</label>
          <input type="range" min="3" max="200" step="1" value="${amount}" class="pap-calc-range">
          <div class="amount-display"><span class="pap-calc-amount">${amount}</span> $</div>
        </div>

        <div class="breakdown pap-calc-breakdown"></div>

        <div class="comparison">
          <h4>Comparaison estimee pour le livreur</h4>
          <div class="comparison-content"></div>
        </div>

        <div class="footer-note">
          Pourcentages mis a jour selon les parametres publics. <a href="/transparence.html">Voir le detail complet</a>.
        </div>
      </div>
    `;
    const range = container.querySelector('.pap-calc-range');
    const display = container.querySelector('.pap-calc-amount');
    range.addEventListener('input', () => {
      display.textContent = range.value;
      renderBreakdown(container, Number(range.value));
    });
    renderBreakdown(container, amount);
  }

  function renderBreakdown(container, amount) {
    const posts = [
      { icon: '🚗', name: 'Livreur québécois', pct: settings.pct_livreur, highlight: true },
      { icon: '💳', name: 'Frais Stripe (traitement des paiements)', pct: settings.pct_stripe, isStripe: true },
      { icon: '🔧', name: 'Infrastructure & développement', pct: settings.pct_developpement },
      { icon: '🛡️', name: 'Protection colis', pct: settings.pct_protection },
      { icon: '🆘', name: 'Fonds d urgence', pct: settings.pct_urgence },
      { icon: '💚', name: 'Communauté (organismes d ici)', pct: settings.pct_communaute, cause: true },
      { icon: '💪', name: 'Réserve / pérennité', pct: settings.pct_profit },
      { icon: '📢', name: 'Marketing & croissance', pct: settings.pct_marketing },
      { icon: '🏛️', name: 'Opérations', pct: settings.pct_operations }
    ].filter((p) => Number(p.pct) > 0);
    const html = posts.map((p) => {
      const dollars = amount * p.pct / 100;
      const cls = p.highlight ? 'highlight' : (p.cause ? 'cause' : '');
      return `
        <div class="row ${cls}">
          <div class="icon">${p.icon}</div>
          <div class="info">
            <div class="name">${p.name}</div>
            <div class="pct">${Number(p.pct).toFixed(1)}% du montant</div>
          </div>
          <div class="amount">${dollars.toFixed(2)} $</div>
        </div>
      `;
    }).join('');
    container.querySelector('.pap-calc-breakdown').innerHTML = html;

    const livreurPaP = amount * settings.pct_livreur / 100;
    const livreurUber = amount * 0.32;
    const livreurDoorDash = amount * 0.30;
    container.querySelector('.comparison-content').innerHTML = `
      <div class="compare-row"><span>PorteaPorte, objectif beta</span> <strong style="color:#b8f53e">${livreurPaP.toFixed(2)} $</strong></div>
      <div class="compare-row"><span>Autres plateformes, estimation haute</span> <strong>${livreurUber.toFixed(2)} $</strong></div>
      <div class="compare-row"><span>Autres plateformes, estimation basse</span> <strong>${livreurDoorDash.toFixed(2)} $</strong></div>
      <div class="compare-row" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)"><span style="color:#7dffc1">Ecart estime en faveur du livreur</span> <strong style="color:#7dffc1">+${(livreurPaP - livreurUber).toFixed(2)} $</strong></div>
    `;
  }

  window._papCalcSet = function (btn, val) {
    const card = btn.closest ? btn.closest('.pap-calc') : null;
    if (!card) return;
    card.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
    if (btn.classList) btn.classList.add('active');
    const range = card.querySelector('.pap-calc-range');
    const display = card.querySelector('.pap-calc-amount');
    range.value = val;
    display.textContent = val;
    renderBreakdown(card.parentNode, val);
  };

  async function init() {
    injectStyles();
    await loadSettings();
    document.querySelectorAll('#pap-calculator, .pap-calculator').forEach(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
