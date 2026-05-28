/* PorteaPorte - Pia guide widget
   Pia aide les nouveaux visiteurs a trouver le bon chemin sans cacher la plateforme complete.
*/

if (!window.__PIA_LOADED__) {
  window.__PIA_LOADED__ = true;

  (function () {
    'use strict';

    const KNOWLEDGE = [
      {
        keys: ['covoiturage', 'trajet', 'passager', 'conducteur', 'route', 'lift', 'siege', 'place', 'covoit', 'voyage', 'chauffeur'],
        title: 'Covoiturage — trouver un trajet',
        answer: 'Cherche ton trajet : ville depart, ville arrivee, date. Tu vois immediatement qui passe deja par la. La beta privilegie les profils verifies, la messagerie interne et les evaluations apres chaque trajet. Le paiement en ligne protege autorise la carte au moment de reserver, puis la capture se fait apres validation du trajet.',
        actions: [
          ['Trouver un trajet', '/covoiturage.html'],
          ['Pourquoi nous (comparatif)', '/comparatif-covoiturage.html'],
          ['Securite expliquee', '/securite.html']
        ]
      },
      {
        keys: ['publier', 'conduire', 'conducteur', 'chauffeur', 'gagner', 'essence', 'auto', 'voiture', 'siege libre'],
        title: 'Je conduis — publier un trajet',
        answer: 'Tu fais deja la route ? Publie ton trajet en 60 secondes (mode express). Tu remplis ton auto, tu partages l essence. Bonus : active "j accepte les colis" et gagne 15-25 $ de plus par trajet en glissant un colis dans ton coffre. 0 % de commission sur tes 10 premiers trajets en beta.',
        actions: [
          ['Publier un trajet', '/covoiturage-publier.html'],
          ['Guide chauffeur', '/covoiturage-info.html'],
          ['Securite chauffeur', '/securite.html']
        ]
      },
      {
        keys: ['envoyer', 'colis', 'expedier', 'lettre', 'expediteur', 'livraison', 'paquet', 'boite'],
        title: 'Envoyer un colis dans le coffre',
        answer: 'Bonus de notre concept : tu peux glisser un colis dans le coffre d un chauffeur qui passe deja dans la bonne direction. Plus economique que Postes Canada / Purolart, livraison souvent le jour meme. Tu indiques depart, arrivee, taille et valeur declaree. Adresses completes protegees avant acceptation.',
        actions: [
          ['Envoyer un colis', '/expediteur.html'],
          ['Trouver un chauffeur', '/covoiturage.html'],
          ['Protections', '/assurance.html']
        ]
      },
      {
        keys: ['paiement', 'stripe', 'argent', 'escrow', 'capture', 'payer', 'remboursement', 'rembourser', 'no-show'],
        title: 'Paiement et reservation',
        answer: 'Le paiement Stripe protege est actif pour les livraisons et le covoiturage. Pour un trajet, la carte est autorisee a la reservation et la capture reste manuelle apres validation. Aucune info de carte n est stockee sur nos serveurs.',
        actions: [
          ['FAQ securite paiement', '/securite.html'],
          ['Voir les conditions', '/cgu.html']
        ]
      },
      {
        keys: ['securite', 'kyc', 'identite', 'verifie', 'verification', 'face', 'safe', 'arnaque', 'fraude', 'femme'],
        title: 'Securite et identite verifiee',
        answer: 'La confiance doit passer par les profils verifies, les avis, les messages gardes dans l app et les signalements. Evite de voyager avec un profil incomplet. Si probleme pendant la beta, texte Denis au 438-449-2023.',
        actions: [
          ['Page securite complete', '/securite.html'],
          ['Texter le fondateur', 'sms:+14384492023']
        ]
      },
      {
        keys: ['suivi', 'gps', 'tracking', 'position', 'destinataire', 'code', 'reception'],
        title: 'Suivi et reception',
        answer: 'Le chauffeur peut activer le partage GPS pendant le trajet. Tu vois ou il est. Un contact de confiance que tu designes (mere, conjoint) peut aussi voir le GPS. Le partage s arrete a l arrivee. Pour les colis : photo de confirmation + code destinataire.',
        actions: [
          ['Suivre une livraison', '/suivi-livraison.html'],
          ['Support', '/contact.html']
        ]
      },
      {
        keys: ['evaluation', 'note', 'avis', 'etoile', 'rating', 'review', 'feedback'],
        title: 'Evaluations mutuelles',
        answer: 'Apres chaque trajet, le passager note le chauffeur ET le chauffeur note le passager. Note basse (1-2 etoiles) declenche une alerte admin. Les mauvais profils sont identifies vite. Badges visibles : 🌟 Elite, ✓ Confiance verifiee, 👍 Recommande, 🌱 Nouveau membre.',
        actions: [
          ['Voir comment ca marche', '/securite.html']
        ]
      },
      {
        keys: ['quebec', 'levis', 'beta', 'test', '50', 'lundi', 'tester', 'saguenay', 'montreal', 'sherbrooke', 'rimouski', 'riviere du loup', 'rivieredu loup', 'beauce', 'saint-georges', 'gatineau', 'trois-rivieres'],
        title: 'Beta — partout au Québec',
        answer: 'Beta ouverte partout au Quebec : Quebec, Levis, Saguenay, Trois-Rivieres, Montreal, Sherbrooke, Rimouski, Riviere-du-Loup, Beauce (Saint-Georges), Gatineau et plus. 10 premiers trajets sans commission. Aucun engagement, annule quand tu veux.',
        actions: [
          ['Voir les trajets', '/covoiturage.html'],
          ['Beta Quebec', '/quebec-beta.html'],
          ['Contacter PorteaPorte', '/contact.html']
        ]
      },
      {
        keys: ['livreur', 'livrer', 'devenir livreur', 'verification livreur'],
        title: 'Devenir livreur de colis',
        answer: 'Tu veux livrer des colis (sans necessairement covoiturer) ? Cree ton compte, choisis le role livreur, termine la verification d identite. Tu vois ensuite les missions sur ta route. Tu garde 60 a 70 % du prix par colis.',
        actions: [
          ['Devenir livreur', '/devenir-livreur.html'],
          ['Dashboard livreur', '/dashboard-livreur.html']
        ]
      },
      {
        keys: ['impact', 'organisme', 'don', 'transparence', 'communaute', 'tirage', 'points', 'porte coins'],
        title: 'Impact communautaire',
        answer: 'Un pourcentage de chaque trajet va a des organismes locaux quebecois que tu choisis chaque trimestre. Tout est public sur la page Transparence. Les PorteCoins ne sont pas de l argent et ne sont pas une cryptomonnaie.',
        actions: [
          ['Voir la transparence', '/transparence.html'],
          ['Programme Points', '/programme-points.html'],
          ['Organismes', '/organismes.html']
        ]
      },
      {
        keys: ['aide', 'support', 'contact', 'probleme', 'bug', 'question', 'perdu'],
        title: 'Besoin d aide',
        answer: 'Dis-moi simplement ce que tu veux faire : trouver un trajet, conduire, envoyer un colis, payer, comprendre. Si c est urgent, texte Denis au 438-449-2023 — il repond personnellement.',
        actions: [
          ['Texter Denis (SMS)', 'sms:+14384492023'],
          ['Contact', '/contact.html'],
          ['FAQ', '/faq.html']
        ]
      }
    ];

    const STARTERS = [
      ['Je cherche un trajet', 'covoiturage'],
      ['Je conduis (je veux publier)', 'publier conducteur'],
      ['Comment ca marche, la securite ?', 'securite kyc'],
      ['Je veux envoyer un colis', 'envoyer colis'],
      ['Je teste a Quebec/Levis', 'beta quebec'],
      ['Je suis perdu', 'aide']
    ];

    let isOpen = false;
    let greeted = false;

    function normalize(text) {
      return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    }

    function findEntry(message) {
      const msg = normalize(message);
      let best = null;
      let score = 0;
      for (const entry of KNOWLEDGE) {
        const current = entry.keys.reduce((n, key) => n + (msg.includes(normalize(key)) ? 1 : 0), 0);
        if (current > score) {
          best = entry;
          score = current;
        }
      }
      return best;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function css() {
      const style = document.createElement('style');
      style.textContent = `
        #pia-launch {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 9998;
          display: grid;
          place-items: center;
          align-items: center;
          width: 58px;
          height: 58px;
          padding: 0;
          border: 1px solid rgba(255,255,255,.24);
          border-radius: 18px;
          background: linear-gradient(135deg,#00d9ff,#b8f53e);
          color: #071006;
          font-weight: 900;
          box-shadow: 0 18px 46px rgba(0,0,0,.45), 0 0 24px rgba(0,217,255,.22);
          cursor: pointer;
        }
        #pia-launch svg {
          width: 27px;
          height: 27px;
          display: block;
          fill: #fff;
          filter: drop-shadow(0 2px 3px rgba(0,0,0,.2));
        }
        #pia-panel {
          position: fixed;
          right: 22px;
          bottom: 86px;
          z-index: 9999;
          width: min(390px, calc(100vw - 28px));
          max-height: min(620px, calc(100vh - 108px));
          display: none;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 16px;
          background: #10151d;
          box-shadow: 0 24px 80px rgba(0,0,0,.65);
          color: #eef4f7;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        }
        #pia-panel.open { display: flex; }
        .pia-head {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 16px;
          background: #0a0c10;
          border-bottom: 1px solid rgba(255,255,255,.1);
        }
        .pia-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg,#b8f53e,#00d9ff);
          color: #071006;
          font-weight: 950;
        }
        .pia-title { font-weight: 950; line-height: 1.1; }
        .pia-subtitle { color: #b8f53e; font-size: .76rem; margin-top: 2px; }
        .pia-close {
          margin-left: auto;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.05);
          color: #eef4f7;
          cursor: pointer;
        }
        .pia-body {
          padding: 15px;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 11px;
        }
        .pia-bubble {
          max-width: 92%;
          padding: 11px 13px;
          border-radius: 13px;
          line-height: 1.55;
          font-size: .88rem;
          overflow-wrap: anywhere;
        }
        .pia-bubble.bot {
          align-self: flex-start;
          background: #1a2230;
          border-bottom-left-radius: 4px;
        }
        .pia-bubble.user {
          align-self: flex-end;
          background: #b8f53e;
          color: #071006;
          font-weight: 800;
          border-bottom-right-radius: 4px;
        }
        .pia-actions,
        .pia-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 10px;
        }
        .pia-action,
        .pia-chip {
          border: 1px solid rgba(184,245,62,.34);
          border-radius: 999px;
          background: rgba(184,245,62,.07);
          color: #dfffb0;
          padding: 7px 10px;
          font-size: .78rem;
          font-weight: 850;
          text-decoration: none;
          cursor: pointer;
        }
        .pia-chip:hover,
        .pia-action:hover {
          background: #b8f53e;
          color: #071006;
        }
        .pia-input-row {
          display: flex;
          gap: 8px;
          padding: 12px;
          border-top: 1px solid rgba(255,255,255,.1);
          background: #0c1118;
        }
        #pia-input {
          flex: 1;
          min-height: 42px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,.13);
          background: #151c27;
          color: #fff;
          padding: 0 11px;
          font-size: 16px;
        }
        #pia-send {
          min-height: 42px;
          border: 0;
          border-radius: 10px;
          padding: 0 14px;
          background: #b8f53e;
          color: #071006;
          font-weight: 950;
          cursor: pointer;
        }
        .pia-foot {
          padding: 0 12px 10px;
          color: #8190a0;
          font-size: .72rem;
          text-align: center;
          background: #0c1118;
        }
        @media (max-width: 560px) {
          #pia-launch {
            left: auto;
            right: 16px;
            bottom: 14px;
          }
          #pia-panel {
            left: 12px;
            right: 12px;
            bottom: 76px;
            width: auto;
          }
        }
      `;
      document.head.appendChild(style);
    }

    function build() {
      const existingButton = document.getElementById('pia-launch');
      const existingPanel = document.getElementById('pia-panel');
      if (existingButton) existingButton.remove();
      if (existingPanel) existingPanel.remove();

      const button = document.createElement('button');
      button.id = 'pia-launch';
      button.type = 'button';
      button.setAttribute('aria-label', 'Ouvrir Pia');
      button.title = 'Pia';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5c0 4.1-3.8 7.5-8.5 7.5-1 0-2-.15-2.9-.46L4 21l1.18-4.02C3.82 15.6 3 13.7 3 11.5 3 7.36 6.8 4 11.5 4S20 7.36 20 11.5Z"/></svg>';
      button.addEventListener('click', function () { isOpen ? close() : open(); });

      const panel = document.createElement('section');
      panel.id = 'pia-panel';
      panel.setAttribute('aria-label', 'Guide Pia PorteaPorte');
      panel.innerHTML = `
        <div class="pia-head">
          <div class="pia-avatar">P</div>
          <div>
            <div class="pia-title">Pia</div>
            <div class="pia-subtitle">Guide simple PorteaPorte</div>
          </div>
          <button class="pia-close" type="button" aria-label="Fermer Pia">x</button>
        </div>
        <div class="pia-body" id="pia-body"></div>
        <div class="pia-input-row">
          <input id="pia-input" placeholder="Ex: je veux envoyer une lettre" maxlength="220" autocomplete="off">
          <button id="pia-send" type="button">OK</button>
        </div>
        <div class="pia-foot">Pia aide a s orienter. Pour un litige, garde toujours tes preuves.</div>
      `;

      document.body.appendChild(button);
      document.body.appendChild(panel);

      panel.querySelector('.pia-close').addEventListener('click', close);
      panel.querySelector('#pia-send').addEventListener('click', send);
      panel.querySelector('#pia-input').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') send();
      });
    }

    function body() {
      return document.getElementById('pia-body');
    }

    function addBubble(html, type) {
      const el = document.createElement('div');
      el.className = 'pia-bubble ' + (type || 'bot');
      el.innerHTML = html;
      body().appendChild(el);
      body().scrollTop = body().scrollHeight;
      return el;
    }

    function actionHtml(actions) {
      if (!actions || !actions.length) return '';
      return '<div class="pia-actions">' + actions.map(function (a) {
        return '<a class="pia-action" href="' + escapeHtml(a[1]) + '">' + escapeHtml(a[0]) + '</a>';
      }).join('') + '</div>';
    }

    function chipsHtml() {
      return '<div class="pia-chips">' + STARTERS.map(function (s) {
        return '<button class="pia-chip" type="button" data-pia-question="' + escapeHtml(s[1]) + '">' + escapeHtml(s[0]) + '</button>';
      }).join('') + '</div>';
    }

    function greet(topic) {
      if (greeted && !topic) return;
      greeted = true;
      addBubble(
        '<strong>Salut, je suis Pia.</strong><br>Je t aide a trouver ton trajet, publier le tien, ou comprendre comment ca marche. Dis-moi ce que tu veux faire :<br>' +
        chipsHtml()
      );
      body().querySelectorAll('[data-pia-question]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          ask(chip.getAttribute('data-pia-question'));
        });
      });
      if (topic) ask(topic);
    }

    function ask(message) {
      const clean = String(message || '').trim();
      if (!clean) return;
      addBubble(escapeHtml(clean), 'user');
      const entry = findEntry(clean);
      if (entry) {
        addBubble('<strong>' + escapeHtml(entry.title) + '</strong><br>' + escapeHtml(entry.answer) + actionHtml(entry.actions));
      } else {
        addBubble('<strong>Je peux te guider.</strong><br>Essaie : envoyer un colis, devenir livreur, beta Quebec, paiement, GPS ou support.' + chipsHtml());
        body().querySelectorAll('[data-pia-question]').forEach(function (chip) {
          chip.addEventListener('click', function () { ask(chip.getAttribute('data-pia-question')); });
        });
      }
    }

    function send() {
      const input = document.getElementById('pia-input');
      const value = input.value.trim();
      input.value = '';
      ask(value);
    }

    function open(topic) {
      isOpen = true;
      document.getElementById('pia-panel').classList.add('open');
      greet(topic);
      setTimeout(function () {
        const input = document.getElementById('pia-input');
        if (input) input.focus();
      }, 80);
    }

    function close() {
      isOpen = false;
      document.getElementById('pia-panel').classList.remove('open');
    }

    function init() {
      css();
      build();
      window.Pia = { open: open, close: close, ask: ask };
      setTimeout(function () {
        if (!isOpen && document.body.dataset.piaWelcome !== 'off') {
          const launch = document.getElementById('pia-launch');
          if (launch) launch.style.boxShadow = '0 18px 52px rgba(184,245,62,.38), 0 0 0 5px rgba(184,245,62,.1)';
        }
      }, 2500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
}
