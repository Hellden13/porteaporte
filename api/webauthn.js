const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(value) {
  value = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  return Buffer.from(value, 'base64');
}

function randomChallenge() {
  return b64url(crypto.randomBytes(32));
}

function originFromReq(req) {
  return process.env.WEBAUTHN_ORIGIN || `https://${req.headers.host || 'porteaporte.site'}`;
}

function rpIdFromReq(req) {
  return process.env.WEBAUTHN_RP_ID || (req.headers.host || 'porteaporte.site').split(':')[0];
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}

async function getSession(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${sbUrl}/auth/v1/user`, { headers: { apikey: sbKey, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

async function getProfile(userId, sbUrl, sbKey) {
  const r = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=id,email,prenom,nom,role`, { headers: sbHeaders(sbKey) });
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

function canUseBiometric(profile) {
  return ['livreur', 'les deux', 'admin'].includes(profile?.role);
}

async function saveChallenge(userId, challengeType, challenge, sbUrl, sbKey) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await fetch(`${sbUrl}/rest/v1/webauthn_challenges`, {
    method: 'POST',
    headers: sbHeaders(sbKey),
    body: JSON.stringify({ user_id: userId, type: challengeType, challenge, expires_at: expiresAt })
  });
}

async function consumeChallenge(userId, challengeType, challenge, sbUrl, sbKey) {
  const r = await fetch(`${sbUrl}/rest/v1/webauthn_challenges?user_id=eq.${userId}&type=eq.${challengeType}&challenge=eq.${encodeURIComponent(challenge)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&order=created_at.desc&limit=1`, {
    headers: sbHeaders(sbKey)
  });
  const rows = r.ok ? await r.json() : [];
  if (!rows[0]) return false;
  await fetch(`${sbUrl}/rest/v1/webauthn_challenges?id=eq.${rows[0].id}`, { method: 'DELETE', headers: { ...sbHeaders(sbKey), Prefer: 'return=minimal' } });
  return true;
}

function readCbor(buffer, offset = 0) {
  const first = buffer[offset++];
  const major = first >> 5;
  let add = first & 31;
  function readLen() {
    if (add < 24) return add;
    if (add === 24) return buffer[offset++];
    if (add === 25) { const v = buffer.readUInt16BE(offset); offset += 2; return v; }
    if (add === 26) { const v = buffer.readUInt32BE(offset); offset += 4; return v; }
    throw new Error('CBOR length unsupported');
  }
  if (major === 0) return { value: readLen(), offset };
  if (major === 1) return { value: -1 - readLen(), offset };
  if (major === 2) { const len = readLen(); const value = buffer.slice(offset, offset + len); return { value, offset: offset + len }; }
  if (major === 3) { const len = readLen(); const value = buffer.slice(offset, offset + len).toString('utf8'); return { value, offset: offset + len }; }
  if (major === 4) { const len = readLen(); const arr = []; for (let i = 0; i < len; i++) { const r = readCbor(buffer, offset); arr.push(r.value); offset = r.offset; } return { value: arr, offset }; }
  if (major === 5) {
    const len = readLen();
    const map = new Map();
    for (let i = 0; i < len; i++) {
      const k = readCbor(buffer, offset); offset = k.offset;
      const v = readCbor(buffer, offset); offset = v.offset;
      map.set(k.value, v.value);
    }
    return { value: map, offset };
  }
  if (major === 7) return { value: add === 21, offset };
  throw new Error('CBOR type unsupported');
}

function coseToJwk(coseBuffer) {
  const parsed = readCbor(coseBuffer).value;
  const kty = parsed.get(1);
  const alg = parsed.get(3);
  const crv = parsed.get(-1);
  const x = parsed.get(-2);
  const y = parsed.get(-3);
  if (kty !== 2 || alg !== -7 || crv !== 1 || !x || !y) throw new Error('Only ES256 passkeys supported');
  return { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y), ext: true };
}

function parseAuthData(authData) {
  const rpIdHash = authData.slice(0, 32);
  const flags = authData[32];
  const counter = authData.readUInt32BE(33);
  let offset = 37;
  if (!(flags & 0x40)) return { rpIdHash, flags, counter };
  offset += 16;
  const credLen = authData.readUInt16BE(offset); offset += 2;
  const credentialId = authData.slice(offset, offset + credLen); offset += credLen;
  const publicKeyCose = authData.slice(offset);
  return { rpIdHash, flags, counter, credentialId, publicKeyJwk: coseToJwk(publicKeyCose) };
}

