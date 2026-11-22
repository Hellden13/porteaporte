// lib/_concours-fetes.js — Concours des Fêtes PorteàPorte 2026 + thème des Fêtes.
// Réutilise les tables de tirage existantes : monthly_draws (le concours), draw_entries (participations
// par membre), draw_winners (gagnant). Aucune migration.
//
// Règles (Denis, 22 nov. 2026) :
//  - Inscription (Denis, 22 nov. 2026, règlement art. 5 a) : chaque membre reçoit automatiquement UNE
//    participation gratuite, qu'il utilise le service ou non : courriel vérifié, compte non suspendu
//    (les comptes archivés sont suspendus), compte créé au plus tard le 31 déc. 2026 23 h 59 (Québec).
//    Exclus : comptes de test (adresse), admins (l'Organisateur, règlement art. 3). Aucun formulaire,
//    aucune participation par lettre, aucun achat en PorteCoins.
//  - Participations supplémentaires par le service (art. 5 b) :
//  - Livraison complétée et payée (statut « payee », capture faite), sans litige : 1 participation à l'expéditeur.
//  - Trajet de covoiturage complété et payé (réservation « paye », paiement capturé), sans litige :
//    1 participation au passager et 1 au conducteur.
//  - Litige : participation suspendue pendant le litige, rendue s'il est refusé ou réglé en faveur du
//    membre, retirée s'il est réglé contre lui. Tout est RECALCULÉ depuis les données réelles.
//  - Date limite : 31 décembre 2026, 23 h 59, heure du Québec. Tirage pondéré, seulement après la date limite,
//    inscrit au journal d'audit et non modifiable.
//  - Thème des Fêtes jusqu'au 6 janvier 2027 inclus, puis retrait automatique ; interrupteur admin.
'use strict';

const crypto = require('crypto');
const { sbHeaders } = require('./_lib');

const CONCOURS = Object.freeze({
  slug: 'concours-fetes-2026', // marque réservée (monthly_draws.eligibility_badge_slug) : identifie le concours
  titre: 'Concours des Fêtes 2026',
  prix: 'Carte-cadeau Super C de 100 $',
  // 31 décembre 2026 23 h 59 59,999 à Québec (heure normale de l'Est, UTC−5).
  fin: '2027-01-01T04:59:59.999Z',
  // Thème visible jusqu'au 6 janvier 2027 inclus : coupé le 7 janvier à 0 h, heure du Québec.
  finTheme: '2027-01-07T05:00:00.000Z',
  reglement: '/concours-fetes-reglement.html',
});

const STATUTS_RESA_PAYEE = new Set(['paye', 'complete', 'completed', 'termine']);
const EVT_TIRAGE = 'concours_fetes_tirage';
const EVT_THEME = 'concours_fetes_theme';

const ms = (d) => { const t = d ? new Date(d).getTime() : NaN; return Number.isFinite(t) ? t : null; };

function tirageAutorise(now = Date.now()) {
  return now > ms(CONCOURS.fin);
}

function themeActif({ now = Date.now(), interrupteur = true, lance = true } = {}) {
  return Boolean(lance) && interrupteur !== false && now < ms(CONCOURS.finTheme);
}

// Compte de test : reconnu à son adresse (« test », « demo », « fictif », « e2e », domaines d'exemple).
// Un « + » seul ne suffit pas : beaucoup de vraies adresses en ont un.
function estCompteTest(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return true; // sans adresse utilisable : pas de participation
  const [local, domaine] = [e.slice(0, e.lastIndexOf('@')), e.slice(e.lastIndexOf('@') + 1)];
  if (/(^|[^a-z])(test|tests|testeur|testeuse|demo|fictif|fictive|e2e)([^a-z]|$)/.test(local)) return true;
  if (/^test|^demo/.test(local)) return true;
  if (/(^|\.)(example|exemple)\.(com|org|net|ca)$/.test(domaine)) return true;
  if (/\.(test|invalid|local|localhost|example)$/.test(domaine)) return true;
  return false;
}

