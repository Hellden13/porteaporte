// tests/aides/notifier-serveur.js — Vrai serveur HTTP local qui fait tourner api/notifier.js tel quel.
// Seul l'appel à Resend est intercepté (noté dans un fichier, jamais envoyé). Tout autre réseau est refusé.
'use strict';
const http = require('node:http');
const fs = require('node:fs');

const journal = process.env.NOTIF_JOURNAL;
const fetchReel = global.fetch;
global.fetch = async (url, o = {}) => {
  const u = new URL(String(url));
  if (u.hostname === 'api.resend.com') {
    fs.appendFileSync(journal, JSON.stringify(JSON.parse(o.body)) + '\n');
    return new Response(JSON.stringify({ id: 'faux-id' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return fetchReel(url, o);
  throw new Error('Réseau bloqué dans le test : ' + u.hostname);
};

const notifier = require('../../api/notifier');
const serveur = http.createServer((req, res) => {
  let brut = '';
  req.on('data', (c) => { brut += c; });
  req.on('end', async () => {
    let body = {};
    try { body = brut ? JSON.parse(brut) : {}; } catch (_) { body = {}; }
    const vres = {
      statusCode: 200,
      setHeader(k, v) { res.setHeader(k, v); return this; },
      status(c) { this.statusCode = c; return this; },
      json(b) { res.writeHead(this.statusCode, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); return this; },
      end() { res.writeHead(this.statusCode); res.end(); return this; },
    };
    try { await notifier({ method: req.method, headers: req.headers, body, url: req.url }, vres); }
    catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  });
});
serveur.listen(0, '127.0.0.1', () => { process.stdout.write('PORT ' + serveur.address().port + '\n'); });
