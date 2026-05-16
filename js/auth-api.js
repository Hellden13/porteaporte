/* ================================================================
   PorteÀPorte — auth-api.js
   Pont universel : charge Supabase si absent, expose getSupabaseClient()
   ================================================================ */
(function () {
  'use strict';

  const SUPABASE_URL     = 'https://miqrircrfpzkmvvacgwt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcXJpcmNyZnB6a212dmFjZ3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODk3MzAsImV4cCI6MjA5MjE2NTczMH0.LJ8m2Vo7U0bmLbdoN1BqBuYlJZWUQxnZCwLwAZvVIaM';

  function initClient() {
    if (window.db && window.getSupabaseClient) return;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('[auth-api] Supabase SDK non disponible');
      return;
    }
    window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    window.getSupabaseClient = function () { return window.db; };
    window.PORTEAPORTE_SUPABASE_URL     = SUPABASE_URL;
    window.PORTEAPORTE_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  }

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    // SDK déjà chargé (chargé avant ce script)
    initClient();
  } else {
    // Injecter le SDK puis initialiser
    const existing = document.querySelector('script[src*="supabase"]');
    if (existing) {
      existing.addEventListener('load', initClient);
    } else {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.crossOrigin = 'anonymous';
      s.onload  = initClient;
      s.onerror = function () { console.error('[auth-api] Échec chargement Supabase SDK'); };
      document.head.insertBefore(s, document.head.firstChild);
    }
  }
})();