// Participation d'inscription : une seule par compte, aux conditions de l'art. 5 a).
// membre : { id, email, role, suspendu, created_at, email_confirmed_at, email_verified, banned_until }
function inscriptionAdmissible(m, finMs, now = Date.now()) {
  if (!m || !m.id) return false;
  if (m.suspendu === true) return false; // suspendu ou archivé
  if (m.banned_until && (ms(m.banned_until) ?? 0) > now) return false; // bloqué dans Supabase Auth
  if (String(m.role || '').toLowerCase() === 'admin') return false; // l'Organisateur
  if (estCompteTest(m.email)) return false;
  const cree = ms(m.created_at);
  if (cree === null || cree > finMs) return false;
  const confirme = ms(m.email_confirmed_at);
  if (confirme !== null) return confirme <= finMs;
  return m.email_verified === true; // drapeau du profil, sans date
}

// Calcule les participations validées. Fonction pure (testable), données réelles en entrée.
// sources : { livraisons, litiges, bookings, rides, reports, membres? } ; fenetre : { debut, fin } (ISO ou ms).
function calculerParticipations(sources, fenetre) {
  const debut = ms(fenetre?.debut);
  const fin = ms(fenetre?.fin ?? CONCOURS.fin);
  const dansFenetre = (d) => { const t = ms(d); return t !== null && (debut === null || t >= debut) && t <= fin; };

  // Litiges (Denis, 22 nov. 2026) : pendant le litige, la participation est SUSPENDUE ; réglé en faveur
  // du membre ou refusé, elle REVIENT ; retirée seulement si le litige est réglé CONTRE le membre.
  //  - Livraison (table litiges, plaignant_id) : ouvert/en_analyse = en cours ; rejete = refusé ;
  //    resolu/rembourse = réglé en faveur du plaignant (donc contre le membre s'il n'est pas le plaignant).
  //  - Covoiturage (ride_reports, reporter_id/reported_id) : ouvert/en_traitement = en cours ; ferme = refusé ;
  //    resolu = réglé contre la personne signalée (reported_id).
  const EN_COURS_LIV = new Set(['ouvert', 'en_analyse']);
  const REGLE_LIV = new Set(['resolu', 'rembourse']);
  const EN_COURS_COV = new Set(['ouvert', 'en_traitement']);
  // Effet d'un litige pour un membre : 'suspendue' | 'retiree' | null (aucun effet).
  const effetLivraison = (litiges, membre) => {
    let effet = null;
    for (const l of litiges) {
      const st = String(l?.statut || 'ouvert').toLowerCase();
      if (EN_COURS_LIV.has(st)) effet = effet || 'suspendue';
      else if (REGLE_LIV.has(st) && l.plaignant_id !== membre) return 'retiree';
    }
    return effet;
  };
  const effetCovoiturage = (reports, membre) => {
    let effet = null;
    for (const r of reports) {
      const st = String(r?.status || 'ouvert').toLowerCase();
      if (EN_COURS_COV.has(st)) effet = effet || 'suspendue';
      else if (st === 'resolu' && r.reported_id && r.reported_id === membre) return 'retiree';
    }
    return effet;
  };
  const litigesParLiv = new Map();
  for (const l of sources.litiges || []) {
    if (!l?.livraison_id) continue;
    if (!litigesParLiv.has(l.livraison_id)) litigesParLiv.set(l.livraison_id, []);
    litigesParLiv.get(l.livraison_id).push(l);
  }
  const reportsParResa = new Map(); const reportsParTrajet = new Map();
  for (const r of sources.reports || []) {
    const cible = r?.booking_id ? reportsParResa : (r?.ride_id ? reportsParTrajet : null);
    const cle = r?.booking_id || r?.ride_id;
    if (!cible) continue;
    if (!cible.has(cle)) cible.set(cle, []);
    cible.get(cle).push(r);
  }
  const conducteurDe = new Map((sources.rides || []).map((r) => [r.id, r.driver_id]));

  const par = new Map();
  const fiche = (uid) => par.get(uid) || { user_id: uid, total: 0, suspendues: 0, inscription: 0, livraisons: 0, trajets_passager: 0, trajets_conducteur: 0, refs: [] };
  const ajouter = (uid, type, ref, effet) => {
    if (!uid || effet === 'retiree') return;
    const p = fiche(uid);
    if (effet === 'suspendue') p.suspendues += 1;
    else { p[type] += 1; p.total += 1; p.refs.push(ref); }
    par.set(uid, p);
  };

  for (const l of sources.livraisons || []) {
    if (!l || String(l.statut || '').toLowerCase() !== 'payee') continue; // capturée après livraison
    if (!dansFenetre(l.livre_le || l.updated_at || l.mis_a_jour_le)) continue;
    ajouter(l.expediteur_id, 'livraisons', `livraison:${l.id}`, effetLivraison(litigesParLiv.get(l.id) || [], l.expediteur_id));
  }
  for (const b of sources.bookings || []) {
    if (!b || !STATUTS_RESA_PAYEE.has(String(b.status || '').toLowerCase())) continue;
    if (String(b.payment_status || '').toLowerCase() !== 'succeeded' || !b.paid_at) continue; // capturée
    if (!dansFenetre(b.paid_at)) continue;
    const reports = [...(reportsParResa.get(b.id) || []), ...(reportsParTrajet.get(b.ride_id) || [])];
    ajouter(b.passenger_id, 'trajets_passager', `reservation:${b.id}`, effetCovoiturage(reports, b.passenger_id));
    const conducteur = conducteurDe.get(b.ride_id);
    if (conducteur && conducteur !== b.passenger_id) ajouter(conducteur, 'trajets_conducteur', `reservation:${b.id}`, effetCovoiturage(reports, conducteur));
  }
  // Inscription : 1 participation par compte, jamais plus (même si le compte apparaît deux fois).
  const dejaInscrits = new Set();
  for (const m of sources.membres || []) {
    if (!m?.id || dejaInscrits.has(m.id) || !inscriptionAdmissible(m, fin)) continue;
    dejaInscrits.add(m.id);
    const p = fiche(m.id);
    p.inscription = 1; p.total += 1; p.refs.push(`inscription:${m.id}`);
    par.set(m.id, p);
  }
  return [...par.values()].sort((a, b) => b.total - a.total || String(a.user_id).localeCompare(String(b.user_id)));
}

