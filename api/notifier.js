// ============================================================
// PORTEÀPORTE — Vercel Function : Notifications courriel
// Fichier : api/notifier.js
// Service : SendGrid (gratuit jusqu'à 100 courriels/jour)
// ============================================================
// CONFIGURATION REQUISE dans Vercel → Settings → Environment Variables :
//   SENDGRID_API_KEY = SG.xxxxxxxxxxxxxxxxxxxxxxxx
//   ADMIN_EMAIL      = denismorneaubtc@gmail.com
//   FROM_EMAIL       = notifications@porteaporte.site
//   INTERNAL_API_SECRET = (obligatoire en prod pour types sensibles — voir BUILD)
// ============================================================

const crypto = require('crypto');

const PUBLIC_TYPES = new Set([
  'auth_confirmation',
  'test_email',
  'partenaire',
  'liste_attente',
  'contact_support',
  'contact_partenariat',
  'contact_investisseur',
  // Types appelés en interne par platform.js (server-to-server)
  'livraison_creee_expediteur',
  'code_destinataire',
  'colis_livre_expediteur',
  'colis_livre_destinataire',
  'livraison_complete',
  'livraison_imprevu',
  'manquement_signale',
  'livraison_annulee_livreur',
  'preuve_soumise_admin',
  'prefs_destinataire',
  'xl_confirmation_destinataire',
  'xl_confirmation_resultat',
  'ride_booking_confirmed',
  'ride_booking_to_driver',
  'bienvenue',
]);

function safeCompareSecret(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function hasValidInternalSecret(req) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || secret.length < 16) return false;
  const provided =
    req.headers['x-internal-notifier-secret'] ||
    req.headers['x-internal-webhook-secret'];
  return safeCompareSecret(String(provided || ''), secret);
}

function validatePublicCaller(req) {
  const allowed =
    process.env.ALLOWED_ORIGIN || process.env.NOTIFIER_ALLOWED_ORIGIN || 'https://porteaporte.site';
  const origin = String(req.headers.origin || '');
  const referer = String(req.headers.referer || '');
  if (allowed === '*' || allowed === '') return true;
  // Server-to-server call (no Origin/Referer) → trust (Vercel internal)
  if (!origin && !referer) return true;
  const base = allowed.replace(/\/$/, '');
  if (origin && (origin === base || origin.startsWith(base + '/'))) return true;
  if (referer && (referer === base || referer.startsWith(base + '/'))) return true;
  return false;
}

function normalizeNotifierBody(body) {
  if (!body || typeof body !== 'object') return null;
  let { type } = body;
  let data = body.data;
  if (!type && body.email) {
    type = 'test_email';
    data = { email: body.email };
  }

  const flatContact =
    typeof type === 'string' &&
    (type.startsWith('contact_') || PUBLIC_TYPES.has(type)) &&
    !data;

  if (!type) return null;
  if (!data || typeof data !== 'object') {
    if (flatContact) {
      const { type: _t, ...rest } = body;
      data = rest;
    } else {
      return null;
    }
  }
  return { type, data };
}

function assertNotifierAuth(req, type) {
  const internalConfigured = !!(process.env.INTERNAL_API_SECRET && process.env.INTERNAL_API_SECRET.length >= 16);

  if (hasValidInternalSecret(req)) return { ok: true };

  if (PUBLIC_TYPES.has(type)) {
    if (!validatePublicCaller(req))
      return { ok: false, status: 403, error: 'Origine non autorisee' };
    return { ok: true };
  }

  if (internalConfigured) {
    return { ok: false, status: 403, error: 'Secret interne requis pour ce type de notification' };
  }
  console.warn('[notifier] INTERNAL_API_SECRET non configure — tous types acceptés (migration)');
  return { ok: true };
}

