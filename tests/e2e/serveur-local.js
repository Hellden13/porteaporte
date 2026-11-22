// tests/e2e/serveur-local.js — Fait tourner le site + l'API SUR LE MAC, branchés sur la base Supabase LOCALE.
// Garde-fou : tout appel réseau hors 127.0.0.1 / localhost est BLOQUÉ (production, courriels, etc.).
// Stripe est remplacé par un faux Stripe en mémoire (mode test simulé). Aucune clé réelle n'est utilisée.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');

function demarrer({ supabaseUrl, anonKey, serviceKey, port = 0, configNavigateurLocale = false }) {
  const u = new URL(supabaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('REFUS : la base doit être locale (127.0.0.1)');
  Object.assign(process.env, {
    SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey,
    STRIPE_SECRET_KEY: 'sk_test_fake123', STRIPE_WEBHOOK_SECRET: 'whsec_e2e_local',
    CRON_SECRET: 'e2e-local-cron-secret-0123456789abcdef', INTERNAL_API_SECRET: 'e2e-local-internal-secret-0123',
  });
  for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'TWILIO_AUTH_TOKEN', 'GOOGLE_MAPS_API_KEY', 'TURNSTILE_SECRET', 'VAPID_PRIVATE_KEY']) delete process.env[k];

  const bloques = [];
  const stripe = { intents: new Map(), appels: [] };
  const vraiFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const cible = new URL(String(url));
    if (cible.hostname === 'api.stripe.com') return fauxStripe(stripe, cible, opts);
    if (!['127.0.0.1', 'localhost'].includes(cible.hostname)) {
      bloques.push(`${opts.method || 'GET'} ${cible.hostname}${cible.pathname}`);
      throw new Error('E2E : appel réseau hors du Mac bloqué');
    }
    return vraiFetch(url, opts);
  };

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const handlers = {};
  const charger = (nom) => (handlers[nom] ||= require(path.join(ROOT, 'api', nom + '.js')));

  const serveur = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    let p = url.pathname;
    // Réécritures /api/xxx -> /api/platform?endpoint=xxx (comme vercel.json)
    for (const r of vercel.rewrites || []) {
      if (r.source === p && r.destination.startsWith('/api/')) {
        const d = new URL(r.destination, 'http://local');
        p = d.pathname; d.searchParams.forEach((v, k) => url.searchParams.set(k, v));
        break;
      }
    }
    if (p.startsWith('/api/')) {
      const nom = p.slice(5).replace(/\/$/, '');
      if (!/^[a-z0-9-]+$/.test(nom) || !fs.existsSync(path.join(ROOT, 'api', nom + '.js'))) { res.statusCode = 404; return res.end('{}'); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const brut = Buffer.concat(chunks).toString('utf8');
      let body = {}; try { body = brut ? JSON.parse(brut) : {}; } catch (_) {}
      const vreq = Object.assign(req, { body, query: Object.fromEntries(url.searchParams), url: p + url.search });
      const vres = {
        _s: 200, _h: { 'content-type': 'application/json' },
        status(c) { this._s = c; return this; }, setHeader(k, v) { this._h[k.toLowerCase()] = v; return this; },
        json(b) { res.writeHead(this._s, this._h); res.end(JSON.stringify(b)); return this; },
        send(b) { res.writeHead(this._s, this._h); res.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); return this; },
        end(b) { if (!res.headersSent) res.writeHead(this._s, this._h); res.end(b); return this; },
        redirect(c, l) { res.writeHead(typeof c === 'number' ? c : 302, { location: l || c }); res.end(); },
      };
      try { await charger(nom)(vreq, vres); } catch (e) { if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ error: String(e.message) })); } }
      return;
    }
    // Redirections simples de vercel.json
    const red = (vercel.redirects || []).find((r) => r.source === p);
    if (red) { res.writeHead(red.permanent ? 308 : 307, { location: red.destination }); return res.end(); }
    // Captures d'écran : le navigateur parle à la base LOCALE (jamais à la production).
    if (configNavigateurLocale && (p === '/js/supabase-config.js' || p === '/js/auth-api.js')) {
      let js = fs.readFileSync(path.join(ROOT, p), 'utf8');
      js = js.replace(/https:\/\/miqrircrfpzkmvvacgwt\.supabase\.co/g, supabaseUrl)
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, anonKey);
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(js);
    }
    // Fichiers statiques (cleanUrls)
    let f = path.join(ROOT, decodeURIComponent(p));
    if (!f.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('404'); }
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); fs.createReadStream(f).pipe(res);
  });

  return new Promise((ok) => serveur.listen(port, '127.0.0.1', () => {
    const adresse = `http://127.0.0.1:${serveur.address().port}`;
    process.env.PUBLIC_SITE_ORIGIN = adresse; process.env.BASE_URL = adresse;
    ok({ adresse, bloques, stripe, fermer: () => new Promise((f) => { global.fetch = vraiFetch; serveur.close(f); }) });
  }));
}

// Faux Stripe : PaymentIntents en capture manuelle, comptes Connect.
async function fauxStripe(etat, url, opts) {
  const m = (opts.method || 'GET').toUpperCase();
  const form = new URLSearchParams(typeof opts.body === 'string' ? opts.body : '');
  etat.appels.push(`${m} ${url.pathname}`);
  const rep = (d, s = 200) => ({ ok: s < 400, status: s, headers: { get: () => null }, json: async () => d, text: async () => JSON.stringify(d) });
  let mm;
  if (m === 'POST' && url.pathname === '/v1/payment_intents') {
    const id = 'pi_test_e2e' + Math.random().toString(36).slice(2, 12).padEnd(14, '0');
    const pi = { id, object: 'payment_intent', amount: Number(form.get('amount')), currency: form.get('currency') || 'cad', status: 'requires_payment_method', capture_method: form.get('capture_method') || 'automatic', client_secret: id + '_secret_e2e', metadata: {} };
    for (const [k, v] of form) { const x = k.match(/^metadata\[(.+)\]$/); if (x) pi.metadata[x[1]] = v; }
    etat.intents.set(id, pi); return rep(pi);
  }
  if ((mm = url.pathname.match(/^\/v1\/payment_intents\/([^/]+)$/))) {
    const pi = etat.intents.get(mm[1]); return pi ? rep(pi) : rep({ error: { message: 'No such payment_intent' } }, 404);
  }
  if ((mm = url.pathname.match(/^\/v1\/payment_intents\/([^/]+)\/(capture|cancel)$/))) {
    const pi = etat.intents.get(mm[1]); if (!pi) return rep({ error: { message: 'No such payment_intent' } }, 404);
    pi.status = mm[2] === 'capture' ? 'succeeded' : 'canceled'; pi.amount_received = pi.amount; return rep(pi);
  }
  if (url.pathname.startsWith('/v1/accounts')) return rep({ id: 'acct_e2e', charges_enabled: true, payouts_enabled: true, details_submitted: true });
  if (url.pathname.startsWith('/v1/transfers') || url.pathname.startsWith('/v1/refunds')) return rep({ id: 'tr_e2e', status: 'succeeded' });
  return rep({ error: { message: 'faux Stripe : route non simulée ' + url.pathname } }, 400);
}

// Simule « le passager a payé » (ce que Stripe.js ferait dans le navigateur).
function autoriserPaiement(stripe, piId) {
  const pi = stripe.intents.get(piId); if (pi) { pi.status = pi.capture_method === 'manual' ? 'requires_capture' : 'succeeded'; pi.amount_capturable = pi.amount; }
  return pi;
}

module.exports = { demarrer, autoriserPaiement };