// Tirage pondéré : chaque participation = 1 chance. randomInt injectable pour les tests.
function tirerPondere(participants, randomInt = crypto.randomInt) {
  const liste = [...participants].filter((p) => p.total > 0).sort((a, b) => String(a.user_id).localeCompare(String(b.user_id)));
  const totalPoids = liste.reduce((s, p) => s + p.total, 0);
  if (!totalPoids) return null;
  const tire = randomInt(1, totalPoids + 1); // 1..totalPoids
  let reste = tire;
  for (const p of liste) {
    reste -= p.total;
    if (reste <= 0) return { gagnant: p, tire, totalPoids, nbParticipants: liste.length, ordre: liste.map((x) => `${x.user_id}:${x.total}`) };
  }
  return null;
}

// ─── Accès aux données ────────────────────────────────────────────────────────
async function lireJson(url, key) {
  const r = await fetch(url, { headers: sbHeaders(key) }).catch(() => ({ ok: false }));
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : null;
}

async function lireConcours(ctx) {
  const rows = await lireJson(`${ctx.sbUrl}/rest/v1/monthly_draws?eligibility_badge_slug=eq.${CONCOURS.slug}&select=*&order=created_at.asc&limit=1`, ctx.sbKey);
  if (!rows) return { ok: false };
  return { ok: true, concours: rows[0] || null };
}

