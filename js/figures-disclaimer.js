/* PorteàPorte — mention légale unique « peut changer sans préavis ».
   Texte centralisé ICI (source unique). Inclure le script sur toute page
   affichant des chiffres : <script src="/js/figures-disclaimer.js" defer></script>

   Deux modes :
     1) S'il existe un/des élément(s) [data-figures-disclaimer] vides → on les remplit.
     2) Sinon, on ajoute discrètement la mention en bas de page (avant </body>). */
(function () {
  'use strict';
  var TXT = '⚠️ Les pourcentages, frais et montants affichés sont indicatifs et peuvent changer sans préavis.';
  window.__figuresDisclaimer = TXT;

  function run() {
    var slots = document.querySelectorAll('[data-figures-disclaimer]');
    if (slots.length) {
      for (var i = 0; i < slots.length; i++) {
        if (!slots[i].textContent.trim()) slots[i].textContent = TXT;
      }
      return;
    }
    // Aucun emplacement explicite : ajout automatique en pied de page
    var p = document.createElement('p');
    p.textContent = TXT;
    p.style.cssText = 'max-width:780px;margin:24px auto 40px;padding:0 24px;text-align:center;color:var(--brand-muted,#8aa);font-size:.8rem;line-height:1.5;opacity:.85';
    document.body.appendChild(p);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
