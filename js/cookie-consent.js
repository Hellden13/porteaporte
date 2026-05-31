/**
 * PorteàPorte — Bandeau consentement cookies (Loi 25 Québec + RGPD)
 *
 * Affiche un bandeau au 1er visit avec 3 choix : accepter tout / refuser non-essentiels / personnaliser.
 * Stocke le choix dans localStorage. Re-demande après 13 mois (CNIL/CAI recommandation).
 *
 * Inclusion : <script src="/js/cookie-consent.js" defer></script>
 */
(function () {
  if (window.__papCookieConsent) return;
  window.__papCookieConsent = true;

  const STORAGE_KEY = 'pap_cookie_consent_v1';
  const MAX_AGE_DAYS = 395; // ~13 mois (CAI Québec / CNIL)

  function getConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      const ageDays = (Date.now() - (c.timestamp || 0)) / 86400000;
      if (ageDays > MAX_AGE_DAYS) return null; // expiré, re-demande
      return c;
    } catch (e) { return null; }
  }

  function saveConsent(choice) {
    const c = {
      choice, // 'all' | 'essential' | 'custom'
      essential: true,
      analytics: choice === 'all' || (choice === 'custom' && document.getElementById('cc-analytics')?.checked),
      marketing: choice === 'all' || (choice === 'custom' && document.getElementById('cc-marketing')?.checked),
      timestamp: Date.now(),
      version: 1
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    // Dispatch event pour que d'autres scripts puissent réagir
    window.dispatchEvent(new CustomEvent('pap-consent-changed', { detail: c }));
    closeBanner();
  }

  function closeBanner() {
    const el = document.getElementById('pap-cookie-banner');
    if (el) el.remove();
  }

  function showBanner() {
    const css = `
      .pap-cc-banner {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
        background: #0a0f17; border-top: 2px solid #5dbfff;
        padding: 20px 24px; box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
        animation: papCcSlide .3s ease;
      }
      @keyframes papCcSlide { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      .pap-cc-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: center; }
      @media (max-width: 720px) { .pap-cc-inner { grid-template-columns: 1fr; } }
      .pap-cc-title { font-weight: 800; color: #fff; margin: 0 0 6px; font-size: 1rem; }
      .pap-cc-text { color: #a8b0ba; font-size: .85rem; line-height: 1.5; margin: 0; }
      .pap-cc-text a { color: #5dbfff; text-decoration: underline; }
      .pap-cc-btns { display: flex; gap: 8px; flex-wrap: wrap; }
      .pap-cc-btn {
        padding: 10px 16px; border: 1px solid transparent; border-radius: 8px;
        font-weight: 700; cursor: pointer; font-size: .88rem; white-space: nowrap;
      }
      .pap-cc-btn.primary { background: #5dbfff; color: #051022; }
      .pap-cc-btn.primary:hover { background: #3da9ff; }
      .pap-cc-btn.ghost { background: transparent; color: #fff; border-color: #1e2535; }
      .pap-cc-btn.ghost:hover { border-color: #5dbfff; }
      .pap-cc-options { padding: 12px 0 0; display: none; grid-column: 1 / -1; border-top: 1px solid #1e2535; margin-top: 14px; }
      .pap-cc-options.open { display: grid; gap: 8px; }
      .pap-cc-opt { display: flex; gap: 10px; align-items: center; color: #d8dde6; font-size: .85rem; }
      .pap-cc-opt input { accent-color: #5dbfff; }
      .pap-cc-opt label { cursor: pointer; }
      .pap-cc-opt strong { color: #fff; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const html = `
      <div id="pap-cookie-banner" class="pap-cc-banner" role="dialog" aria-label="Consentement cookies">
        <div class="pap-cc-inner">
          <div>
            <h3 class="pap-cc-title">🍪 Cookies et confidentialité — <span style="color:#5dbfff">Loi 25 Québec</span></h3>
            <p class="pap-cc-text">
              On utilise des cookies essentiels (connexion, panier) et, avec ton accord, des cookies de mesure d'audience pour améliorer le service.
              Tes données restent au Québec et tu peux les supprimer à tout moment.
              <a href="/confidentialite.html">Lire la politique complète →</a>
            </p>
          </div>
          <div class="pap-cc-btns">
            <button class="pap-cc-btn ghost" onclick="window.__papCcCustom()">Personnaliser</button>
            <button class="pap-cc-btn ghost" onclick="window.__papCcDecline()">Essentiels seulement</button>
            <button class="pap-cc-btn primary" onclick="window.__papCcAccept()">Tout accepter</button>
          </div>
          <div class="pap-cc-options" id="pap-cc-options">
            <div class="pap-cc-opt">
              <input type="checkbox" id="cc-essential" checked disabled>
              <label for="cc-essential"><strong>Essentiels</strong> — connexion, paiement, sécurité. Obligatoires.</label>
            </div>
            <div class="pap-cc-opt">
              <input type="checkbox" id="cc-analytics">
              <label for="cc-analytics"><strong>Mesure d'audience</strong> — comprendre ce qui fonctionne (anonyme).</label>
            </div>
            <div class="pap-cc-opt">
              <input type="checkbox" id="cc-marketing">
              <label for="cc-marketing"><strong>Marketing</strong> — personnaliser les recommandations.</label>
            </div>
            <button class="pap-cc-btn primary" style="margin-top:10px;align-self:start" onclick="window.__papCcSaveCustom()">💾 Enregistrer mes choix</button>
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    window.__papCcAccept   = () => saveConsent('all');
    window.__papCcDecline  = () => saveConsent('essential');
    window.__papCcCustom   = () => document.getElementById('pap-cc-options').classList.add('open');
    window.__papCcSaveCustom = () => saveConsent('custom');
  }

  // Public API : ré-ouvrir le bandeau pour permettre à l'user de changer
  window.PapCookieConsent = {
    open: showBanner,
    get: getConsent,
    reset: () => { localStorage.removeItem(STORAGE_KEY); showBanner(); }
  };

  // Auto-show si pas de consentement valide
  function init() {
    if (!document.body) { setTimeout(init, 50); return; }
    if (getConsent()) return; // déjà consenti récemment
    showBanner();
  }
  init();
})();