async function estDrawConcours(ctx, drawId) {
  if (!drawId) return false;
  const rows = await lireJson(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${encodeURIComponent(drawId)}&select=eligibility_badge_slug&limit=1`, ctx.sbKey);
  // Lecture impossible : on considère que c'est le concours (prudence, l'action générique est refusée).
  if (!rows) return true;
  return rows[0]?.eligibility_badge_slug === CONCOURS.slug;
}

// Tous les comptes avec leur confirmation de courriel (Supabase Auth, clé de service), par pages.
async function lireComptesAuth(ctx) {
  const tous = [];
  for (let page = 1; page <= 50; page += 1) {
    const r = await fetch(`${ctx.sbUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: sbHeaders(ctx.sbKey) }).catch(() => ({ ok: false }));
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const users = Array.isArray(d) ? d : d?.users;
    if (!Array.isArray(users)) return null;
    tous.push(...users);
    if (users.length < 1000) return tous;
  }
  return null; // plus de 50 000 comptes : on refuse plutôt que d'en oublier
}

// Membres pour la participation d'inscription : profil (rôle, suspendu, adresse) + compte Auth (confirmation).
async function lireMembres(ctx) {
  const [profils, comptes] = await Promise.all([
    lireJson(`${ctx.sbUrl}/rest/v1/profiles?select=id,prenom,nom,email,role,suspendu,email_verified,created_at&limit=50000`, ctx.sbKey),
    lireComptesAuth(ctx),
  ]);
  if (!profils || !comptes) return null;
  const auth = new Map(comptes.map((c) => [c.id, c]));
  return profils.map((p) => {
    const a = auth.get(p.id) || {};
    return {
      id: p.id, prenom: p.prenom, nom: p.nom, email: a.email || p.email, role: p.role, suspendu: p.suspendu,
      email_verified: p.email_verified, created_at: a.created_at || p.created_at,
      email_confirmed_at: a.email_confirmed_at || a.confirmed_at || null, banned_until: a.banned_until || null,
    };
  });
}

// Le membre connecté seulement (sa session Auth porte déjà la confirmation du courriel).
function membreConnecte(ctx) {
  const s = ctx.session || {}; const p = ctx.profile || {};
  return {
    id: s.id, email: s.email || p.email, role: p.role, suspendu: p.suspendu, email_verified: p.email_verified,
    created_at: s.created_at || null, email_confirmed_at: s.email_confirmed_at || s.confirmed_at || null, banned_until: s.banned_until || null,
  };
}

async function lireSources(ctx, { userId = null } = {}) {
  const u = ctx.sbUrl; const k = ctx.sbKey;
  const filtreLiv = userId ? `&expediteur_id=eq.${encodeURIComponent(userId)}` : '';
  const [livraisons, litiges, bookings, rides, reports] = await Promise.all([
    lireJson(`${u}/rest/v1/livraisons?statut=eq.payee${filtreLiv}&select=id,expediteur_id,statut,livre_le,updated_at&limit=10000`, k),
    lireJson(`${u}/rest/v1/litiges?select=livraison_id,statut,plaignant_id&limit=10000`, k),
    lireJson(`${u}/rest/v1/ride_bookings?status=in.(${[...STATUTS_RESA_PAYEE].join(',')})&payment_status=eq.succeeded&select=id,ride_id,passenger_id,status,payment_status,paid_at&limit=10000`, k),
    lireJson(`${u}/rest/v1/rides?select=id,driver_id&limit=10000`, k),
    lireJson(`${u}/rest/v1/ride_reports?select=booking_id,ride_id,status,reporter_id,reported_id&limit=10000`, k),
  ]);
  // Échec fermé : une source illisible = on ne compte rien (jamais une participation par défaut,
  // jamais un litige oublié).
  if ([livraisons, litiges, bookings, rides, reports].some((x) => x === null)) return null;
  return { livraisons, litiges, bookings, rides, reports };
}

