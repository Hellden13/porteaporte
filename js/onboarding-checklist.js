/**
 * PorteàPorte — Checklist onboarding adaptative
 *
 * Détecte automatiquement le rôle et l'état du compte, affiche les étapes
 * restantes pour rendre le compte 100% opérationnel.
 *
 * Inclusion : <script src="/js/onboarding-checklist.js" defer></script>
 * + dans la page, mettre <div id="pap-onboarding-checklist"></div> à l'endroit voulu
 *   (sinon : insertion auto en tête de la première section du body)
 */
(function () {
  if (window.__papOnboardChecklist) return;
  window.__papOnboardChecklist = true;

  function getDb() {
    return window.db || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
  }

  async function getProfile() {
    const db = getDb();
    if (!db) return null;
    const { data: { session } } = await db.auth.getSession();
    if (!session) return null;
    const { data: profile } = await db.from('profiles').select('*').eq('id', session.user.id).single();
    return { session, profile };
  }

  // ─── Détermine les étapes selon le rôle et l'état ───
  function buildSteps(session, profile) {
    const role = profile.role || 'expediteur';
    const isLivreur = role === 'livreur' || role === 'les deux';
    const isExpediteur = role === 'expediteur' || role === 'les deux';
    const emailConfirmed = Boolean(session.user.email_confirmed_at || session.user.confirmed_at || profile.email_verified);
    const profileComplete = Boolean(profile.prenom && profile.nom && profile.ville && profile.telephone);
    const hasPhoto = Boolean(profile.photo_url && profile.photo_status === 'approved');

    const steps = [];

    // Étapes communes
    steps.push({
      key: 'email',
      label: 'Vérifie ton adresse courriel',
      done: emailConfirmed,
      href: emailConfirmed ? null : null,
      hint: emailConfirmed ? null : 'Regarde ta boîte mail (pense aux indésirables)'
    });
    steps.push({
      key: 'profile',
      label: 'Complète ton profil (nom, ville, téléphone)',
      done: profileComplete,
      href: profileComplete ? null : '/profile.html',
      hint: profileComplete ? null : 'Plus ton profil est complet, plus tu obtiens la confiance'
    });
    steps.push({
      key: 'photo',
      label: 'Ajoute une photo de profil (recommandé)',
      done: hasPhoto,
      href: hasPhoto ? null : '/profile.html',
      hint: hasPhoto ? null : 'Les profils avec photo ont 3x plus de réservations',
      optional: true
    });

    // Étapes livreur
    if (isLivreur) {
      const kycVerified = profile.driver_status === 'verified';
      const kycPending = profile.driver_status === 'pending_review';
      steps.push({
        key: 'kyc',
        label: kycPending ? 'Dossier livreur en cours de vérification' : 'Soumets ton dossier livreur (KYC)',
        done: kycVerified,
        waiting: kycPending,
        href: (kycVerified || kycPending) ? null : '/kyc.html',
        hint: kycVerified ? null : kycPending ? 'On revoit ton dossier sous 24-48h' : 'Permis de conduire + selfie. Délai 24-48h.'
      });

      // Stripe Connect (on ne sait pas depuis le profil seul — on assume manquant si pas vérifié)
      steps.push({
        key: 'stripe',
        label: 'Active ton compte Stripe Connect (pour être payé)',
        done: false, // sera vérifié async
        href: '/kyc.html',
        hint: 'Sans ça, tu ne peux PAS recevoir tes paiements de livraisons',
        critical: true,
        pendingCheck: 'stripe'
      });
    }

    // Étapes expéditeur
    if (isExpediteur) {
      steps.push({
        key: 'first-mission',
        label: 'Publie ta 1ère livraison',
        done: (profile.livraisons || profile.livraisons_count || 0) > 0,
        href: '/create-mission.html',
        hint: 'En 2 minutes : adresse départ → arrivée → poids → prix.'
      });
    }

    return steps;
  }

  // Check Stripe Connect async (vérifie l'API)
  async function checkStripe(session) {
    try {
      const db = getDb();
      // On tente une lecture directe; si la table existe, on lit payouts_enabled
      const { data, error } = await db.from('stripe_connect_accounts').select('payouts_enabled').eq('user_id', session.user.id).single();
      if (error || !data) return false;
      return Boolean(data.payouts_enabled);
    } catch (_) {
      return false;
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('pap-onboard-css')) return;
    const css = `
      .pap-onboard {
        background: linear-gradient(135deg, rgba(93,191,255,.07), rgba(0,217,255,.04));
        border: 1px solid rgba(93,191,255,.3);
        border-radius: 14px; padding: 18px 22px; margin: 16px 0;
      }
      .pap-onboard h3 {
        margin: 0 0 12px; font-size: 1rem; color: #fff;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
      }
      .pap-onboard h3 .pap-onboard-progress {
        font-size: .82rem; color: #5dbfff; font-weight: 700;
      }
      .pap-onboard-bar {
        width: 100%; height: 6px; background: rgba(255,255,255,.08); border-radius: 3px; margin-bottom: 14px; overflow: hidden;
      }
      .pap-onboard-bar-fill {
        height: 100%; background: linear-gradient(90deg, #5dbfff, #7dffc1);
        transition: width .4s ease;
      }
      .pap-onboard-step {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 10px 12px; border-radius: 8px;
        background: rgba(255,255,255,.02); margin-bottom: 6px;
      }
      .pap-onboard-step.done {
        opacity: .55; background: rgba(125,255,193,.04);
      }
      .pap-onboard-step.critical {
        background: rgba(255,90,90,.06); border: 1px solid rgba(255,90,90,.25);
      }
      .pap-onboard-step.waiting {
        background: rgba(255,200,0,.06); border: 1px solid rgba(255,200,0,.25);
      }
      .pap-onboard-icon {
        font-size: 1.2rem; line-height: 1.2; flex-shrink: 0;
      }
      .pap-onboard-body { flex: 1; min-width: 0; }
      .pap-onboard-label {
        font-weight: 700; color: #fff; font-size: .92rem;
      }
      .pap-onboard-step.done .pap-onboard-label {
        text-decoration: line-through; color: #a8b0ba;
      }
      .pap-onboard-hint {
        font-size: .78rem; color: #a8b0ba; margin-top: 4px;
      }
      .pap-onboard-step a {
        display: inline-block; margin-top: 6px;
        background: #5dbfff; color: #051022;
        padding: 5px 14px; border-radius: 6px;
        font-size: .82rem; font-weight: 800; text-decoration: none;
      }
      .pap-onboard-step a:hover { background: #3da9ff; }
      .pap-onboard-step.critical a { background: #ff7a7a; color: #fff; }
      .pap-onboard-dismiss {
        background: transparent; border: 1px solid rgba(255,255,255,.15);
        color: #a8b0ba; padding: 4px 10px; border-radius: 6px;
        font-size: .72rem; cursor: pointer;
      }
      .pap-onboard-dismiss:hover { color: #fff; }
    `;
    const s = document.createElement('style');
    s.id = 'pap-onboard-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function renderChecklist(container, steps, session, profile) {
    const total = steps.length;
    const done = steps.filter(s => s.done).length;
    const allDone = done === total;
    const pct = Math.round((done / total) * 100);

    if (allDone) {
      // Permet à l'user de cacher définitivement
      if (localStorage.getItem('pap_onboard_dismissed_' + session.user.id) === '1') {
        container.style.display = 'none';
        return;
      }
      container.innerHTML = `
        <div class="pap-onboard" style="background:linear-gradient(135deg,rgba(125,255,193,.1),rgba(125,255,193,.04));border-color:rgba(125,255,193,.3)">
          <h3>🎉 Ton compte est complet ! <button class="pap-onboard-dismiss" onclick="(function(uid){localStorage.setItem('pap_onboard_dismissed_'+uid,'1');document.getElementById('pap-onboarding-checklist').style.display='none';})('${session.user.id}')">Fermer</button></h3>
          <p style="color:#a8b0ba;margin:0">Toutes les étapes essentielles sont faites. Continue à explorer le service.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="pap-onboard">
        <h3>🚀 Pour bien démarrer <span class="pap-onboard-progress">${done}/${total} (${pct}%)</span></h3>
        <div class="pap-onboard-bar"><div class="pap-onboard-bar-fill" style="width:${pct}%"></div></div>
        ${steps.map(s => `
          <div class="pap-onboard-step ${s.done ? 'done' : ''} ${s.critical && !s.done ? 'critical' : ''} ${s.waiting ? 'waiting' : ''}">
            <div class="pap-onboard-icon">${s.done ? '✅' : s.waiting ? '⏳' : s.critical ? '🔴' : s.optional ? '💡' : '⭕'}</div>
            <div class="pap-onboard-body">
              <div class="pap-onboard-label">${s.label}</div>
              ${s.hint ? `<div class="pap-onboard-hint">${s.hint}</div>` : ''}
              ${!s.done && s.href ? `<a href="${s.href}">${s.critical ? '🔴 Compléter maintenant' : 'Aller →'}</a>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function init() {
    if (!document.body) { setTimeout(init, 100); return; }

    const ctx = await getProfile();
    if (!ctx) return; // pas connecté
    const { session, profile } = ctx;
    if (!profile) return;

    // Trouver/créer le conteneur
    let container = document.getElementById('pap-onboarding-checklist');
    if (!container) {
      // Insertion auto en haut du main ou body
      const target = document.querySelector('main') || document.querySelector('.container') || document.body;
      container = document.createElement('div');
      container.id = 'pap-onboarding-checklist';
      target.insertBefore(container, target.firstChild);
    }

    injectStyles();
    const steps = buildSteps(session, profile);

    // Render immédiat (sans check Stripe)
    renderChecklist(container, steps, session, profile);

    // Check Stripe async et re-render
    const stripeStep = steps.find(s => s.pendingCheck === 'stripe');
    if (stripeStep) {
      const ok = await checkStripe(session);
      stripeStep.done = ok;
      if (ok) stripeStep.critical = false;
      renderChecklist(container, steps, session, profile);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PapOnboardingChecklist = { init };
})();
