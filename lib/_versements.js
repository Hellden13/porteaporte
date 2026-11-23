// lib/_versements.js — Versements trimestriels aux organismes et au fonds d'urgence (décision de Denis).
// Les montants viennent du journal (lignes « repartition_capturee » écrites à chaque paiement capturé) :
//   Organismes      = poste « communauté » des livraisons + poste « dons » des frais de covoiturage ;
//   Fonds d'urgence = poste « urgence » des livraisons.
// Denis approuve chaque trimestre TERMINÉ dans l'admin ; l'approbation est écrite au journal
// (« versement_approuve »), une seule fois par trimestre et par poste. AUCUN virement automatique :
// le virement réel est fait à la main après l'approbation.
'use strict';

const { sbHeaders, roleIn } = require('./_lib');
const { uneSeuleFois } = require('./_une-fois');
const { EVT_REPARTITION } = require('./_repartition-journal');

const EVT_VERSEMENT = 'versement_approuve';
const POSTES_VERSEMENT = Object.freeze({
  organismes: { label: 'Organismes (communauté et dons)', test: (sorte, p) => (sorte === 'livraison' && p.poste === 'communaute') || (sorte === 'covoiturage' && /don|organisme|communaut/i.test(`${p.poste} ${p.label}`)) },
  urgence: { label: 'Fonds d’urgence', test: (sorte, p) => sorte === 'livraison' && p.poste === 'urgence' },
});

// Trimestre du Québec d'une date : « 2026-T4 ».
function trimestreDe(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-T${Math.floor((Number(p.month) - 1) / 3) + 1}`;
}

// Un trimestre est terminé quand on est dans un trimestre plus récent.
function trimestreTermine(trimestre, maintenant = new Date()) {
  const actuel = trimestreDe(maintenant.toISOString());
  return Boolean(trimestre && actuel && trimestre < actuel);
}

async function lireTout(ctx, chemin) {
  const r = await fetch(`${ctx.sbUrl}/rest/v1/${chemin}`, { headers: sbHeaders(ctx.sbKey) });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : null;
}

// Montants par trimestre et par poste, avec l'état de l'approbation.
async function etatVersements(ctx, maintenant = new Date()) {
  const lignes = await lireTout(ctx, `transaction_audit_events?event_type=eq.${EVT_REPARTITION}&select=created_at,evidence&order=created_at.asc&limit=20000`);
  const approb = await lireTout(ctx, `transaction_audit_events?event_type=eq.${EVT_VERSEMENT}&select=created_at,user_id,evidence&order=created_at.asc&limit=1000`);
  if (!lignes || !approb) return { lisible: false, versements: [] };
  const montants = new Map();
  for (const e of lignes) {
    const ev = e.evidence || {};
    const sorte = ev.sorte === 'covoiturage' ? 'covoiturage' : ev.sorte === 'livraison' || !ev.sorte ? 'livraison' : null;
    if (!sorte) continue; // les annulations n'alimentent pas ces versements
    const t = trimestreDe(e.created_at);
    for (const l of Array.isArray(ev.lignes) ? ev.lignes : []) {
      for (const [poste, def] of Object.entries(POSTES_VERSEMENT)) {
        if (!def.test(sorte, l)) continue;
        const cle = `${t}|${poste}`;
        montants.set(cle, (montants.get(cle) || 0) + Math.round(Number(l.cents) || 0));
      }
    }
  }
  const faits = new Map();
  for (const a of approb) {
    const ev = a.evidence || {};
    const cle = `${ev.trimestre}|${ev.poste}`;
    if (!faits.has(cle)) faits.set(cle, { approuve_le: a.created_at, approuve_par: a.user_id || null, montant_cents: Number(ev.montant_cents) || 0 });
  }
  const versements = [...montants.entries()].map(([cle, cents]) => {
    const [trimestre, poste] = cle.split('|');
    const fait = faits.get(cle);
    return {
      trimestre, poste, label: POSTES_VERSEMENT[poste].label, montant_cents: cents,
      statut: fait ? 'approuve' : trimestreTermine(trimestre, maintenant) ? 'a_approuver' : 'en_cours',
      approuve_le: fait?.approuve_le || null, montant_approuve_cents: fait ? fait.montant_cents : null,
    };
  }).sort((a, b) => b.trimestre.localeCompare(a.trimestre) || a.poste.localeCompare(b.poste));
  return { lisible: true, versements };
}

async function adminVersements(req, res, ctx) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const e = await etatVersements(ctx);
  if (!e.lisible) return res.status(503).json({ error: 'Journal illisible : réessaie plus tard.' });
  return res.status(200).json({ success: true, versements: e.versements, note: 'Aucun virement automatique : l’approbation est notée au journal, le virement se fait à la main.' });
}

async function adminVersementApprouver(req, res, ctx, body) {
  if (!roleIn(ctx.profile, ['admin'])) return res.status(403).json({ error: 'Admin requis' });
  const trimestre = String(body.trimestre || '');
  const poste = String(body.poste || '');
  if (!/^\d{4}-T[1-4]$/.test(trimestre) || !POSTES_VERSEMENT[poste]) return res.status(400).json({ error: 'Trimestre ou poste invalide' });
  if (!trimestreTermine(trimestre)) return res.status(409).json({ error: 'Ce trimestre n’est pas terminé.' });
  const e = await etatVersements(ctx);
  if (!e.lisible) return res.status(503).json({ error: 'Journal illisible : rien n’a été approuvé.' });
  const v = e.versements.find((x) => x.trimestre === trimestre && x.poste === poste);
  if (!v || !(v.montant_cents > 0)) return res.status(409).json({ error: 'Aucun montant à verser pour ce trimestre.' });
  if (v.statut === 'approuve') return res.status(409).json({ error: 'Déjà approuvé.' });
  const ok = await uneSeuleFois(ctx, `versement:${trimestre}:${poste}`, {
    eventType: EVT_VERSEMENT,
    userId: ctx.session?.id || null, // qui a approuvé
    status: 'approuve',
    amountCents: v.montant_cents,
    evidence: { trimestre, poste, montant_cents: v.montant_cents, note: String(body.note || '').slice(0, 300) || null, source: 'lib/_versements', virement: 'à faire à la main' },
  });
  if (!ok) return res.status(409).json({ error: 'Déjà approuvé (ou journal illisible) : rien n’a changé.' });
  return res.status(200).json({ success: true, trimestre, poste, montant_cents: v.montant_cents });
}

// Pour la page Transparence : les versements approuvés (montants seulement).
async function versementsApprouvesPublics(ctx) {
  const e = await etatVersements(ctx).catch(() => ({ lisible: false, versements: [] }));
  return e.versements.filter((v) => v.statut === 'approuve').map((v) => ({ trimestre: v.trimestre, poste: v.poste, label: v.label, montant_cents: v.montant_approuve_cents, approuve_le: v.approuve_le }));
}

module.exports = { EVT_VERSEMENT, POSTES_VERSEMENT, trimestreDe, trimestreTermine, etatVersements, adminVersements, adminVersementApprouver, versementsApprouvesPublics };
