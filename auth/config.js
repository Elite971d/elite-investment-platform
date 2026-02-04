/**
 * Supabase config — single place for URL and anon key.
 * Load this script before any page that uses Supabase (login, dashboard, admin, etc.).
 *
 * Replace the values below with your project's from:
 * https://app.supabase.com/project/YOUR_PROJECT/settings/api
 *
 * If you use a build (e.g. Vite), you can set window.__SUPABASE_URL__ and
 * window.__SUPABASE_ANON_KEY__ in index.html from env instead of editing this file.
 */
(function () {
  if (typeof window === 'undefined') return;
  window.__SUPABASE_URL__ = window.__SUPABASE_URL__ || 'https://rnrqntxewqcnczcooxkc.supabase.co';
  // MUST be the real anon key (long JWT from Supabase Dashboard → Settings → API). Not "process.env.xxx" or placeholder.
  var anonKey = window.__SUPABASE_ANON_KEY__ || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJucnFudHhld3FjbmN6Y29veGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MDI1MjUsImV4cCI6MjA4NTQ3ODUyNX0.stdUK5v1N2erk7IOphpfF8m0t5uPE1riyrgWbMPbtuk';
  window.__SUPABASE_ANON_KEY__ = anonKey;
  if (anonKey === 'YOUR_PUBLIC_ANON_KEY' || anonKey.indexOf('process.env') !== -1) {
    console.warn('[auth/config.js] Replace YOUR_PUBLIC_ANON_KEY with your real Supabase anon key (Dashboard → Settings → API) or you will get "Invalid API key" on login.');
  }
})();
