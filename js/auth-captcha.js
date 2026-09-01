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

  function mount(containerId, action) {
    const state = { enabled: false, token: '', widgetId: null, ready: null };
    const container = document.getElementById(containerId);

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
        callback: (token) => { state.token = token; },
        'expired-callback': () => { state.token = ''; },
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
        if (state.enabled && !state.token) {
          throw new Error('Confirme que tu n’es pas un robot avant de continuer.');
        }
        return state.token || null;
      },
      reset() {
        state.token = '';
        if (state.widgetId !== null && window.turnstile) {
          window.turnstile.reset(state.widgetId);
        }
      }
    };
  }

  window.PAPAuthCaptcha = { mount };
})();
