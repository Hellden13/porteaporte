/**
 * PorteàPorte — Bouton SOS / Urgence sécurité
 * Affiche un bouton flottant "🆘 SOS" sur les pages de trajet actif.
 *
 * Au clic :
 *   1. Appel direct du 911 (priorité absolue, danger immédiat).
 *   2. Partage de la position GPS au fondateur (endpoint sos-alert),
 *      avec le contexte du trajet (ride_id / booking_id).
 *
 * Contexte : définir window.PAP_SOS_CONTEXT = { ride_id, booking_id, label }
 * avant le chargement, ou appeler window.PapSOS.setContext({...}).
 */
(function () {
  if (window.__papSOS) return;
  window.__papSOS = true;

  var ctx = window.PAP_SOS_CONTEXT || {};

  function getClient() {
    return (window.getSupabaseClient && window.getSupabaseClient()) || window.db || null;
  }

  function injectStyles() {
    if (document.getElementById('pap-sos-styles')) return;
    var s = document.createElement('style');
    s.id = 'pap-sos-styles';
    s.textContent = [
      '.pap-sos-fab{position:fixed;left:16px;bottom:16px;z-index:9998;',
      'background:linear-gradient(135deg,#ff3b3b,#c81e1e);color:#fff;border:none;',
      'border-radius:999px;padding:12px 18px;font-weight:900;font-size:.95rem;',
      'box-shadow:0 6px 24px rgba(255,59,59,.45);cursor:pointer;display:flex;',
      'align-items:center;gap:8px;letter-spacing:.04em}',
      '.pap-sos-fab:hover{filter:brightness(1.08)}',
      '.pap-sos-fab:focus-visible{outline:3px solid #fff;outline-offset:2px}',
      '.pap-sos-overlay{position:fixed;inset:0;z-index:9999;background:rgba(3,6,12,.78);',
      'display:none;align-items:center;justify-content:center;padding:18px}',
      '.pap-sos-overlay.open{display:flex}',
      '.pap-sos-modal{background:#111827;border:1px solid #2a3550;border-radius:16px;',
      'max-width:420px;width:100%;padding:24px;color:#E8EDF5;box-shadow:0 20px 60px rgba(0,0,0,.6)}',
      '.pap-sos-modal h2{margin:0 0 6px;font-size:1.3rem;font-weight:900;color:#ff6b6b}',
      '.pap-sos-modal p{margin:0 0 16px;color:#8A9BB0;font-size:.9rem;line-height:1.5}',
      '.pap-sos-act{display:block;width:100%;text-align:center;padding:15px;border-radius:11px;',
      'font-weight:800;font-size:1rem;text-decoration:none;margin-bottom:10px;border:none;cursor:pointer}',
      '.pap-sos-911{background:linear-gradient(135deg,#ff3b3b,#c81e1e);color:#fff;font-size:1.15rem}',
      '.pap-sos-loc{background:rgba(93,191,255,.14);color:#5dbfff;border:1px solid rgba(93,191,255,.4)}',
      '.pap-sos-loc:disabled{opacity:.6;cursor:default}',
      '.pap-sos-close{background:transparent;color:#8A9BB0;border:1px solid #2a3550}',
      '.pap-sos-status{font-size:.85rem;margin:4px 0 12px;min-height:1.2em}',
      '.pap-sos-ok{color:#7dffc1}.pap-sos-err{color:#ff9b9b}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildUI() {
    var fab = document.createElement('button');
    fab.className = 'pap-sos-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Bouton d\'urgence SOS');
    fab.innerHTML = '🆘 <span>SOS</span>';

    var overlay = document.createElement('div');
    overlay.className = 'pap-sos-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="pap-sos-modal">' +
        '<h2>🆘 Urgence sécurité</h2>' +
        '<p>Si tu es en <strong>danger immédiat</strong>, appelle le 911 tout de suite. ' +
        'Tu peux aussi envoyer ta position au fondateur de PorteàPorte.</p>' +
        '<a class="pap-sos-act pap-sos-911" href="tel:911">📞 Appeler le 911</a>' +
        '<div class="pap-sos-status" id="pap-sos-status"></div>' +
        '<button class="pap-sos-act pap-sos-loc" id="pap-sos-loc" type="button">📍 Envoyer ma position au fondateur</button>' +
        '<button class="pap-sos-act pap-sos-close" id="pap-sos-close" type="button">Fermer</button>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(overlay);

    function open() { overlay.classList.add('open'); }
    function close() { overlay.classList.remove('open'); }

    fab.addEventListener('click', open);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#pap-sos-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    overlay.querySelector('#pap-sos-loc').addEventListener('click', sendLocation);
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('pap-sos-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'pap-sos-status' + (kind ? ' pap-sos-' + kind : '');
  }

  async function postAlert(coords) {
    var client = getClient();
    var token = null;
    try {
      var s = client && (await client.auth.getSession());
      token = s && s.data && s.data.session && s.data.session.access_token;
    } catch (e) {}

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var payload = {
      latitude: coords ? coords.latitude : null,
      longitude: coords ? coords.longitude : null,
      accuracy: coords ? coords.accuracy : null,
      ride_id: ctx.ride_id || null,
      booking_id: ctx.booking_id || null,
      context: ctx.label || 'covoiturage',
      page: location.pathname
    };

    var res = await fetch('/api/platform?endpoint=sos-alert', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    return res;
  }

  function sendLocation() {
    var btn = document.getElementById('pap-sos-loc');
    if (btn) btn.disabled = true;
    setStatus('Récupération de ta position…');

    function finish(coords) {
      postAlert(coords).then(function (res) {
        if (res && res.ok) {
          setStatus('✅ Alerte envoyée au fondateur. Reste en sécurité, garde le 911 à portée.', 'ok');
        } else {
          setStatus('⚠️ Envoi impossible. Appelle le 911 ou écris à bonjour@porteaporte.site.', 'err');
          if (btn) btn.disabled = false;
        }
      }).catch(function () {
        setStatus('⚠️ Envoi impossible. Appelle le 911 ou écris à bonjour@porteaporte.site.', 'err');
        if (btn) btn.disabled = false;
      });
    }

    if (!navigator.geolocation) {
      // Pas de GPS : on envoie quand même l'alerte sans coordonnées.
      finish(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) { finish(pos.coords); },
      function () {
        // Position refusée : alerte sans coordonnées.
        setStatus('Position non disponible — envoi de l\'alerte sans GPS…');
        finish(null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  function init() {
    injectStyles();
    buildUI();
  }

  // API publique
  window.PapSOS = {
    setContext: function (c) { ctx = Object.assign({}, ctx, c || {}); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
