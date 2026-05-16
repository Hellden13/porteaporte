// ============================================================
// PORTEÃPORTE â Vercel Function : Notifications courriel
// Fichier : api/notifier.js
// Service : SendGrid (gratuit jusqu'Ã  100 courriels/jour)
// ============================================================
// CONFIGURATION REQUISE dans Vercel â Settings â Environment Variables :
//   SENDGRID_API_KEY = SG.xxxxxxxxxxxxxxxxxxxxxxxx
//   ADMIN_EMAIL      = denismorneaubtc@gmail.com
//   FROM_EMAIL       = notifications@porteaporte.site
//   INTERNAL_API_SECRET = (obligatoire en prod pour types sensibles â voir BUILD)
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
  console.warn('[notifier] INTERNAL_API_SECRET non configure â tous types acceptÃ©s (migration)');
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
    return res.status(200).json({
      success: true,
      sendgrid_configured: Boolean(process.env.SENDGRID_API_KEY),
      from_email_configured: Boolean(process.env.FROM_EMAIL),
      admin_email_configured: Boolean(process.env.ADMIN_EMAIL),
      supabase_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      internal_secret_configured: Boolean(process.env.INTERNAL_API_SECRET)
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'MÃ©thode non autorisÃ©e' });

  const normalized = normalizeNotifierBody(req.body);
  if (!normalized) return res.status(400).json({ error: 'ParamÃ¨tres manquants (type et data)' });
  const { type, data } = normalized;

  const auth = assertNotifierAuth(req, type);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const ADMIN_EMAIL      = process.env.ADMIN_EMAIL || 'denismorneaubtc@gmail.com';
  const FROM_EMAIL       = process.env.FROM_EMAIL  || 'notifications@porteaporte.site';
  const FROM_NAME        = 'PorteÃ Porte ð';

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
      total: results.length
    });

  } catch (err) {
    console.error('Erreur notification:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// CONSTRUCTION DES COURRIELS PAR TYPE
// ============================================================
function buildEmails(type, data, adminEmail, fromEmail, fromName) {
  const emails = [];

  switch (type) {

    // ââ NOUVELLE INSCRIPTION ââ
    case 'inscription': {
      // 1. Courriel de bienvenue Ã  l'utilisateur
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: 'ð Bienvenue sur PorteÃ Porte ! Tes 50 PorteCoins t\'attendent',
        html: templateBienvenue(data)
      });
      // 2. Alerte admin
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `ð Nouvel inscrit : ${data.prenom} ${data.nom} (${data.role})`,
        html: templateAdminNotif('Nouvelle inscription', [
          { label: 'Nom', value: `${data.prenom} ${data.nom}` },
          { label: 'Courriel', value: data.email },
          { label: 'RÃ´le', value: data.role },
          { label: 'Ville', value: data.ville || 'Non spÃ©cifiÃ©e' },
          { label: 'Code parrainage', value: data.parrain || 'Aucun' },
          { label: 'PorteCoins', value: '50 crÃ©ditÃ©s automatiquement' }
        ])
      });
      break;
    }

    // ââ CARTE LIVREUR PROVISOIRE / CERTIFIEE ââ
    case 'carte_livreur': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: `Carte livreur PorteaPorte â ${data.card_id || 'profil livreur'}`,
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

    // ââ LIVRAISON PUBLIÃE ââ
    case 'livraison_publiee': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `ð¦ Nouvelle livraison : ${data.ville_depart} â ${data.ville_arrivee}`,
        html: templateAdminNotif('Nouvelle livraison publiÃ©e', [
          { label: 'Code', value: data.code },
          { label: 'Trajet', value: `${data.ville_depart} â ${data.ville_arrivee}` },
          { label: 'Type', value: data.type_colis },
          { label: 'Valeur dÃ©clarÃ©e', value: `${data.valeur_declaree} $` },
          { label: 'Prix proposÃ©', value: `${data.prix_total} $` },
          { label: 'Assurance', value: data.assurance_plan },
          { label: 'ExpÃ©diteur', value: data.expediteur_email }
        ])
      });
      break;
    }

    // ââ LIVRAISON CONFIRMÃE ââ
    case 'livraison_confirmee': {
      // Ã l'expÃ©diteur
      emails.push({
        to: data.expediteur_email,
        from: { email: fromEmail, name: fromName },
        subject: `â Ton colis ${data.code} est confirmÃ© â livraison en route !`,
        html: templateLivraisonConfirmee(data)
      });
      // Au livreur
      emails.push({
        to: data.livreur_email,
        from: { email: fromEmail, name: fromName },
        subject: `ð Livraison ${data.code} confirmÃ©e â ramassage Ã  prÃ©voir`,
        html: templateLivreurConfirme(data)
      });
      break;
    }

    // ââ LIVRAISON COMPLÃTÃE ââ
    case 'livraison_complete': {
      // Ã l'expÃ©diteur
      emails.push({
        to: data.expediteur_email,
        from: { email: fromEmail, name: fromName },
        subject: `ð Ton colis ${data.code} a Ã©tÃ© livrÃ© !`,
        html: templateLivraisonComplete(data)
      });
      // Au livreur â paiement libÃ©rÃ©
      emails.push({
        to: data.livreur_email,
        from: { email: fromEmail, name: fromName },
        subject: `ð° Paiement libÃ©rÃ© â ${data.montant_livreur} $ en route !`,
        html: templatePaiementLibere(data)
      });
      break;
    }

    // ââ LISTE D'ATTENTE ââ
    case 'liste_attente': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: 'ð Tu es sur la liste â 50 PorteCoins rÃ©servÃ©s pour toi !',
        html: templateListeAttente(data)
      });
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `ð Liste d'attente : ${data.prenom} de ${data.ville}`,
        html: templateAdminNotif('Nouvelle inscription liste d\'attente', [
          { label: 'Nom', value: `${data.prenom} ${data.nom}` },
          { label: 'Courriel', value: data.email },
          { label: 'Ville', value: data.ville },
          { label: 'RÃ´le souhaitÃ©', value: data.role },
          { label: 'Code parrainage', value: data.parrain || 'Aucun' }
        ])
      });
      break;
    }

    // ââ DEMANDE PARTENAIRE ââ
    case 'partenaire': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: 'ð¤ Demande reÃ§ue â Denis te contacte sous 48h',
        html: templatePartenaire(data)
      });
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `ð¤ Nouvelle demande partenaire : ${data.entreprise}`,
        html: templateAdminNotif('Demande de partenariat', [
          { label: 'Entreprise', value: data.entreprise },
          { label: 'Contact', value: `${data.prenom} ${data.nom}` },
          { label: 'Courriel', value: data.email },
          { label: 'TÃ©lÃ©phone', value: data.tel || 'Non fourni' },
          { label: 'Type', value: data.type },
          { label: 'RÃ©gion', value: data.region },
          { label: 'Offre proposÃ©e', value: data.offre },
          { label: 'Message', value: data.message || 'Aucun' }
        ])
      });
      break;
    }

    // ââ LITIGE OUVERT ââ
    case 'litige': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `â ï¸ LITIGE OUVERT : ${data.code} â Action requise`,
        html: templateAdminNotif('â ï¸ Nouveau litige â action requise', [
          { label: 'Code livraison', value: data.code },
          { label: 'Type', value: data.type_litige },
          { label: 'Plaignant', value: data.plaignant_email },
          { label: 'Montant rÃ©clamÃ©', value: `${data.montant} $` },
          { label: 'Description', value: data.description }
        ], true)
      });
      break;
    }

    // ââ CONTACT (formulaires site) ââ
    case 'contact_support': {
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: 'ð¬ Support PorteÃPorte : ' + (data.sujet || 'Sans sujet'),
        html: templateAdminNotif('Message support client', [
          { label: 'PrÃ©nom / nom', value: data.prenom || '' },
          { label: 'Courriel', value: data.email || '' },
          { label: 'TÃ©lÃ©phone', value: data.tel || '' },
          { label: 'Sujet', value: data.sujet || '' },
          { label: 'Code livraison', value: data.code_livraison || 'â' },
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
        subject: 'ð¤ Contact partenariat â ' + (data.organisation || data.nom || 'Sans nom'),
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
        subject: 'ð Investisseur â ' + (data.organisation || data.nom || 'Sans nom'),
        html: templateAdminNotif('Demande investisseur', [
          { label: 'Nom', value: data.nom },
          { label: 'Organisation', value: data.organisation },
          { label: 'Courriel', value: data.email },
          { label: 'TÃ©lÃ©phone', value: data.tel },
          { label: 'Montant', value: String(data.montant || '') },
          {
            label: 'Message',
            value: truncateField(data.message || '', 8000),
          },
        ]),
      });
      break;
    }

    // ââ ACHAT PORTECOIN ââ
    case 'achat_coins': {
      emails.push({
        to: data.email,
        from: { email: fromEmail, name: fromName },
        subject: `ðª ${data.coins} PorteCoins crÃ©ditÃ©s sur ton compte !`,
        html: templateAchatCoins(data)
      });
      emails.push({
        to: adminEmail,
        from: { email: fromEmail, name: fromName },
        subject: `ðª Achat PorteCoins : ${data.coins} PC â ${data.prix} $`,
        html: templateAdminNotif('Achat PorteCoins', [
          { label: 'Client', value: data.email },
          { label: 'Forfait', value: data.forfait },
          { label: 'Coins crÃ©ditÃ©s', value: `${data.coins} PC` },
          { label: 'Montant payÃ©', value: `${data.prix} $` },
          { label: 'Stripe ID', value: data.stripe_id || 'N/A' },
          { label: 'Cadeau pour', value: data.gift_email || 'Non (pour soi)' }
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
  return s.slice(0, max) + ' â¦';
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
    error: response.status === 202 ? undefined : (message || 'SendGrid a refuse le message')
  };
}

async function generateSupabaseMagicLink(email) {
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
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
    Porte<span style="color:#B8F53E">Ã </span>Porte
  </span>
  <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:2px;">
    ð LIVRAISON DE CONFIANCE AU CANADA
  </div>
`;
const BODY_WRAP = `padding: 32px; color: #1a1a1a;`;
const FOOTER_HTML = `
  <div style="padding:20px 32px;background:#f4f4f0;text-align:center;font-size:11px;color:#888;border-top:1px solid #e0e0da;">
    Â© 2026 PorteÃ Porte Â· porteaporte.site Â· LÃ©vis, QuÃ©bec ð<br>
    <a href="https://porteaporte.site" style="color:#0A1628;">Visiter le site</a> Â·
    <a href="https://porteaporte.site/compte.html" style="color:#0A1628;">Mon compte</a>
  </div>
`;

function wrap(header, body) {
  return `<html><body style="${CSS_BASE}"><div style="${CONTAINER}">${header}<div style="${BODY_WRAP}">${body}</div>${FOOTER_HTML}</div></body></html>`;
}

function templateBienvenue(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">Bienvenue, ${d.prenom} ! ð</h2>
    <p style="color:#555;line-height:1.7;">Ton compte PorteÃ Porte est crÃ©Ã©. Tu fais maintenant partie de la premiÃ¨re plateforme canadienne de livraison entre particuliers.</p>
    <div style="background:#f9f9f7;border:1px solid #e0e0da;border-radius:6px;padding:20px;margin:20px 0;text-align:center;">
      <div style="font-size:42px;font-weight:900;color:#B8F53E;letter-spacing:-2px;">50 ðª</div>
      <div style="font-size:13px;color:#888;margin-top:4px;">PorteCoins de bienvenue crÃ©ditÃ©s</div>
      <div style="font-size:11px;color:#aaa;margin-top:2px;">Valeur : 5,00 $</div>
    </div>
    <p style="color:#555;line-height:1.7;">Utilise tes PorteCoins pour obtenir des livraisons gratuites, accÃ©der Ã  la boutique de rÃ©compenses, et participer aux tirages mensuels.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#B8F53E;color:#0A1628;padding:13px 28px;border-radius:4px;text-decoration:none;font-weight:800;font-size:14px;display:inline-block;">
        AccÃ©der Ã  mon compte â
      </a>
    </div>
    <p style="font-size:12px;color:#aaa;line-height:1.6;">Des questions ? Ãcris-nous Ã  <a href="mailto:bonjour@porteaporte.site" style="color:#0A1628;">bonjour@porteaporte.site</a></p>`
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
    `<h2 style="font-size:22px;margin:0 0 16px;">Tu es sur la liste, ${d.prenom} ! ð</h2>
    <p style="color:#555;line-height:1.7;">On a bien reÃ§u ta demande. Tu seras parmi les premiers notifiÃ©s quand PorteÃ Porte ouvrira officiellement dans ta rÃ©gion.</p>
    <div style="background:#f0faf4;border:1px solid #b8f53e;border-radius:6px;padding:20px;margin:20px 0;">
      <div style="font-weight:700;margin-bottom:8px;">Ce qui t'attend au lancement :</div>
      <div style="color:#555;font-size:13px;line-height:1.8;">
        â 50 PorteCoins offerts (valeur 5 $)<br>
        â Badge exclusif "Fondateur" sur ton profil<br>
        â AccÃ¨s prioritaire avant l'ouverture publique<br>
        â Tarifs prÃ©fÃ©rentiels les 3 premiers mois
      </div>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://porteaporte.site" style="background:#0A1628;color:#ffffff;padding:13px 28px;border-radius:4px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
        Voir le site â
      </a>
    </div>`
  );
}

function templateLivraisonConfirmee(d) {
  return wrap(
    `<div style="${HEADER('#1A3A7C')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">â Livraison confirmÃ©e !</h2>
    <p style="color:#555;line-height:1.7;">Ton livreur a acceptÃ© ton colis. Voici les dÃ©tails :</p>
    <div style="background:#f4f8ff;border:1px solid #c8d8f0;border-radius:6px;padding:20px;margin:16px 0;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e0e8f0;"><span style="color:#888;">Code</span><strong>${d.code}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e0e8f0;"><span style="color:#888;">Trajet</span><strong>${d.ville_depart} â ${d.ville_arrivee}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e0e8f0;"><span style="color:#888;">Livreur</span><strong>${d.livreur_prenom}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#888;">Montant</span><strong>${d.prix_total} $</strong></div>
    </div>
    <p style="color:#555;line-height:1.7;font-size:13px;">ð Ton paiement est sÃ©curisÃ© en escrow. Il sera libÃ©rÃ© uniquement quand tu confirmeras la rÃ©ception de ton colis.</p>
    <div style="text-align:center;margin:20px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#1A3A7C;color:#ffffff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">Suivre ma livraison â</a>
    </div>`
  );
}

function templateLivreurConfirme(d) {
  return wrap(
    `<div style="${HEADER('#1D6B3A')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">ð Nouvelle livraison assignÃ©e !</h2>
    <p style="color:#555;line-height:1.7;">Tu as une nouvelle livraison confirmÃ©e. Voici les dÃ©tails du ramassage :</p>
    <div style="background:#f0faf4;border:1px solid #b8f53e;border-radius:6px;padding:20px;margin:16px 0;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Code</span><strong>${d.code}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Trajet</span><strong>${d.ville_depart} â ${d.ville_arrivee}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Adresse ramassage</span><strong>${d.adresse_depart || 'Ã confirmer'}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #c8e8d0;"><span style="color:#888;">Date souhaitÃ©e</span><strong>${d.date_souhaitee || 'Flexible'}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#888;">Ton revenu</span><strong style="color:#1D6B3A;">${d.montant_livreur} $</strong></div>
    </div>
    <p style="font-size:12px;color:#888;">N'oublie pas de prendre une photo du colis au ramassage et Ã  la livraison.</p>`
  );
}

function templateLivraisonComplete(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">ð Colis livrÃ© avec succÃ¨s !</h2>
    <p style="color:#555;line-height:1.7;">Ton colis <strong>${d.code}</strong> a Ã©tÃ© livrÃ©. N'oublie pas de confirmer la rÃ©ception pour libÃ©rer le paiement au livreur.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#B8F53E;color:#0A1628;padding:13px 28px;border-radius:4px;text-decoration:none;font-weight:800;font-size:14px;display:inline-block;">â Confirmer la rÃ©ception â</a>
    </div>
    <p style="font-size:12px;color:#aaa;">Une fois confirmÃ©, tu peux laisser une Ã©valuation au livreur et il recevra son paiement. Tu gagneras aussi des PorteCoins.</p>`
  );
}

function templatePaiementLibere(d) {
  return wrap(
    `<div style="${HEADER('#1D6B3A')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">ð° Paiement libÃ©rÃ© !</h2>
    <p style="color:#555;line-height:1.7;">L'expÃ©diteur a confirmÃ© la rÃ©ception. Ton paiement de <strong style="color:#1D6B3A;">${d.montant_livreur} $</strong> a Ã©tÃ© libÃ©rÃ© et sera dans ton compte sous 2-5 jours ouvrables.</p>
    <div style="background:#f0faf4;border:1px solid #b8f53e;border-radius:6px;padding:16px;margin:16px 0;text-align:center;">
      <div style="font-size:36px;font-weight:900;color:#1D6B3A;">${d.montant_livreur} $</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">+ ${d.portecoin_bonus || 0} PorteCoins bonus</div>
    </div>
    <p style="font-size:12px;color:#aaa;">Merci pour ta fiabilitÃ© ! Continue comme Ã§a pour maintenir ton statut et accÃ©der aux bonus mensuels.</p>`
  );
}

function templateAchatCoins(d) {
  return wrap(
    `<div style="${HEADER('#2A1A50')}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">ðª ${d.coins} PorteCoins crÃ©ditÃ©s !</h2>
    <p style="color:#555;line-height:1.7;">Ton achat a Ã©tÃ© traitÃ© avec succÃ¨s. Tes PorteCoins sont maintenant disponibles sur ton compte.</p>
    <div style="background:#f8f4ff;border:1px solid #c8b8f0;border-radius:6px;padding:20px;margin:16px 0;text-align:center;">
      <div style="font-size:48px;font-weight:900;color:#7F77DD;letter-spacing:-2px;">${d.coins} ðª</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">Forfait ${d.forfait} Â· ${d.prix} $</div>
      <div style="font-size:12px;color:#aaa;margin-top:2px;">Valeur Ã©quivalente : ${(d.coins * 0.10).toFixed(2)} $</div>
    </div>
    ${d.gift_email ? `<p style="color:#555;line-height:1.7;font-size:13px;">ð Ces PorteCoins ont Ã©tÃ© envoyÃ©s Ã  <strong>${d.gift_email}</strong> avec ton message.</p>` : ''}
    <div style="text-align:center;margin:20px 0;">
      <a href="https://porteaporte.site/compte.html" style="background:#7F77DD;color:#ffffff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">Voir mon solde â</a>
    </div>`
  );
}

function templatePartenaire(d) {
  return wrap(
    `<div style="${HEADER()}">${LOGO_HTML}</div>`,
    `<h2 style="font-size:22px;margin:0 0 16px;">ð¤ Demande bien reÃ§ue, ${d.prenom} !</h2>
    <p style="color:#555;line-height:1.7;">Merci pour ton intÃ©rÃªt Ã  rejoindre le rÃ©seau PorteÃ Porte. Denis Morneau, fondateur, te contactera personnellement sous <strong>48 heures</strong> pour discuter des modalitÃ©s.</p>
    <div style="background:#f4f8f4;border:1px solid #c8d8c8;border-radius:6px;padding:16px;margin:16px 0;font-size:13px;">
      <strong>${d.entreprise}</strong><br>
      <span style="color:#888;">${d.type} Â· ${d.region}</span><br>
      <span style="color:#555;margin-top:6px;display:block;">Offre : ${d.offre}</span>
    </div>
    <p style="font-size:12px;color:#aaa;line-height:1.6;">Questions urgentes : <a href="mailto:partenaires@porteaporte.site" style="color:#0A1628;">partenaires@porteaporte.site</a></p>`
  );
}

function templateAdminNotif(titre, rows, urgent = false) {
  const rowsHtml = rows.map(r =>
    `<tr>
      <td style="padding:7px 12px;color:#888;font-size:12px;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${r.label}</td>
      <td style="padding:7px 12px;font-size:12px;font-weight:500;border-bottom:1px solid #f0f0f0;">${r.value || 'â'}</td>
    </tr>`
  ).join('');

  const headerBg = urgent ? '#8B0000' : '#0A1628';
  const alertBar = urgent
    ? `<div style="background:#FFEBEB;border-left:4px solid #CC0000;padding:10px 16px;font-size:12px;color:#CC0000;font-weight:600;margin-bottom:16px;">â ï¸ ACTION REQUISE â Traiter dans les 24h</div>`
    : '';

  return wrap(
    `<div style="${HEADER(headerBg)}">${LOGO_HTML}<div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:8px;">ð Notification Admin</div></div>`,
    `${alertBar}
    <h2 style="font-size:18px;margin:0 0 16px;">${titre}</h2>
    <table style="width:100%;border-collapse:collapse;font-family:inherit;">${rowsHtml}</table>
    <div style="margin-top:16px;text-align:center;">
      <a href="https://porteaporte.site/gestion-pp-8k2x.html" style="background:#0A1628;color:#ffffff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:600;display:inline-block;">Ouvrir le panneau admin â</a>
    </div>
    <p style="font-size:11px;color:#aaa;margin-top:16px;">GÃ©nÃ©rÃ© automatiquement par PorteÃ Porte Â· ${new Date().toLocaleString('fr-CA')}</p>`
  );
}