module.exports = async function handler(req, res) {
  // CORS
  const allowOrigin = process.env.ALLOWED_ORIGIN || 'https://porteaporte.site';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-notifier-secret, x-internal-webhook-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    const fromEmail = process.env.FROM_EMAIL || '';
    const fromDomain = fromEmail.includes('@') ? fromEmail.split('@').pop() : '';
    return res.status(200).json({
      success: true,
      sendgrid_configured: Boolean(process.env.SENDGRID_API_KEY),
      from_email_configured: Boolean(process.env.FROM_EMAIL),
      admin_email_configured: Boolean(process.env.ADMIN_EMAIL),
      supabase_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      internal_secret_configured: Boolean(process.env.INTERNAL_API_SECRET),
      from_domain: fromDomain || null,
      expected_dns: fromDomain ? [
        `SPF: ${fromDomain} doit autoriser SendGrid`,
        `DKIM: ${fromDomain} doit etre authentifie dans SendGrid`,
        `DMARC: _dmarc.${fromDomain} recommande`
      ] : [],
      spam_note: 'Si les courriels arrivent en pourriels, verifier surtout SPF, DKIM, DMARC et reputation du domaine expediteur.'
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const normalized = normalizeNotifierBody(req.body);
  if (!normalized) return res.status(400).json({ error: 'Paramètres manquants (type et data)' });
  const { type, data } = normalized;

  const auth = assertNotifierAuth(req, type);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const ADMIN_EMAIL      = process.env.ADMIN_EMAIL || 'denismorneaubtc@gmail.com';
  const FROM_EMAIL       = process.env.FROM_EMAIL  || 'notifications@porteaporte.site';
  const FROM_NAME        = 'PorteàPorte 🍁';

  if (!SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY manquante');
    return res.status(500).json({ error: 'Configuration manquante' });
  }

  try {
    if (type === 'auth_confirmation') {
      const result = await sendAuthConfirmationEmail(data, {
        sendgridKey: SENDGRID_API_KEY,
        fromEmail: FROM_EMAIL,
        fromName: FROM_NAME
      });
      return res.status(result.ok ? 200 : (result.status || 500)).json({
        success: result.ok,
        sent: result.ok ? 1 : 0,
        sendgrid_status: result.status,
        error: result.ok ? undefined : (result.error || 'Courriel de confirmation non envoye')
      });
    }

    if (type === 'test_email') {
      const result = await sendTestEmail(data, {
        sendgridKey: SENDGRID_API_KEY,
        fromEmail: FROM_EMAIL,
        fromName: FROM_NAME
      });
      return res.status(result.ok ? 200 : (result.status || 500)).json({
        success: result.ok,
        sent: result.ok ? 1 : 0,
        email_masked: result.email_masked,
        sendgrid_status: result.status,
        error: result.ok ? undefined : (result.error || 'Email de test non envoye')
      });
    }

    const emails = buildEmails(type, data, ADMIN_EMAIL, FROM_EMAIL, FROM_NAME);
    if (!emails.length) return res.status(400).json({ error: 'Type de notification inconnu: ' + type });

    // Envoyer tous les courriels
    const results = await Promise.all(emails.map(e => sendEmail(e, SENDGRID_API_KEY)));
    const success = results.every(r => r.ok);

    return res.status(success ? 200 : 500).json({
      success,
      sent: results.filter(r => r.ok).length,
      total: results.length,
      results: results.map((r) => ({ ok: r.ok, status: r.status, to: r.to, error: r.error }))
    });

  } catch (err) {
    console.error('Erreur notification:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// CONSTRUCTION DES COURRIELS PAR TYPE
// ============================================================
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function safeHttpUrl(value, fallback = 'https://porteaporte.site/admin/operations.html') {
  try {
    const url = new URL(String(value || ''), 'https://porteaporte.site');
    if (url.protocol === 'https:' || url.protocol === 'http:') return escapeHtml(url.toString());
  } catch (_) {}
  return escapeHtml(fallback);
}

function buildEmails(type, data, adminEmail, fromEmail, fromName) {
  const emails = [];

  switch (type) {

    // ── NOUVELLE INSCRIPTION ──
    case 'inscription': {
      // 1. Courriel de bienvenue à l'utilisateur
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: '🍁 Bienvenue sur PorteàPorte ! Tes 50 PorteCoins t\'attendent',
        html: templateBienvenue(data)
      });
      // 2. Alerte admin
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `🆕 Nouvel inscrit : ${data.prenom} ${data.nom} (${data.role})`,
        html: templateAdminNotif('Nouvelle inscription', [
          { label: 'Nom', value: `${data.prenom} ${data.nom}` },
          { label: 'Courriel', value: data.email },
          { label: 'Rôle', value: data.role },
          { label: 'Ville', value: data.ville || 'Non spécifiée' },
          { label: 'Code parrainage', value: data.parrain || 'Aucun' },
          { label: 'PorteCoins', value: '50 crédités automatiquement' }
        ])
      });
      break;
    }

    // ── CARTE LIVREUR PROVISOIRE / CERTIFIEE ──
    case 'carte_livreur': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: `Carte livreur PorteaPorte — ${data.card_id || 'profil livreur'}`,
        html: templateCarteLivreur(data)
      });
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `Carte livreur envoyee : ${data.prenom || ''} ${data.nom || ''}`.trim(),
        html: templateAdminNotif('Carte livreur envoyee', [
          { label: 'Nom', value: `${data.prenom || ''} ${data.nom || ''}`.trim() },
          { label: 'Courriel', value: data.email },
          { label: 'Statut', value: data.driver_status || 'pending_review' },
          { label: 'Transport', value: data.vehicule || data.transport_mode || 'Non precise' },
          { label: 'Ville', value: data.ville || 'Non precisee' },
          { label: 'Carte', value: data.card_id || 'Non precisee' }
        ])
      });
      break;
    }

    // ── LIVRAISON PUBLIÉE ──
    case 'livraison_publiee': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `📦 Nouvelle livraison : ${data.ville_depart} → ${data.ville_arrivee}`,
        html: templateAdminNotif('Nouvelle livraison publiée', [
          { label: 'Code', value: data.code },
          { label: 'Trajet', value: `${data.ville_depart} → ${data.ville_arrivee}` },
          { label: 'Type', value: data.type_colis },
          { label: 'Valeur déclarée', value: `${data.valeur_declaree} $` },
          { label: 'Prix proposé', value: `${data.prix_total} $` },
          { label: 'Assurance', value: data.assurance_plan },
          { label: 'Expéditeur', value: data.expediteur_email }
        ])
      });
      break;
    }

    // ── LIVRAISON CONFIRMÉE ──
    case 'livraison_confirmee': {
      // À l'expéditeur
      emails.push({
        to: data.expediteur_email,
        from: { email: fromEmail, name: fromName },
        subject: `✅ Ton colis ${data.code} est confirmé — livraison en route !`,
        html: templateLivraisonConfirmee(data)
      });
      // Au livreur
      emails.push({
        to: data.livreur_email,
        from: { email: fromEmail, name: fromName },
        subject: `🚗 Livraison ${data.code} confirmée — ramassage à prévoir`,
        html: templateLivreurConfirme(data)
      });
      break;
    }

    // ── LIVRAISON CRÉÉE — email expéditeur avec code destinataire ──
    case 'livraison_creee_expediteur': {
      emails.push({
        to: data.expediteur_email,
        from: { email: fromEmail, name: fromName },
        subject: `📦 Livraison créée — Code destinataire : ${data.recipient_code}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">📦 Livraison confirmée !</h2>
            <p style="color:#a8b0ba">Bonjour ${data.prenom || 'cher expéditeur'},<br><br>Ta livraison <strong style="color:#fff">#${data.code}</strong> a bien été créée. Le livreur te sera assigné sous peu.</p>
            <div style="background:rgba(184,245,62,.08);border:1px solid rgba(184,245,62,.25);border-radius:10px;padding:16px;margin:20px 0">
              <div style="font-size:.75rem;color:#6d7886;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Trajet</div>
              <div style="font-weight:700;color:#fff;margin-bottom:4px">📦 ${data.adresse_depart || data.ville_depart}</div>
              <div style="font-weight:700;color:#b8f53e">🏠 ${data.adresse_arrivee || data.ville_arrivee}</div>
              <div style="margin-top:8px;font-size:.85rem;color:#a8b0ba">${data.type_colis} · ${parseFloat(data.prix_total || 0).toFixed(2)} $</div>
            </div>
            <div style="background:rgba(255,200,0,.08);border:2px solid rgba(255,200,0,.4);border-radius:12px;padding:20px;margin:20px 0;text-align:center">
              <div style="font-size:.8rem;color:#ffd700;font-weight:700;letter-spacing:.08em;margin-bottom:8px">⚠️ CODE DE RÉCEPTION — CONFIDENTIEL</div>
              <div style="font-size:2.2rem;font-weight:900;letter-spacing:.25em;color:#fff;margin-bottom:10px">${data.recipient_code}</div>
              <div style="font-size:.82rem;color:#a8b0ba">Donne ce code <strong>uniquement</strong> au destinataire du colis.<br>Il devra l'entrer pour confirmer la réception et libérer ton paiement au livreur.</div>
            </div>
            <div style="background:rgba(0,217,255,.08);border:1px solid rgba(0,217,255,.2);border-radius:10px;padding:14px;margin:16px 0">
              <div style="font-size:.8rem;color:#00d9ff;font-weight:700;margin-bottom:6px">🔗 Lien de confirmation à envoyer au destinataire :</div>
              <a href="${data.confirm_link}" style="color:#b8f53e;word-break:break-all;font-size:.85rem">${data.confirm_link}</a>
              <div style="margin-top:8px;font-size:.78rem;color:#6d7886">Tu peux partager ce lien par SMS, WhatsApp ou courriel. Le destinataire entre le code sur cette page pour confirmer la réception.</div>
            </div>
            ${data.pickup_code ? `
            <div style="background:rgba(255,200,0,.08);border:2px solid rgba(255,200,0,.4);border-radius:12px;padding:20px;margin:20px 0;text-align:center">
              <div style="font-size:.8rem;color:#ffd700;font-weight:700;letter-spacing:.08em;margin-bottom:8px">🔑 CODE DE RAMASSAGE (PICKUP)</div>
              <div style="font-size:2rem;font-weight:900;letter-spacing:.25em;color:#fff;margin-bottom:10px">${data.pickup_code}</div>
              <div style="font-size:.82rem;color:#a8b0ba">À donner au livreur <strong>seulement</strong> quand il arrive chez toi pour récupérer le colis. Cela garantit que personne ne peut prendre ton colis sans ton accord.</div>
            </div>
            ` : ''}
            <p style="color:#6d7886;font-size:.8rem;margin-top:20px">PorteàPorte · Livraison sécurisée au Québec</p>
          </div>`
      });
      break;
    }

    // ── XL CONFIRMATION — destinataire doit confirmer présence avant départ livreur ──
    case 'xl_confirmation_destinataire': {
      emails.push({
        to: data.destinataire_email,
        from: { email: fromEmail, name: fromName },
        subject: `🚨 URGENT — Le livreur de ton colis XL part dans 15 min — Confirme ta présence`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">🚨 Confirmation requise — Colis XL</h2>
            <p style="color:#a8b0ba">Bonjour ${data.destinataire_nom || ''},<br><br>Le livreur de ton colis <strong style="color:#fff">#${data.code}</strong> est prêt à partir vers <strong>${data.ville_arrivee}</strong>.</p>
            <div style="background:rgba(255,90,90,.08);border:2px solid rgba(255,90,90,.4);border-radius:12px;padding:20px;margin:20px 0;text-align:center">
              <div style="font-size:.9rem;color:#ffb0b0;font-weight:800;margin-bottom:10px">⏱️ Tu as 15 minutes pour confirmer ta présence</div>
              <div style="font-size:.85rem;color:#a8b0ba">Sans réponse, la livraison sera <strong>annulée automatiquement</strong> et reprogrammée. Le livreur sera compensé pour son temps perdu.</div>
            </div>
            <div style="text-align:center;margin:20px 0">
              <a href="${data.confirm_link}" style="background:#b8f53e;color:#071006;padding:14px 28px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block;font-size:1rem">✅ Je serai présent — Confirmer</a>
            </div>
            <p style="color:#a8b0ba;font-size:.85rem;margin-top:18px">⚠️ <strong>Important</strong> : pour les gros colis (électroménager, meubles), nous ne pouvons pas faire de dépôt sans confirmation. Cela évite vol et dommages.</p>
          </div>`
      });
      break;
    }

    // ── XL CONFIRMATION RÉSULTAT — notif livreur ──
    case 'xl_confirmation_resultat': {
      const accepted = !!data.accepted;
      emails.push({
        to: data.livreur_email,
        from: { email: fromEmail, name: fromName },
        subject: accepted
          ? `✅ Destinataire CONFIRMÉ — Livraison #${data.code}`
          : `❌ Destinataire ABSENT — Livraison #${data.code} annulée`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">${accepted ? '✅ Destinataire présent' : '❌ Destinataire absent / refus'}</h2>
            <p style="color:#a8b0ba">Bonjour ${data.prenom || ''},<br><br>${accepted
              ? `Le destinataire a confirmé sa présence pour la livraison <strong style="color:#fff">#${data.code}</strong>. Tu peux partir avec le colis XL en toute sécurité.`
              : `Le destinataire a refusé ou n'a pas répondu pour la livraison <strong style="color:#fff">#${data.code}</strong>. La livraison passe en retour expéditeur. Tu recevras une compensation pour ton temps.`}</p>
            <div style="text-align:center;margin:20px 0">
              <a href="https://porteaporte.site/dashboard-livreur.html" style="background:#b8f53e;color:#071006;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">→ Dashboard livreur</a>
            </div>
          </div>`
      });
      break;
    }

    // ── PRÉFÉRENCES DESTINATAIRE — notif livreur (et expéditeur) ──
    case 'prefs_destinataire': {
      const modeLabels = {
        signature: '✍️ Signature obligatoire',
        depot_porte: '📦 Dépôt à la porte (photo)',
        concierge: '🛎️ Laisser au concierge',
        voisin: '🏘️ Laisser au voisin',
        boite_securisee: '🔐 Boîte sécurisée'
      };
      const prefsHtml = `
        <div style="background:rgba(0,217,255,.08);border:1px solid rgba(0,217,255,.3);border-radius:10px;padding:16px;margin:16px 0">
          ${data.reception_mode ? `<div style="margin-bottom:6px"><strong>Mode :</strong> ${modeLabels[data.reception_mode] || data.reception_mode}</div>` : ''}
          ${data.reception_heure_debut ? `<div style="margin-bottom:6px"><strong>🕐 Plage horaire :</strong> ${data.reception_heure_debut.slice(0,5)} à ${(data.reception_heure_fin||'').slice(0,5)}</div>` : ''}
          ${data.reception_photo_obligatoire ? `<div style="margin-bottom:6px;color:#ffd700">📸 <strong>Photo de dépôt obligatoire</strong></div>` : ''}
          ${data.reception_lieu_repli ? `<div style="margin-bottom:6px"><strong>🏠 Si absent :</strong> ${data.reception_lieu_repli}</div>` : ''}
          ${data.reception_note_livreur ? `<div style="margin-top:10px;padding:10px;background:rgba(255,200,0,.08);border-left:3px solid #ffd700;border-radius:4px">💬 <strong>Note :</strong> <em>${data.reception_note_livreur}</em></div>` : ''}
        </div>`;
      // Email livreur
      if (data.livreur_email) {
        emails.push({
          to: data.livreur_email,
          from: { email: fromEmail, name: fromName },
          subject: `📋 Préférences destinataire mises à jour — Livraison #${data.code}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
              <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
              <h2 style="margin:0 0 16px;color:#fff">📋 Le destinataire a configuré ses préférences</h2>
              <p style="color:#a8b0ba">Pour la livraison <strong style="color:#fff">#${data.code}</strong> (${data.ville_depart} → ${data.ville_arrivee}), voici comment le destinataire souhaite recevoir son colis :</p>
              ${prefsHtml}
              <p style="color:#a8b0ba;font-size:.9rem">⚠️ <strong>Respecte ces consignes</strong>. En cas d'imprévu (absence, refus…), utilise les boutons « 🚨 Imprévu » de ton dashboard pour signaler et être protégé.</p>
              <div style="text-align:center;margin:20px 0">
                <a href="https://porteaporte.site/dashboard-livreur.html" style="background:#b8f53e;color:#071006;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">→ Voir sur mon dashboard</a>
              </div>
            </div>`
        });
      }
      // Email expéditeur (copie info)
      if (data.expediteur_email) {
        emails.push({
          to: data.expediteur_email,
          from: { email: fromEmail, name: fromName },
          subject: `📋 Le destinataire a configuré la réception — Livraison #${data.code}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
              <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
              <h2 style="margin:0 0 16px;color:#fff">📋 Préférences de réception du destinataire</h2>
              <p style="color:#a8b0ba">Ton destinataire a précisé ses préférences pour la livraison <strong style="color:#fff">#${data.code}</strong>. Le livreur a été informé.</p>
              ${prefsHtml}
            </div>`
        });
      }
      break;
    }

    // ── MANQUEMENT SIGNALÉ — notif accusé avec lien contestation ──
    // ── ADMIN CRITICAL ALERT — événements qui demandent attention immédiate ──
    case 'admin_critical_alert': {
      const severityColors = {
        critical: { bg: 'rgba(255,90,90,.1)', border: 'rgba(255,90,90,.4)', text: '#ff7a7a', label: '🚨 CRITIQUE' },
        warning:  { bg: 'rgba(255,200,0,.08)', border: 'rgba(255,200,0,.4)', text: '#ffd700', label: '⚠️ ATTENTION' },
        info:     { bg: 'rgba(0,217,255,.08)', border: 'rgba(0,217,255,.3)', text: '#00d9ff', label: 'ℹ️ INFO' },
        success:  { bg: 'rgba(0,255,159,.08)', border: 'rgba(0,255,159,.3)', text: '#7dffc1', label: '✅ BONNE NOUVELLE' }
      };
      const sev = severityColors[data.severity || 'info'];
      const ctaLabel = escapeHtml(data.cta_label || 'Voir dans l\'admin →');
      const ctaUrl = data.cta_url ? safeHttpUrl(data.cta_url) : '';
      const ctaHtml = ctaUrl ? `<div style="text-align:center;margin:24px 0"><a href="${ctaUrl}" style="background:#b8f53e;color:#071006;padding:14px 28px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">${ctaLabel}</a></div>` : '';
      const detailsHtml = data.details && typeof data.details === 'object'
        ? `<div style="background:rgba(255,255,255,.03);border-radius:8px;padding:14px 18px;margin:14px 0">${Object.entries(data.details).map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.88rem"><span style="color:#a8b0ba">${escapeHtml(k)}</span><strong style="color:#fff">${escapeHtml(v)}</strong></div>`).join('')}</div>`
        : '';
      const title = escapeHtml(data.title || data.subject || 'Action requise');
      const message = escapeHtml(data.message || '');
      const safeSubject = String(data.subject || 'Événement plateforme').replace(/[\r\n]+/g, ' ').slice(0, 160);
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `${sev.label} ${safeSubject} — PorteàPorte`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.78rem;letter-spacing:.12em;margin-bottom:14px">PORTEÀPORTE · ADMIN ALERT</div>
            <div style="background:${sev.bg};border:1px solid ${sev.border};border-radius:10px;padding:14px 18px;margin-bottom:18px">
              <div style="font-weight:900;color:${sev.text};font-size:.85rem;margin-bottom:6px;letter-spacing:.06em">${sev.label}</div>
              <h2 style="margin:0;color:#fff;font-size:1.2rem;line-height:1.3">${title}</h2>
            </div>
            ${message ? `<p style="color:#d8dde6;line-height:1.6;margin:0 0 14px">${message}</p>` : ''}
            ${detailsHtml}
            ${ctaHtml}
            <p style="color:#6d7886;font-size:.74rem;margin-top:24px;border-top:1px solid rgba(255,255,255,.06);padding-top:14px">Tu reçois cet email parce que tu es admin de PorteàPorte. Pour gérer les alertes : <a href="https://porteaporte.site/admin/operations.html" style="color:#b8f53e">Centre Opérations →</a></p>
          </div>`
      });
      break;
    }

    // ── LIVRAISON ANNULÉE — notif livreur ──
    case 'livraison_annulee_livreur': {
      const compensationLine = data.compensation_cad > 0
        ? `<div style="background:rgba(0,255,159,.08);border:1px solid rgba(0,255,159,.3);border-radius:10px;padding:14px 18px;margin:16px 0;color:#7dffc1"><strong>💰 Compensation versée : ${Number(data.compensation_cad).toFixed(2)} $</strong><br><span style="font-size:.85rem;opacity:.9">Pour compenser ton temps/déplacement. Visible dans tes paiements.</span></div>`
        : '';
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: `Livraison annulée — Récupère une nouvelle mission`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 14px;color:#fff">Une livraison a été annulée</h2>
            <p style="color:#d8dde6;line-height:1.6">Bonjour ${data.prenom || ''},<br><br>${data.canceller || 'L\'expéditeur'} a annulé la livraison.</p>
            ${data.raison ? `<p style="color:#a8b0ba;font-size:.9rem;margin:8px 0 16px">Raison : <em>"${data.raison}"</em></p>` : ''}
            ${compensationLine}
            <div style="text-align:center;margin:24px 0">
              <a href="https://porteaporte.site/browse-missions.html" style="background:#b8f53e;color:#071006;padding:14px 28px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">🚗 Voir d'autres missions</a>
            </div>
            <p style="color:#6d7886;font-size:.78rem;margin-top:18px">Merci de ta flexibilité — ça arrive parfois et c'est normal.</p>
          </div>`
      });
      break;
    }

    case 'manquement_signale': {
      const contesteLink = `https://porteaporte.site/contester-manquement.html?id=${encodeURIComponent(data.manquement_id || '')}`;
      const roleLabels = { expediteur: 'L\'expéditeur', livreur: 'Le livreur', destinataire: 'Le destinataire', admin: 'L\'administration' };
      emails.push({
        to: data.accuse_email,
        from: { email: fromEmail, name: fromName },
        subject: `⚠️ Signalement à ton encontre — Livraison #${data.code}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">⚠️ Un signalement a été déposé contre toi</h2>
            <p style="color:#a8b0ba">Bonjour ${data.prenom || ''},<br><br>${roleLabels[data.signaleur_role] || 'Une partie'} a déposé un signalement concernant la livraison <strong style="color:#fff">#${data.code}</strong>.</p>
            <div style="background:rgba(255,90,90,.08);border:1px solid rgba(255,90,90,.3);border-radius:10px;padding:16px;margin:18px 0">
              <div style="font-weight:800;color:#ffb0b0;margin-bottom:6px">Catégorie : ${data.categorie}</div>
              ${data.description ? `<div style="color:#a8b0ba;font-size:.9rem">Description : ${data.description}</div>` : ''}
            </div>
            <div style="background:rgba(0,217,255,.08);border:1px solid rgba(0,217,255,.3);border-radius:10px;padding:16px;margin:18px 0">
              <strong style="color:#00d9ff">⏱️ Tu as 48h pour contester</strong><br>
              <span style="color:#a8b0ba;font-size:.9rem">Délai jusqu'au ${data.conteste_avant ? new Date(data.conteste_avant).toLocaleString('fr-CA') : '48h'}. Sans réponse, le signalement sera validé automatiquement.</span>
            </div>
            <div style="text-align:center;margin:20px 0">
              <a href="${contesteLink}" style="background:#b8f53e;color:#071006;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">→ Voir et contester</a>
            </div>
            <p style="color:#6d7886;font-size:.78rem;margin-top:20px">Les signalements répétés affectent ton score de fiabilité. Un score bas peut suspendre temporairement ton accès à la plateforme.</p>
          </div>`
      });
      break;
    }

    // ── IMPRÉVU LIVRAISON — notif expéditeur ──
    case 'livraison_imprevu': {
      const actionLabels = {
        depot_securise: '📸 Dépôt sécurisé (photo + GPS)',
        relivraison: '🔄 Re-livraison demandée',
        retour_expediteur: '↩️ Retour à l\'expéditeur'
      };
      const actionLabel = actionLabels[data.action] || data.action;
      const reschedule = data.relivraison_date
        ? `<div style="margin-top:8px"><strong>Nouveau créneau :</strong> ${data.relivraison_date} de ${(data.relivraison_heure_debut||'').slice(0,5)} à ${(data.relivraison_heure_fin||'').slice(0,5)}</div>`
        : '';
      const compMsg = (data.compensation_amount && Number(data.compensation_amount) > 0)
        ? `<div style="margin-top:14px;padding:12px;background:rgba(255,90,90,.08);border:1px solid rgba(255,90,90,.3);border-radius:8px"><strong style="color:#ffb0b0">⚠️ Compensation livreur :</strong> Comme le destinataire est à l'origine de l'imprévu, le livreur reçoit <strong>${Number(data.compensation_amount).toFixed(2)} $</strong> pour son déplacement. Ce montant sera déduit du remboursement éventuel.</div>`
        : '';
      emails.push({
        to: data.expediteur_email,
        from: { email: fromEmail, name: fromName },
        subject: `⚠️ Imprévu sur ta livraison #${data.code} — ${actionLabel}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">⚠️ Imprévu sur ta livraison</h2>
            <p style="color:#a8b0ba">Bonjour ${data.prenom || ''},<br><br>Le livreur a signalé un imprévu pour ta livraison <strong style="color:#fff">#${data.code}</strong> (${data.ville_depart} → ${data.ville_arrivee}).</p>
            <div style="background:rgba(255,200,0,.08);border:1px solid rgba(255,200,0,.3);border-radius:10px;padding:16px;margin:18px 0">
              <div style="font-weight:800;color:#ffd700;margin-bottom:6px">${actionLabel}</div>
              ${data.raison ? `<div style="color:#a8b0ba;font-size:.9rem">Raison : ${data.raison}</div>` : ''}
              ${data.fautif ? `<div style="color:#a8b0ba;font-size:.85rem;margin-top:6px">Cause attribuée : <strong>${data.fautif}</strong></div>` : ''}
              ${reschedule}
            </div>
            ${compMsg}
            <p style="color:#a8b0ba;font-size:.9rem">Tu peux suivre l'évolution et contacter le support depuis ton dashboard.</p>
            <div style="text-align:center;margin:20px 0">
              <a href="https://porteaporte.site/dashboard-expediteur.html" style="background:#b8f53e;color:#071006;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">→ Mon dashboard</a>
            </div>
          </div>`
      });
      break;
    }

    // ── CODE DESTINATAIRE — email auto au destinataire ──
    case 'code_destinataire': {
      if (!data.destinataire_email) break;
      emails.push({
        to: data.destinataire_email,
        from: { email: fromEmail, name: fromName },
        subject: `📦 Un colis arrive pour toi — Code de réception : ${data.recipient_code}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">📦 Un colis arrive pour toi !</h2>
            <p style="color:#a8b0ba">Bonjour ${data.destinataire_nom || ''},<br><br><strong style="color:#fff">${data.expediteur_nom || 'Un expéditeur'}</strong> t'envoie un colis via PorteàPorte. Voici tes infos pour confirmer la réception.</p>
            <div style="background:rgba(184,245,62,.08);border:1px solid rgba(184,245,62,.25);border-radius:10px;padding:16px;margin:20px 0">
              <div style="font-size:.75rem;color:#6d7886;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Livraison</div>
              <div style="font-weight:700;color:#fff;margin-bottom:4px">📦 Depuis ${data.ville_depart}</div>
              <div style="font-weight:700;color:#b8f53e">🏠 Vers ${data.adresse_arrivee || data.ville_arrivee}</div>
              <div style="margin-top:8px;font-size:.85rem;color:#a8b0ba">${data.type_colis || 'Colis'}</div>
            </div>
            <div style="background:rgba(255,200,0,.08);border:2px solid rgba(255,200,0,.4);border-radius:12px;padding:20px;margin:20px 0;text-align:center">
              <div style="font-size:.8rem;color:#ffd700;font-weight:700;letter-spacing:.08em;margin-bottom:8px">🔑 TON CODE DE RÉCEPTION</div>
              <div style="font-size:2.2rem;font-weight:900;letter-spacing:.25em;color:#fff;margin-bottom:10px">${data.recipient_code}</div>
              <div style="font-size:.82rem;color:#a8b0ba">Garde ce code. Tu le saisiras à la réception du colis pour confirmer la livraison.</div>
            </div>
            <div style="text-align:center;margin:24px 0">
              <a href="${data.confirm_link}" style="background:#b8f53e;color:#071006;padding:14px 28px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">✅ Confirmer la réception</a>
            </div>
            <p style="color:#6d7886;font-size:.8rem;margin-top:20px;text-align:center">Tu peux aussi suivre la livraison en temps réel via ce lien.<br>PorteàPorte · Livraison sécurisée au Québec</p>
          </div>`
      });
      break;
    }

    // ── PREUVE SOUMISE — alerte admin action requise ──
    case 'preuve_soumise_admin': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `🔔 ACTION REQUISE — Preuve déposée : livraison #${data.code}`,
        html: templateAdminNotif('⚠️ Preuve de livraison soumise — paiement en attente', [
          { label: 'Code livraison', value: data.code },
          { label: 'Trajet', value: `${data.ville_depart} → ${data.ville_arrivee}` },
          { label: 'Type', value: data.type_colis },
          { label: 'Montant en escrow', value: `${parseFloat(data.prix_total || 0).toFixed(2)} $` },
          { label: 'Livreur', value: `${data.livreur_prenom} (${data.livreur_email})` },
          { label: 'Note du livreur', value: data.note || '—' },
          { label: 'Lien confirmation destinataire', value: data.confirm_link },
          { label: 'Actions disponibles', value: '1. Attendre que le destinataire entre son code → libération automatique\n2. OU valider manuellement dans le dashboard admin si confirmé verbalement' }
        ], true) +
        `<div style="text-align:center;margin:20px 0"><a href="${data.admin_link}" style="background:#b8f53e;color:#071006;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none;display:inline-block">→ Ouvrir le dashboard admin</a></div>`
      });
      break;
    }

    // ── COLIS LIVRÉ — notif expéditeur ──
    case 'colis_livre_expediteur': {
      emails.push({
        to: data.expediteur_email,
        from: { email: fromEmail, name: fromName },
        subject: `🚚 Colis #${data.code} livré — confirmation du destinataire en attente`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">🚚 Ton colis a été livré !</h2>
            <p style="color:#a8b0ba">Bonjour ${data.prenom || ''},<br><br>Le livreur a déposé une preuve de livraison pour ton colis <strong style="color:#fff">#${data.code}</strong>.</p>
            <div style="background:rgba(184,245,62,.08);border:1px solid rgba(184,245,62,.25);border-radius:10px;padding:16px;margin:20px 0">
              <div style="font-weight:700;color:#b8f53e">✅ Livré à : ${data.adresse_arrivee || data.ville_arrivee}</div>
              ${data.nom_destinataire ? `<div style="color:#a8b0ba;margin-top:4px">Destinataire : ${data.nom_destinataire}</div>` : ''}
            </div>
            <div style="background:rgba(0,217,255,.06);border:1px solid rgba(0,217,255,.2);border-radius:10px;padding:14px;margin:16px 0">
              <div style="font-size:.85rem;color:#00d9ff;font-weight:700;margin-bottom:8px">📋 Prochaine étape</div>
              <p style="color:#a8b0ba;font-size:.88rem;margin:0">Le destinataire doit confirmer la réception avec son code pour libérer le paiement au livreur. Transmets-lui ce lien si ce n'est pas encore fait :</p>
              <a href="${data.confirm_link}" style="display:block;margin-top:8px;color:#b8f53e;word-break:break-all;font-size:.82rem">${data.confirm_link}</a>
            </div>
            <p style="color:#6d7886;font-size:.8rem;margin-top:20px">Si le destinataire ne confirme pas sous 48h, contacte le support ou l'admin peut valider manuellement.<br><br>PorteàPorte · Livraison sécurisée au Québec</p>
          </div>`
      });
      break;
    }

    // ── COLIS LIVRÉ — notif destinataire (si email connu) ──
    case 'colis_livre_destinataire': {
      emails.push({
        to: data.destinataire_email,
        from: { email: fromEmail, name: fromName },
        subject: `📦 Votre colis est arrivé — Code de confirmation requis`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#b8f53e;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h2 style="margin:0 0 16px;color:#fff">📦 Votre colis est arrivé !</h2>
            <p style="color:#a8b0ba">Bonjour ${data.nom_destinataire || ''},<br><br>Un colis vous a été livré à <strong style="color:#fff">${data.ville_arrivee}</strong>.</p>
            <div style="background:rgba(255,200,0,.08);border:2px solid rgba(255,200,0,.35);border-radius:12px;padding:20px;margin:20px 0;text-align:center">
              <div style="font-size:.85rem;color:#ffd700;font-weight:700;margin-bottom:12px">Pour confirmer la réception, cliquez ci-dessous et entrez le code qui vous a été remis :</div>
              <a href="${data.confirm_link}" style="background:#b8f53e;color:#071006;padding:14px 28px;border-radius:10px;font-weight:900;text-decoration:none;display:inline-block;font-size:1rem">✅ Confirmer la réception</a>
            </div>
            <p style="color:#6d7886;font-size:.8rem;margin-top:20px">N'entrez le code que si vous avez bien reçu votre colis. En cas de problème, contactez PorteàPorte avant de confirmer.<br><br>PorteàPorte · Livraison sécurisée au Québec</p>
          </div>`
      });
      break;
    }

    // ── LIVRAISON COMPLÉTÉE ──
    case 'livraison_complete': {
      // À l'expéditeur
      emails.push({
        to: data.expediteur_email,
        from: { email: fromEmail, name: fromName },
        subject: `🎉 Ton colis ${data.code} a été livré !`,
        html: templateLivraisonComplete(data)
      });
      // Au livreur — paiement libéré
      emails.push({
        to: data.livreur_email,
        from: { email: fromEmail, name: fromName },
        subject: `💰 Paiement libéré — ${data.montant_livreur} $ en route !`,
        html: templatePaiementLibere(data)
      });
      break;
    }

    // ── LISTE D'ATTENTE ──
    case 'liste_attente': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: '🍁 Tu es sur la liste — 50 PorteCoins réservés pour toi !',
        html: templateListeAttente(data)
      });
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `📋 Liste d'attente : ${data.prenom} de ${data.ville}`,
        html: templateAdminNotif('Nouvelle inscription liste d\'attente', [
          { label: 'Nom', value: `${data.prenom} ${data.nom}` },
          { label: 'Courriel', value: data.email },
          { label: 'Ville', value: data.ville },
          { label: 'Rôle souhaité', value: data.role },
          { label: 'Code parrainage', value: data.parrain || 'Aucun' }
        ])
      });
      break;
    }

    // ── DEMANDE PARTENAIRE ──
    case 'partenaire': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: '🤝 Demande reçue — Denis te contacte sous 48h',
        html: templatePartenaire(data)
      });
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `🤝 Nouvelle demande partenaire : ${data.entreprise}`,
        html: templateAdminNotif('Demande de partenariat', [
          { label: 'Entreprise', value: data.entreprise },
          { label: 'Contact', value: `${data.prenom} ${data.nom}` },
          { label: 'Courriel', value: data.email },
          { label: 'Téléphone', value: data.tel || 'Non fourni' },
          { label: 'Type', value: data.type },
          { label: 'Région', value: data.region },
          { label: 'Offre proposée', value: data.offre },
          { label: 'Message', value: data.message || 'Aucun' }
        ])
      });
      break;
    }

    // ── LITIGE OUVERT ──
    case 'litige': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `⚠️ LITIGE OUVERT : ${data.code} — Action requise`,
        html: templateAdminNotif('⚠️ Nouveau litige — action requise', [
          { label: 'Code livraison', value: data.code },
          { label: 'Type', value: data.type_litige },
          { label: 'Plaignant', value: data.plaignant_email },
          { label: 'Montant réclamé', value: `${data.montant} $` },
          { label: 'Description', value: data.description }
        ], true)
      });
      break;
    }

    // ── CONTACT (formulaires site) ──
    case 'contact_support': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: '📬 Support PorteÀPorte : ' + (data.sujet || 'Sans sujet'),
        html: templateAdminNotif('Message support client', [
          { label: 'Prénom / nom', value: data.prenom || '' },
          { label: 'Courriel', value: data.email || '' },
          { label: 'Téléphone', value: data.tel || '' },
          { label: 'Sujet', value: data.sujet || '' },
          { label: 'Code livraison', value: data.code_livraison || '—' },
          {
            label: 'Message',
            value: truncateField(data.message || '', 8000),
          },
        ]),
      });
      break;
    }

    case 'contact_partenariat': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: '🤝 Contact partenariat — ' + (data.organisation || data.nom || 'Sans nom'),
        html: templateAdminNotif('Demande partenariat (contact)', [
          { label: 'Organisation', value: data.organisation },
          { label: 'Contact', value: data.nom },
          { label: 'Courriel', value: data.email },
          { label: 'Type', value: data.type_partenariat },
          {
            label: 'Message',
            value: truncateField(data.message || '', 8000),
          },
        ]),
      });
      break;
    }

    case 'contact_investisseur': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: '📈 Investisseur — ' + (data.organisation || data.nom || 'Sans nom'),
        html: templateAdminNotif('Demande investisseur', [
          { label: 'Nom', value: data.nom },
          { label: 'Organisation', value: data.organisation },
          { label: 'Courriel', value: data.email },
          { label: 'Téléphone', value: data.tel },
          { label: 'Montant', value: String(data.montant || '') },
          {
            label: 'Message',
            value: truncateField(data.message || '', 8000),
          },
        ]),
      });
      break;
    }

    // ── ACHAT PORTECOIN ──
    case 'achat_coins': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: `🪙 ${data.coins} PorteCoins crédités sur ton compte !`,
        html: templateAchatCoins(data)
      });
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `🪙 Achat PorteCoins : ${data.coins} PC — ${data.prix} $`,
        html: templateAdminNotif('Achat PorteCoins', [
          { label: 'Client', value: data.email },
          { label: 'Forfait', value: data.forfait },
          { label: 'Coins crédités', value: `${data.coins} PC` },
          { label: 'Montant payé', value: `${data.prix} $` },
          { label: 'Stripe ID', value: data.stripe_id || 'N/A' },
          { label: 'Cadeau pour', value: data.gift_email || 'Non (pour soi)' }
        ])
      });
      break;
    }

    // ─── BIENVENUE NOUVEAU COMPTE ──────────────────────────────────
    case 'bienvenue': {
      const prenom = data.prenom || 'toi';
      const role = data.role || 'expediteur';
      const roleLabel = role === 'livreur' ? 'livreur' : role === 'les deux' ? 'membre (les deux côtés)' : 'expéditeur';
      emails.push({
        to: data.to || data.email,
        from: { email: fromEmail, name: fromName },
        subject: `🎉 Bienvenue sur PorteàPorte, ${prenom} !`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#5dbfff;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE</div>
            <h1 style="color:#fff;font-size:1.5rem;margin:0 0 12px">Bienvenue ${prenom} ! 🎉</h1>
            <p style="color:#a8b0ba;line-height:1.6;margin:0 0 18px">Ton compte ${roleLabel} est créé. Tu peux maintenant utiliser PorteàPorte pour le covoiturage et la livraison de colis au Québec.</p>
            <div style="background:rgba(93,191,255,.08);border:1px solid rgba(93,191,255,.3);border-radius:10px;padding:18px;margin-bottom:18px">
              <strong style="color:#5dbfff;display:block;margin-bottom:8px">🚀 Prochaines étapes</strong>
              <ol style="color:#d8dde6;padding-left:20px;margin:0">
                <li style="margin-bottom:6px">Complète ton profil (photo, ville, téléphone)</li>
                <li style="margin-bottom:6px">Explore le tableau de bord</li>
                ${role !== 'expediteur' ? '<li style="margin-bottom:6px"><strong>Important :</strong> finalise ton compte Stripe Connect pour recevoir tes paiements</li>' : ''}
                <li>Publie ton premier trajet ou ta première livraison</li>
              </ol>
            </div>
            <a href="https://porteaporte.site/dashboard.html" style="display:inline-block;background:#5dbfff;color:#051022;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none">📊 Ouvrir mon dashboard</a>
            <p style="color:#6d7886;font-size:.78rem;margin-top:20px">Une question ? <a href="mailto:bonjour@porteaporte.site" style="color:#5dbfff">bonjour@porteaporte.site</a></p>
          </div>`
      });
      break;
    }

    // ─── COVOITURAGE : RÉSERVATION CONFIRMÉE (au passager) ────────
    case 'ride_booking_confirmed': {
      const route = `${data.ville_depart || '?'} → ${data.ville_arrivee || '?'}`;
      emails.push({
        to: data.passenger_email,
        from: { email: fromEmail, name: fromName },
        subject: `✅ Réservation confirmée : ${route}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#7dffc1;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE — RÉSERVATION CONFIRMÉE</div>
            <h1 style="color:#fff;font-size:1.4rem;margin:0 0 12px">✅ ${route}</h1>
            <p style="color:#a8b0ba;margin:0 0 18px">${data.departure_time || 'Date à confirmer'} · ${data.seats || 1} place(s) · <strong style="color:#7dffc1">${data.total_price || '—'} $</strong> payé</p>

            <div style="background:rgba(93,191,255,.08);border:1px solid rgba(93,191,255,.3);border-radius:10px;padding:16px;margin-bottom:18px">
              <strong style="color:#5dbfff;display:block;margin-bottom:8px">👨‍✈️ Ton conducteur</strong>
              <div><strong>${data.driver_name || 'Conducteur'}</strong></div>
              ${data.driver_email ? `<div style="margin-top:4px"><a href="mailto:${data.driver_email}" style="color:#5dbfff">${data.driver_email}</a></div>` : ''}
              ${data.driver_phone ? `<div><a href="tel:${data.driver_phone}" style="color:#7dffc1">📞 ${data.driver_phone}</a></div>` : ''}
              ${data.driver_vehicle ? `<div style="color:#a8b0ba;margin-top:6px">🚙 ${data.driver_vehicle}</div>` : ''}
            </div>

            <div style="background:rgba(125,255,193,.06);border:1px solid rgba(125,255,193,.25);border-radius:10px;padding:16px;margin-bottom:18px">
              <strong style="color:#7dffc1;display:block;margin-bottom:8px">📍 Points de rencontre</strong>
              <div style="margin-bottom:8px"><strong>Embarquement :</strong> ${data.pickup_label || data.ville_depart}<br>${data.pickup_address || ''}</div>
              <div><strong>Débarquement :</strong> ${data.dropoff_label || data.ville_arrivee}<br>${data.dropoff_address || ''}</div>
            </div>

            <a href="https://porteaporte.site/covoiturage-confirme.html?booking_id=${encodeURIComponent(data.booking_id || '')}" style="display:inline-block;background:#5dbfff;color:#051022;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none">📋 Voir tous les détails</a>

            <p style="color:#6d7886;font-size:.78rem;margin-top:22px;line-height:1.5">💡 Ton paiement est protégé. Le conducteur sera payé après la livraison du trajet. Tu peux contacter le conducteur directement par email ou téléphone si besoin.</p>
          </div>`
      });
      break;
    }

    // ─── COVOITURAGE : NOUVELLE RÉSERVATION (au conducteur) ───────
    case 'ride_booking_to_driver': {
      const route = `${data.ville_depart || '?'} → ${data.ville_arrivee || '?'}`;
      emails.push({
        to: data.driver_email,
        from: { email: fromEmail, name: fromName },
        subject: `🎫 Nouvelle réservation : ${data.passenger_name || 'Un passager'} (${route})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#05080c;color:#f7f8fb;border-radius:12px;padding:28px">
            <div style="color:#7dffc1;font-weight:900;font-size:.8rem;letter-spacing:.1em;margin-bottom:12px">PORTEÀPORTE — NOUVELLE RÉSERVATION</div>
            <h1 style="color:#fff;font-size:1.4rem;margin:0 0 12px">🎫 ${route}</h1>
            <p style="color:#a8b0ba;margin:0 0 18px">${data.departure_time || 'Date à confirmer'} · ${data.seats || 1} place(s) réservée(s)</p>

            <div style="background:rgba(93,191,255,.08);border:1px solid rgba(93,191,255,.3);border-radius:10px;padding:16px;margin-bottom:18px">
              <strong style="color:#5dbfff;display:block;margin-bottom:8px">🎫 Ton passager</strong>
              <div><strong>${data.passenger_name || 'Passager'}</strong></div>
              ${data.passenger_email ? `<div style="margin-top:4px"><a href="mailto:${data.passenger_email}" style="color:#5dbfff">${data.passenger_email}</a></div>` : ''}
              ${data.passenger_phone ? `<div><a href="tel:${data.passenger_phone}" style="color:#7dffc1">📞 ${data.passenger_phone}</a></div>` : ''}
              ${data.has_luggage ? '<div style="color:#ffd700;margin-top:6px">🧳 A des bagages volumineux</div>' : ''}
              ${data.has_pet ? '<div style="color:#ffd700;margin-top:6px">🐾 Voyage avec un animal</div>' : ''}
              ${data.special_requests ? `<div style="color:#a8b0ba;margin-top:8px;font-style:italic">"${data.special_requests}"</div>` : ''}
            </div>

            <div style="background:rgba(125,255,193,.06);border:1px solid rgba(125,255,193,.25);border-radius:10px;padding:16px;margin-bottom:18px">
              <strong style="color:#7dffc1;display:block;margin-bottom:8px">📍 Points de rencontre</strong>
              <div style="margin-bottom:8px"><strong>Embarquement :</strong> ${data.pickup_label || data.ville_depart}<br>${data.pickup_address || ''}</div>
              <div><strong>Débarquement :</strong> ${data.dropoff_label || data.ville_arrivee}<br>${data.dropoff_address || ''}</div>
            </div>

            <div style="background:rgba(255,200,0,.08);border:1px solid rgba(255,200,0,.3);border-radius:10px;padding:14px;margin-bottom:18px;font-size:.88rem">
              💰 <strong>Tu recevras ${data.driver_amount || '—'} $</strong> après la livraison du trajet (paiement Stripe escrow).
            </div>

            <a href="https://porteaporte.site/dashboard.html" style="display:inline-block;background:#5dbfff;color:#051022;padding:12px 24px;border-radius:8px;font-weight:900;text-decoration:none">📊 Voir mes trajets</a>
          </div>`
      });
      // Aussi notif admin pour suivi
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `🎫 Réservation : ${route} (${data.total_price || '—'} $)`,
        html: templateAdminNotif('Nouvelle réservation covoiturage', [
          { label: 'Route', value: route },
          { label: 'Passager', value: `${data.passenger_name || ''} (${data.passenger_email || ''})` },
          { label: 'Conducteur', value: `${data.driver_name || ''} (${data.driver_email || ''})` },
          { label: 'Date trajet', value: data.departure_time || '?' },
          { label: 'Places', value: data.seats || 1 },
          { label: 'Total payé', value: `${data.total_price || '—'} $` },
          { label: 'Montant conducteur', value: `${data.driver_amount || '—'} $` }
        ])
      });
      break;
    }
  }

  return emails;
}

function truncateField(val, max) {
  const s = String(val);
  if (s.length <= max) return s;
  return s.slice(0, max) + ' …';
}

// ============================================================
// ENVOI VIA SENDGRID API
// ============================================================
async function sendEmail(emailData, apiKey) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: emailData.to }] }],
      from: emailData.from,
      subject: emailData.subject,
      content: [{ type: 'text/html', value: emailData.html }]
    })
  });
  const text = await response.text().catch(() => '');
  let details = null;
  if (text) {
    try {
      details = JSON.parse(text);
    } catch (_) {
      details = text.slice(0, 500);
    }
  }
  const message = details?.errors?.[0]?.message || (typeof details === 'string' ? details : undefined);
  return {
    ok: response.status === 202,
    status: response.status,
    to: emailData.to,
    error: response.status === 202 ? undefined : (message || 'SendGrid a refuse le message'),
    sendgrid_message_id: response.headers.get('x-message-id') || null
  };
}

async function generateSupabaseMagicLink(email) {
  const _s = v => { let r = (v || '').trim(); while (r.length > 0 && r.charCodeAt(0) > 127) r = r.slice(1); return r.trim(); };
  const sbUrl = _s(process.env.SUPABASE_URL);
  const sbKey = _s(process.env.SUPABASE_SERVICE_KEY);
  if (!sbUrl || !sbKey) throw new Error('Supabase non configure pour les liens email');

  const redirectTo = (process.env.PUBLIC_SITE_ORIGIN || process.env.ALLOWED_ORIGIN || 'https://porteaporte.site').replace(/\/$/, '') + '/login.html?confirmed=1';
  const response = await fetch(`${sbUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'magiclink',
      email,
      redirect_to: redirectTo
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.msg || payload.error_description || payload.error || 'Lien Supabase impossible');
  }
  const link = payload.properties?.action_link || payload.action_link || payload.properties?.email_otp;
  if (!link || String(link).length < 20) throw new Error('Lien Supabase manquant');
  return link;
}

async function sendAuthConfirmationEmail(data, config) {
  const email = String(data?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: 'Email invalide' };

  const link = await generateSupabaseMagicLink(email);
  return sendEmail({
    to: email,
    from: { email: config.fromEmail, name: config.fromName },
    subject: 'Confirme ton compte PorteaPorte',
    html: templateAuthConfirmation({ email, link })
  }, config.sendgridKey);
}

async function sendTestEmail(data, config) {
  const email = String(data?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'Email invalide' };
  }
  const result = await sendEmail({
    to: email,
    from: { email: config.fromEmail, name: config.fromName },
    subject: 'Test PorteaPorte - Verification SendGrid',
    html: wrap(
      `<div style="${HEADER()}">${LOGO_HTML}</div>`,
      `<h2 style="font-size:22px;margin:0 0 16px;">Email de test recu</h2>
      <p style="color:#555;line-height:1.7;">SendGrid fonctionne correctement pour PorteaPorte.</p>
      <p style="font-size:12px;color:#777;">Timestamp: ${new Date().toISOString()}</p>`
    )
  }, config.sendgridKey);
  return {
    ...result,
    email_masked: email.replace(/^(.)(.*)(@.*)$/, '$1***$3')
  };
}

