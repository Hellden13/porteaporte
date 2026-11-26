// lib/_commande-telephone.js — « Commande téléphonique » (décisions de Denis, 26 nov. 2026).
//
// Un aîné (ou son enfant) appelle Denis. Denis crée la livraison dans l'admin et envoie un lien de paiement
// Stripe Checkout. Au lancement : cueillette d'une commande DÉJÀ PRÊTE ET PAYÉE à l'épicerie seulement ;
// le livreur n'avance jamais d'argent.
//  • La livraison est au nom du compte admin de Denis (expediteur_id) ; statut « en_attente » jusqu'au
//    paiement (invisible des livreurs), puis le webhook la passe à « paiement_autorise » (flux normal).
//  • Marquage : admin_note « 📞 Commande téléphonique » + événement « commande_telephonique » au journal.
//    (Colonne « source » : à créer dans prod-v2, voir docs/PLAN-MIGRATION-PROD-V2.md.)
//  • Prix : calculé par le SERVEUR avec les vrais tarifs (même calcul que price-estimate et create-mission).
//  • Paiement : Checkout, capture MANUELLE (comme les livraisons normales), lien valide 24 h, au plus
//    5 jours avant la livraison. Aucun numéro de carte n'est jamais saisi dans l'admin.
//  • Courriel et téléphone du payeur : chiffrés au journal, jamais écrits dans les journaux (console).
//  • Service aux aînés : interrupteur « partage » éteint par défaut → seul Denis voit et accepte ; allumé →
//    seulement les livreurs avec le badge « Approuvé service aux aînés » (accordé par l'admin).
'use strict';

const { computeDeliveryPrice, sbHeaders, alertAdmin, siteOrigin } = require('./_lib');
const { distanceLivraison } = require('./_distance');
const { prixMinimumTotal, PRIMES_PROTECTION_CENTS } = require('../js/repartition');
const { creerCodes, lireCodes, chiffrer, dechiffrer } = require('./_codes-livraison');
const { uneSeuleFois } = require('./_une-fois');

const MARQUE = '📞 Commande téléphonique';
const EVT_COMMANDE = 'commande_telephonique';
const EVT_LIEN = 'commande_tel_lien';
const EVT_REGLAGE = 'reglage_service_aines';
const EVT_BADGE = 'badge_service_aines';
const JOURS_MAX_AVANT = 5;
const LIEN_DUREE_S = 24 * 3600 - 120; // Stripe : 24 h au plus
const PRIORITE_CAD = 5; // même option que create-mission.html (« Priorité +5 CAD »)
const PROTECTIONS = ['none', 'base', 'standard']; // « Plus » retiré (lib/_protection.js)
const TAILLES = ['petit', 'moyen', 'gros'];
const TYPES = ['colis', 'nourriture'];
const FORMAT_JOUR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });

const jourQc = (ms) => FORMAT_JOUR.format(new Date(ms));
const texte = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const estCommandeTel = (l) => String(l?.admin_note || '').startsWith(MARQUE);

function rue(adresse) {
  return texte(String(adresse || '').split(',')[0], 80);
}
function titreCommande({ aine_nom, epicerie_nom, adresse_livraison }) {
  return `📞 ${texte(aine_nom, 60)} — ${texte(epicerie_nom, 60)} → ${rue(adresse_livraison)}`;
}

