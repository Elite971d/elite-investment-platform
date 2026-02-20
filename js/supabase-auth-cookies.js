/**
 * Elite Investor Academy - ONE shared Supabase auth client
 *
 * Session persistence and domain compatibility:
 * - On invest.* / dealcheck.* (elitesolutionsnetwork.com): cookie storage with
 *   domain=.elitesolutionsnetwork.com so session is shared across subdomains.
 * - On Vercel preview, localhost, static dashboard: localStorage so session
 *   persists without cross-origin cookie limits.
 *
 * All pages MUST use getSupabase() from this module (or re-exports). No duplicate
 * createClient() calls elsewhere.
 */

const COOKIE_DOMAIN = '.elitesolutionsnetwork.com';
const COOKIE_MAX_AGE_DAYS = 7;

function getCookieDomain() {
  if (typeof window === 'undefined' || !window.location?.hostname) return COOKIE_DOMAIN;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return '';
  if (h.includes('elitesolutionsnetwork.com')) return COOKIE_DOMAIN;
  return '';
}

/**
 * Cookie-based storage adapter for Supabase auth (cross-subdomain on ESN).
 */
export function getCookieStorage() {
  return {
    getItem(key) {
      if (typeof document === 'undefined') return null;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = document.cookie.match(new RegExp('(^| )' + escaped + '=([^;]*)'));
      return match ? decodeURIComponent(match[2]) : null;
    },
    setItem(key, value) {
      if (typeof document === 'undefined') return;
      const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
      const domain = getCookieDomain();
      let cookie = key + '=' + encodeURIComponent(value) + ';path=/;max-age=' + maxAge + ';SameSite=Lax';
      if (domain) cookie += ';domain=' + domain;
      if (typeof window !== 'undefined' && window.location?.protocol === 'https:') cookie += ';Secure';
      document.cookie = cookie;
    },
    removeItem(key) {
      if (typeof document === 'undefined') return;
      const domain = getCookieDomain();
      document.cookie = key + '=;path=/;max-age=0' + (domain ? ';domain=' + domain : '');
    }
  };
}

/**
 * Get storage for Supabase auth: cookie on ESN (invest/dealcheck) for subdomain
 * sharing, localStorage elsewhere (Vercel preview, localhost, static).
 */
function getAuthStorage() {
  if (typeof window === 'undefined') return undefined;
  const h = window.location?.hostname || '';
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app') || !h.includes('elitesolutionsnetwork.com')) {
    return window.localStorage;
  }
  return getCookieStorage();
}

let supabaseSingleton = null;

/**
 * Canonical Supabase URL and anon key (from window or env).
 */
function getSupabaseConfig() {
  const url = (typeof window !== 'undefined' && window.__SUPABASE_URL__) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    'https://YOUR_PROJECT_ID.supabase.co';
  const anonKey = (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
    'YOUR_PUBLIC_ANON_KEY';
  return { url, anonKey };
}

/**
 * Create Supabase client with unified auth options. Used internally by getSupabase().
 *
 * @param {string} url - Supabase project URL
 * @param {string} anonKey - Supabase anon key
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function createSupabaseAuthClient(url, anonKey) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const storage = getAuthStorage();
  const authOpts = {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: storage || undefined
  };
  const client = createClient(url, anonKey, { auth: authOpts });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[supabase-auth] Client created:', { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true });
  }
  return client;
}

/**
 * Get the single shared Supabase client. All pages must use this (or re-exports).
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getSupabase() {
  if (supabaseSingleton) return supabaseSingleton;
  const { url, anonKey } = getSupabaseConfig();
  supabaseSingleton = await createSupabaseAuthClient(url, anonKey);
  return supabaseSingleton;
}
