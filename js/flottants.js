/* js/flottants.js — Range les boutons flottants pour qu'ils ne cachent plus le contenu
   (test complet du 22 nov. 2026, point 23) :
   • bas de page réservé (le dernier contenu peut toujours défiler au-dessus des boutons);
   • plus de boutons empilés au même endroit (menu carré bleu et bulle d'aide étaient superposés);
   • sur cellulaire : boutons plus petits, « GPS actif » réduit à un point. */
(function () {
  'use strict';
  if (document.getElementById('pap-flottants-css')) return;
  var s = document.createElement('style');
  s.id = 'pap-flottants-css';
  s.textContent =
    'body{padding-bottom:max(var(--pap-reserve-bas,92px),env(safe-area-inset-bottom))}' +
    // Point 43 : le texte d'une carte (adresse, nom, courriel, code, description longue) ne déborde plus :
    // il passe à la ligne à l'intérieur de la carte, et une carte ne dépasse jamais l'écran.
    // break-word (et non anywhere) : un mot long passe à la ligne, mais une colonne étroite ne s'écrase plus
    // jusqu'à une lettre par ligne (bogue du texte vertical, fiche du conducteur, 23 nov. 2026).
    '[class*="card"]{min-width:0;max-width:100%;box-sizing:border-box}' +
    '[class*="card"],[class*="card"] *{overflow-wrap:break-word;word-break:normal}' +
    '[class*="card"] img,[class*="card"] video,[class*="card"] canvas{max-width:100%}' +
    /* Ordinateur : bulle d'aide en bas à droite, menu juste au-dessus, GPS au centre. */
    '#pia-launch{right:20px!important;bottom:20px!important}' +
    '.pap-launcher-btn{right:21px!important;bottom:88px!important}' +
    '#pap-gps-status{left:50%!important;right:auto!important;bottom:20px!important;transform:translateX(-50%);white-space:nowrap}' +
    /* 24 nov. 2026 (vu sur Brave Android) :
       • la marge intérieure générale des boutons (12px 18px) écrasait l'icône à 6 px dans les boutons ronds;
       • libellé visible « Menu » / « Aide » sous l'icône;
       • (le bouton « Niveau » a été retiré le 26 nov. 2026 : il ne changeait rien à l'affichage). */
    '.pap-launcher-btn,#pia-launch{padding:0!important;flex-direction:column!important;gap:2px;line-height:1}' +
    '.pap-launcher-btn svg,#pia-launch svg{max-width:none!important;flex:none!important;width:26px!important;height:26px!important}' +
    '.pap-launcher-btn::after,#pia-launch::after{font:800 11px/1 system-ui,-apple-system,sans-serif;letter-spacing:.02em;color:#051022}' +
    '.pap-launcher-btn::after{content:"Menu"}' +
    '#pia-launch::after{content:"Aide"}' +
    '#pia-launch{display:flex!important;align-items:center!important;justify-content:center!important}' +
    '@media (max-width:640px){' +
      'body{--pap-reserve-bas:84px}' +
      '#pia-launch{width:58px!important;height:58px!important;border-radius:16px!important;right:12px!important;bottom:12px!important}' +
      '.pap-launcher-btn{width:58px!important;height:58px!important;font-size:19px!important;right:12px!important;bottom:78px!important}' +
      '.pap-launcher-btn svg,#pia-launch svg{width:26px!important;height:26px!important}' +
      '#pap-gps-status{bottom:20px!important;padding:6px 10px!important;font-size:.72rem!important;max-width:calc(100vw - 140px);overflow:hidden;text-overflow:ellipsis}' +
    '}';
  (document.head || document.documentElement).appendChild(s);
})();
