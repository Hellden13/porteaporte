(function () {
  const SUPABASE_URL = 'https://miqrircrfpzkmvvacgwt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcXJpcmNyZnB6a212dmFjZ3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODk3MzAsImV4cCI6MjA5MjE2NTczMH0.LJ8m2Vo7U0bmLbdoN1BqBuYlJZWUQxnZCwLwAZvVIaM';

  window.PORTEAPORTE_SUPABASE_URL = SUPABASE_URL;
  window.PORTEAPORTE_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('❌ erreur Supabase: CDN non charge');
    return;
  }

  if (!window.db) {
    window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  window.getSupabaseClient = function () {
    return window.db;
  };

  console.log('✅ connecté: Supabase client pret');
})();
