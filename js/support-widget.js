/* PorteaPorte - Pia guide widget
   Pia aide les nouveaux visiteurs a trouver le bon chemin sans cacher la plateforme complete.
*/

if (!window.__PIA_LOADED__) {
  window.__PIA_LOADED__ = true;

  (function () {
    'use strict';

    const KNOWLEDGE = [
      {
        keys: ['envoyer', 'colis', 'expedier', 'lettre', 'expediteur', 'livraison'],
        title: 'Envoyer un colis',
        answer: 'Pour envoyer un colis, commence par creer une livraison. Tu indiques le depart, l arrivee, la taille, la valeur declaree et la protection si tu en veux une. Les adresses completes restent protegees avant acceptation.',
        actions: [
          ['Creer une livraison', '/create-mission.html'],
          ['Voir les protections', '/assurance.html'],
          ['FAQ expediteur', '/faq.html']
        ]
      },
      {
        keys: ['livreur', 'livrer', 'gagner', 'verification', 'verifie', 'velo', 'pied', 'voiture'],
        title: 'Devenir livreur',
        answer: 'Pour livrer, tu dois creer ton compte, choisir le role livreur et terminer la verification. A pied ou a velo, le permis de conduire n est pas logique : on verifie plutot ton identite, ton telephone, ta ville et ton mode de transport. Un livreur non verifie ne voit pas les vrais colis.',
        actions: [
          ['Devenir livreur', '/devenir-livreur.html'],
          ['Verifier mon profil', '/livreur.html'],
          ['Dashboard livreur', '/dashboard-livreur.html']
        ]
      },
      {
        keys: ['quebec', 'levis', 'beta', 'test', '50', 'lundi', 'tester'],
        title: 'Beta Quebec / Levis',
        answer: 'Pour le test terrain, utilise la page beta Quebec. Elle explique simplement quoi faire : envoyer un colis, devenir livreur, ou demander de l aide a Pia.',
        actions: [
          ['Ouvrir la beta Quebec', '/quebec-beta.html'],
          ['Commencer', '/role-choice.html'],
          ['Contacter PorteaPorte', '/contact.html']
        ]
      },
      {
        keys: ['paiement', 'stripe', 'argent', 'escrow', 'capture', 'payer', 'remboursement'],
        title: 'Paiement protege',
        answer: 'Le paiement passe par Stripe. L argent est protege pendant la mission et le paiement du livreur depend de la confirmation de livraison ou de la resolution du dossier. Pour un probleme, garde les preuves : photos, GPS, messages et historique.',
        actions: [
          ['Comprendre la protection', '/assurance.html'],
          ['Voir les conditions', '/cgu.html'],
          ['Historique paiements', '/historique-paiements.html']
        ]
      },
      {
        keys: ['suivi', 'gps', 'tracking', 'position', 'destinataire', 'code', 'reception'],
        title: 'Suivi et reception',
        answer: 'Le suivi sert a voir l etat de la livraison. Le destinataire peut confirmer la reception avec son code ou selon le processus prevu. Si personne n est sur place, le depot securise doit etre documente avec photo, GPS et note claire.',
        actions: [
          ['Suivre une livraison', '/suivi-livraison.html'],
          ['Confirmation destinataire', '/confirmation-destinataire.html'],
          ['Support', '/contact.html']
        ]
      },
      {
        keys: ['covoiturage', 'trajet', 'passager', 'conducteur', 'route'],
        title: 'Covoiturage',
        answer: 'Le covoiturage permet de partager un trajet deja prevu. Le prix est affiche avant confirmation. Les informations sensibles restent protegees et les profils approuves inspirent plus confiance.',
        actions: [
          ['Chercher un trajet', '/covoiturage.html'],
          ['Publier un trajet', '/covoiturage-publier.html'],
          ['Guide covoiturage', '/covoiturage-info.html']
        ]
      },
      {
        keys: ['impact', 'organisme', 'don', 'transparence', 'communaute', 'tirage', 'points'],
        title: 'Impact communautaire',
        answer: 'La section Transparence montre l impact communautaire, les organismes, les tirages et les montants suivis publiquement quand les donnees sont disponibles. Les PorteCoins ne sont pas de l argent et ne sont pas une cryptomonnaie.',
        actions: [
          ['Voir la transparence', '/transparence.html'],
          ['Programme Points', '/programme-points.html'],
          ['Organismes', '/organismes.html']
        ]
      },
      {
        keys: ['aide', 'support', 'contact', 'probleme', 'bug', 'question', 'perdu'],
        title: 'Besoin d aide',
        answer: 'Dis-moi simplement ce que tu veux faire : envoyer, livrer, suivre, payer ou comprendre. Si c est urgent ou sensible, contacte aussi l equipe avec tes captures, photos et numeros de livraison.',
        actions: [
          ['Contact', '/contact.html'],
          ['FAQ', '/faq.html'],
          ['Choisir mon role', '/role-choice.html']
        ]
      }
    ];

    const STARTERS = [
      ['Je veux envoyer un colis', 'envoyer colis'],
      ['Je veux devenir livreur', 'devenir livreur'],
      ['Je teste a Quebec', 'beta quebec'],
      ['Je veux suivre une livraison', 'suivi gps'],
      ['Je veux comprendre le paiement', 'paiement stripe'],
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
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-height: 50px;
          padding: 0 16px;
          border: 1px solid rgba(184,245,62,.45);
          border-radius: 999px;
          background: linear-gradient(135deg,#00d9ff,#b8f53e);
          color: #071006;
          font-weight: 900;
          box-shadow: 0 18px 46px rgba(0,0,0,.45), 0 0 24px rgba(0,217,255,.22);
          cursor: pointer;
        }
        #pia-launch .pia-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #071006;
          box-shadow: 0 0 0 5px rgba(7,16,6,.12);
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
            left: 14px;
            right: 14px;
            bottom: 14px;
            justify-content: center;
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
      const button = document.createElement('button');
      button.id = 'pia-launch';
      button.type = 'button';
      button.innerHTML = '<span class="pia-dot"></span><span>Pia me guide</span>';
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
        '<strong>Salut, je suis Pia.</strong><br>Dis-moi ce que tu veux faire et je t envoie directement au bon endroit.<br>' +
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
