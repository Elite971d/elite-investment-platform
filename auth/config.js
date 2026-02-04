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
  // Paste your anon/public key here (long JWT from Dashboard → Settings → API). Do not use env var names.
  window.__SUPABASE_ANON_KEY__ = window.__SUPABASE_ANON_KEY__ || ' process.env.SUPABASE_KEY';
})();
