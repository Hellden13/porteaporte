/**
 * PorteàPorte — Loading states helper
 * Affiche un overlay spinner ou des skeletons pour éviter pages blanches
 */
(function() {
  if (window.PapLoading) return;
  function injectCss() {
    if (document.getElementById('pap-loading-css')) return;
    const s = document.createElement('style');
    s.id = 'pap-loading-css';
    s.textContent = `
      .pap-spinner { width:40px; height:40px; border:3px solid rgba(184,245,62,.2); border-top-color:#b8f53e; border-radius:50%; animation:papSpin .8s linear infinite; display:inline-block; }
      @keyframes papSpin { to { transform: rotate(360deg); } }
      .pap-overlay { position:fixed; inset:0; background:rgba(5,8,12,.85); backdrop-filter:blur(4px); z-index:9999; display:grid; place-items:center; }
      .pap-overlay .text { color:#fff; margin-top:14px; font-weight:700; }
      .pap-skeleton { background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,255,255,.06),rgba(255,255,255,.03)); background-size:200% 100%; animation:papShimmer 1.5s ease-in-out infinite; border-radius:10px; }
      @keyframes papShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      .pap-toast { position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(10,14,20,.95); border:1px solid rgba(184,245,62,.4); padding:12px 22px; border-radius:10px; color:#fff; font-weight:700; z-index:99998; animation:papSlideDown .3s ease; box-shadow:0 8px 30px rgba(0,0,0,.5); }
      .pap-toast.err { border-color:rgba(255,90,90,.5); }
      .pap-toast.ok { border-color:rgba(0,255,159,.5); }
      @keyframes papSlideDown { from{transform:translate(-50%,-30px);opacity:0} to{transform:translate(-50%,0);opacity:1} }
    `;
    document.head.appendChild(s);
  }
  injectCss();

  window.PapLoading = {
    show(text = 'Chargement…') {
      this.hide();
      const o = document.createElement('div');
      o.id = 'pap-loading-overlay';
      o.className = 'pap-overlay';
      o.innerHTML = `<div style="text-align:center"><div class="pap-spinner"></div><div class="text">${text}</div></div>`;
      document.body.appendChild(o);
    },
    hide() { document.getElementById('pap-loading-overlay')?.remove(); },
    toast(msg, type = 'info', duration = 3000) {
      const t = document.createElement('div');
      t.className = 'pap-toast ' + (type === 'err' ? 'err' : type === 'ok' ? 'ok' : '');
      t.textContent = (type === 'err' ? '⚠️ ' : type === 'ok' ? '✅ ' : 'ℹ️ ') + msg;
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
    },
    skeleton(width = '100%', height = '20px') {
      return `<div class="pap-skeleton" style="width:${width};height:${height}"></div>`;
    }
  };
})();
