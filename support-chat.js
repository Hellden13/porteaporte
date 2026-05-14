(function() {
  const KNOWLEDGE_BASE = {
    'public|colis|publier|envoyer|transport': { 
      title: 'Publier un colis', 
      response: 'Pour publier un colis sur PorteÃ Porte:\n\n1. Clique sur "Commencer maintenant"\n2. Remplis: ville dÃ©part, arrivÃ©e, type objet, description, budget\n3. SystÃ¨me cherche trajets compatibles\n4. Tu confirmes le livreur\n5. Suivi GPS en temps rÃ©el' 
    },
    'trajet|proposer|conducteur|livreur|route': { 
      title: 'Proposer un trajet', 
      response: 'Tu fais un trajet et tu veux gagner?\n\n1. Indique dÃ©part et destination\n2. Date/heure du trajet\n3. Type de vÃ©hicule\n4. Espace disponible\n\nSystÃ¨me te propose colis compatibles. Accepte, ramasse, livre, tu es payÃ©!' 
    },
    'paiement|payer|prix|cout|tarif|argent|transaction': { 
      title: 'Paiement', 
      response: 'Paiement sÃ©curisÃ©:\n\nâœ“ Argent retenu Ã  la crÃ©ation\nâœ“ Pas d\'Ã©change liquide\nâœ“ ConfirmÃ© aprÃ¨s livraison\nâœ“ Typiquement 5-15$ par km\nâœ“ ZÃ©ro frais cachÃ©s' 
    },
    'securite|verifie|verification|identite|confiance|danger|arnaque': { 
      title: 'SÃ©curitÃ©', 
      response: 'Confiance = cÅ“ur de PorteÃ Porte:\n\nâœ“ Profils vÃ©rifiÃ©s\nâœ“ Ã‰valuations 1-5 Ã©toiles\nâœ“ Suivi GPS intelligent\nâœ“ Preuve de ramassage/livraison\nâœ“ Paiement sÃ©curisÃ©\n\nProblÃ¨me? Garde preuves et contacte Ã©quipe' 
    },
    'suivi|tracking|ou est|livraison|statut|progression': { 
      title: 'Suivi', 
      response: 'Suis ton colis en temps rÃ©el!\n\nTu verras:\nâœ“ Statut (ramassÃ©, en route, livrÃ©)\nâœ“ GPS du livreur\nâœ“ Ã‰tapes avec heures\nâœ“ Profil livreur/notes\nâœ“ Notifications chaque Ã©tape' 
    },
    'communaute|bonus|reward|tirage|organisme|entraide|redonner': { 
      title: 'CommunautÃ©', 
      response: 'PorteÃ Porte = communautÃ© quÃ©bÃ©coise!\n\nðŸ† Livreurs:\nâœ“ Bonus mensuels\nâœ“ Badges/reconnaissance\n\nðŸŽ Tous:\nâœ“ Tirages mensuels\nâœ“ Points fidÃ©litÃ©\n\nâ¤ï¸ Local:\nâœ“ Organismes soutenus\nâœ“ RÃ©gions Ã©loignÃ©es aidÃ©es' 
    },
    'urgent|probleme|erreur|souci|aide|crise': { 
      title: 'ProblÃ¨me urgent', 
      response: 'Je comprends, c\'est important!\n\nGarde les preuves:\nâœ“ Screenshots messages\nâœ“ Photos colis\nâœ“ Code livraison\nâœ“ Dates/heures exactes\n\nContacte Ã©quipe PorteÃ Porte:\nðŸ“§ bonjour@porteaporte.site' 
    },
    'default': { 
      title: 'PorteÃ Porte Support', 
      response: 'Salut! ðŸ‘‹ Comment je peux aider?\n\nðŸ“¦ Publier un colis\nðŸš— Proposer un trajet\nðŸ’³ Paiement\nðŸ”’ SÃ©curitÃ©\nðŸ“ Suivi\nâ¤ï¸ CommunautÃ©\nâš¡ ProblÃ¨me urgent' 
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
    btn.innerHTML = 'ðŸ’¬';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:#B8F53E;color:#05080A;border:none;cursor:pointer;font-size:28px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center;transition:all 0.3s;';
    
    btn.addEventListener('mouseover', function() { this.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseout', function() { this.style.transform = 'scale(1)'; });
    
    btn.addEventListener('click', function() {
      const msg = prompt('ðŸ’¬ PorteÃ Porte Support\n\nTa question?');
      if (msg) {
        const response = findResponse(msg);
        showSuccess('ðŸ“Œ ' + response.title + '\n\n' + response.response);
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