// ============================================================
// TEMPLATES HTML
// ============================================================
const CSS_BASE = `
  font-family: 'Helvetica Neue', Arial, sans-serif;
  background: #f4f4f0;
  margin: 0; padding: 0;
`;
const CONTAINER = `
  max-width: 560px; margin: 32px auto; background: #ffffff;
  border-radius: 8px; overflow: hidden;
  border: 1px solid #e0e0da;
`;
const HEADER = (bg = '#0A1628') => `
  background: ${bg}; padding: 28px 32px; text-align: center;
`;
const LOGO_HTML = `
  <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:2px;">
    Porte<span style="color:#B8F53E">à</span>Porte
  </span>
  <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:2px;">
    🍁 LIVRAISON DE CONFIANCE AU CANADA
  </div>
`;
const BODY_WRAP = `padding: 32px; color: #1a1a1a;`;
const FOOTER_HTML = `
  <div style="padding:24px 32px;background:#0A1628;text-align:center;border-top:3px solid #B8F53E;">
    <div style="font-size:13px;color:#ffffff;font-weight:700;margin-bottom:10px;">
      Porte<span style="color:#B8F53E">à</span>Porte 🍁
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.7;margin-bottom:12px;">
      Le réseau québécois de livraison entre voisins<br>
      Lévis · Québec · Canada
    </div>
    <div style="margin:14px 0 10px;">
      <a href="https://porteaporte.site" style="color:#B8F53E;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Site</a>
      <a href="https://porteaporte.site/comparatif.html" style="color:#B8F53E;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Comparatif</a>
      <a href="https://porteaporte.site/transparence.html" style="color:#B8F53E;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Transparence</a>
      <a href="https://www.facebook.com/profile.php?id=61568025027918" style="color:#B8F53E;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Facebook</a>
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:14px;line-height:1.6;">
      © 2026 PorteàPorte · Conforme Loi 25 (QC) · Paiement sécurisé Stripe<br>
      <a href="https://porteaporte.site/mes-donnees.html" style="color:rgba(255,255,255,0.5);text-decoration:underline;">Gérer mes données</a> ·
      <a href="https://porteaporte.site/confidentialite.html" style="color:rgba(255,255,255,0.5);text-decoration:underline;">Confidentialité</a>
    </div>
  </div>
`;

