(function () {
  const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  let configPromise;
  let scriptPromise;

  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/platform?endpoint=turnstile-config', {
        headers: { Accept: 'application/json' }
      })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null);
    }
    return configPromise;
  }

  function loadScript() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!scriptPromise) {
      scriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
        const script = existing || document.createElement('script');
        script.addEventListener('load', () => resolve(window.turnstile), { once: true });
        script.addEventListener('error', () => reject(new Error('Protection anti-robot indisponible. Réessaie dans un instant.')), { once: true });
        if (!existing) {
          script.src = SCRIPT_URL;
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
      });
    }
    return scriptPromise;
  }

  const TOKEN_WAIT_MS = 12000;
  const TOKEN_POLL_MS = 200;

  function mount(containerId, action) {
    // used : un jeton Turnstile ne sert qu'une fois. Une fois remis à Supabase,
    // on n'en redonne plus avant que le widget en produise un nouveau.
    const state = { enabled: false, token: '', used: false, widgetId: null, ready: null };
    const container = document.getElementById(containerId);

    function widgetExpired() {
      const ts = window.turnstile;
      if (state.widgetId === null || !ts || typeof ts.isExpired !== 'function') return false;
      try { return ts.isExpired(state.widgetId) === true; } catch (_) { return false; }
    }

    // Jeton utilisable : celui du callback, sinon celui que le widget détient
    // réellement (getResponse) ; jamais un jeton expiré ni déjà remis.
    function freshToken() {
      if (state.used || widgetExpired()) return '';
      if (!state.token && state.widgetId !== null && window.turnstile && typeof window.turnstile.getResponse === 'function') {
        try { state.token = window.turnstile.getResponse(state.widgetId) || ''; } catch (_) { state.token = ''; }
      }
      return state.token;
    }

    async function waitForToken(ms) {
      const until = Date.now() + ms;
      let token = freshToken();
      while (!token && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
        token = freshToken();
      }
      return token;
    }

    function refreshWidget() {
      state.token = '';
      state.used = false;
      if (state.widgetId !== null && window.turnstile) {
        try { window.turnstile.reset(state.widgetId); } catch (_) { /* widget retiré */ }
      }
    }

    state.ready = (async () => {
      if (!container) return;
      const config = await loadConfig();
      if (!config?.enabled || !config.site_key) {
        container.hidden = true;
        return;
      }
      state.enabled = true;
      container.hidden = false;
      const turnstile = await loadScript();
      if (!turnstile) throw new Error('Protection anti-robot indisponible.');
      state.widgetId = turnstile.render(container, {
        sitekey: config.site_key,
        theme: 'dark',
        action,
        'refresh-expired': 'auto',
        callback: (token) => { state.token = token || ''; state.used = false; },
        'expired-callback': () => { state.token = ''; },
        // On ne retourne rien : Turnstile garde son nouvel essai automatique.
        'error-callback': () => { state.token = ''; }
      });
    })().catch((error) => {
      state.enabled = true;
      if (container) {
        container.hidden = false;
        container.textContent = error.message;
      }
    });

    return {
      async getToken() {
        await state.ready;
        if (!state.enabled) return null;
        // Jeton déjà remis ou expiré : on relance le widget, puis on attend le
        // nouveau jeton (au lieu de refuser tout de suite).
        if (state.used || widgetExpired()) refreshWidget();
        const token = await waitForToken(TOKEN_WAIT_MS);
        if (!token) {
          throw new Error('Confirme que tu n’es pas un robot avant de continuer.');
        }
        state.used = true;
        return token;
      },
      reset() {
        refreshWidget();
      }
    };
  }

  window.PAPAuthCaptcha = { mount };
})();
