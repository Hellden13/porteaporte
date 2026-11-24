// lib/_admin-a-faire.js — Écran d'accueil admin « À faire maintenant » (lot 1, morceau 2).
// Ne renvoie QUE ce qui demande une action de l'admin. Lecture seule : aucune écriture en base.
'use strict';

const { sbHeaders } = require('./_lib');
const { EVT_RELANCE } = require('./_relance');

const DELAI_48H_MS = 48 * 3600 * 1000;

// Livraison « bloquée » : en cours (payée, acceptée, imprévu ou litige), sans aucun changement depuis 48 h.
const STATUTS_LIVRAISON_BLOQUEE = [
  'paiement_autorise', 'offre_recue', 'confirme', 'en_route', 'ramasse',
  'relivraison_demandee', 'retour_expediteur', 'litige',
];
// Livraison « à capturer » : livrée, argent pas encore libéré.
const STATUTS_LIVRAISON_A_CAPTURER = ['livre', 'livree', 'delivered'];

function nomComplet(p) {
  return [p?.prenom, p?.nom].filter(Boolean).join(' ') || p?.email || '—';
}

function dateRef(row) {
  const d = row?.updated_at || row?.created_at || row?.cree_le || null;
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

// Fonction pure : à partir des lignes lues, construit la liste d'actions. `now` en ms.
function construireAFaire(sources, now = Date.now()) {
  const profiles = Array.isArray(sources.profiles) ? sources.profiles : [];
  const livraisons = Array.isArray(sources.livraisons) ? sources.livraisons : [];
  const bookings = Array.isArray(sources.bookings) ? sources.bookings : [];
  const reports = Array.isArray(sources.reports) ? sources.reports : [];
  const manquements = Array.isArray(sources.manquements) ? sources.manquements : [];
  const applications = Array.isArray(sources.applications) ? sources.applications : [];
  const preuvesBrutes = Array.isArray(sources.preuves) ? sources.preuves : [];
  const signalementsLivraison = Array.isArray(sources.signalementsLivraison) ? sources.signalementsLivraison : [];
  const photosBrutes = Array.isArray(sources.photos) ? sources.photos : [];
  // Dernier envoi « Relancer » par membre (journal d'audit, le plus récent d'abord).
  const dernieresRelances = new Map();
  for (const e of (Array.isArray(sources.relances) ? sources.relances : [])) {
    const t = e?.created_at ? new Date(e.created_at).getTime() : NaN;
    if (!e?.user_id || !Number.isFinite(t)) continue;
    const deja = dernieresRelances.get(e.user_id);
    if (!deja || t > new Date(deja).getTime()) dernieresRelances.set(e.user_id, e.created_at);
  }
  const limite = now - DELAI_48H_MS;

  const actifs = profiles.filter((p) => p && !p.suspendu);

  // Même règle que le bouton « Relancer » existant du tableau des utilisateurs.
  const relancer = actifs
    .filter((p) => ['livreur', 'les deux'].includes(p.role) && p.driver_status === 'not_started')
    .map((p) => ({ id: p.id, nom: nomComplet(p), email: p.email || null, depuis: p.created_at || null, derniere_relance: dernieresRelances.get(p.id) || null }));

  const livraisonsAction = [];
  for (const l of livraisons) {
    const statut = String(l?.statut || l?.status || '').toLowerCase().trim();
    const t = dateRef(l);
    if (t === null || t > limite) continue;
    let type = null;
    if (STATUTS_LIVRAISON_A_CAPTURER.includes(statut)) type = 'a_capturer';
    else if (STATUTS_LIVRAISON_BLOQUEE.includes(statut)) type = 'bloquee';
    if (!type) continue;
    livraisonsAction.push({
      id: l.id, code: l.code || null, statut, type,
      trajet: `${l.ville_depart || '?'} → ${l.ville_arrivee || '?'}`,
      depuis: new Date(t).toISOString(),
    });
  }

  const reservations = bookings
    .filter((b) => b && b.status === 'en_attente')
    .map((b) => ({
      id: b.id, ride_id: b.ride_id || null,
      passager: b.passenger_profile?.prenom || null,
      places: b.seats_reserved ?? null, depuis: b.created_at || null,
    }));

  const signalements = [
    // Conversation signalée (covoiturage) : reason « messagerie:… » → page des conversations signalées
    ...reports.filter((r) => r && r.status === 'ouvert').map((r) => ({
      id: r.id, source: String(r.reason || '').startsWith('messagerie:') ? 'messagerie' : 'covoiturage',
      motif: String(r.reason || '—').replace(/^messagerie:/, ''), depuis: r.created_at || null,
    })),
    ...signalementsLivraison.filter((e) => e && e.status === 'ouvert' && e.evidence && e.evidence.sorte === 'livraison').map((e) => ({
      id: e.id, source: 'messagerie', motif: e.evidence.raison || '—', depuis: e.created_at || null,
    })),
    ...manquements.filter((m) => m && m.statut === 'signale').map((m) => ({
      id: m.id, source: 'manquement', motif: m.categorie || '—', depuis: m.signale_at || m.created_at || null,
    })),
  ];

  const validations = [
    ...applications.filter((a) => a && a.status === 'pending').map((a) => ({
      id: a.id, type: 'organisme', nom: a.organisation_name || '—', depuis: a.created_at || null,
    })),
    ...actifs.filter((p) => p.driver_status === 'pending_review').map((p) => ({
      id: p.id, type: 'livreur', nom: nomComplet(p), depuis: p.created_at || null,
    })),
  ];

  // Preuves de livraison déposées, pas encore révisées
  const preuves = preuvesBrutes.filter((x) => x && x.status === 'submitted' && x.livraison_id)
    .map((x) => ({ id: x.id, livraison_id: x.livraison_id, depuis: x.created_at || null }));
  // Photos de profil en attente de modération
  const photos = photosBrutes.filter((x) => x && x.photo_status === 'pending')
    .map((x) => ({ id: x.id, nom: nomComplet(x), depuis: x.photo_submitted_at || null }));

  const items = { preuves, signalements, validations, photos, livraisons: livraisonsAction, reservations, relancer };
  const total = Object.values(items).reduce((s, a) => s + a.length, 0);
  return { items, total };
}

async function lire(url, key) {
  try {
    const r = await fetch(url, { headers: sbHeaders(key) });
    if (!r.ok) return { ok: false, rows: [] };
    const rows = await r.json();
    return { ok: Array.isArray(rows), rows: Array.isArray(rows) ? rows : [] };
  } catch (_) {
    return { ok: false, rows: [] };
  }
}

async function adminAFaire(req, res, ctx) {
  if (ctx.profile?.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const u = ctx.sbUrl;
  const k = ctx.sbKey;
  const statutsLiv = [...STATUTS_LIVRAISON_BLOQUEE, ...STATUTS_LIVRAISON_A_CAPTURER].join(',');

  const [profiles, livraisons, bookings, reports, manquements, applications, relances, preuves, signalementsLivraison, photos] = await Promise.all([
    lire(`${u}/rest/v1/profiles?select=id,prenom,nom,email,role,driver_status,suspendu,created_at&driver_status=in.(not_started,pending_review)&order=created_at.asc&limit=500`, k),
    lire(`${u}/rest/v1/livraisons?select=*&statut=in.(${statutsLiv})&limit=500`, k),
    lire(`${u}/rest/v1/ride_bookings?select=id,ride_id,status,seats_reserved,created_at,passenger_profile:profiles!passenger_id(prenom)&status=eq.en_attente&order=created_at.asc&limit=200`, k),
    lire(`${u}/rest/v1/ride_reports?select=id,reason,status,created_at&status=eq.ouvert&order=created_at.asc&limit=200`, k),
    lire(`${u}/rest/v1/manquements?select=id,categorie,statut,signale_at&statut=eq.signale&order=signale_at.asc&limit=200`, k),
    lire(`${u}/rest/v1/impact_applications?select=id,organisation_name,status,created_at&status=eq.pending&order=created_at.asc&limit=200`, k),
    lire(`${u}/rest/v1/transaction_audit_events?select=user_id,created_at&event_type=eq.${EVT_RELANCE}&status=eq.envoye&order=created_at.desc&limit=1000`, k),
    lire(`${u}/rest/v1/delivery_proofs?select=id,livraison_id,status,created_at&status=eq.submitted&order=created_at.asc&limit=200`, k),
    lire(`${u}/rest/v1/transaction_audit_events?select=id,status,evidence,created_at&event_type=eq.messages_signales&status=eq.ouvert&order=created_at.asc&limit=200`, k),
    lire(`${u}/rest/v1/profiles?select=id,prenom,nom,photo_status,photo_submitted_at&photo_status=eq.pending&order=photo_submitted_at.asc&limit=200`, k),
  ]);

  const sources = { profiles, livraisons, bookings, reports, manquements, applications, relances, preuves, signalementsLivraison, photos };
  // Une source illisible ne doit jamais faire croire qu'il n'y a « rien à faire ».
  const erreurs = Object.entries(sources).filter(([, v]) => !v.ok).map(([nom]) => nom);
  const { items, total } = construireAFaire({
    profiles: profiles.rows, livraisons: livraisons.rows, bookings: bookings.rows,
    reports: reports.rows, manquements: manquements.rows, applications: applications.rows,
    relances: relances.rows, preuves: preuves.rows, signalementsLivraison: signalementsLivraison.rows, photos: photos.rows,
  });
  return res.status(200).json({ success: true, generated_at: new Date().toISOString(), total, items, erreurs });
}

module.exports = { construireAFaire, adminAFaire, DELAI_48H_MS, STATUTS_LIVRAISON_BLOQUEE, STATUTS_LIVRAISON_A_CAPTURER };
