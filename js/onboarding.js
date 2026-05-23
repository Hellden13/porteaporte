/**
 * PorteàPorte — Tutoriel onboarding
 * Affiche un guide visuel à la première visite après connexion
 * Sauvegarde le statut "vu" dans localStorage
 */
(function() {
  if (window.__papOnboarding) return;
  window.__papOnboarding = true;

  const STORAGE_KEY = 'pap_onboarding_v2_seen';

  // Détecter le rôle (livreur, expediteur, destinataire) selon la page courante
  function detectRole() {
    const path = window.location.pathname;
    if (path.includes('dashboard-livreur')) return 'livreur';
    if (path.includes('dashboard-expediteur')) return 'expediteur';
    if (path.includes('dashboard-destinataire')) return 'destinataire';
    return null;
  }

  const TUTORIALS = {
    livreur: [
      {
        icon: '👋',
        title: 'Bienvenue Livreur !',
        text: 'Tu vas découvrir ton tableau de bord en 4 étapes rapides.'
      },
      {
        icon: '🚦',
        title: 'Étape 1 : Mode actif (Profil)',
        text: 'Va dans l\'onglet "⚙️ Profil" pour choisir ton véhicule du jour. Tu peux ajouter plusieurs modes (vélo, voiture, camion) et basculer entre eux.'
      },
      {
        icon: '🗺️',
        title: 'Étape 2 : Ta route IA',
        text: 'Toujours dans Profil, configure ta route prévue (origine, destination, déviation km). L\'IA te montrera en priorité les missions sur ton chemin.'
      },
      {
        icon: '📦',
        title: 'Étape 3 : Accepter une mission',
        text: 'L\'onglet "📦 Missions" affiche les livraisons disponibles. Tu DOIS accepter de partager ton GPS pendant la livraison.'
      },
      {
        icon: '🆔',
        title: 'Étape 4 : Ta carte d\'identité',
        text: 'Au pickup, montre ta carte d\'identité numérique à l\'expéditeur. Il scanne le QR pour vérifier ton authenticité. Bouton "📲 Ouvrir ma carte" dans Profil.'
      },
      {
        icon: '🆘',
        title: 'Bonus : Système Rescue',
        text: 'Si tu as un imprévu après avoir pris le colis, demande un Rescue : un autre livreur t\'aide, vous partagez le gain. Solidarité !'
      }
    ],
    expediteur: [
      {
        icon: '👋',
        title: 'Bienvenue Expéditeur !',
        text: 'Voici comment envoyer ton premier colis en 4 étapes.'
      },
      {
        icon: '➕',
        title: 'Étape 1 : Créer une livraison',
        text: 'Clique sur l\'onglet "➕ Nouvelle livraison" pour le formulaire rapide. Ou "+ Nouvelle Expédition" pour le formulaire complet avec préférences destinataire.'
      },
      {
        icon: '💳',
        title: 'Étape 2 : Paiement escrow',
        text: 'Ton paiement est bloqué chez Stripe (escrow). Il ne sera libéré au livreur qu\'après confirmation du destinataire avec son code.'
      },
      {
        icon: '🆔',
        title: 'Étape 3 : Vérifier le livreur',
        text: 'Quand un livreur est assigné, sa carte d\'identité vérifiée s\'affiche. Au pickup, compare son visage à la photo avant d\'ouvrir.'
      },
      {
        icon: '📍',
        title: 'Étape 4 : Suivi temps réel',
        text: 'Suis ta livraison en direct sur la carte avec ETA, position GPS, et progress bar. L\'onglet "📦 Mes expéditions" liste tout.'
      }
    ],
    destinataire: [
      {
        icon: '👋',
        title: 'Bienvenue Destinataire !',
        text: 'Un compte (optionnel) te permet de suivre tous tes colis reçus.'
      },
      {
        icon: '⚙️',
        title: 'Configure tes préférences',
        text: 'Pour chaque livraison, tu peux configurer : signature obligatoire, plage horaire, lieu de repli si absent, note pour le livreur.'
      },
      {
        icon: '🔑',
        title: 'Confirme avec ton code',
        text: 'À la réception, entre ton code à 6 chiffres sur la page de confirmation pour libérer le paiement au livreur.'
      }
    ]
  };

  function showTutorial() {
    const role = detectRole();
    if (!role) return;
    const steps = TUTORIALS[role];
    if (!steps) return;
    let stepIndex = 0;

    const overlay = document.createElement('div');
    overlay.id = 'pap-onboarding';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,.88);
      z-index: 99999; display: grid; place-items: center; padding: 20px;
      animation: papFadeIn .3s ease;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      max-width: 480px; width: 100%;
      background: linear-gradient(160deg, #0e1620, #061018);
      border: 2px solid rgba(184,245,62,.4);
      border-radius: 18px; padding: 32px 28px;
      box-shadow: 0 30px 80px rgba(0,0,0,.6), 0 0 80px rgba(184,245,62,.15);
      text-align: center;
    `;
    overlay.appendChild(card);

    function render() {
      const step = steps[stepIndex];
      const progress = ((stepIndex + 1) / steps.length) * 100;
      card.innerHTML = `
        <div style="font-size:.72rem;color:#a8b0ba;letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px">PorteàPorte · Tutoriel ${stepIndex + 1}/${steps.length}</div>
        <div style="font-size:64px;margin:14px 0">${step.icon}</div>
        <h2 style="margin:0 0 12px;color:#fff;font-size:1.35rem">${step.title}</h2>
        <p style="color:#a8b0ba;line-height:1.65;margin:0 0 24px;font-size:.95rem">${step.text}</p>
        <div style="height:6px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;margin-bottom:24px">
          <div style="width:${progress}%;height:100%;background:linear-gradient(90deg,#00d9ff,#b8f53e);border-radius:999px;transition:width .3s ease"></div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          ${stepIndex > 0 ? `<button id="pap-onb-prev" style="padding:12px 20px;background:rgba(255,255,255,.06);border:1px solid #1E2535;color:#fff;border-radius:10px;cursor:pointer;font-weight:700">← Précédent</button>` : ''}
          <button id="pap-onb-skip" style="padding:12px 20px;background:transparent;border:none;color:#6d7886;cursor:pointer;font-weight:600">Passer le tuto</button>
          <button id="pap-onb-next" style="padding:12px 24px;background:linear-gradient(135deg,#b8f53e,#78d900);color:#071006;border:none;border-radius:10px;cursor:pointer;font-weight:900">${stepIndex === steps.length - 1 ? '✅ C\'est parti !' : 'Suivant →'}</button>
        </div>
      `;
      card.querySelector('#pap-onb-prev')?.addEventListener('click', () => { stepIndex--; render(); });
      card.querySelector('#pap-onb-next').addEventListener('click', () => {
        if (stepIndex === steps.length - 1) finish();
        else { stepIndex++; render(); }
      });
      card.querySelector('#pap-onb-skip').addEventListener('click', finish);
    }

    function finish() {
      try { localStorage.setItem(STORAGE_KEY + '_' + role, '1'); } catch (e) {}
      overlay.style.animation = 'papFadeOut .3s ease';
      setTimeout(() => overlay.remove(), 280);
    }

    if (!document.querySelector('style[data-papOnb]')) {
      const style = document.createElement('style');
      style.dataset.papOnb = '1';
      style.textContent = `
        @keyframes papFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes papFadeOut { from { opacity: 1; } to { opacity: 0; } }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
    render();
  }

  function maybeShow() {
    const role = detectRole();
    if (!role) return;
    try {
      if (localStorage.getItem(STORAGE_KEY + '_' + role)) return;
    } catch (e) { return; }
    // Petit délai pour que la page se charge
    setTimeout(showTutorial, 1500);
  }

  // Lancer au chargement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeShow);
  } else {
    maybeShow();
  }

  // Exposer pour relancer manuellement
  window.PapOnboarding = {
    show: showTutorial,
    reset: () => {
      ['livreur', 'expediteur', 'destinataire'].forEach(r => {
        try { localStorage.removeItem(STORAGE_KEY + '_' + r); } catch (e) {}
      });
    }
  };
})();