// ── Validation serveur de TOUS les champs ─────────────────────────────────────────────────────
function validerCommande(b, maintenant = Date.now()) {
  const e = (msg, champ) => ({ erreur: msg, champ });
  b = b || {};
  const v = {
    payeur_nom: texte(b.payeur_nom, 100),
    payeur_email: texte(b.payeur_email, 160).toLowerCase(),
    payeur_tel: String(b.payeur_tel || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''),
    aine_nom: texte(b.aine_nom, 100),
    adresse_livraison: texte(b.adresse_livraison, 200),
    ville_livraison: texte(b.ville_livraison, 80),
    cp_livraison: texte(b.cp_livraison, 7).toUpperCase(),
    epicerie_nom: texte(b.epicerie_nom, 100),
    epicerie_adresse: texte(b.epicerie_adresse, 200),
    epicerie_ville: texte(b.epicerie_ville, 80),
    cp_epicerie: texte(b.cp_epicerie, 7).toUpperCase(),
    commande_no: texte(b.commande_no, 60),
    date: texte(b.date, 10),
    heure_debut: texte(b.heure_debut, 5),
    heure_fin: texte(b.heure_fin, 5),
    note: texte(b.note, 500),
    poids_kg: b.poids_kg === undefined || b.poids_kg === '' ? 10 : Number(b.poids_kg),
    taille: texte(b.taille || 'moyen', 10).toLowerCase(),
    type: texte(b.type || 'colis', 20).toLowerCase(),
    protection: texte(b.protection || 'standard', 10).toLowerCase(),
    priorite: b.priorite === true || b.priorite === 'true' || b.priorite === 1 || b.priorite === '1',
    valeur_commande: b.valeur_commande === undefined || b.valeur_commande === '' ? null : Number(b.valeur_commande),
  };
  if (v.payeur_nom.length < 2) return e('Nom du payeur requis.', 'payeur_nom');
  if (!v.payeur_email && !v.payeur_tel) return e('Courriel ou cellulaire du payeur requis (pour le lien).', 'payeur_email');
  if (v.payeur_email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.payeur_email)) return e('Courriel du payeur invalide.', 'payeur_email');
  if (v.payeur_tel && !/^\d{10}$/.test(v.payeur_tel)) return e('Cellulaire du payeur invalide (10 chiffres).', 'payeur_tel');
  if (v.aine_nom.length < 2) return e('Nom de la personne qui reçoit requis.', 'aine_nom');
  if (v.adresse_livraison.length < 5 || v.ville_livraison.length < 2) return e('Adresse et ville de livraison requises.', 'adresse_livraison');
  if (v.epicerie_nom.length < 2) return e('Nom de l’épicerie requis.', 'epicerie_nom');
  if (v.epicerie_adresse.length < 5 || v.epicerie_ville.length < 2) return e('Adresse et ville de l’épicerie requises.', 'epicerie_adresse');
  if (v.commande_no.length < 1) return e('Nom ou numéro de la commande à l’épicerie requis (commande déjà prête et payée).', 'commande_no');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return e('Date de livraison requise (AAAA-MM-JJ).', 'date');
  const auj = jourQc(maintenant);
  const max = jourQc(maintenant + JOURS_MAX_AVANT * 86400000);
  if (v.date < auj) return e('La date de livraison est passée.', 'date');
  if (v.date > max) return e(`Le lien de paiement se crée au plus ${JOURS_MAX_AVANT} jours avant la livraison (l’autorisation de la carte expire après 7 jours).`, 'date');
  const hh = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hh.test(v.heure_debut) || !hh.test(v.heure_fin) || v.heure_debut >= v.heure_fin) return e('Plage horaire invalide (ex. 13:00 à 15:00).', 'heure_debut');
  if (!Number.isFinite(v.poids_kg) || v.poids_kg < 0.5 || v.poids_kg > 30) return e('Poids estimé entre 0,5 et 30 kg.', 'poids_kg');
  if (!TAILLES.includes(v.taille)) return e('Taille invalide.', 'taille');
  if (!TYPES.includes(v.type)) return e('Type invalide.', 'type');
  if (!PROTECTIONS.includes(v.protection)) return e('Protection invalide (aucune, Base ou Standard).', 'protection');
  if (v.valeur_commande !== null && (!Number.isFinite(v.valeur_commande) || v.valeur_commande < 0 || v.valeur_commande > 2000)) return e('Valeur de la commande entre 0 et 2 000 $.', 'valeur_commande');
  if (v.protection !== 'none' && !(v.valeur_commande > 0)) return e('Valeur de la commande requise avec une protection (la couverture ne dépasse jamais la valeur déclarée).', 'valeur_commande');
  return { valeurs: v };
}

