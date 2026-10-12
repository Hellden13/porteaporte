/**
 * PorteàPorte — paramètres UTM et intention d'inscription (lot 1).
 *
 * UTM : lus dans l'URL, gardés seulement s'ils sont valides (1 à 100 caractères,
 * [A-Za-z0-9_.-]), conservés en sessionStorage pour la durée de l'onglet.
 * Aucun stockage en base : ils servent uniquement de propriétés d'événements Plausible.
 *
 * Intention : seule la valeur "conducteur" est reconnue (liste blanche). Elle est
 * gardée 7 jours en localStorage pour présélectionner visuellement le choix dans
 * role-choice.html. Elle n'écrit jamais est_conducteur.
 *
 * Toute erreur de stockage est ignorée silencieusement (navigation privée, etc.).
 */
(function () {
  if (window.papUtm) return;

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var UTM_STORAGE_KEY = 'pap_utm';
  var VALID_VALUE = /^[A-Za-z0-9_.-]{1,100}$/;
  var INTENT_KEY = 'pap_intent';
  var INTENT_VALUES = ['conducteur'];
  var INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function readStoredUtm() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) || '{}');
      var clean = {};
      UTM_KEYS.forEach(function (key) {
        if (typeof parsed[key] === 'string' && VALID_VALUE.test(parsed[key])) clean[key] = parsed[key];
      });
      return clean;
    } catch (_) {
      return {};
    }
  }

  function captureUtm() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (_) { return; }
    var found = {};
    var any = false;
    UTM_KEYS.forEach(function (key) {
      var value = params.get(key);
      if (value !== null && VALID_VALUE.test(value)) { found[key] = value; any = true; }
    });
    if (!any) return;
    try {
      var merged = readStoredUtm();
      Object.keys(found).forEach(function (key) { merged[key] = found[key]; });
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}
  }

  function rememberIntent(value) {
    if (INTENT_VALUES.indexOf(value) === -1) return false;
    try {
      localStorage.setItem(INTENT_KEY, JSON.stringify({ v: value, exp: Date.now() + INTENT_TTL_MS }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readIntent() {
    try {
      var parsed = JSON.parse(localStorage.getItem(INTENT_KEY) || 'null');
      if (parsed && INTENT_VALUES.indexOf(parsed.v) !== -1 && typeof parsed.exp === 'number' && parsed.exp > Date.now()) {
        return parsed.v;
      }
      if (parsed) localStorage.removeItem(INTENT_KEY);
    } catch (_) {}
    return '';
  }

  function clearIntent() {
    try { localStorage.removeItem(INTENT_KEY); } catch (_) {}
  }

  // Événement Plausible seulement si analytics.js a été chargé (donc après consentement).
  function track(eventName, props) {
    try {
      if (typeof window.papTrack === 'function') window.papTrack(eventName, props || {});
    } catch (_) {}
  }

  captureUtm();

  window.papUtm = {
    get: readStoredUtm,
    rememberIntent: rememberIntent,
    readIntent: readIntent,
    clearIntent: clearIntent,
    track: track
  };
})();