async function lireInterrupteurTheme(ctx) {
  const rows = await lireJson(`${ctx.sbUrl}/rest/v1/transaction_audit_events?event_type=eq.${EVT_THEME}&select=status,created_at&order=created_at.desc&limit=1`, ctx.sbKey);
  if (!rows) return true; // illisible : thème laissé tel quel (cosmétique)
  return rows[0] ? rows[0].status !== 'off' : true;
}

async function lireTirage(ctx, drawId) {
  const rows = await lireJson(`${ctx.sbUrl}/rest/v1/draw_winners?draw_id=eq.${encodeURIComponent(drawId)}&select=*&limit=1`, ctx.sbKey);
  return rows ? { ok: true, gagnant: rows[0] || null } : { ok: false };
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// Public : de quoi afficher la bannière, le compte à rebours et le thème. Aucune donnée personnelle.
async function concoursFetesPublic(req, res, ctx) {
  const now = Date.now();
  const [c, interrupteur] = await Promise.all([lireConcours(ctx), lireInterrupteurTheme(ctx)]);
  const lance = Boolean(c.ok && c.concours && c.concours.status !== 'cancelled');
  res.setHeader?.('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    theme_actif: themeActif({ now, interrupteur, lance }),
    concours_ouvert: lance && now <= new Date(CONCOURS.fin).getTime(),
    // Date du clic « Lancer le concours » (règlement, art. 2). Aucune donnée personnelle.
    lance_le: lance ? (c.concours.created_at || null) : null,
    fin: CONCOURS.fin,
    fin_theme: CONCOURS.finTheme,
    prix: CONCOURS.prix,
    reglement: CONCOURS.reglement,
  });
}

// Membre : ses propres participations (lecture seule, calculées en direct).
async function concoursFetesMoi(req, res, ctx) {
  if (!ctx.session) return res.status(401).json({ error: 'Authentification requise' });
  const c = await lireConcours(ctx);
  if (!c.ok) return res.status(502).json({ error: 'Concours indisponible' });
  if (!c.concours) return res.status(200).json({ lance: false, participations: 0 });
  const sources = await lireSources(ctx);
  if (!sources) return res.status(502).json({ error: 'Calcul des participations indisponible' });
  sources.membres = [membreConnecte(ctx)];
  const p = calculerParticipations(sources, { debut: c.concours.created_at, fin: CONCOURS.fin }).find((x) => x.user_id === ctx.session.id);
  const inscription = p?.inscription || 0;
  return res.status(200).json({
    lance: true, fin: CONCOURS.fin, prix: CONCOURS.prix, reglement: CONCOURS.reglement,
    participations: p?.total || 0,
    inscription,
    service: (p?.total || 0) - inscription,
    suspendues: p?.suspendues || 0,
    detail: p ? { livraisons: p.livraisons, trajets_passager: p.trajets_passager, trajets_conducteur: p.trajets_conducteur } : null,
  });
}