function verifyClientData(clientDataJSON, expectedType, expectedChallenge, expectedOrigin) {
  const clientData = JSON.parse(fromB64url(clientDataJSON).toString('utf8'));
  if (clientData.type !== expectedType) throw new Error('Type WebAuthn invalide');
  if (clientData.challenge !== expectedChallenge) throw new Error('Challenge invalide');
  if (clientData.origin !== expectedOrigin) throw new Error('Origine invalide');
  return clientData;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase service non configure' });

  const session = await getSession(req, SB_URL, SB_KEY);
  if (!session) return res.status(401).json({ error: 'Session requise' });
  const profile = await getProfile(session.id, SB_URL, SB_KEY);
  if (!canUseBiometric(profile)) return res.status(403).json({ error: 'Role livreur requis' });

  const { action } = req.body || {};
  const rpId = rpIdFromReq(req);
  const origin = originFromReq(req);

  try {
    if (action === 'register-options') {
      const challenge = randomChallenge();
      await saveChallenge(session.id, 'registration', challenge, SB_URL, SB_KEY);
      const existingRes = await fetch(`${SB_URL}/rest/v1/webauthn_credentials?user_id=eq.${session.id}&select=credential_id`, { headers: sbHeaders(SB_KEY) });
      const existing = existingRes.ok ? await existingRes.json() : [];
      return res.status(200).json({
        publicKey: {
          challenge,
          rp: { name: 'PorteaPorte', id: rpId },
          user: {
            id: b64url(Buffer.from(session.id)),
            name: session.email || profile.email || session.id,
            displayName: [profile.prenom, profile.nom].filter(Boolean).join(' ') || session.email || 'Livreur'
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          timeout: 60000,
          attestation: 'none',
          authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
          excludeCredentials: existing.map(c => ({ type: 'public-key', id: c.credential_id }))
        }
      });
    }

    if (action === 'register-verify') {
      const cred = req.body.credential || {};
      const clientDataJSON = cred.response?.clientDataJSON;
      const attestationObject = cred.response?.attestationObject;
      const clientData = JSON.parse(fromB64url(clientDataJSON).toString('utf8'));
      if (!(await consumeChallenge(session.id, 'registration', clientData.challenge, SB_URL, SB_KEY))) throw new Error('Challenge expire');
      verifyClientData(clientDataJSON, 'webauthn.create', clientData.challenge, origin);
      const att = readCbor(fromB64url(attestationObject)).value;
      const auth = parseAuthData(att.get('authData'));
      const expectedRpHash = crypto.createHash('sha256').update(rpId).digest();
      if (!crypto.timingSafeEqual(auth.rpIdHash, expectedRpHash)) throw new Error('RP ID invalide');
      if (!(auth.flags & 0x01)) throw new Error('Presence utilisateur requise');
      if (!(auth.flags & 0x04)) throw new Error('Verification utilisateur requise');

      const credentialId = b64url(auth.credentialId);
      await fetch(`${SB_URL}/rest/v1/webauthn_credentials`, {
        method: 'POST',
        headers: { ...sbHeaders(SB_KEY), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          user_id: session.id,
          credential_id: credentialId,
          public_key_jwk: auth.publicKeyJwk,
          counter: auth.counter || 0,
          transports: cred.response.transports || [],
          device_name: req.body.device_name || 'Passkey livreur'
        })
      });
      return res.status(200).json({ success: true, credential_id: credentialId });
    }

    if (action === 'auth-options') {
      const challenge = randomChallenge();
      await saveChallenge(session.id, 'authentication', challenge, SB_URL, SB_KEY);
      const r = await fetch(`${SB_URL}/rest/v1/webauthn_credentials?user_id=eq.${session.id}&select=credential_id`, { headers: sbHeaders(SB_KEY) });
      const credentials = r.ok ? await r.json() : [];
      return res.status(200).json({
        publicKey: {
          challenge,
          timeout: 60000,
          rpId,
          userVerification: 'required',
          allowCredentials: credentials.map(c => ({ type: 'public-key', id: c.credential_id }))
        }
      });
    }

    if (action === 'auth-verify') {
      const assertion = req.body.assertion || {};
      const credentialId = assertion.id;
      const response = assertion.response || {};
      const clientData = JSON.parse(fromB64url(response.clientDataJSON).toString('utf8'));
      if (!(await consumeChallenge(session.id, 'authentication', clientData.challenge, SB_URL, SB_KEY))) throw new Error('Challenge expire');
      verifyClientData(response.clientDataJSON, 'webauthn.get', clientData.challenge, origin);

      const r = await fetch(`${SB_URL}/rest/v1/webauthn_credentials?user_id=eq.${session.id}&credential_id=eq.${credentialId}&select=id,public_key_jwk,counter`, { headers: sbHeaders(SB_KEY) });
      const rows = r.ok ? await r.json() : [];
      const stored = rows[0];
      if (!stored) throw new Error('Passkey inconnue');

      const authenticatorData = fromB64url(response.authenticatorData);
      const auth = parseAuthData(authenticatorData);
      const expectedRpHash = crypto.createHash('sha256').update(rpId).digest();
      if (!crypto.timingSafeEqual(auth.rpIdHash, expectedRpHash)) throw new Error('RP ID invalide');
      if (!(auth.flags & 0x01)) throw new Error('Presence utilisateur requise');
      if (!(auth.flags & 0x04)) throw new Error('Verification utilisateur requise');

      const clientHash = crypto.createHash('sha256').update(fromB64url(response.clientDataJSON)).digest();
      const signedData = Buffer.concat([authenticatorData, clientHash]);
      const publicKey = crypto.createPublicKey({ key: stored.public_key_jwk, format: 'jwk' });
      const ok = crypto.verify('SHA256', signedData, publicKey, fromB64url(response.signature));
      if (!ok) throw new Error('Signature biometrie invalide');

      await fetch(`${SB_URL}/rest/v1/webauthn_credentials?id=eq.${stored.id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(SB_KEY), Prefer: 'return=minimal' },
        body: JSON.stringify({ counter: Math.max(auth.counter || 0, stored.counter || 0), last_used_at: new Date().toISOString() })
      });
      return res.status(200).json({ success: true, verified_at: new Date().toISOString() });
    }

    return res.status(400).json({ error: 'Action WebAuthn inconnue' });
  } catch (err) {
    console.error('[webauthn]', err.message);
    return res.status(400).json({ error: err.message });
  }
};