// Champs qui servent au prix seulement (aperçu en direct dans l'admin).
function validerPrix(b) {
  b = b || {};
  const v = {
    epicerie_ville: texte(b.epicerie_ville, 80), ville_livraison: texte(b.ville_livraison, 80),
    cp_epicerie: texte(b.cp_epicerie, 7).toUpperCase(), cp_livraison: texte(b.cp_livraison, 7).toUpperCase(),
    poids_kg: b.poids_kg === undefined || b.poids_kg === '' ? 10 : Number(b.poids_kg),
    taille: texte(b.taille || 'moyen', 10).toLowerCase(), type: texte(b.type || 'colis', 20).toLowerCase(),
    protection: texte(b.protection || 'standard', 10).toLowerCase(),
    priorite: b.priorite === true || b.priorite === 'true' || b.priorite === 1 || b.priorite === '1',
  };
  if (v.epicerie_ville.length < 2 || v.ville_livraison.length < 2) return { erreur: 'Villes de l’épicerie et de livraison requises pour le prix.', champ: 'epicerie_ville' };
  if (!Number.isFinite(v.poids_kg) || v.poids_kg < 0.5 || v.poids_kg > 30) return { erreur: 'Poids estimé entre 0,5 et 30 kg.', champ: 'poids_kg' };
  if (!TAILLES.includes(v.taille)) return { erreur: 'Taille invalide.', champ: 'taille' };
  if (!TYPES.includes(v.type)) return { erreur: 'Type invalide.', champ: 'type' };
  if (!PROTECTIONS.includes(v.protection)) return { erreur: 'Protection invalide (aucune, Base ou Standard).', champ: 'protection' };
  return { valeurs: v };
}

// ── Prix : vrais tarifs, même calcul que price-estimate + options de create-mission.html ─────────
function prixCommande(v) {
  const dist = distanceLivraison({ ville_depart: v.epicerie_ville, ville_arrivee: v.ville_livraison, cp_depart: v.cp_epicerie, cp_arrivee: v.cp_livraison });
  const info = computeDeliveryPrice({ distance_km: dist.km, weight_kg: v.poids_kg, size: v.taille, type: v.type, urgency: 'flexible' });
  const livraison = prixMinimumTotal(info.price_cad); // prix suggéré + frais de service
  const protection = (PRIMES_PROTECTION_CENTS[v.protection] || 0) / 100;
  const priorite = v.priorite ? PRIORITE_CAD : 0;
  const total = Math.round((livraison + protection + priorite) * 100) / 100;
  return { distance_km: dist.km, distance_methode: dist.methode, prix_base: info.price_cad, livraison, protection, priorite, total, min_total: prixMinimumTotal(info.min_price_cad) };
}

// ── Stripe Checkout (capture manuelle, comme api/paiement-livraison.js) ────────────────────────
async function stripeForm(ctx, chemin, params, cle) {
  const r = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + ctx.stripeKey, 'Content-Type': 'application/x-www-form-urlencoded', ...(cle ? { 'Idempotency-Key': cle } : {}) },
    body: params ? params.toString() : '',
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

async function dernierLien(ctx, livraisonId) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?livraison_id=eq.${encodeURIComponent(livraisonId)}&event_type=eq.${EVT_LIEN}&select=evidence,created_at&order=created_at.desc&limit=1`, { headers: sbHeaders(ctx.sbKey) });
  const e = r.ok ? (await r.json().catch(() => []))[0] : null;
  return e?.evidence || null;
}

async function lireCommande(ctx, livraisonId) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?livraison_id=eq.${encodeURIComponent(livraisonId)}&event_type=eq.${EVT_COMMANDE}&select=evidence,created_at&order=created_at.asc&limit=1`, { headers: sbHeaders(ctx.sbKey) });
  const e = r.ok ? (await r.json().catch(() => []))[0] : null;
  return e?.evidence || null;
}