function wrap(header, body) {
  return `<html><body style="${CSS_BASE}"><div style="${CONTAINER}">${header}<div style="${BODY_WRAP}">${body}</div>${FOOTER_HTML}</div></body></html>`;
}

function templateBienvenue(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">Bienvenue, ${d.prenom} ! 🎉</h2>
    <p style="color:#555;line-height:1.7;">Ton compte PorteàPorte est créé. Tu fais maintenant partie de la première plateforme canadienne de livraison entre particuliers.</p>
    <div style="background:#f9f9f7;border:1px solid #e0e0da;border-radius:6px;padding:20px;margin:20px 0;text-align:center;">
      <div style="font-size:42px;font-weight:900;color:#B8F53E;letter-spacing:-2px;">50 🪙</div>
      <div style="font-size:13px;color:#888;margin-top:4px;">PorteCoins de bienvenue crédités</div>
      <div style="font-size:11px;color:#aaa;margin-top:2px;">Valeur : 5,00 $</div>
    </div>
    <p style="color:#555;line-height:1.7;">Utilise tes PorteCoins pour obtenir des livraisons gratuites, accéder à la boutique de récompenses, et participer aux tirages mensuels.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#B8F53E;color:#0A1628;padding:13px 28px;border-radius:4px;text-decoration:none;font-weight:800;font-size:14px;display:inline-block;">
        Accéder à mon compte →
      </a>
    </div>
    <p style="font-size:12px;color:#aaa;line-height:1.6;">Des questions ? Écris-nous à <a href="mailto:bonjour@porteaporte.site" style="color:#0A1628;">bonjour@porteaporte.site</a></p>`
  );
}

function templateAuthConfirmation(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">Confirme ton compte PorteaPorte</h2>
    <p style="color:#555;line-height:1.7;">Tu recois ce courriel parce qu'un compte PorteaPorte a ete cree avec cette adresse.</p>
    <p style="color:#555;line-height:1.7;">Clique sur le bouton ci-dessous pour confirmer ton courriel et ouvrir ta session.</p>
    <div style="text-align:center;margin:26px 0;">
      <a href="${d.link}" style="background:#B8F53E;color:#0A1628;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:800;font-size:14px;display:inline-block;">Confirmer mon courriel</a>
    </div>
    <p style="font-size:12px;color:#777;line-height:1.6;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :</p>
    <p style="font-size:11px;line-height:1.5;word-break:break-all;color:#555;">${d.link}</p>
    <p style="font-size:12px;color:#aaa;line-height:1.6;">Si tu n'as pas cree de compte PorteaPorte, tu peux ignorer ce message.</p>
    <p style="font-size:11px;color:#aaa;line-height:1.6;margin-top:18px;">PorteaPorte, plateforme de livraison collaborative au Quebec.</p>`
  );
}

