/* ================================================================
   PorteàPorte — Support IA Widget
   Injecter via : <script src="/js/support-widget.js"></script>
   ================================================================ */

(function () {
  'use strict';

  const WIDGET_ID = 'pap-support-widget';
  if (document.getElementById(WIDGET_ID)) return; // already loaded

  /* ---- Knowledge base ---- */
  const KB = [
    {
      patterns: ['livraison', 'colis', 'envoyer', 'expédier', 'envoyer un colis'],
      answer: 'Pour envoyer un colis, connecte-toi et clique sur **Publier une livraison**. Tu renseignes le trajet, le poids, le type de colis et le prix que tu proposes. Un livreur qui passe dans la bonne direction acceptera ta mission.'
    },
    {
      patterns: ['livreur', 'devenir livreur', 'gagner', 'revenu', 'argent'],
      answer: 'Pour devenir livreur, crée un compte, choisis le rôle **Livreur** et complète ta vérification (KYC). Une fois vérifié, tu peux accepter des missions compatibles avec ton trajet et ton mode de transport. Tu gardes **60% du prix** de chaque livraison.'
    },
    {
      patterns: ['prix', 'tarif', 'combien', 'coût', 'cout', 'frais'],
      answer: 'Le prix est fixé par l\'expéditeur. PorteàPorte prend **12%** de commission, **5%** va à une cause solidaire de ton choix, et **60%** va au livreur. C\'est en moyenne **2 à 3× moins cher** qu\'UPS ou FedEx pour des livraisons locales.'
    },
    {
      patterns: ['paiement', 'payer', 'stripe', 'remboursement', 'escrow'],
      answer: 'Le paiement est sécurisé via **Stripe**. L\'argent est mis en escrow au moment de la publication. Il est libéré au livreur uniquement après confirmation de livraison par l\'expéditeur. En cas de problème, le remboursement est automatique.'
    },
    {
      patterns: ['assurance', 'colis perdu', 'bris', 'dommage', 'responsabilité'],
      answer: 'Chaque livraison inclut une **couverture de base**. Pour les colis de valeur, une assurance complémentaire est disponible au moment de la publication. Consulte la page [Assurance](/assurance.html) pour les détails complets.'
    },
    {
      patterns: ['suivi', 'tracker', 'gps', 'où est', 'ou est', 'position'],
      answer: 'Le suivi GPS est disponible en temps réel depuis ton dashboard. Le livreur active le tracking au départ, et tu peux voir sa position sur la carte. Tu reçois aussi une notification à la livraison.'
    },
    {
      patterns: ['vérification', 'verification', 'kyc', 'identité', 'identite', 'documents'],
      answer: 'La vérification d\'identité (KYC) est obligatoire pour les livreurs. Tu soumets une pièce d\'identité + un selfie. Notre équipe examine le dossier sous **24–48h**. Une fois vérifié, tu peux accepter des missions indéfiniment.'
    },
    {
      patterns: ['annuler', 'annulation', 'cancel'],
      answer: 'L\'expéditeur peut annuler une mission **avant qu\'un livreur ne l\'accepte** sans frais. Après acceptation, des frais d\'annulation s\'appliquent. Le livreur peut décliner avant de se mettre en route. Contacte le support si tu as un cas particulier.'
    },
    {
      patterns: ['inscription', 'créer un compte', 'creer', 'signup', 'register'],
      answer: 'L\'inscription est gratuite ! Clique sur **Commencer** depuis la page d\'accueil, choisis Email/Téléphone/Google, puis sélectionne ton rôle (expéditeur ou livreur). Tout le processus prend moins de 2 minutes.'
    },
    {
      patterns: ['connexion', 'login', 'mot de passe', 'oublié', 'oublie'],
      answer: 'Si tu as oublié ton mot de passe, clique sur **Connexion** puis **Mot de passe oublié**. Un email de réinitialisation te sera envoyé. Tu peux aussi te connecter avec ton numéro de téléphone (SMS OTP) ou avec Google.'
    },
    {
      patterns: ['vélo', 'velo', 'distance', 'poids max', 'transport', 'compatible'],
      answer: 'Le système de matching filtre automatiquement les missions selon ton mode de transport. Un livreur à vélo ne voit que les missions légères et courtes. En voiture ou camionnette, tu accèdes à des colis plus lourds et des distances plus longues.'
    },
    {
      patterns: ['contact', 'support', 'aide', 'problème', 'probleme', 'bug', 'erreur'],
      answer: 'Pour toute demande urgente, écris-nous à **support@porteaporte.site**. Pour les questions générales, consulte cette page ! Si tu as un problème technique, décris-le ici et je t\'aide à le résoudre.'
    },
    {
      patterns: ['solidaire', 'cause', 'don', 'organisation', 'orga'],
      answer: '5% de chaque livraison va à une **cause solidaire** choisie par l\'expéditeur (banque alimentaire, environnement, aide aux personnes âgées, etc.). Tu peux voir le total de tes contributions dans ton dashboard expéditeur.'
    },
    {
      patterns: ['bonjour', 'salut', 'allô', 'allo', 'hi', 'hello'],
      answer: 'Bonjour ! 👋 Je suis l\'assistant PorteàPorte. Je peux t\'aider avec les livraisons, les paiements, la vérification de compte, le suivi, et bien plus. Qu\'est-ce que je peux faire pour toi ?'
    }
  ];

  const FALLBACK = "Je n'ai pas trouvé de réponse précise à ta question. Pour une aide personnalisée, écris-nous à **support@porteaporte.site** ou consulte la [FAQ](/faq.html). 😊";

  function findAnswer(text) {
    const q = text.toLowerCase();
    for (const entry of KB) {
      if (entry.patterns.some(p => q.includes(p))) return entry.answer;
    }
    return FALLBACK;
  }

  /* ---- Markdown-lite renderer ---- */
  function renderMd(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--brand-cyan,#00D9FF)">$1</a>')
      .replace(/\n/g, '<br>');
  }

  /* ---- Styles ---- */
  const style = document.createElement('style');
  style.textContent = `
    #pap-support-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #pap-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 9998;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg,#00FF9F,#00D9FF);
      border: none; cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,217,255,0.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; transition: transform .2s, box-shadow .2s;
    }
    #pap-fab:hover { transform: scale(1.1); box-shadow: 0 6px 32px rgba(0,217,255,0.6); }
    #pap-fab .pap-badge {
      position: absolute; top: -4px; right: -4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #EF4444; color: #fff;
      font-size: 11px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      display: none;
    }
    #pap-chat-box {
      position: fixed; bottom: 90px; right: 24px; z-index: 9999;
      width: 340px; max-height: 520px;
      background: #111318; border: 1px solid #1F2937; border-radius: 16px;
      box-shadow: 0 16px 56px rgba(0,0,0,0.6);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.95) translateY(10px); opacity: 0;
      pointer-events: none;
      transition: transform .22s ease, opacity .22s ease;
    }
    #pap-chat-box.open {
      transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
    }
    .pap-chat-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      background: #0A0C10;
      border-bottom: 1px solid #1F2937;
      flex-shrink: 0;
    }
    .pap-chat-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg,#00FF9F,#00D9FF);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
    }
    .pap-chat-title { flex: 1; }
    .pap-chat-title strong { display: block; font-size: 0.88rem; color: #F0F2F5; }
    .pap-chat-title span { font-size: 0.72rem; color: #00FF9F; }
    .pap-chat-close {
      background: transparent; border: none; color: #A8ACB1;
      font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;
      transition: color .15s;
    }
    .pap-chat-close:hover { color: #F0F2F5; }
    .pap-messages {
      flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px;
    }
    .pap-messages::-webkit-scrollbar { width: 3px; }
    .pap-messages::-webkit-scrollbar-thumb { background: #1F2937; }
    .pap-msg { display: flex; flex-direction: column; gap: 2px; }
    .pap-msg.bot { align-items: flex-start; }
    .pap-msg.user { align-items: flex-end; }
    .pap-bubble {
      max-width: 85%; padding: 9px 13px; border-radius: 14px;
      font-size: 0.83rem; line-height: 1.55;
    }
    .pap-msg.bot .pap-bubble {
      background: #1A1F28; border: 1px solid #1F2937; color: #F0F2F5;
      border-bottom-left-radius: 4px;
    }
    .pap-msg.user .pap-bubble {
      background: linear-gradient(135deg,rgba(0,255,159,.2),rgba(0,217,255,.16));
      border: 1px solid rgba(0,255,159,.28); color: #F0F2F5;
      border-bottom-right-radius: 4px;
    }
    .pap-typing { display: flex; gap: 4px; padding: 9px 13px; background: #1A1F28; border: 1px solid #1F2937; border-radius: 14px; border-bottom-left-radius: 4px; width: fit-content; }
    .pap-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: #A8ACB1; animation: papType 1.2s ease-in-out infinite; }
    .pap-typing-dot:nth-child(2){animation-delay:.2s} .pap-typing-dot:nth-child(3){animation-delay:.4s}
    @keyframes papType { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
    .pap-quick-replies { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
    .pap-qr {
      padding: 5px 10px; border: 1px solid #1F2937; border-radius: 999px;
      background: transparent; color: #A8ACB1; font-size: 0.72rem; font-weight: 700;
      cursor: pointer; transition: all .15s;
    }
    .pap-qr:hover { border-color: #00D9FF; color: #00D9FF; }
    .pap-input-row {
      display: flex; gap: 8px; padding: 12px 14px;
      border-top: 1px solid #1F2937; background: #0A0C10; flex-shrink: 0;
    }
    .pap-input {
      flex: 1; padding: 9px 12px;
      background: #1A1F28; border: 1px solid #1F2937; border-radius: 8px;
      color: #F0F2F5; font-size: 13px; outline: none; font-family: inherit;
      transition: border-color .2s;
    }
    .pap-input:focus { border-color: #00D9FF; }
    .pap-input::placeholder { color: #A8ACB1; }
    .pap-send {
      width: 36px; height: 36px; border-radius: 8px; border: none;
      background: linear-gradient(135deg,#00FF9F,#00D9FF);
      color: #0A0C10; font-size: 15px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity .2s; flex-shrink: 0;
    }
    .pap-send:hover { opacity: .85; }
    @media (max-width: 480px) {
      #pap-chat-box { width: calc(100vw - 32px); right: 16px; bottom: 80px; }
      #pap-fab { right: 16px; bottom: 16px; }
    }
  `;
  document.head.appendChild(style);

  /* ---- HTML ---- */
  const wrap = document.createElement('div');
  wrap.id = WIDGET_ID;
  wrap.innerHTML = `
    <button id="pap-fab" aria-label="Ouvrir le support PorteàPorte">
      💬
      <span class="pap-badge" id="pap-badge">1</span>
    </button>

    <div id="pap-chat-box" role="dialog" aria-label="Support PorteàPorte">
      <div class="pap-chat-header">
        <div class="pap-chat-avatar">🤖</div>
        <div class="pap-chat-title">
          <strong>Assistant PorteàPorte</strong>
          <span>● En ligne 24/7</span>
        </div>
        <button class="pap-chat-close" id="pap-close" aria-label="Fermer">✕</button>
      </div>

      <div class="pap-messages" id="pap-messages"></div>

      <div class="pap-quick-replies" id="pap-qr-row">
        <button class="pap-qr" onclick="papAsk('Comment envoyer un colis ?')">📦 Envoyer un colis</button>
        <button class="pap-qr" onclick="papAsk('Comment devenir livreur ?')">🚴 Devenir livreur</button>
        <button class="pap-qr" onclick="papAsk('Comment fonctionne le paiement ?')">💳 Paiement</button>
        <button class="pap-qr" onclick="papAsk('Comment fonctionne le suivi GPS ?')">📍 Suivi GPS</button>
        <button class="pap-qr" onclick="papAsk('Contacter le support')">📧 Contact</button>
      </div>

      <div class="pap-input-row">
        <input class="pap-input" id="pap-input" type="text" placeholder="Pose ta question…" autocomplete="off">
        <button class="pap-send" id="pap-send" aria-label="Envoyer">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  /* ---- State ---- */
  let isOpen = false;
  let msgCount = 0;

  const fab = document.getElementById('pap-fab');
  const chatBox = document.getElementById('pap-chat-box');
  const msgContainer = document.getElementById('pap-messages');
  const input = document.getElementById('pap-input');
  const badge = document.getElementById('pap-badge');

  /* ---- Open / close ---- */
  fab.addEventListener('click', toggle);
  document.getElementById('pap-close').addEventListener('click', close);

  function toggle() { isOpen ? close() : open(); }

  function open() {
    isOpen = true;
    chatBox.classList.add('open');
    fab.textContent = '✕';
    badge.style.display = 'none';
    if (msgCount === 0) {
      setTimeout(() => {
        addBotMsg('Bonjour ! 👋 Je suis l\'assistant PorteàPorte. Comment puis-je t\'aider aujourd\'hui ?');
      }, 300);
    }
    setTimeout(() => input.focus(), 400);
  }

  function close() {
    isOpen = false;
    chatBox.classList.remove('open');
    fab.textContent = '💬';
  }

  /* ---- Send ---- */
  document.getElementById('pap-send').addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

  function sendMsg() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    papAsk(text);
  }

  window.papAsk = function(text) {
    addUserMsg(text);
    showTyping();
    setTimeout(() => {
      hideTyping();
      addBotMsg(findAnswer(text));
    }, 700 + Math.random() * 500);
    if (!isOpen) {
      badge.style.display = 'flex';
      badge.textContent = '1';
    }
  };

  /* ---- Messages ---- */
  function addUserMsg(text) {
    msgCount++;
    const el = document.createElement('div');
    el.className = 'pap-msg user';
    el.innerHTML = `<div class="pap-bubble">${escHtml(text)}</div>`;
    msgContainer.appendChild(el);
    scrollBottom();
  }

  function addBotMsg(md) {
    msgCount++;
    const el = document.createElement('div');
    el.className = 'pap-msg bot';
    el.innerHTML = `<div class="pap-bubble">${renderMd(md)}</div>`;
    msgContainer.appendChild(el);
    scrollBottom();
  }

  let typingEl = null;
  function showTyping() {
    typingEl = document.createElement('div');
    typingEl.className = 'pap-msg bot';
    typingEl.innerHTML = `<div class="pap-typing"><div class="pap-typing-dot"></div><div class="pap-typing-dot"></div><div class="pap-typing-dot"></div></div>`;
    msgContainer.appendChild(typingEl);
    scrollBottom();
  }
  function hideTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }

  function scrollBottom() { msgContainer.scrollTop = msgContainer.scrollHeight; }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ---- Show badge after 4s if page is active ---- */
  setTimeout(() => {
    if (!isOpen) {
      badge.style.display = 'flex';
      badge.textContent = '1';
    }
  }, 4000);

})();
