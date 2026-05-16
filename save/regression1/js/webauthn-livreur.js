(function () {
  function b64urlToBuffer(value) {
    value = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (value.length % 4) value += '=';
    const bin = atob(value);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferToB64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function api(action, payload) {
    const session = await window.PorteAuth.requireSession('/login.html');
    if (!session) return null;
    const r = await fetch('/api/webauthn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify(Object.assign({ action }, payload || {}))
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur WebAuthn');
    return data;
  }

  function prepareCreate(options) {
    options.challenge = b64urlToBuffer(options.challenge);
    options.user.id = b64urlToBuffer(options.user.id);
    options.excludeCredentials = (options.excludeCredentials || []).map((c) => Object.assign({}, c, { id: b64urlToBuffer(c.id) }));
    return options;
  }

  function prepareGet(options) {
    options.challenge = b64urlToBuffer(options.challenge);
    options.allowCredentials = (options.allowCredentials || []).map((c) => Object.assign({}, c, { id: b64urlToBuffer(c.id) }));
    return options;
  }

  function serializeCredential(credential) {
    const response = credential.response;
    const out = {
      id: credential.id,
      rawId: bufferToB64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToB64url(response.clientDataJSON)
      }
    };
    if (response.attestationObject) out.response.attestationObject = bufferToB64url(response.attestationObject);
    if (response.authenticatorData) out.response.authenticatorData = bufferToB64url(response.authenticatorData);
    if (response.signature) out.response.signature = bufferToB64url(response.signature);
    if (response.userHandle) out.response.userHandle = bufferToB64url(response.userHandle);
    if (response.getTransports) out.response.transports = response.getTransports();
    return out;
  }

  async function registerLivreurPasskey() {
    if (!window.PublicKeyCredential) throw new Error('WebAuthn non supporte sur ce navigateur');
    const options = await api('register-options');
    const credential = await navigator.credentials.create({ publicKey: prepareCreate(options.publicKey) });
    const result = await api('register-verify', { credential: serializeCredential(credential), device_name: navigator.userAgent.slice(0, 80) });
    // console.log('âœ… connecte: passkey livreur enregistree');
    return result;
  }

  async function verifyLivreurPasskey() {
    if (!window.PublicKeyCredential) throw new Error('WebAuthn non supporte sur ce navigateur');
    const options = await api('auth-options');
    const assertion = await navigator.credentials.get({ publicKey: prepareGet(options.publicKey) });
    const result = await api('auth-verify', { assertion: serializeCredential(assertion) });
    // console.log('âœ… connecte: livreur verifie par biometrie');
    return result;
  }

  window.PorteWebAuthn = { registerLivreurPasskey, verifyLivreurPasskey };
})();