async function lireLivraison(ctx, id) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/livraisons?id=eq.${encodeURIComponent(id)}&select=id,code,statut,expediteur_id,livreur_id,prix_total,date_souhaitee,heure_souhaitee,admin_note,description,ville_depart,ville_arrivee,adresse_arrivee,pickup_code_hash,recipient_confirmation_hash,stripe_payment_intent&limit=1`, { headers: sbHeaders(ctx.sbKey) });
  return r.ok ? (await r.json().catch(() => []))[0] || null : null;
}

async function creerLienPaiement(ctx, livraison, commande, maintenant = Date.now()) {
  if (!ctx.stripeKey) return { status: 503, erreur: 'Stripe non configuré' };
  if (!estCommandeTel(livraison)) return { status: 409, erreur: 'Ce n’est pas une commande téléphonique.' };
  if (livraison.statut !== 'en_attente') return { status: 409, erreur: 'Cette commande est déjà payée ou n’attend plus de paiement.' };
  const date = String(livraison.date_souhaitee || '');
  if (date < jourQc(maintenant)) return { status: 409, erreur: 'La date de livraison est passée : crée une nouvelle commande.' };
  if (date > jourQc(maintenant + JOURS_MAX_AVANT * 86400000)) return { status: 409, erreur: `Trop tôt : le lien se crée au plus ${JOURS_MAX_AVANT} jours avant la livraison.` };
  const cents = Math.round(Number(livraison.prix_total) * 100);
  if (!(cents >= 50)) return { status: 400, erreur: 'Montant invalide.' };

  // L'ancien lien encore ouvert est fermé (un seul lien valide à la fois).
  const ancien = await dernierLien(ctx, livraison.id);
  if (ancien?.session_id && Date.parse(ancien.expires_at) > maintenant) {
    await stripeForm(ctx, `checkout/sessions/${encodeURIComponent(ancien.session_id)}/expire`, null).catch(() => null);
  }
  const n = Date.now();
  const p = new URLSearchParams({
    mode: 'payment',
    locale: 'fr-CA',
    'payment_method_types[]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'cad',
    'line_items[0][price_data][unit_amount]': String(cents),
    'line_items[0][price_data][product_data][name]': `Livraison PorteàPorte ${livraison.code || ''}`.trim(),
    'line_items[0][price_data][product_data][description]': 'Cueillette d’une commande d’épicerie déjà payée et livraison à domicile. Paiement prélevé seulement après la livraison.',
    'payment_intent_data[capture_method]': 'manual',
    'payment_intent_data[description]': `Livraison PorteàPorte - ${livraison.code || livraison.id}`,
    'payment_intent_data[metadata][type]': 'livraison',
    'payment_intent_data[metadata][source]': 'telephone',
    'payment_intent_data[metadata][plateforme]': 'porteaporte',
    'payment_intent_data[metadata][livraison_id]': livraison.id,
    'payment_intent_data[metadata][colis_id]': livraison.code || livraison.id,
    'payment_intent_data[metadata][expediteur_id]': livraison.expediteur_id,
    'metadata[livraison_id]': livraison.id,
    'metadata[source]': 'telephone',
    expires_at: String(Math.floor(maintenant / 1000) + LIEN_DUREE_S),
    success_url: `${siteOrigin()}/paiement-recu.html?statut=ok`,
    cancel_url: `${siteOrigin()}/paiement-recu.html?statut=annule`,
  });
  const email = commande?.payeur_email_c ? dechiffrer(commande.payeur_email_c) : null;
  if (email) p.set('customer_email', email);
  const s = await stripeForm(ctx, 'checkout/sessions', p, `commande-tel-${livraison.id}-${n}`);
  if (!s.ok || !s.data?.url) return { status: 502, erreur: s.data?.error?.message || 'Création du lien Stripe impossible.' };
  const lien = { session_id: s.data.id, url: s.data.url, expires_at: new Date((s.data.expires_at || Math.floor(maintenant / 1000) + LIEN_DUREE_S) * 1000).toISOString() };
  await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ livraison_id: livraison.id, user_id: null, actor_id: ctx.session?.id || null, event_type: EVT_LIEN, status: 'cree', evidence: lien }),
  }).catch(() => null);
  return { lien };
}

// ── Création ──────────────────────────────────────────────────────────────────────────────────
async function creerCommande(ctx, body, maintenant = Date.now()) {
  const val = validerCommande(body, maintenant);
  if (val.erreur) return { status: 400, erreur: val.erreur, champ: val.champ };
  const v = val.valeurs;
  const prix = prixCommande(v);
  if (!(prix.total >= prix.min_total)) return { status: 500, erreur: 'Prix sous le minimum : création refusée.' };
  const titre = titreCommande(v);
  const payload = {
    expediteur_id: ctx.session.id,
    statut: 'en_attente', // invisible des livreurs jusqu'au paiement (webhook → paiement_autorise)
    admin_note: `${MARQUE} — commande no ${v.commande_no}`,
    description: `${titre}\nCueillette : commande « ${v.commande_no} » déjà prête et payée à l’épicerie. Le livreur n’avance jamais d’argent.`,
    type_colis: v.type,
    taille_colis: v.taille,
    poids_kg: v.poids_kg,
    valeur_declaree: v.valeur_commande || 0,
    assurance_plan: v.protection,
    assurance_prix: prix.protection,
    prix_base: prix.prix_base,
    prix_total: prix.total,
    adresse_depart: `${v.epicerie_nom}, ${v.epicerie_adresse}`,
    ville_depart: v.epicerie_ville,
    adresse_arrivee: v.adresse_livraison,
    ville_arrivee: v.ville_livraison,
    destinataire_nom: v.aine_nom,
    date_souhaitee: v.date,
    heure_souhaitee: `${v.heure_debut}-${v.heure_fin}`,
    reception_heure_debut: v.heure_debut,
    reception_heure_fin: v.heure_fin,
    reception_note_livreur: v.note || null,
  };
  const ins = await fetch(`${ctx.sbUrl}/rest/v1/livraisons`, { method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=representation'), body: JSON.stringify(payload) });
  const lignes = ins.ok ? await ins.json().catch(() => []) : null;
  const livraison = Array.isArray(lignes) ? lignes[0] : null;
  if (!livraison?.id) return { status: 502, erreur: 'Création de la livraison impossible.' };

  const codes = await creerCodes(ctx, livraison.id);
  const commande = {
    titre, payeur_nom: v.payeur_nom,
    payeur_email_c: v.payeur_email ? chiffrer(v.payeur_email) : null,
    payeur_tel_c: v.payeur_tel ? chiffrer(v.payeur_tel) : null,
    aine_nom: v.aine_nom, epicerie_nom: v.epicerie_nom, commande_no: v.commande_no,
    prix,
  };
  await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ livraison_id: livraison.id, user_id: null, actor_id: ctx.session.id, event_type: EVT_COMMANDE, status: 'creee', evidence: commande }),
  }).catch(() => null);
  const l = await creerLienPaiement(ctx, { ...payload, ...livraison }, commande, maintenant);
  return {
    commande: {
      livraison_id: livraison.id, code: livraison.code, titre, prix,
      code_ramassage: codes?.ramassage || null, code_reception: codes?.reception || null,
      lien: l.lien || null, lien_erreur: l.erreur || null,
    },
  };
}

// ── Liste admin ───────────────────────────────────────────────────────────────────────────────
function masquerEmail(e) { const [u, d] = String(e || '').split('@'); return d ? `${u.slice(0, 2)}…@${d}` : null; }
function masquerTel(t) { const s = String(t || ''); return s.length === 10 ? `…${s.slice(-4)}` : null; }

async function listerCommandes(ctx) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${EVT_COMMANDE}&select=livraison_id,evidence,created_at&order=created_at.desc&limit=100`, { headers: sbHeaders(ctx.sbKey) });
  const evts = r.ok ? await r.json().catch(() => []) : [];
  const out = [];
  for (const e of Array.isArray(evts) ? evts : []) {
    const l = await lireLivraison(ctx, e.livraison_id);
    if (!l) continue;
    const [codes, lien] = await Promise.all([lireCodes(ctx, l), dernierLien(ctx, l.id)]);
    let livreur = null;
    if (l.livreur_id) {
      const p = await fetch(`${ctx.sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(l.livreur_id)}&select=prenom&limit=1`, { headers: sbHeaders(ctx.sbKey) });
      livreur = p.ok ? ((await p.json().catch(() => []))[0]?.prenom || 'Livreur') : 'Livreur';
    }
    const ev = e.evidence || {};
    const email = ev.payeur_email_c ? dechiffrer(ev.payeur_email_c) : null;
    const tel = ev.payeur_tel_c ? dechiffrer(ev.payeur_tel_c) : null;
    out.push({
      livraison_id: l.id, code: l.code, titre: ev.titre, statut: l.statut, livreur,
      payeur_nom: ev.payeur_nom, payeur_email: email, payeur_tel: tel,
      aine_nom: ev.aine_nom, epicerie_nom: ev.epicerie_nom, commande_no: ev.commande_no,
      date: l.date_souhaitee, plage: l.heure_souhaitee, prix_total: l.prix_total,
      code_ramassage: codes.ramassage, code_reception: codes.reception,
      lien: lien && Date.parse(lien.expires_at) > Date.now() && l.statut === 'en_attente' ? lien : null,
      lien_expire: lien ? Date.parse(lien.expires_at) <= Date.now() : null,
      cree_le: e.created_at,
    });
  }
  return out;
}

