// scripts/inject-meta.js — Injecte meta description + og: sur toutes les pages HTML
// Usage : node scripts/inject-meta.js
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const META = {
  'index.html':              { desc: 'PorteÀPorte — Livraison collaborative et covoiturage entre particuliers au Québec. Envoyez vos colis, gagnez de l\'argent comme livreur ou partagez vos trajets.', img: '/hero-center.jpg' },
  'covoiturage.html':        { desc: 'Trouvez ou publiez un trajet de covoiturage au Québec. Partagez les frais, réduisez votre empreinte carbone et rencontrez de nouvelles personnes.', img: '/hero-center.jpg' },
  'covoiturage-info.html':   { desc: 'Tout savoir sur le covoiturage PorteÀPorte : tarifs, assurance, comment ça marche et comment commencer à covoiturer dès aujourd\'hui.', img: '/hero-center.jpg' },
  'expediteur.html':         { desc: 'Envoyez vos colis facilement entre particuliers avec PorteÀPorte. Prix transparents, suivi en temps réel et livraison écoresponsable.', img: '/hero-left.jpg' },
  'devenir-livreur.html':    { desc: 'Devenez livreur PorteÀPorte et gagnez de l\'argent en livrant des colis sur vos trajets habituels. Inscription gratuite, paiements rapides.', img: '/hero-right.jpg' },
  'parrainage.html':         { desc: 'Parrainez vos amis sur PorteÀPorte et gagnez des Points Impact. Partagez votre code unique et recevez des récompenses dès leur première action.', img: null },
  'programme-points.html':   { desc: 'Découvrez le programme Points Impact de PorteÀPorte : gagnez des points à chaque action, montez en niveau et participez aux tirages mensuels.', img: null },
  'abonnements.html':        { desc: 'Abonnements PorteÀPorte Pro — Profitez d\'avantages exclusifs, de réductions et d\'un accès prioritaire aux meilleures missions.', img: null },
  'assurance.html':          { desc: 'Assurance colis PorteÀPorte — Protégez vos envois jusqu\'à 500 $ avec notre couverture intégrée. Simple, rapide et sans franchise.', img: null },
  'faq.html':                { desc: 'Questions fréquentes sur PorteÀPorte : livraison, covoiturage, paiements, sécurité et plus. Toutes les réponses en un seul endroit.', img: null },
  'contact.html':            { desc: 'Contactez l\'équipe PorteÀPorte pour toute question, demande de partenariat ou signalement. Nous répondons sous 24 heures.', img: null },
  'transparence.html':       { desc: 'Rapport de transparence PorteÀPorte : impact environnemental, kilomètres parcourus, CO₂ économisé et organismes soutenus.', img: null },
  'partenaire.html':         { desc: 'Devenez partenaire PorteÀPorte — Offrez la livraison collaborative à vos clients et contribuez à une logistique plus humaine et écoresponsable.', img: null },
  'cgu.html':                { desc: 'Conditions générales d\'utilisation de la plateforme PorteÀPorte.', img: null },
  'cgv.html':                { desc: 'Conditions générales de vente des services PorteÀPorte.', img: null },
  'confidentialite.html':    { desc: 'Politique de confidentialité PorteÀPorte — Comment nous collectons, utilisons et protégeons vos données personnelles.', img: null },
  'reglements-concours.html':{ desc: 'Règlements officiels des concours et promotions PorteÀPorte. Aucun achat requis.', img: null },
  'reglements-tirage.html':  { desc: 'Règlements des tirages au sort PorteÀPorte Points Impact. Aucun achat requis.', img: null },
};

const OG_SITE   = 'PorteÀPorte';
const OG_ORIGIN = 'https://porteaporte.site';
const OG_DEFAULT_IMG = '/hero-center.jpg';

let updated = 0;
let skipped  = 0;

for (const [file, { desc, img }] of Object.entries(META)) {
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) { console.log(`⚠️  Introuvable : ${file}`); continue; }

  let html = fs.readFileSync(filePath, 'utf8');

  // Extraire le titre
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : OG_SITE;

  // Ne pas dupliquer
  if (html.includes('og:description') && html.includes('og:title')) {
    skipped++;
    continue;
  }

  const ogImg = img ? `${OG_ORIGIN}${img}` : `${OG_ORIGIN}${OG_DEFAULT_IMG}`;

  const metaBlock = `
  <meta name="description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${OG_SITE}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:url" content="${OG_ORIGIN}/${file}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${ogImg}">`;

  // Injecter juste avant </head>
  if (!html.includes('</head>')) { console.log(`⚠️  Pas de </head> : ${file}`); continue; }
  html = html.replace('</head>', metaBlock + '\n</head>');
  fs.writeFileSync(filePath, html, 'utf8');
  updated++;
  console.log(`✅ ${file}`);
}

console.log(`\n${updated} pages mises à jour, ${skipped} déjà complètes.`);
