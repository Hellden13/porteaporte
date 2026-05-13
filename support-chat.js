(function() {
  const KNOWLEDGE_BASE = {
    'public|colis|publier|envoyer|transport': { 
      title: 'Publier un colis', 
      response: 'Pour publier un colis sur PorteàPorte:\n\n1. Clique sur "Commencer maintenant"\n2. Remplis: ville départ, arrivée, type objet, description, budget\n3. Système cherche trajets compatibles\n4. Tu confirmes le livreur\n5. Suivi GPS en temps réel' 
    },
    'trajet|proposer|conducteur|livreur|route': { 
      title: 'Proposer un trajet', 
      response: 'Tu fais un trajet et tu veux gagner?\n\n1. Indique départ et destination\n2. Date/heure du trajet\n3. Type de véhicule\n4. Espace disponible\n\nSystème te propose colis compatibles. Accepte, ramasse, livre, tu es payé!' 
    },
    'paiement|payer|prix|cout|tarif|argent|transaction': { 
      title: 'Paiement', 
      response: 'Paiement sécurisé:\n\n✓ Argent retenu à la création\n✓ Pas d\'échange liquide\n✓ Confirmé après livraison\n✓ Typiquement 5-15$ par km\n✓ Zéro frais cachés' 
    },
    'securite|verifie|verification|identite|confiance|danger|arnaque': { 
      title: 'Sécurité', 
      response: 'Confiance = cœur de PorteàPorte:\n\n✓ Profils vérifiés\n✓ Évaluations 1-5 étoiles\n✓ Suivi GPS intelligent\n✓ Preuve de ramassage/livraison\n✓ Paiement sécurisé\n\nProblème? Garde preuves et contacte équipe' 
    },
    'suivi|tracking|ou est|livraison|statut|progression': { 
      title: 'Suivi', 
      response: 'Suis ton colis en temps réel!\n\nTu verras:\n✓ Statut (ramassé, en route, livré)\n✓ GPS du livreur\n✓ Étapes avec heures\n✓ Profil livreur/notes\n✓ Notifications chaque étape' 
    },
    'communaute|bonus|reward|tirage|organisme|entraide|redonner': { 
      title: 'Communauté', 
      response: 'PorteàPorte = communauté québécoise!\n\n🏆 Livreurs:\n✓ Bonus mensuels\n✓ Badges/reconnaissance\n\n🎁 Tous:\n✓ Tirages mensuels\n✓ Points fidélité\n\n❤️ Local:\n✓ Organismes soutenus\n✓ Régions éloignées aidées' 
    },
    'urgent|probleme|erreur|souci|aide|crise': { 
      title: 'Problème urgent', 
      response: 'Je comprends, c\'est important!\n\nGarde les preuves:\n✓ Screenshots messages\n✓ Photos colis\n✓ Code livraison\n✓ Dates/heures exactes\n\nContacte équipe PorteàPorte:\n📧 bonjour@porteaporte.site' 
    },
    'default': { 
      title: 'PorteàPorte Support', 
      response: 'Salut! 👋 Comment je peux aider?\n\n📦 Publier un colis\n🚗 Proposer un trajet\n💳 Paiement\n🔒 Sécurité\n📍 Suivi\n❤️ Communauté\n⚡ Problème urgent' 
    }
  };

  function findResponse(msg) {
    const norm = msg.toLowerCase();
    for (const [kw, resp] of Object.entries(KNOWLEDGE_BASE)) {
      if (kw === 'default') continue;
      for (const k of kw.split('|')) {
        if (norm.includes(k)) return resp;
      }
    }
    return KNOWLEDGE_BASE.default;
  }

  function createWidget() {
    const btn = document.createElement('button');
    btn.innerHTML = '💬';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:#B8F53E;color:#05080A;border:none;cursor:pointer;font-size:28px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center;transition:all 0.3s;';
    
    btn.addEventListener('mouseover', function() { this.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseout', function() { this.style.transform = 'scale(1)'; });
    
    btn.addEventListener('click', function() {
      const msg = prompt('💬 PorteàPorte Support\n\nTa question?');
      if (msg) {
        const response = findResponse(msg);
        alert('📌 ' + response.title + '\n\n' + response.response);
      }
    });
    
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();