// ── Courriel du lien (seulement sur clic de Denis) ──────────────────────────────────────────────
async function donneesCourrielLien(ctx, livraisonId) {
  const l = await lireLivraison(ctx, livraisonId);
  if (!l || !estCommandeTel(l)) return { status: 404, erreur: 'Commande introuvable.' };
  if (l.statut !== 'en_attente') return { status: 409, erreur: 'Cette commande est déjà payée.' };
  const c = await lireCommande(ctx, l.id);
  const email = c?.payeur_email_c ? dechiffrer(c.payeur_email_c) : null;
  if (!email) return { status: 409, erreur: 'Aucun courriel de payeur : copie le lien et envoie-le autrement.' };
  const lien = await dernierLien(ctx, l.id);
  if (!lien || Date.parse(lien.expires_at) <= Date.now()) return { status: 409, erreur: 'Le lien a expiré : génère un nouveau lien d’abord.' };
  return {
    donnees: {
      to: email, payeur_nom: c.payeur_nom, aine_nom: c.aine_nom, epicerie_nom: c.epicerie_nom,
      date: l.date_souhaitee, plage: l.heure_souhaitee, montant: Number(l.prix_total).toFixed(2),
      url: lien.url, expires_at: lien.expires_at, code: l.code,
    },
  };
}

