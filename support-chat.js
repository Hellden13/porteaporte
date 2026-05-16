(function () {
  'use strict';

  /* ── BASE DE CONNAISSANCES PIA ─────────────────────────── */
  const KB = [
    // ── LIVRAISON ──
    {
      keys: ['publier','colis','envoyer','expediteur','poster','commande'],
      title: '📦 Publier un colis',
      response: 'Pour publier un colis :\n\n1. Clique sur "Commencer maintenant"\n2. Remplis : ville départ, arrivée, type d\'objet, description, budget\n3. Le système cherche des trajets compatibles\n4. Tu confirmes le livreur\n5. Suivi GPS en temps réel\n\n➡️ Prêt ? <a href="/index.html#cta" style="color:#B8F53E">Publier maintenant</a>'
    },
    {
      keys: ['trajet','proposer','livreur','conducteur','livrer','route','gagner'],
      title: '🚗 Proposer un trajet',
      response: 'Tu fais un trajet et tu veux contribuer ?\n\n1. Indique départ et destination\n2. Date et heure du trajet\n3. Type de véhicule\n4. Espace disponible\n\nLe système te propose des colis compatibles. Tu acceptes, ramasses, livres — et tu es payé !\n\n➡️ <a href="/livreur.html" style="color:#B8F53E">Devenir livreur</a>'
    },
    {
      keys: ['paiement','payer','prix','cout','tarif','argent','transaction','stripe'],
      title: '💳 Paiement',
      response: 'Paiement 100% sécurisé avec Stripe :\n\n✓ Argent retenu à la création\n✓ Aucun échange liquide\n✓ Confirmé après livraison\n✓ Zéro frais cachés\n\nTarifs typiques : 5–15$ selon la distance. Le calcul est transparent avant confirmation.'
    },
    {
      keys: ['suivi','tracking','ou est','statut','progression','gps','position'],
      title: '📍 Suivi en temps réel',
      response: 'Suis ton colis en direct !\n\nTu vois :\n✓ Statut (ramassé, en route, livré)\n✓ Position GPS du livreur\n✓ Étapes avec heures\n✓ Profil du livreur et ses notes\n✓ Notifications à chaque étape\n\n➡️ <a href="/gps-tracker.html" style="color:#B8F53E">Ouvrir le suivi</a>'
    },
    {
      keys: ['securite','verifie','verification','identite','confiance','arnaque','danger'],
      title: '🔒 Sécurité',
      response: 'La confiance est au cœur de PorteÀPorte :\n\n✓ Profils vérifiés (photo, courriel, téléphone)\n✓ Évaluations 1–5 étoiles\n✓ Suivi GPS intelligent\n✓ Preuve de ramassage et livraison\n✓ Paiement sécurisé Stripe\n\nProblème ? Garde tes preuves et contacte notre équipe.'
    },
    {
      keys: ['remboursement','rembourser','annuler','annulation','litige'],
      title: '↩️ Remboursement',
      response: 'En cas de problème :\n\n1. Ouvre un litige depuis ton tableau de bord\n2. Notre équipe examine sous 24–48h\n3. Remboursement via Stripe si approuvé\n\n📧 bonjour@porteaporte.site\n\nGarde toujours tes photos et screenshots comme preuves.'
    },

    // ── COVOITURAGE ──
    {
      keys: ['covoiturage','covoit','partage','trajet partage','passager','embarquer'],
      title: '🚗 Covoiturage',
      response: 'Le covoiturage PorteÀPorte permet de partager les frais d\'un trajet que tu fais déjà !\n\n✓ Légal au Québec (partage de frais, pas taxi)\n✓ Prix calculé automatiquement par km\n✓ Profils vérifiés\n✓ Adresses protégées jusqu\'à confirmation\n\n➡️ <a href="/covoiturage-info.html" style="color:#B8F53E">Tout savoir sur le covoiturage</a>\n➡️ <a href="/covoiturage.html" style="color:#B8F53E">Chercher un trajet</a>'
    },
    {
      keys: ['publier trajet','offrir trajet','je conduis','je fais le trajet'],
      title: '🚘 Publier un trajet covoiturage',
      response: 'Tu fais déjà ce trajet ? Partage tes frais !\n\n1. Connecte-toi à ton compte\n2. Clique "Publier un trajet"\n3. Indique départ, destination, date, places\n4. Fixe ton coût au km (max 0,50$/km)\n5. Les passagers réservent, tu économises\n\n➡️ <a href="/covoiturage-publier.html" style="color:#B8F53E">Publier maintenant</a>'
    },
    {
      keys: ['reserver','chercher place','trouver trajet','je veux voyager'],
      title: '🎫 Réserver une place',
      response: 'Trouver une place en covoiturage :\n\n1. Va sur la page de recherche\n2. Indique ville départ, arrivée, date\n3. Choisis un trajet selon horaire et prix\n4. Clique "Réserver" — le prix est calculé pour ta portion\n5. L\'adresse exacte s\'affiche après confirmation\n\n➡️ <a href="/covoiturage.html" style="color:#B8F53E">Chercher un trajet</a>'
    },
    {
      keys: ['prix covoiturage','combien covoiturage','tarif covoiturage','cout trajet'],
      title: '💰 Prix du covoiturage',
      response: 'Le prix est calculé automatiquement :\n\n📐 Formule :\nPrix de base = Distance totale × 0,35$/km\nTa part = Prix × (ta portion / trajet total)\n\n➕ Options :\n• Gros bagage : +5$\n• Animal : +8$\n• Arrêt supplémentaire : +3$\n• Frais plateforme : 10%\n\n🎉 Bonus groupe :\n• 2 passagers : −5% chacun\n• 3 passagers : −10% chacun\n• Auto pleine : −15% chacun\n\n➡️ <a href="/covoiturage-info.html" style="color:#B8F53E">Simuler mon prix</a>'
    },
    {
      keys: ['inscription covoiturage','creer profil covoiturage','m inscrire','sinscrire'],
      title: '✍️ Inscription covoiturage',
      response: 'Créer ton profil covoiturage en 4 étapes :\n\n1. Choisis ton rôle : conducteur, passager, ou les deux\n2. Remplis ton profil (prénom, courriel, téléphone, ville)\n3. Ajoute les détails de ton véhicule et tes préférences\n4. Accepte les règlements et crée ton compte\n\n🎁 À l\'inscription : badge 🌱 "Nouveau covoitureur" + 50 XP offerts !\n\n➡️ <a href="/covoiturage/inscription.html" style="color:#B8F53E">S\'inscrire maintenant</a>'
    },
    {
      keys: ['regles covoiturage','reglements covoiturage','legal','legal quebec','loi covoiturage'],
      title: '⚖️ Règlements covoiturage',
      response: 'Points essentiels :\n\n✓ Le conducteur fait le trajet pour lui-même\n✓ La contribution ne dépasse pas les frais réels\n✓ Ce n\'est pas du taxi — c\'est du partage de frais\n✓ Le conducteur garde son permis, assurance et responsabilité\n\n❌ Interdit :\n• Prix abusif\n• Trajet inventé juste pour passagers\n• Comportement dangereux\n\nSource : Éducaloi & Commission des transports du Québec\n\n➡️ <a href="/covoiturage/regles.html" style="color:#B8F53E">Règlement complet</a>'
    },
    {
      keys: ['dashboard covoiturage','mon covoiturage','tableau de bord covoiturage'],
      title: '📊 Tableau de bord covoiturage',
      response: 'Ton tableau de bord covoiturage regroupe :\n\n🚗 Conducteur : trajets publiés, réservations reçues, places restantes\n🎫 Passager : mes réservations, trajets à venir, historique\n🎯 Missions en cours avec barre de progression\n🏆 Badges obtenus et à débloquer\n⭐ Avis reçus\n📈 Niveau XP et progression\n\n➡️ <a href="/dashboard-covoiturage.html" style="color:#B8F53E">Ouvrir mon dashboard</a>'
    },

    // ── MISSIONS & BADGES & XP ──
    {
      keys: ['mission','missions','defi','defis','objectif'],
      title: '🎯 Missions',
      response: 'Voici quelques missions covoiturage :\n\n🚗 Premier trajet partagé → +50 XP\n🎯 Trajet complet (auto pleine) → +100 XP\n🌿 Éco-route (50km+ avec 2 pax) → +150 XP\n⏱️ Ponctualité (5 trajets sans retard) → +200 XP\n🤝 Aide communautaire → +180 XP\n⭐ Ambassadeur (10 trajets, note 4.8+) → +300 XP\n\nChaque mission complétée attribue un badge visible sur ton profil !\n\n➡️ <a href="/dashboard-covoiturage.html" style="color:#B8F53E">Voir mes missions</a>'
    },
    {
      keys: ['badge','badges','trophee'],
      title: '🏆 Badges',
      response: 'Les badges PorteÀPorte :\n\n🌱 Nouveau covoitureur\n✅ Conducteur vérifié\n🚗 Premier trajet utile\n🎯 Auto pleine\n🌿 Éco-route\n⭐ Ambassadeur PorteÀPorte\n🗺️ Connecteur régional\n❤️ Trajet solidaire\n🏆 Groupe optimisé\n🎖️ Capitaine régional\n\nChaque badge est visible sur ton profil et renforce ta réputation dans la communauté.\n\n➡️ <a href="/dashboard-covoiturage.html" style="color:#B8F53E">Voir mes badges</a>'
    },
    {
      keys: ['xp','experience','niveau','niveaux','progression','points'],
      title: '📈 XP et niveaux',
      response: 'Système de progression :\n\n🟢 Niveau 1 — Nouveau (0–199 XP)\n🔵 Niveau 2 — Fiable (200–499 XP)\n🟩 Niveau 3 — Habitué (500–999 XP)\n🟡 Niveau 4 — Ambassadeur (1000–1999 XP)\n⭐ Niveau 5 — Capitaine régional (2000+ XP)\n\nLes niveaux élevés donnent : meilleure visibilité, missions exclusives, accès gros trajets, support prioritaire.\n\n➡️ <a href="/dashboard-covoiturage.html" style="color:#B8F53E">Voir ma progression</a>'
    },
    {
      keys: ['bonus groupe','reduction groupe','auto pleine','economie groupe'],
      title: '🎉 Bonus de groupe',
      response: 'Plus vous êtes nombreux, moins chacun paie !\n\n👤 1 passager → prix normal\n👥 2 passagers → −5% chacun\n👥👥 3 passagers → −10% chacun\n🚗 Auto pleine → −15% chacun + badge "Auto pleine"\n\nLe bonus est calculé automatiquement. Il s\'applique sur la part de base de chaque passager.\n\nCe n\'est pas un profit conducteur — c\'est une optimisation collective !'
    },

    // ── COMPTE & COMMUNAUTÉ ──
    {
      keys: ['communaute','reward','recompense','tirage','organisme','entraide'],
      title: '❤️ Communauté',
      response: 'PorteÀPorte = communauté québécoise !\n\n🏆 Livreurs : bonus mensuels, badges, reconnaissance\n🎁 Tous : tirages mensuels, points fidélité\n❤️ Local : organismes soutenus, régions éloignées aidées\n🚗 Covoiturage : missions, badges, niveaux XP\n\nChaque trajet contribue à une mobilité plus humaine et abordable au Québec.'
    },
    {
      keys: ['compte','connexion','login','mot de passe','inscription','creer compte'],
      title: '👤 Compte',
      response: 'Gestion de ton compte :\n\n🔑 Connexion : <a href="/login.html" style="color:#B8F53E">login.html</a>\n✍️ Inscription livraison : <a href="/register.html" style="color:#B8F53E">register.html</a>\n✍️ Inscription covoiturage : <a href="/covoiturage/inscription.html" style="color:#B8F53E">inscription covoiturage</a>\n📊 Mon profil : depuis le tableau de bord\n\nMot de passe oublié ? Utilise le lien "Mot de passe oublié" sur la page de connexion.'
    },
    {
      keys: ['urgent','probleme','erreur','souci','aide','crise','bogue'],
      title: '🚨 Problème urgent',
      response: 'Je comprends, c\'est important !\n\nGarde ces preuves :\n✓ Screenshots des messages\n✓ Photos du colis\n✓ Code de livraison\n✓ Dates et heures exactes\n\nContacte notre équipe :\n📧 bonjour@porteaporte.site\n\nNous répondons sous 24h en jours ouvrables.'
    },
    {
      keys: ['contact','email','courriel','telephone','equipe'],
      title: '📧 Nous contacter',
      response: 'Notre équipe est là pour toi :\n\n📧 bonjour@porteaporte.site\n⏰ Réponse sous 24h (jours ouvrables)\n\nPour les urgences : décris clairement la situation et joins tes preuves (photos, screenshots, code de livraison).'
    }
  ];

  const SUGGESTIONS = [
    { label: '📦 Publier un colis', q: 'publier colis' },
    { label: '🚗 Covoiturage', q: 'covoiturage' },
    { label: '💰 Prix & tarifs', q: 'prix covoiturage' },
    { label: '🎯 Missions & badges', q: 'missions badges' },
    { label: '🔒 Sécurité', q: 'securite' },
    { label: '📧 Nous contacter', q: 'contact' },
  ];

  /* ── RECHERCHE ───────────────────────────────────────────── */
  function findResponse(msg) {
    const norm = msg.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let best = null, bestScore = 0;
    for (const entry of KB) {
      let score = 0;
      for (const k of entry.keys) {
        const kn = k.normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (norm.includes(kn)) score++;
      }
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return best;
  }

  /* ── WIDGET HTML ─────────────────────────────────────────── */
  function buildCSS() {
    const style = document.createElement('style');
    style.textContent = `
      #pia-btn {
        position:fixed;bottom:24px;right:24px;width:56px;height:56px;
        border-radius:50%;background:#B8F53E;color:#0A0F1E;border:none;
        cursor:pointer;font-size:24px;box-shadow:0 4px 20px rgba(0,0,0,.4);
        z-index:9998;display:flex;align-items:center;justify-content:center;
        transition:transform .2s,box-shadow .2s;
      }
      #pia-btn:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(184,245,62,.35);}
      #pia-btn .notif{position:absolute;top:0;right:0;width:14px;height:14px;
        background:#FF6B6B;border-radius:50%;border:2px solid #0A0F1E;display:none;}
      #pia-panel {
        position:fixed;bottom:90px;right:24px;width:min(360px,calc(100vw - 32px));
        height:min(540px,calc(100vh - 110px));
        background:#111827;border:1px solid #1E2A3A;border-radius:16px;
        box-shadow:0 24px 64px rgba(0,0,0,.6);z-index:9999;
        display:none;flex-direction:column;overflow:hidden;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      }
      #pia-panel.open{display:flex;}
      .pia-header{background:#0A0F1E;padding:14px 16px;display:flex;align-items:center;
        gap:10px;border-bottom:1px solid #1E2A3A;flex-shrink:0;}
      .pia-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#B8F53E,#00D9FF);
        display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
      .pia-name{font-weight:800;color:#E8EDF5;font-size:.95rem;}
      .pia-status{font-size:.72rem;color:#B8F53E;margin-top:1px;}
      .pia-close{margin-left:auto;background:none;border:none;color:#5A6A7A;
        cursor:pointer;font-size:20px;line-height:1;padding:4px;transition:color .15s;}
      .pia-close:hover{color:#E8EDF5;}
      .pia-messages{flex:1;overflow-y:auto;padding:16px;display:flex;
        flex-direction:column;gap:12px;scroll-behavior:smooth;}
      .pia-messages::-webkit-scrollbar{width:4px;}
      .pia-messages::-webkit-scrollbar-track{background:transparent;}
      .pia-messages::-webkit-scrollbar-thumb{background:#1E2A3A;border-radius:4px;}
      .pia-bubble{max-width:85%;padding:10px 13px;border-radius:12px;
        font-size:.85rem;line-height:1.55;animation:piaPop .2s ease;}
      @keyframes piaPop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      .pia-bubble.bot{background:#1A2235;color:#E8EDF5;border-bottom-left-radius:4px;align-self:flex-start;}
      .pia-bubble.user{background:#B8F53E;color:#0A0F1E;border-bottom-right-radius:4px;
        align-self:flex-end;font-weight:600;}
      .pia-bubble a{color:#B8F53E;}
      .pia-bubble.bot a{color:#00D9FF;}
      .pia-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}
      .pia-chip{background:#1E2A3A;border:1px solid #2A3A50;color:#A8B8C8;
        border-radius:20px;padding:5px 11px;font-size:.75rem;cursor:pointer;
        transition:all .15s;white-space:nowrap;}
      .pia-chip:hover{background:#B8F53E;color:#0A0F1E;border-color:#B8F53E;font-weight:700;}
      .pia-typing{display:flex;gap:4px;align-items:center;padding:10px 13px;
        background:#1A2235;border-radius:12px;border-bottom-left-radius:4px;
        align-self:flex-start;width:52px;}
      .pia-typing span{width:7px;height:7px;background:#5A6A7A;border-radius:50%;
        animation:piaTyping 1.2s infinite;}
      .pia-typing span:nth-child(2){animation-delay:.2s;}
      .pia-typing span:nth-child(3){animation-delay:.4s;}
      @keyframes piaTyping{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
      .pia-input-row{padding:10px 12px;border-top:1px solid #1E2A3A;display:flex;
        gap:8px;flex-shrink:0;background:#0D1524;}
      .pia-input{flex:1;background:#1A2235;border:1.5px solid #1E2A3A;border-radius:10px;
        padding:9px 12px;color:#E8EDF5;font-size:.85rem;outline:none;font-family:inherit;}
      .pia-input:focus{border-color:#B8F53E;}
      .pia-input::placeholder{color:#4A5A6A;}
      .pia-send{background:#B8F53E;color:#0A0F1E;border:none;border-radius:10px;
        padding:9px 14px;cursor:pointer;font-weight:800;font-size:.9rem;transition:opacity .15s;}
      .pia-send:hover{opacity:.9;}
      .pia-branding{text-align:center;font-size:.7rem;color:#3A4A5A;
        padding:6px 0 2px;flex-shrink:0;}
    `;
    document.head.appendChild(style);
  }

  function buildWidget() {
    // Bouton
    const btn = document.createElement('button');
    btn.id = 'pia-btn';
    btn.innerHTML = '💬<span class="notif" id="pia-notif"></span>';
    btn.title = 'Parler à Pia — Support PorteÀPorte';

    // Panel
    const panel = document.createElement('div');
    panel.id = 'pia-panel';
    panel.innerHTML = `
      <div class="pia-header">
        <div class="pia-avatar">🤖</div>
        <div>
          <div class="pia-name">Pia</div>
          <div class="pia-status">● En ligne — Support PorteÀPorte</div>
        </div>
        <button class="pia-close" id="pia-close" title="Fermer">✕</button>
      </div>
      <div class="pia-messages" id="pia-messages"></div>
      <div class="pia-input-row">
        <input class="pia-input" id="pia-input" placeholder="Pose ta question à Pia…" autocomplete="off" maxlength="200">
        <button class="pia-send" id="pia-send">➤</button>
      </div>
      <div class="pia-branding">PorteÀPorte · Pia v2</div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // Événements
    btn.addEventListener('click', toggle);
    document.getElementById('pia-close').addEventListener('click', close);
    document.getElementById('pia-send').addEventListener('click', sendMessage);
    document.getElementById('pia-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  /* ── ÉTAT ───────────────────────────────────────────────── */
  let isOpen = false;
  let hasOpened = false;

  function toggle() { isOpen ? close() : open(); }

  function open() {
    isOpen = true;
    document.getElementById('pia-panel').classList.add('open');
    document.getElementById('pia-notif').style.display = 'none';
    document.getElementById('pia-btn').innerHTML = '✕<span class="notif" id="pia-notif"></span>';
    if (!hasOpened) { hasOpened = true; greet(); }
    setTimeout(() => document.getElementById('pia-input').focus(), 200);
  }

  function close() {
    isOpen = false;
    document.getElementById('pia-panel').classList.remove('open');
    document.getElementById('pia-btn').innerHTML = '💬<span class="notif" id="pia-notif"></span>';
  }

  /* ── MESSAGES ───────────────────────────────────────────── */
  function addBubble(html, type = 'bot') {
    const div = document.createElement('div');
    div.className = 'pia-bubble ' + type;
    div.innerHTML = html.replace(/\n/g, '<br>');
    document.getElementById('pia-messages').appendChild(div);
    scrollBottom();
    return div;
  }

  function addTyping() {
    const t = document.createElement('div');
    t.className = 'pia-typing';
    t.id = 'pia-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    document.getElementById('pia-messages').appendChild(t);
    scrollBottom();
  }

  function removeTyping() {
    const t = document.getElementById('pia-typing');
    if (t) t.remove();
  }

  function scrollBottom() {
    const m = document.getElementById('pia-messages');
    m.scrollTop = m.scrollHeight;
  }

  function greet() {
    setTimeout(() => {
      addTyping();
      setTimeout(() => {
        removeTyping();
        addBubble('Salut ! 👋 Je suis <strong>Pia</strong>, l\'assistante de PorteÀPorte.<br><br>Je peux t\'aider avec :<br>📦 Livraisons · 🚗 Covoiturage · 💰 Prix · 🎯 Missions · 🔒 Sécurité<br><br>Comment puis-je t\'aider ?');
        addSuggestions();
      }, 800);
    }, 300);
  }

  function addSuggestions() {
    const wrap = document.createElement('div');
    wrap.className = 'pia-bubble bot';
    wrap.style.background = 'transparent';
    wrap.style.padding = '0';
    const chips = document.createElement('div');
    chips.className = 'pia-suggestions';
    SUGGESTIONS.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'pia-chip';
      chip.textContent = s.label;
      chip.addEventListener('click', () => {
        chips.parentElement.remove();
        handleInput(s.q);
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    document.getElementById('pia-messages').appendChild(wrap);
    scrollBottom();
  }

  function sendMessage() {
    const input = document.getElementById('pia-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    handleInput(msg);
  }

  function handleInput(msg) {
    addBubble(escHtml(msg), 'user');
    addTyping();

    setTimeout(() => {
      removeTyping();
      const entry = findResponse(msg);
      if (entry) {
        addBubble('<strong>' + entry.title + '</strong><br><br>' + entry.response);
      } else {
        addBubble('Je n\'ai pas trouvé de réponse précise à ça. 🤔<br><br>Essaie une de ces questions ou contacte notre équipe :<br>📧 <a href="mailto:bonjour@porteaporte.site">bonjour@porteaporte.site</a>');
        addSuggestions();
      }
    }, 600 + Math.random() * 400);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── INIT ────────────────────────────────────────────────── */
  function init() {
    buildCSS();
    buildWidget();
    // Notif d'accueil après 4s
    setTimeout(() => {
      if (!isOpen) {
        const n = document.getElementById('pia-notif');
        if (n) n.style.display = 'block';
      }
    }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