function templateCarteLivreur(d) {
  const verified = d.driver_status === 'verified';
  const statusLabel = verified ? 'Livreur verifie' : 'Verification en attente';
  const cardId = d.card_id || 'PP-DR-' + String(d.user_id || '').slice(0, 8).toUpperCase();
  return wrap(
    `<div style="${HEADER('#1D6B3A')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">Ta carte livreur PorteaPorte</h2>
    <p style="color:#555;line-height:1.7;">Bonjour ${d.prenom || ''}, voici ta carte livreur numerique. Elle confirme ton profil PorteaPorte, mais l'acces aux colis reels reste limite tant que la verification n'est pas complete.</p>
    <div style="background:#0A1628;color:#fff;border-radius:12px;padding:22px;margin:20px 0;">
      <div style="font-size:12px;color:#B8F53E;text-transform:uppercase;letter-spacing:1px;">PorteaPorte</div>
      <div style="font-size:24px;font-weight:800;margin:14px 0 4px;">${d.prenom || ''} ${d.nom || ''}</div>
      <div style="font-size:13px;color:#d7dfd0;">${statusLabel}</div>
      <div style="height:1px;background:rgba(255,255,255,.18);margin:16px 0;"></div>
      <div style="font-size:13px;line-height:1.8;">
        <div><strong>ID :</strong> ${cardId}</div>
        <div><strong>Ville :</strong> ${d.ville || 'A completer'}</div>
        <div><strong>Transport :</strong> ${d.vehicule || d.transport_mode || 'A completer'}</div>
      </div>
    </div>
    <p style="color:#555;line-height:1.7;">Pour devenir actif, complete la verification d'identite. Les livreurs non verifies ne voient pas les colis reels ni les informations sensibles.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://porteaporte.site/dashboard-livreur.html" style="background:#B8F53E;color:#0A1628;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:800;">Ouvrir mon dashboard</a>
    </div>`
  );
}