// ── Service aux aînés : interrupteur + badge ────────────────────────────────────────────────────
async function lireReglage(ctx) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${EVT_REGLAGE}&select=evidence,created_at&order=created_at.desc&limit=1`, { headers: sbHeaders(ctx.sbKey) });
  const e = r.ok ? (await r.json().catch(() => []))[0] : null;
  return { partage: e?.evidence?.partage === true }; // éteint par défaut (et si illisible)
}
async function ecrireReglage(ctx, partage) {
  const p = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ user_id: null, actor_id: ctx.session.id, event_type: EVT_REGLAGE, status: partage ? 'active' : 'desactive', evidence: { partage: Boolean(partage) } }),
  });
  return p.ok;
}
// Livreurs approuvés : dernier événement par livreur (accorde vrai/faux).
async function livreursApprouves(ctx) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${EVT_BADGE}&select=evidence,created_at&order=created_at.asc&limit=2000`, { headers: sbHeaders(ctx.sbKey) });
  const rows = r.ok ? await r.json().catch(() => []) : [];
  const etat = new Map();
  for (const e of Array.isArray(rows) ? rows : []) if (e.evidence?.livreur_id) etat.set(e.evidence.livreur_id, e.evidence.accorde === true);
  return new Set([...etat].filter(([, ok]) => ok).map(([id]) => id));
}
async function badgeLivreur(ctx, livreurId, accorde) {
  const p = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
    method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=minimal'),
    body: JSON.stringify({ user_id: livreurId, actor_id: ctx.session.id, event_type: EVT_BADGE, status: accorde ? 'accorde' : 'retire', evidence: { livreur_id: livreurId, accorde: Boolean(accorde) } }),
  });
  return p.ok;
}

