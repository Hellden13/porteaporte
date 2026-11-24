/* js/flottants.js — Range les boutons flottants pour qu'ils ne cachent plus le contenu
   (test complet du 22 nov. 2026, point 23) :
   • bas de page réservé (le dernier contenu peut toujours défiler au-dessus des boutons);
   • plus de boutons empilés au même endroit (menu carré bleu et bulle d'aide étaient superposés);
   • sur cellulaire : boutons plus petits, « Niveau » réduit à une icône, « GPS actif » réduit à un point. */
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
    /* Ordinateur : bulle d'aide en bas à droite, menu juste au-dessus, GPS au centre, Niveau à gauche. */
    '#pia-launch{right:20px!important;bottom:20px!important}' +
    '.pap-launcher-btn{right:21px!important;bottom:88px!important}' +
    '#pap-gps-status{left:50%!important;right:auto!important;bottom:20px!important;transform:translateX(-50%);white-space:nowrap}' +
    '.pp-layer-pill{left:18px!important;bottom:20px!important}' +
    '@media (max-width:640px){' +
      'body{--pap-reserve-bas:76px}' +
      '#pia-launch{width:44px!important;height:44px!important;border-radius:14px!important;right:12px!important;bottom:12px!important}' +
      '#pia-launch svg{width:22px!important;height:22px!important}' +
      '.pap-launcher-btn{width:44px!important;height:44px!important;font-size:19px!important;right:12px!important;bottom:64px!important}' +
      '.pp-layer-pill{left:12px!important;bottom:12px!important;padding:0!important;width:44px!important;height:44px!important;min-width:0!important;justify-content:center!important;overflow:hidden}' +
      '.pp-layer-pill > :not(.pp-layer-chevron){display:none!important}' +
      '#pap-gps-status{bottom:20px!important;padding:6px 10px!important;font-size:.72rem!important;max-width:calc(100vw - 140px);overflow:hidden;text-overflow:ellipsis}' +
    '}';
  (document.head || document.documentElement).appendChild(s);
})();