function templateListeAttente(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">Tu es sur la liste, ${d.prenom} ! 🍁</h2>
    <p style="color:#555;line-height:1.7;">On a bien reçu ta demande. Tu seras parmi les premiers notifiés quand PorteàPorte ouvrira officiellement dans ta région.</p>
    <div style="background:#f0faf4;border:1px solid #b8f53e;border-radius:6px;padding:20px;margin:20px 0;">
      <div style="font-weight:700;margin-bottom:8px;">Ce qui t'attend au lancement :</div>
      <div style="color:#555;font-size:13px;line-height:1.8;">
        ✓ 50 PorteCoins offerts (valeur 5 $)<br>
        ✓ Badge exclusif "Fondateur" sur ton profil<br>
        ✓ Accès prioritaire avant l'ouverture publique<br>
        ✓ Tarifs préférentiels les 3 premiers mois
      </div>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://porteaporte.site" style="background:#0A1628;color:#ffffff;padding:13px 28px;border-radius:4px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
        Voir le site →
      </a>
    </div>`
  );
}

function templateLivraisonConfirmee(d) {
  return wrap(
    `<div style="${HEADER('#1A3A7C')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">✅ Livraison confirmée !</h2>
    <p style="color:#555;line-height:1.7;">Ton livreur a accepté ton colis. Voici les détails :</p>
    <div style="background:#f4f8ff;border:1px solid #c8d8f0;border-radius:6px;padding:20px;margin:16px 0;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e0e8f0;"><span style="color:#888;">Code</span><strong>${d.code}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e0e8f0;"><span style="color:#888;">Trajet</span><strong>${d.ville_depart} → ${d.ville_arrivee}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e0e8f0;"><span style="color:#888;">Livreur</span><strong>${d.livreur_prenom}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#888;">Montant</span><strong>${d.prix_total} $</strong></div>
    </div>
    <p style="color:#555;line-height:1.7;font-size:13px;">🔒 Ton paiement est sécurisé en escrow. Il sera libéré uniquement quand tu confirmeras la réception de ton colis.</p>
    <div style="text-align:center;margin:20px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#1A3A7C;color:#ffffff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">Suivre ma livraison →</a>
    </div>`
  );
}

function templateLivreurConfirme(d) {
  return wrap(
    `<div style="${HEADER('#1D6B3A')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">🚗 Nouvelle livraison assignée !</h2>
    <p style="color:#555;line-height:1.7;">Tu as une nouvelle livraison confirmée. Voici les détails du ramassage :</p>
    <div style="background:#f0faf4;border:1px solid #b8f53e;border-radius:6px;padding:20px;margin:16px 0;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Code</span><strong>${d.code}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Trajet</span><strong>${d.ville_depart} → ${d.ville_arrivee}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Adresse ramassage</span><strong>${d.adresse_depart || 'À confirmer'}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Date souhaitée</span><strong>${d.date_souhaitee || 'Flexible'}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#888;">Ton revenu</span><strong style="color:#1D6B3A;">${d.montant_livreur} $</strong></div>
    </div>
    <p style="font-size:12px;color:#888;">N'oublie pas de prendre une photo du colis au ramassage et à la livraison.</p>`
  );
}

