/**
 * Widget de messagerie covoiturage
 * Usage :
 *   RideChat.open({ ride_id: 'xxx', other_user_id: 'yyy', other_name: 'Marie' });
 *   RideChat.close();
 */
(function () {
  const STYLE = `
    .rc-overlay { position: fixed; inset: 0; background: rgba(5,8,16,.8); backdrop-filter: blur(6px); z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 12px; }
    .rc-box { background: #0f1320; border: 1px solid rgba(0,217,255,.3); border-radius: 16px; width: 100%; max-width: 460px; height: 80vh; max-height: 640px; display: flex; flex-direction: column; box-shadow: 0 30px 80px rgba(0,0,0,.6); overflow: hidden; }
    .rc-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: rgba(0,217,255,.06); border-bottom: 1px solid rgba(255,255,255,.08); }
    .rc-header .name { font-weight: 800; color: #00d9ff; font-size: 1.02rem; }
    .rc-header .sub { font-size: .75rem; color: #888; }
    .rc-close { background: transparent; border: 0; color: #aab2c5; font-size: 1.5rem; cursor: pointer; line-height: 1; padding: 0 4px; }
    .rc-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
    .rc-msg { max-width: 78%; padding: 9px 13px; border-radius: 14px; font-size: .95rem; line-height: 1.35; word-wrap: break-word; }
    .rc-msg.mine { align-self: flex-end; background: linear-gradient(135deg, #00d9ff, #00b8d4); color: #001828; border-bottom-right-radius: 4px; }
    .rc-msg.theirs { align-self: flex-start; background: rgba(255,255,255,.08); color: #e9edf4; border-bottom-left-radius: 4px; }
    .rc-time { font-size: .68rem; color: rgba(255,255,255,.4); margin-top: 2px; padding: 0 6px; }
    .rc-time.mine { text-align: right; align-self: flex-end; }
    .rc-time.theirs { text-align: left; align-self: flex-start; }
    .rc-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.02); }
    .rc-input textarea { flex: 1; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; color: #e9edf4; padding: 9px 12px; font-family: inherit; font-size: .94rem; resize: none; min-height: 42px; max-height: 120px; }
    .rc-input textarea:focus { outline: none; border-color: rgba(0,217,255,.5); }
    .rc-send { background: linear-gradient(135deg, #00d9ff, #00b8d4); color: #001828; border: 0; padding: 0 16px; border-radius: 12px; font-weight: 900; cursor: pointer; font-size: 1.1rem; }
    .rc-send:disabled { opacity: .4; cursor: not-allowed; }
    .rc-empty { color: #666; text-align: center; padding: 30px 14px; font-size: .88rem; line-height: 1.5; }
    .rc-err { color: #ff8c8c; font-size: .82rem; padding: 6px 12px; }
    .rc-prive { font-size: .74rem; color: #9fb3c8; padding: 7px 14px; background: rgba(125,255,193,.05); border-bottom: 1px solid rgba(255,255,255,.06); line-height: 1.35; }
    .rc-ferme { font-size: .84rem; color: #ffd166; padding: 10px 14px; border-top: 1px solid rgba(255,255,255,.08); background: rgba(255,209,102,.06); line-height: 1.4; }
    .rc-actions { display: flex; gap: 6px; align-items: center; }
    #rc-overlay .rc-signaler { background: transparent !important; border: 1px solid rgba(255,120,120,.55) !important; color: #ff9c9c !important; box-shadow: none !important; border-radius: 8px !important; padding: 6px 10px !important; min-height: 0 !important; font-size: .78rem !important; font-weight: 800; cursor: pointer; }
    #rc-overlay .rc-close { background: transparent !important; box-shadow: none !important; border: 0 !important; color: #aab2c5 !important; min-height: 0 !important; padding: 0 4px !important; }
    .rc-sig { padding: 12px 14px; border-top: 1px solid rgba(255,255,255,.08); background: rgba(255,120,120,.05); display: flex; flex-direction: column; gap: 8px; }
    .rc-sig select, .rc-sig textarea { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; color: #e9edf4; padding: 8px 10px; font: inherit; font-size: .88rem; }
    .rc-sig .rc-sig-btns { display: flex; gap: 8px; justify-content: flex-end; }
    .rc-sig button { border-radius: 10px; padding: 8px 14px; font-weight: 800; cursor: pointer; border: 0; }
    #rc-overlay .rc-sig .ok { background: #ff7a7a !important; color: #200 !important; box-shadow: none !important; border: 0 !important; }
    #rc-overlay .rc-sig .non { background: rgba(255,255,255,.08) !important; color: #e9edf4 !important; box-shadow: none !important; border: 0 !important; }
    .rc-sig-msg { font-size: .84rem; color: #7dffc1; }
    #rc-overlay [hidden] { display: none !important; }
    @media (max-width: 520px) { .rc-box { max-height: none; height: 92vh; } }
  `;

  let pollTimer = null;
  let currentCtx = null;

  function injectStyle() {
    if (document.getElementById('rc-style')) return;
    const s = document.createElement('style');
    s.id = 'rc-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function close() {
    const o = document.getElementById('rc-overlay');
    if (o) o.remove();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    currentCtx = null;
  }

  async function getToken() {
    if (window.db && window.db.auth) {
      const { data: { session } } = await window.db.auth.getSession();
      return session?.access_token || null;
    }
    return null;
  }

  // API de livraison (lib/_messagerie-livraison.js). Avec opts.t : destinataire sans compte (lien personnel).
  function livraisonApi(o) {
    const lien = Boolean(o.t);
    const appel = async (suffixe, extra) => {
      const endpoint = (lien ? 'livraison-message-lien-' : 'livraison-message-') + suffixe;
      const headers = { 'Content-Type': 'application/json' };
      if (!lien) {
        const token = await getToken();
        if (!token) { window.location.href = '/login.html'; return { ok: false, d: {} }; }
        headers.Authorization = 'Bearer ' + token;
      }
      const r = await fetch('/api/platform?endpoint=' + endpoint, {
        method: 'POST', headers,
        body: JSON.stringify(Object.assign({ endpoint, livraison_id: o.livraison_id, avec: o.avec, t: o.t }, extra || {})),
      });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok, d };
    };
    return {
      thread: async () => { const x = await appel('thread'); return x.ok ? x.d : { error: x.d.error || 'Erreur', messages: [] }; },
      send: (text) => appel('send', { body: text }),
      report: (raison, details) => appel('report', { raison, details }),
    };
  }

  async function fetchThread(opts) {
    if (opts.api) return opts.api.thread();
    const token = await getToken();
    if (!token) { window.location.href = '/login.html'; return null; }
    const r = await fetch('/api/platform?endpoint=ride-message-thread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ endpoint: 'ride-message-thread', ride_id: opts.ride_id, other_user_id: opts.other_user_id })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { error: d.error || 'Erreur', messages: [] };
    return d;
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) {
        return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMessages(myId, messages) {
    const body = document.querySelector('#rc-overlay .rc-body');
    if (!body) return;
    if (!messages.length) {
      body.innerHTML = '<div class="rc-empty">💬 Commencez la conversation.<br>Soyez courtois et clair sur les détails (heure exacte, point de rencontre…).</div>';
      return;
    }
    body.innerHTML = messages.map(m => {
      const mine = typeof m.moi === 'boolean' ? m.moi : m.sender_id === myId;
      const safe = escHtml(m.body || '');
      return `
        <div class="rc-msg ${mine ? 'mine' : 'theirs'}">${safe}</div>
        <div class="rc-time ${mine ? 'mine' : 'theirs'}">${fmtTime(m.created_at)}</div>
      `;
    }).join('');
    body.scrollTop = body.scrollHeight;
  }

  async function sendMessage(opts) {
    const ta = document.querySelector('#rc-overlay .rc-input textarea');
    const btn = document.querySelector('#rc-overlay .rc-send');
    if (!ta || !ta.value.trim()) return;
    const text = ta.value.trim();
    btn.disabled = true;
    try {
      let r, d;
      if (opts.api) {
        const x = await opts.api.send(text);
        r = { ok: x.ok }; d = x.d || {};
      } else {
        const token = await getToken();
        r = await fetch('/api/platform?endpoint=ride-message-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ endpoint: 'ride-message-send', ride_id: opts.ride_id, recipient_id: opts.other_user_id, body: text })
        });
        d = await r.json().catch(() => ({}));
      }
      if (!r.ok) { (await PAPDialog.alert('Erreur : ' + (d.error || 'envoi impossible'))); btn.disabled = false; return; }
      ta.value = '';
      if (d.masque) {
        const f = document.querySelector('#rc-overlay #rc-ferme');
        if (f) { f.hidden = false; f.textContent = '🔒 ' + (d.avis || 'Tes coordonnées ont été masquées pour ta sécurité.'); }
      }
      // Refresh thread
      const thread = await fetchThread(opts);
      if (thread && thread.messages) renderMessages(currentCtx.myId, thread.messages);
    } catch (e) {
      (await PAPDialog.alert('Erreur réseau : ' + (e.message || e)));
    } finally {
      btn.disabled = false;
      ta.focus();
    }
  }

  async function open(opts) {
    if (!opts || (!opts.api && (!opts.ride_id || !opts.other_user_id))) {
      console.error('[RideChat] ride_id + other_user_id (ou api) requis');
      return;
    }
    injectStyle();
    close();

    // Récupérer mon user id (covoiturage) ; la messagerie de livraison dit elle-même « moi ».
    let myId = null;
    if (!opts.api) {
      if (window.db && window.db.auth) {
        const { data: { user } } = await window.db.auth.getUser();
        myId = user?.id || null;
      }
      if (!myId) { window.location.href = '/login.html'; return; }
    }
    currentCtx = { ...opts, myId };

    const overlay = document.createElement('div');
    overlay.id = 'rc-overlay';
    overlay.className = 'rc-overlay';
    overlay.innerHTML = `
      <div class="rc-box" role="dialog" aria-modal="true">
        <div class="rc-header">
          <div>
            <div class="name">💬 ${escHtml(opts.other_name || 'Conversation')}</div>
            <div class="sub">${escHtml(opts.sous_titre || 'À propos du trajet')}</div>
          </div>
          <div class="rc-actions">
            <button type="button" class="rc-signaler" id="rc-signaler">🚩 Signaler</button>
            <button class="rc-close" id="rc-close" aria-label="Fermer">✕</button>
          </div>
        </div>
        <div class="rc-prive">🔒 Tes coordonnées restent privées. Ne partage pas ton numéro ni ton courriel ; ne paie jamais en dehors de PorteàPorte.</div>
        <div class="rc-body"><div class="rc-empty">Chargement…</div></div>
        <div class="rc-sig" id="rc-sig" hidden>
          <strong style="color:#ff9c9c;font-size:.9rem">Signaler cette conversation</strong>
          <select id="rc-sig-raison" aria-label="Raison du signalement">
            <option value="">Choisis une raison…</option>
            <option value="propos">Propos déplacés ou menaçants</option>
            <option value="coordonnees">Demande mes coordonnées personnelles</option>
            <option value="paiement">Demande de paiement hors de PorteàPorte</option>
            <option value="harcelement">Harcèlement ou insistance</option>
            <option value="autre">Autre</option>
          </select>
          <textarea id="rc-sig-details" rows="2" maxlength="1000" placeholder="Détails (facultatif)"></textarea>
          <div style="font-size:.74rem;color:#9fb3c8">L'équipe PorteàPorte pourra lire cette conversation pour traiter ton signalement.</div>
          <div class="rc-sig-btns"><button type="button" class="non" id="rc-sig-non">Annuler</button><button type="button" class="ok" id="rc-sig-ok">Envoyer le signalement</button></div>
          <div class="rc-sig-msg" id="rc-sig-msg"></div>
        </div>
        <div class="rc-ferme" id="rc-ferme" hidden></div>
        <div class="rc-input">
          <textarea placeholder="Votre message..." maxlength="2000" rows="1"></textarea>
          <button class="rc-send" aria-label="Envoyer">▶</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#rc-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    const ta = overlay.querySelector('.rc-input textarea');
    const sendBtn = overlay.querySelector('.rc-send');
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(opts); }
    });
    sendBtn.addEventListener('click', () => sendMessage(opts));

    // Signaler : petit formulaire dans la fenêtre (aucune boîte de dialogue du navigateur).
    const sig = overlay.querySelector('#rc-sig');
    overlay.querySelector('#rc-signaler').addEventListener('click', () => { sig.hidden = !sig.hidden; });
    overlay.querySelector('#rc-sig-non').addEventListener('click', () => { sig.hidden = true; });
    overlay.querySelector('#rc-sig-ok').addEventListener('click', async () => {
      const raison = overlay.querySelector('#rc-sig-raison').value;
      const msg = overlay.querySelector('#rc-sig-msg');
      if (!raison) { msg.style.color = '#ff9c9c'; msg.textContent = 'Choisis une raison.'; return; }
      const details = overlay.querySelector('#rc-sig-details').value;
      let r, d = {};
      if (opts.api) {
        const x = await opts.api.report(raison, details).catch(() => null);
        r = x ? { ok: x.ok } : null; d = (x && x.d) || {};
      } else {
        const token = await getToken();
        r = await fetch('/api/platform?endpoint=ride-message-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ endpoint: 'ride-message-report', ride_id: opts.ride_id, other_user_id: opts.other_user_id, raison, details })
        }).catch(() => null);
        d = r ? await r.json().catch(() => ({})) : {};
      }
      msg.style.color = r && r.ok ? '#7dffc1' : '#ff9c9c';
      msg.textContent = r && r.ok ? (d.message || 'Signalement reçu.') : ('Signalement impossible : ' + (d.error || 'réessaie plus tard'));
      if (r && r.ok) overlay.querySelector('#rc-sig-ok').disabled = true;
    });

    // Charge initial + poll 8s
    const refresh = async () => {
      const thread = await fetchThread(opts);
      if (thread && thread.messages) renderMessages(myId, thread.messages);
      if (thread && thread.ferme) {
        const f = overlay.querySelector('#rc-ferme');
        f.hidden = false;
        f.textContent = '🔒 Conversation fermée : on ne peut plus écrire 3 jours après ' + (opts.api ? 'la livraison' : 'le trajet') + '. Tu peux encore la lire et la signaler.';
        const zone = overlay.querySelector('.rc-input');
        if (zone) zone.remove();
      }
      if (thread && thread.error) {
        const b = overlay.querySelector('.rc-body');
        if (b) b.innerHTML = '<div class="rc-err">' + escHtml(thread.error) + '</div>';
      }
    };
    await refresh();
    pollTimer = setInterval(refresh, 8000);
  }

  // Compteur global de messages non lus (pour badge nav)
  async function unreadCount() {
    const token = await getToken();
    if (!token) return { total: 0, threads: {} };
    try {
      const r = await fetch('/api/platform?endpoint=ride-message-unread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ endpoint: 'ride-message-unread' })
      });
      if (!r.ok) return { total: 0, threads: {} };
      return await r.json().catch(() => ({ total: 0, threads: {} }));
    } catch { return { total: 0, threads: {} }; }
  }

  window.RideChat = { open, close, unreadCount, livraisonApi };
})();
