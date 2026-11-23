/* js/code-securite.js — Code de sécurité du passager, impossible à manquer (lot code-sécurité).
   PAPCodeSecurite.afficher(conteneur, { session, bookingId, mode })
     mode 'encadre'       : écran de confirmation de réservation (« Crée ton code de sécurité maintenant »)
     mode 'avertissement' : fiche du trajet réservé (« Tu n'as pas encore de code de sécurité »)
   Rien n'est affiché si le passager a déjà un code. Le code n'est jamais affiché : le serveur n'en garde
   qu'une version brouillée. Le code enregistré ici est le code du compte : il sert pour ce trajet et les suivants. */
(function () {
  'use strict';
  if (window.PAPCodeSecurite) return;

  var PHRASE = "Tu l'entreras à l'arrivée pour confirmer que tu es bien arrivé(e).";

  function css() {
    if (document.getElementById('pap-code-securite-css')) return;
    var s = document.createElement('style');
    s.id = 'pap-code-securite-css';
    s.textContent =
      '.pap-cs{border-radius:14px;padding:16px;margin:0 0 16px;font:400 15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;text-align:left}' +
      '.pap-cs.encadre{background:rgba(255,200,0,.1);border:2px solid rgba(255,200,0,.6);color:#fff3c4}' +
      '.pap-cs.avertissement{background:rgba(255,120,80,.1);border:2px solid rgba(255,140,90,.65);color:#ffe0d2}' +
      '.pap-cs h3{margin:0 0 6px;font-size:1.1rem;font-weight:900;color:#fff}' +
      '.pap-cs p{margin:0 0 10px}' +
      '.pap-cs .rangee{display:flex;gap:8px;flex-wrap:wrap}' +
      '.pap-cs input{flex:1;min-width:140px;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #3a4556;background:#05080c;color:#fff;font-size:1.4rem;letter-spacing:.3em;text-align:center}' +
      '.pap-cs button{padding:12px 16px;border-radius:10px;border:0;background:#ffd23f;color:#141000;font-weight:900;font-size:1rem;cursor:pointer;min-height:48px}' +
      '.pap-cs .msg{margin-top:8px;font-weight:700}' +
      '.pap-cs.ok{background:rgba(125,255,193,.08);border:2px solid rgba(125,255,193,.5);color:#c9ffe6}';
    document.head.appendChild(s);
  }

  async function api(session, endpoint, corps) {
    var r = await fetch('/api/platform?endpoint=' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify(Object.assign({ endpoint: endpoint }, corps || {})),
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || 'Action impossible');
    return d;
  }

  async function aDejaUnCode(session, bookingId) {
    try {
      var d = await api(session, 'ride-safety-code-status', bookingId ? { booking_id: bookingId } : {});
      return !!(d.has_code || d.has_profile_code || d.has_booking_code);
    } catch (_) {
      return null; // inconnu : on n'affiche rien plutôt qu'un faux avertissement
    }
  }

  function formulaire(boite, session) {
    var rangee = document.createElement('div');
    rangee.className = 'rangee';
    var champ = document.createElement('input');
    champ.type = 'password';
    champ.inputMode = 'numeric';
    champ.autocomplete = 'off';
    champ.maxLength = 8;
    champ.placeholder = '4 à 8 chiffres';
    champ.setAttribute('aria-label', 'Code de sécurité (4 à 8 chiffres)');
    champ.className = 'pap-cs-champ';
    var bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.textContent = 'Enregistrer mon code';
    var msg = document.createElement('div');
    msg.className = 'msg';
    msg.setAttribute('role', 'status');
    rangee.appendChild(champ);
    rangee.appendChild(bouton);
    boite.appendChild(rangee);
    boite.appendChild(msg);
    champ.addEventListener('input', function () { champ.value = champ.value.replace(/\D/g, '').slice(0, 8); });
    bouton.addEventListener('click', async function () {
      var code = champ.value.replace(/\D/g, '');
      if (code.length < 4) { msg.textContent = 'Le code doit avoir de 4 à 8 chiffres.'; return; }
      bouton.disabled = true;
      try {
        await api(session, 'ride-safety-code-set', { code: code });
        boite.className = 'pap-cs ok';
        boite.textContent = '';
        var h = document.createElement('h3'); h.textContent = '✅ Code de sécurité enregistré';
        var p = document.createElement('p'); p.textContent = PHRASE + ' Garde-le pour toi : ne le donne jamais au conducteur avant l\'arrivée.';
        boite.appendChild(h); boite.appendChild(p);
      } catch (e) {
        msg.textContent = e.message;
        bouton.disabled = false;
      }
    });
  }

  async function afficher(conteneur, opts) {
    opts = opts || {};
    if (!conteneur || !opts.session) return false;
    var deja = await aDejaUnCode(opts.session, opts.bookingId);
    if (deja !== false) { conteneur.textContent = ''; return false; }
    css();
    var mode = opts.mode === 'avertissement' ? 'avertissement' : 'encadre';
    var boite = document.createElement('section');
    boite.className = 'pap-cs ' + mode;
    boite.id = 'code-securite';
    boite.setAttribute('aria-live', 'polite');
    var h = document.createElement('h3');
    h.textContent = mode === 'avertissement' ? "⚠️ Tu n'as pas encore de code de sécurité" : '🔐 Crée ton code de sécurité maintenant';
    var p = document.createElement('p');
    p.textContent = PHRASE + ' Choisis 4 à 8 chiffres faciles à retenir pour toi.';
    boite.appendChild(h);
    boite.appendChild(p);
    formulaire(boite, opts.session);
    conteneur.textContent = '';
    conteneur.appendChild(boite);
    return true;
  }

  window.PAPCodeSecurite = { afficher: afficher, PHRASE: PHRASE };
})();