function templateLivraisonComplete(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">🎉 Colis livré avec succès !</h2>
    <p style="color:#555;line-height:1.7;">Ton colis <strong>${d.code}</strong> a été livré. N'oublie pas de confirmer la réception pour libérer le paiement au livreur.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#B8F53E;color:#0A1628;padding:13px 28px;border-radius:4px;text-decoration:none;font-weight:800;font-size:14px;display:inline-block;">✅ Confirmer la réception →</a>
    </div>
    <p style="font-size:12px;color:#aaa;">Une fois confirmé, tu peux laisser une évaluation au livreur et il recevra son paiement. Tu gagneras aussi des PorteCoins.</p>`
  );
}

function templatePaiementLibere(d) {
  return wrap(
    `<div style="${HEADER('#1D6B3A')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">💰 Paiement libéré !</h2>
    <p style="color:#555;line-height:1.7;">L'expéditeur a confirmé la réception. Ton paiement de <strong style="color:#1D6B3A;">${d.montant_livreur} $</strong> a été libéré et sera dans ton compte sous 2-5 jours ouvrables.</p>
    <div style="background:#f0faf4;border:1px solid #b8f53e;border-radius:6px;padding:16px;margin:16px 0;text-align:center;">
      <div style="font-size:36px;font-weight:900;color:#1D6B3A;">${d.montant_livreur} $</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">+ ${d.portecoin_bonus || 0} PorteCoins bonus</div>
    </div>
    <p style="font-size:12px;color:#aaa;">Merci pour ta fiabilité ! Continue comme ça pour maintenir ton statut et accéder aux bonus mensuels.</p>`
  );
}

function templateAchatCoins(d) {
  return wrap(
    `<div style="${HEADER('#2A1A50')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">🪙 ${d.coins} PorteCoins crédités !</h2>
    <p style="color:#555;line-height:1.7;">Ton achat a été traité avec succès. Tes PorteCoins sont maintenant disponibles sur ton compte.</p>
    <div style="background:#f8f4ff;border:1px solid #c8b8f0;border-radius:6px;padding:20px;margin:16px 0;text-align:center;">
      <div style="font-size:48px;font-weight:900;color:#7F77DD;letter-spacing:-2px;">${d.coins} 🪙</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">Forfait ${d.forfait} · ${d.prix} $</div>
      <div style="font-size:12px;color:#aaa;margin-top:2px;">Valeur équivalente : ${(d.coins * 0.10).toFixed(2)} $</div>
    </div>
    ${d.gift_email ? `<p style="color:#555;line-height:1.7;font-size:13px;">🎁 Ces PorteCoins ont été envoyés à <strong>${d.gift_email}</strong> avec ton message.</p>` : ''}
    <div style="text-align:center;margin:20px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#7F77DD;color:#ffffff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">Voir mon solde →</a>
    </div>`
  );
}

function templatePartenaire(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">🤝 Demande bien reçue, ${d.prenom} !</h2>
    <p style="color:#555;line-height:1.7;">Merci pour ton intérêt à rejoindre le réseau PorteàPorte. Denis Morneau, fondateur, te contactera personnellement sous <strong>48 heures</strong> pour discuter des modalités.</p>
    <div style="background:#f4f8f4;border:1px solid #c8d8c8;border-radius:6px;padding:16px;margin:16px 0;font-size:13px;">
      <strong>${d.entreprise}</strong><br>
      <span style="color:#888;">${d.type} · ${d.region}</span><br>
      <span style="color:#555;margin-top:6px;display:block;">Offre : ${d.offre}</span>
    </div>
    <p style="font-size:12px;color:#aaa;line-height:1.6;">Questions urgentes : <a href="mailto:partenaires@porteaporte.site" style="color:#0A1628;">partenaires@porteaporte.site</a></p>`
  );
}