// Admin : état, participants (recalculés et enregistrés dans draw_entries), gagnant.
async function adminConcoursFetes(req, res, ctx, body = {}) {
  if (ctx.profile?.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const mode = body.mode || 'liste';

  if (mode === 'lancer') {
    const c = await lireConcours(ctx);
    if (!c.ok) return res.status(502).json({ error: 'Lecture du concours impossible' });
    if (c.concours) return res.status(200).json({ success: true, deja: true, concours: c.concours });
    const r = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws`, {
      method: 'POST', headers: sbHeaders(ctx.sbKey, 'return=representation'),
      body: JSON.stringify({ title: CONCOURS.titre, prize: CONCOURS.prix, draw_date: '2026-12-31', status: 'active', eligibility_badge_slug: CONCOURS.slug }),
    }).catch(() => ({ ok: false }));
    if (!r.ok) return res.status(502).json({ error: 'Lancement impossible' });
    const rows = await r.json().catch(() => []);
    return res.status(200).json({ success: true, concours: rows[0] || null });
  }

  if (mode === 'theme') {
    const actif = body.actif !== false;
    const r = await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
      method: 'POST', headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ event_type: EVT_THEME, status: actif ? 'on' : 'off', actor_id: ctx.session.id, user_id: ctx.session.id, evidence: { source: 'lib/_concours-fetes', actif } }),
    }).catch(() => ({ ok: false }));
    if (!r.ok) return res.status(502).json({ error: 'Changement du thème impossible' });
    return res.status(200).json({ success: true, theme: actif ? 'on' : 'off' });
  }

  const c = await lireConcours(ctx);
  if (!c.ok) return res.status(502).json({ error: 'Lecture du concours impossible' });
  const interrupteur = await lireInterrupteurTheme(ctx);
  if (!c.concours) {
    return res.status(200).json({ lance: false, fin: CONCOURS.fin, tirage_autorise: tirageAutorise(), theme_interrupteur: interrupteur, participants: [] });
  }
  const [sources, membres] = await Promise.all([lireSources(ctx), lireMembres(ctx)]);
  // Échec fermé : sans la liste des comptes, on ne montre (ni n'enregistre, ni ne tire) rien d'incomplet.
  if (!sources || !membres) return res.status(502).json({ error: 'Calcul des participations indisponible (une source est illisible)' });
  sources.membres = membres;
  const participants = calculerParticipations(sources, { debut: c.concours.created_at, fin: CONCOURS.fin });

  // Noms pour l'admin (déjà lus avec les membres).
  const parId = new Map(membres.map((p) => [p.id, p]));
  const liste = participants.map((p) => ({
    user_id: p.user_id, prenom: parId.get(p.user_id)?.prenom || null, nom: parId.get(p.user_id)?.nom || null,
    email: parId.get(p.user_id)?.email || null, total: p.total, inscription: p.inscription, suspendues: p.suspendues,
    livraisons: p.livraisons, trajets_passager: p.trajets_passager, trajets_conducteur: p.trajets_conducteur,
  }));

  const t = await lireTirage(ctx, c.concours.id);

  // Enregistre les participations dans draw_entries (réutilisation des tables existantes) tant que le tirage n'est pas fait.
  if (t.ok && !t.gagnant && c.concours.status === 'active') {
    const lignes = liste.filter((p) => p.total > 0).map((p) => ({ draw_id: c.concours.id, user_id: p.user_id, entries: p.total, cost_coins: 0 }));
    if (lignes.length) {
      await fetch(`${ctx.sbUrl}/rest/v1/draw_entries?on_conflict=draw_id,user_id`, {
        method: 'POST', headers: sbHeaders(ctx.sbKey, 'resolution=merge-duplicates,return=minimal'), body: JSON.stringify(lignes),
      }).catch(() => null);
    }
    // Participations retirées (litige) : remises à 0, jamais supprimées.
    const garder = new Set(lignes.map((l) => l.user_id));
    const existantes = (await lireJson(`${ctx.sbUrl}/rest/v1/draw_entries?draw_id=eq.${c.concours.id}&entries=gt.0&select=user_id`, ctx.sbKey)) || [];
    const aZero = existantes.map((e) => e.user_id).filter((id) => !garder.has(id));
    if (aZero.length) {
      await fetch(`${ctx.sbUrl}/rest/v1/draw_entries?draw_id=eq.${c.concours.id}&user_id=in.(${aZero.join(',')})`, {
        method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=minimal'), body: JSON.stringify({ entries: 0 }),
      }).catch(() => null);
    }
  }

  if (mode === 'csv') {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = ['prenom,nom,courriel,participations,inscription,suspendues_litige,livraisons,trajets_passager,trajets_conducteur']
      .concat(liste.map((p) => [p.prenom, p.nom, p.email, p.total, p.inscription, p.suspendues, p.livraisons, p.trajets_passager, p.trajets_conducteur].map(esc).join(',')))
      .join('\n');
    res.setHeader?.('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader?.('Content-Disposition', 'attachment; filename="concours-fetes-2026-participants.csv"');
    return res.status(200).send('﻿' + csv);
  }

  if (mode === 'tirer') {
    if (!tirageAutorise()) return res.status(409).json({ error: 'Le tirage n\'est possible qu\'après la date limite (31 décembre 2026, 23 h 59, heure du Québec).', code: 'trop_tot' });
    if (!t.ok) return res.status(502).json({ error: 'Vérification du tirage impossible' });
    if (t.gagnant || c.concours.status !== 'active') return res.status(409).json({ error: 'Le tirage a déjà eu lieu : il n\'est pas modifiable.', code: 'deja_tire', gagnant: t.gagnant });
    const resultat = tirerPondere(participants);
    if (!resultat) return res.status(409).json({ error: 'Aucune participation validée : tirage impossible.' });
    const g = resultat.gagnant;
    const empreinte = crypto.createHash('sha256').update(resultat.ordre.join('|')).digest('hex');
    const maintenant = new Date().toISOString();

    // Verrou atomique : seul le premier clic fait passer le concours de « active » à « completed ».
    const verrou = await fetch(`${ctx.sbUrl}/rest/v1/monthly_draws?id=eq.${c.concours.id}&status=eq.active`, {
      method: 'PATCH', headers: sbHeaders(ctx.sbKey, 'return=representation'), body: JSON.stringify({ status: 'completed', winner_id: g.user_id }),
    }).catch(() => ({ ok: false }));
    const verrouRows = verrou.ok ? await verrou.json().catch(() => []) : [];
    if (!Array.isArray(verrouRows) || verrouRows.length !== 1) return res.status(409).json({ error: 'Le tirage a déjà eu lieu : il n\'est pas modifiable.', code: 'deja_tire' });

    const profilG = parId.get(g.user_id) || {};
    const preuve = {
      source: 'lib/_concours-fetes', concours: CONCOURS.slug, draw_id: c.concours.id, gagnant: g.user_id,
      poids_gagnant: g.total, total_participations: resultat.totalPoids, nb_participants: resultat.nbParticipants,
      nombre_tire: resultat.tire, empreinte_participants: empreinte, tire_le: maintenant, tire_par: ctx.session.id,
    };
    await fetch(`${ctx.sbUrl}/rest/v1/draw_winners`, {
      method: 'POST', headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ draw_id: c.concours.id, user_id: g.user_id, user_email: profilG.email || null, user_role: profilG.role || null, prize_title: CONCOURS.prix, published: false, entries_weight: g.total, selected_by: ctx.session.id }),
    }).catch(() => null);
    await fetch(`${ctx.sbUrl}/rest/v1/transaction_audit_events`, {
      method: 'POST', headers: sbHeaders(ctx.sbKey),
      body: JSON.stringify({ event_type: EVT_TIRAGE, status: 'tire', actor_id: ctx.session.id, user_id: g.user_id, evidence: preuve }),
    }).catch(() => null);
    return res.status(200).json({ success: true, gagnant: { user_id: g.user_id, prenom: profilG.prenom || null, nom: profilG.nom || null, participations: g.total }, preuve });
  }

  return res.status(200).json({
    lance: true, concours: c.concours, fin: CONCOURS.fin, tirage_autorise: tirageAutorise(),
    theme_interrupteur: interrupteur, gagnant: t.ok ? t.gagnant : null,
    total_participations: liste.reduce((s, p) => s + p.total, 0), participants: liste,
  });
}

module.exports = {
  CONCOURS, tirageAutorise, themeActif, calculerParticipations, tirerPondere, estDrawConcours,
  estCompteTest, inscriptionAdmissible,
  concoursFetesPublic, concoursFetesMoi, adminConcoursFetes,
};
