/* js/dialogues.js — Fenêtres dans la page, non bloquantes (remplacent window.alert, confirm et prompt).
   PAPDialog.alert(message, {title})            -> Promise<void>
   PAPDialog.confirm(message, {title, ok, annuler, danger}) -> Promise<boolean>
   PAPDialog.prompt(message, valeurParDefaut, {title, type, placeholder, inputmode, ok}) -> Promise<string|null>
   Aucune fenêtre du navigateur : la page continue de répondre pendant que la fenêtre est ouverte. */
(function () {
  'use strict';
  if (window.PAPDialog) return;

  function css() {
    if (document.getElementById('pap-dialog-css')) return;
    var s = document.createElement('style');
    s.id = 'pap-dialog-css';
    s.textContent =
      '.pap-dlg-fond{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.62)}' +
      '.pap-dlg{width:min(480px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#111318;border:1px solid #2b3442;border-radius:12px;' +
      'box-shadow:0 24px 70px rgba(0,0,0,.55);padding:20px;color:#f0f2f5;font:400 15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}' +
      '.pap-dlg h2{font-size:18px;font-weight:800;margin:0 0 8px;color:#fff}' +
      '.pap-dlg p{margin:0 0 14px;color:#d3d8df;white-space:pre-wrap;word-break:break-word}' +
      '.pap-dlg input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;border:1px solid #3a4556;background:#0b0d12;color:#fff;font-size:16px;margin:0 0 14px}' +
      '.pap-dlg-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}' +
      '.pap-dlg button{border:1px solid #3a4556;border-radius:8px;padding:10px 16px;font-weight:800;cursor:pointer;background:#1a1f28;color:#f0f2f5;font-size:15px}' +
      '.pap-dlg button.ok{border-color:transparent;background:#00d9ff;color:#06121a}' +
      '.pap-dlg button.danger{border-color:transparent;background:#ef4444;color:#fff}';
    document.head.appendChild(s);
  }

  var file = Promise.resolve();

  function ouvrir(sorte, message, opts, defaut) {
    opts = opts || {};
    var p = file.then(function () {
      return new Promise(function (resolve) {
        css();
        var fond = document.createElement('div');
        fond.className = 'pap-dlg-fond';
        var boite = document.createElement('div');
        boite.className = 'pap-dlg';
        boite.setAttribute('role', sorte === 'alert' ? 'alertdialog' : 'dialog');
        boite.setAttribute('aria-modal', 'true');
        var titre = document.createElement('h2');
        titre.textContent = opts.title || (sorte === 'alert' ? 'Information' : sorte === 'confirm' ? 'Confirmation' : 'À remplir');
        titre.id = 'pap-dlg-t-' + Date.now();
        boite.setAttribute('aria-labelledby', titre.id);
        var texte = document.createElement('p');
        texte.textContent = String(message == null ? '' : message);
        boite.appendChild(titre);
        boite.appendChild(texte);
        var champ = null;
        if (sorte === 'prompt') {
          champ = document.createElement('input');
          champ.type = opts.type || 'text';
          if (opts.inputmode) champ.setAttribute('inputmode', opts.inputmode);
          if (opts.placeholder) champ.placeholder = opts.placeholder;
          if (opts.maxlength) champ.maxLength = opts.maxlength;
          champ.autocomplete = 'off';
          champ.value = defaut == null ? '' : String(defaut);
          boite.appendChild(champ);
        }
        var actions = document.createElement('div');
        actions.className = 'pap-dlg-actions';
        var annuler = null;
        if (sorte !== 'alert') {
          annuler = document.createElement('button');
          annuler.type = 'button';
          annuler.textContent = opts.annuler || 'Annuler';
          actions.appendChild(annuler);
        }
        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = opts.danger ? 'danger' : 'ok';
        ok.textContent = opts.ok || 'OK';
        actions.appendChild(ok);
        boite.appendChild(actions);
        fond.appendChild(boite);
        var avant = document.activeElement;
        function fermer(valeur) {
          document.removeEventListener('keydown', clavier, true);
          fond.remove();
          try { if (avant && avant.focus) avant.focus(); } catch (_) {}
          resolve(valeur);
        }
        function valider() { fermer(sorte === 'prompt' ? champ.value : sorte === 'confirm' ? true : undefined); }
        function refuser() { fermer(sorte === 'prompt' ? null : sorte === 'confirm' ? false : undefined); }
        function clavier(e) {
          if (e.key === 'Escape') { e.preventDefault(); refuser(); }
          else if (e.key === 'Enter' && (sorte !== 'confirm' || document.activeElement === ok || document.activeElement === champ)) { e.preventDefault(); valider(); }
        }
        ok.addEventListener('click', valider);
        if (annuler) annuler.addEventListener('click', refuser);
        fond.addEventListener('click', function (e) { if (e.target === fond && sorte !== 'alert') refuser(); });
        document.addEventListener('keydown', clavier, true);
        (document.body || document.documentElement).appendChild(fond);
        (champ || ok).focus();
      });
    });
    file = p.then(function () {}, function () {});
    return p;
  }

  window.PAPDialog = {
    alert: function (message, opts) { return ouvrir('alert', message, opts); },
    confirm: function (message, opts) { return ouvrir('confirm', message, opts); },
    prompt: function (message, defaut, opts) { return ouvrir('prompt', message, opts, defaut); }
  };
})();