function templateAdminNotif(titre, rows, urgent = false) {
  const rowsHtml = rows.map(r =>
    `<tr>
      <td style="padding:7px 12px;color:#888;font-size:12px;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${r.label}</td>
      <td style="padding:7px 12px;font-size:12px;font-weight:500;border-bottom:1px solid #f0f0f0;">${r.value || '—'}</td>
    </tr>`
  ).join('');

  const headerBg = urgent ? '#8B0000' : '#0A1628';
  const alertBar = urgent
    ? `<div style="background:#FFEBEB;border-left:4px solid #CC0000;padding:10px 16px;font-size:12px;color:#CC0000;font-weight:600;margin-bottom:16px;">⚠️ ACTION REQUISE — Traiter dans les 24h</div>`
    : '';

  return wrap(
    `<div style="${HEADER(headerBg)}">${LOGO_HTML}<div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:8px;">📊 Notification Admin</div></div>`,
    `${alertBar}
    <h2 style="font-size:18px;margin:0 0 16px;">${titre}</h2>
    <table style="width:100%;border-collapse:collapse;font-family:inherit;">${rowsHtml}</table>
    <div style="margin-top:16px;text-align:center;">
      <a href="https://porteaporte.site/gestion-pp-8k2x.html" style="background:#0A1628;color:#ffffff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:600;display:inline-block;">Ouvrir le panneau admin →</a>
    </div>
    <p style="font-size:11px;color:#aaa;margin-top:16px;">Généré automatiquement par PorteàPorte · ${new Date().toLocaleString('fr-CA')}</p>`
  );
}