// Qui peut voir et accepter une commande téléphonique ? Les autres livraisons : pas de changement.
async function peutPrendre(ctx, livraison, livreurId, cache = {}) {
  if (!estCommandeTel(livraison)) return true;
  if (livreurId && livreurId === livraison.expediteur_id) return true; // Denis
  const reglage = cache.reglage || (cache.reglage = await lireReglage(ctx));
  if (!reglage.partage) return false;
  const approuves = cache.approuves || (cache.approuves = await livreursApprouves(ctx));
  return approuves.has(livreurId);
}

// ── Au paiement (webhook) : alerte [PP-ALERTE] Livraison + notification aux livreurs permis ─────
async function apresPaiementCommande(ctx, livraisonId, { deliverPush } = {}) {
  const l = await lireLivraison(ctx, livraisonId);
  if (!l || !estCommandeTel(l)) return { fait: false };
  const premiere = await uneSeuleFois(ctx, `commande_tel_payee:${l.id}`, { eventType: 'commande_tel_payee', livraisonId: l.id, status: 'fait' });
  if (!premiere) return { fait: false, deja: true };
  const c = (await lireCommande(ctx, l.id)) || {};
  await alertAdmin(
    `Nouvelle livraison payée — commande téléphonique ${l.code || ''}`.trim(),
    'Le payeur a autorisé le paiement. La commande est maintenant offerte aux livreurs permis.',
    {
      title: c.titre || MARQUE,
      details: { 'Code': l.code || '', 'Trajet': `${l.ville_depart || '?'} → ${l.ville_arrivee || '?'}`, 'Date': `${l.date_souhaitee || ''} ${l.heure_souhaitee || ''}`.trim(), 'Prix total': `${Number(l.prix_total).toFixed(2)} $` },
      cta_url: `${siteOrigin()}/admin/commandes-telephoniques.html`,
      cta_label: '📞 Voir les commandes téléphoniques →',
    }
  );
  const destinataires = [];
  if (typeof deliverPush === 'function') {
    const reglage = await lireReglage(ctx);
    const ids = reglage.partage ? [l.expediteur_id, ...(await livreursApprouves(ctx))] : [l.expediteur_id];
    for (const id of [...new Set(ids)]) {
      destinataires.push(id);
      await deliverPush(ctx, { type: 'nouvelle_mission', user_id: id, data: { id: l.id, title: c.titre || MARQUE, ville_depart: l.ville_depart, ville_arrivee: l.ville_arrivee, prix_total: l.prix_total, url: `/browse-missions.html?focus=${l.id}` } }).catch(() => null);
    }
  }
  return { fait: true, notifies: destinataires.length };
}

module.exports = {
  MARQUE, EVT_COMMANDE, EVT_LIEN, EVT_REGLAGE, EVT_BADGE, JOURS_MAX_AVANT,
  estCommandeTel, titreCommande, validerCommande, validerPrix, prixCommande, creerCommande, creerLienPaiement,
  lireLivraison, lireCommande, dernierLien, listerCommandes, donneesCourrielLien, masquerEmail, masquerTel,
  lireReglage, ecrireReglage, livreursApprouves, badgeLivreur, peutPrendre, apresPaiementCommande,
};
