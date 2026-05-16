/* ================================================================
   PorteàPorte — Portia support widget
   Injecter via : <script src="/js/support-widget.js"></script>
   ================================================================ */

(function () {
  'use strict';

  const WIDGET_ID = 'pap-support-widget';
  if (document.getElementById(WIDGET_ID)) return;

  const KB = [
    {
      patterns: ['livraison', 'colis', 'envoyer', 'expédier', 'expedier', 'créer livraison', 'creer livraison'],
      answer: 'Pour envoyer un colis, connecte-toi comme expéditeur, ouvre **Créer une livraison**, indique les villes, adresses, poids, valeur déclarée et prix proposé. Ensuite tu passes au paiement sécurisé avant publication.'
    },
    {
      patterns: ['livreur', 'devenir livreur', 'gagner', 'revenu', 'vérification livreur', 'verification livreur'],
      answer: 'Pour devenir livreur, crée un compte, choisis le rôle **Livreur** et complète ta vérification. Un livreur non vérifié ne doit pas voir les vrais colis ni les informations sensibles. Une fois vérifié, tu vois seulement les missions compatibles avec ton mode de transport et ta zone.'
    },
    {
      patterns: ['prix', 'tarif', 'combien', 'coût', 'cout', 'frais'],
      answer: 'Le prix est proposé par l\'expéditeur. La plateforme garde une part minimale pour opérer le service, une part peut aller aux bonus, à la sécurité et à l\'impact communautaire, puis le livreur reçoit sa part après confirmation de livraison.'
    },
    {
      patterns: ['paiement', 'payer', 'stripe', 'remboursement', 'escrow', 'capture'],
      answer: 'Le paiement est protégé avec **Stripe**. L\'argent est autorisé au moment de la publication et le livreur est payé seulement après confirmation de réception ou résolution du dossier. En cas d\'annulation ou de litige, la demande est analysée selon l\'état réel de la livraison.'
    },
    {
      patterns: ['assurance', 'protection', 'colis perdu', 'bris', 'dommage', 'responsabilité', 'responsabilite', 'couverture'],
      answer: 'La protection livraison est optionnelle. Sans protection payée, aucune couverture contractuelle ne s\'applique. Plans : **0 $ aucune couverture**, **Base 1 $ max 50 $**, **Standard 2,99 $ max 250 $**, **Plus 5,99 $ max 1 000 $**. La couverture reste limitée à la valeur déclarée.'
    },
    {
      patterns: ['suivi', 'tracker', 'gps', 'où est', 'ou est', 'position', 'temps réel', 'temps reel'],
      answer: 'Le suivi GPS sert au suivi en direct quand une livraison est assignée et en cours. Le GPS, les photos, messages et l\'historique peuvent aussi servir de preuves en cas de litige.'
    },
    {
      patterns: ['vérification', 'verification', 'kyc', 'identité', 'identite', 'documents', 'permis', 'carte livreur'],
      answer: 'La vérification livreur confirme l\'identité et le sérieux du compte. Selon le mode de transport, on peut demander une pièce d\'identité, photo, téléphone, ville, consentement et informations utiles. Le permis est surtout logique pour voiture ou camionnette, pas pour marche ou vélo.'
    },
    {
      patterns: ['annuler', 'annulation', 'cancel'],
      answer: 'L\'annulation dépend de l\'état de la livraison. Avant assignation, c\'est plus simple. Après acceptation ou départ, des règles peuvent s\'appliquer. Les remboursements sont reliés à Stripe, aux preuves et au statut réel de la mission.'
    },
    {
      patterns: ['inscription', 'créer un compte', 'creer', 'signup', 'register', 'email confirmation', 'confirmation email'],
      answer: 'L\'inscription est gratuite. Après création du compte, vérifie ton email. Si tu ne vois rien, regarde aussi les courriels indésirables. Pour devenir livreur actif, la vérification doit ensuite être approuvée.'
    },
    {
      patterns: ['connexion', 'login', 'mot de passe', 'oublié', 'oublie'],
      answer: 'Pour te connecter, utilise la page **Connexion**. Si ton email de confirmation ou de réinitialisation n\'arrive pas, vérifie les indésirables et assure-toi d\'utiliser la bonne adresse.'
    },
    {
      patterns: ['vélo', 'velo', 'marche', 'pied', 'distance', 'poids max', 'transport', 'compatible'],
      answer: 'Les missions doivent rester réalistes : à pied, seulement très proche et léger; à vélo, léger et local; en voiture, distances et colis plus importants; camionnette pour gros volumes. Le but est d\'éviter qu\'un livreur voie des missions impossibles ou trop loin.'
    },
    {
      patterns: ['contact', 'support', 'aide', 'problème', 'probleme', 'bug', 'erreur'],
      answer: 'Pour une urgence ou un problème que Portia ne règle pas, écris à **support@porteaporte.site**. Décris la page, le bouton utilisé, le message d\'erreur et ton rôle : expéditeur, livreur ou admin.'
    },
    {
      patterns: ['solidaire', 'cause', 'don', 'organisation', 'organisme', 'impact', 'transparence', 'humanitaire'],
      answer: 'La page **Transparence** montre l\'impact communautaire : organismes actifs, montants estimés, répartition décidée par l\'admin et demandes d\'organismes. L\'objectif : prendre le minimum, redonner le maximum.'
    },
    {
      patterns: ['portecoins', 'porte coins', 'points', 'mission bonus', 'missions bonus', 'tirage', 'tirages', 'lot'],
      answer: '**PorteCoins** est un système de points interne, sans valeur monétaire et non retirable. Ils servent à participer aux tirages, débloquer des badges et suivre ta progression. Exemple : 10 PorteCoins = 1 participation à un tirage mensuel.'
    },
    {
      patterns: ['admin', 'dashboard admin', 'organisme accepte', 'demande organisme'],
      answer: 'Le dashboard admin permet de gérer les livreurs, livraisons, organismes d\'impact, demandes reçues, missions bonus, PorteCoins et tirages. Ces fonctions doivent rester réservées aux admins connectés.'
    },
    {
      patterns: ['litige', 'preuve', 'photos', 'message', 'perdu', 'endommagé', 'endommage'],
      answer: 'En cas de litige, les preuves importantes sont : photos, GPS, messages, historique de livraison, valeur déclarée, plan de protection choisi et statut Stripe. Ne confirme jamais une réception si tu n\'as pas vraiment reçu le colis.'
    },
    {
      patterns: ['bonjour', 'salut', 'allô', 'allo', 'hi', 'hello', 'portia'],
      answer: 'Bonjour ! Je suis **Portia**, l\'assistante PorteàPorte. Je peux t\'aider avec les livraisons, paiements escrow, vérification livreur, GPS, protection, PorteCoins, tirages, impact communautaire et support.'
    }
  ];

  const FALLBACK = "Je n'ai pas trouvé de réponse précise. Je suis **Portia** : je peux aider avec livraison, paiement escrow, vérification livreur, GPS, protection, PorteCoins, tirages et impact. Pour une aide humaine, écris à **support@porteaporte.site** ou consulte la [FAQ](/faq.html).";

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function findAnswer(text) {
    const q = normalize(text);
    for (const entry of KB) {
      if (entry.patterns.some(p => q.includes(normalize(p)))) return entry.answer;
    }
    return FALLBACK;
  }

  function renderMd(text) {
    return escHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--brand-cyan,#00D9FF)">$1</a>')
      .replace(/\n/g, '<br>');
  }

  const style = document.createElement('style');
  style.textContent = `
    #pap-support-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #pap-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 9998;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg,#B8F53E,#00D9FF);
      border: none; cursor: pointer; color:#0A0C10;
      box-shadow: 0 4px 24px rgba(0,217,255,0.35);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 900; transition: transform .2s, box-shadow .2s;
    }
    #pap-fab:hover { transform: scale(1.06); box-shadow: 0 6px 32px rgba(0,217,255,0.55); }
    #pap-fab .pap-badge {
      position: absolute; top: -4px; right: -4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #EF4444; color: #fff;
      font-size: 11px; font-weight: 800;
      display: none; align-items: center; justify-content: center;
    }
    #pap-chat-box {
      position: fixed; bottom: 90px; right: 24px; z-index: 9999;
      width: 360px; max-height: 560px;
      background: #111318; border: 1px solid #1F2937; border-radius: 16px;
      box-shadow: 0 16px 56px rgba(0,0,0,0.6);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.95) translateY(10px); opacity: 0;
      pointer-events: none;
      transition: transform .22s ease, opacity .22s ease;
    }
    #pap-chat-box.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }
    .pap-chat-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; background: #0A0C10;
      border-bottom: 1px solid #1F2937; flex-shrink: 0;
    }
    .pap-chat-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg,#B8F53E,#00D9FF);
      display: flex; align-items: center; justify-content: center;
      color:#0A0C10; font-size: 14px; font-weight: 950; flex-shrink: 0;
    }
    .pap-chat-title { flex: 1; }
    .pap-chat-title strong { display: block; font-size: 0.9rem; color: #F0F2F5; }
    .pap-chat-title span { font-size: 0.72rem; color: #B8F53E; }
    .pap-chat-close {
      background: transparent; border: none; color: #A8ACB1;
      font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;
    }
    .pap-chat-close:hover { color: #F0F2F5; }
    .pap-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .pap-messages::-webkit-scrollbar { width: 3px; }
    .pap-messages::-webkit-scrollbar-thumb { background: #1F2937; }
    .pap-msg { display: flex; flex-direction: column; gap: 2px; }
    .pap-msg.bot { align-items: flex-start; }
    .pap-msg.user { align-items: flex-end; }
    .pap-bubble {
      max-width: 88%; padding: 10px 13px; border-radius: 14px;
      font-size: 0.84rem; line-height: 1.55;
    }
    .pap-msg.bot .pap-bubble {
      background: #1A1F28; border: 1px solid #1F2937; color: #F0F2F5;
      border-bottom-left-radius: 4px;
    }
    .pap-msg.user .pap-bubble {
      background: linear-gradient(135deg,rgba(184,245,62,.18),rgba(0,217,255,.16));
      border: 1px solid rgba(184,245,62,.26); color: #F0F2F5;
      border-bottom-right-radius: 4px;
    }
    .pap-typing { display: flex; gap: 4px; padding: 9px 13px; background: #1A1F28; border: 1px solid #1F2937; border-radius: 14px; border-bottom-left-radius: 4px; width: fit-content; }
    .pap-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: #A8ACB1; animation: papType 1.2s ease-in-out infinite; }
    .pap-typing-dot:nth-child(2){animation-delay:.2s} .pap-typing-dot:nth-child(3){animation-delay:.4s}
    @keyframes papType { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
    .pap-quick-replies { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
    .pap-qr {
      padding: 6px 10px; border: 1px solid #1F2937; border-radius: 999px;
      background: transparent; color: #A8ACB1; font-size: 0.72rem; font-weight: 750;
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
    }
    .pap-input:focus { border-color: #00D9FF; }
    .pap-input::placeholder { color: #A8ACB1; }
    .pap-send {
      width: 38px; height: 38px; border-radius: 8px; border: none;
      background: linear-gradient(135deg,#B8F53E,#00D9FF);
      color: #0A0C10; font-size: 15px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity .2s; flex-shrink: 0; font-weight: 900;
    }
    .pap-send:hover { opacity: .85; }
    @media (max-width: 480px) {
      #pap-chat-box { width: calc(100vw - 32px); right: 16px; bottom: 80px; }
      #pap-fab { right: 16px; bottom: 16px; }
    }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = WIDGET_ID;
  wrap.innerHTML = `
    <button id="pap-fab" aria-label="Ouvrir Portia, l'aide PorteàPorte">
      P
      <span class="pap-badge" id="pap-badge">1</span>
    </button>

    <div id="pap-chat-box" role="dialog" aria-label="Portia, aide PorteàPorte">
      <div class="pap-chat-header">
        <div class="pap-chat-avatar">P</div>
        <div class="pap-chat-title">
          <strong>Portia</strong>
          <span>Assistance PorteàPorte 24/7</span>
        </div>
        <button class="pap-chat-close" id="pap-close" aria-label="Fermer">×</button>
      </div>

      <div class="pap-messages" id="pap-messages"></div>

      <div class="pap-quick-replies" id="pap-qr-row">
        <button class="pap-qr" onclick="papAsk('Comment envoyer un colis ?')">Envoyer un colis</button>
        <button class="pap-qr" onclick="papAsk('Comment devenir livreur ?')">Devenir livreur</button>
        <button class="pap-qr" onclick="papAsk('Comment fonctionne le paiement escrow ?')">Paiement escrow</button>
        <button class="pap-qr" onclick="papAsk('Protection livraison')">Protection</button>
        <button class="pap-qr" onclick="papAsk('PorteCoins et tirages')">PorteCoins</button>
        <button class="pap-qr" onclick="papAsk('Impact communautaire')">Impact</button>
      </div>

      <div class="pap-input-row">
        <input class="pap-input" id="pap-input" type="text" placeholder="Pose ta question à Portia..." autocomplete="off">
        <button class="pap-send" id="pap-send" aria-label="Envoyer">➜</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  let isOpen = false;
  let msgCount = 0;

  const fab = document.getElementById('pap-fab');
  const chatBox = document.getElementById('pap-chat-box');
  const msgContainer = document.getElementById('pap-messages');
  const input = document.getElementById('pap-input');
  const badge = document.getElementById('pap-badge');

  fab.addEventListener('click', toggle);
  document.getElementById('pap-close').addEventListener('click', close);
  document.getElementById('pap-send').addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

  function toggle() { isOpen ? close() : open(); }

  function open() {
    isOpen = true;
    chatBox.classList.add('open');
    fab.textContent = '×';
    badge.style.display = 'none';
    if (msgCount === 0) {
      setTimeout(() => {
        addBotMsg('Bonjour ! Je suis **Portia**, ton aide PorteàPorte. Je peux répondre sur les livraisons, paiements, vérifications, GPS, PorteCoins, tirages et impact communautaire.');
      }, 250);
    }
    setTimeout(() => input.focus(), 350);
  }

  function close() {
    isOpen = false;
    chatBox.classList.remove('open');
    fab.textContent = 'P';
  }

  function sendMsg() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    window.papAsk(text);
  }

  window.papAsk = function(text) {
    addUserMsg(text);
    showTyping();
    setTimeout(() => {
      hideTyping();
      addBotMsg(findAnswer(text));
    }, 650);
    if (!isOpen) {
      badge.style.display = 'flex';
      badge.textContent = '1';
    }
  };

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
    typingEl.innerHTML = '<div class="pap-typing"><div class="pap-typing-dot"></div><div class="pap-typing-dot"></div><div class="pap-typing-dot"></div></div>';
    msgContainer.appendChild(typingEl);
    scrollBottom();
  }

  function hideTyping() {
    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  function scrollBottom() {
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  setTimeout(() => {
    if (!isOpen) {
      badge.style.display = 'flex';
      badge.textContent = '1';
    }
  }, 4000);
})();
