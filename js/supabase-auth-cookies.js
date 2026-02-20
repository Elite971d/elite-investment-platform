/**
 * Elite Investor Academy - Shared Supabase Auth with Cross-Subdomain Cookies
 *
 * ROOT CAUSE FIX: Login happens on invest.elitesolutionsnetwork.com but tools
 * are served from dealcheck.elitesolutionsnetwork.com. localStorage is per-origin
 * so the subdomain never sees the session. This module ensures ALL auth uses
 * cookies scoped to .elitesolutionsnetwork.com so session persists across
 * invest.* and dealcheck.* subdomains.
 *
 * Requirements:
 *   - Domain=.elitesolutionsnetwork.com (note leading dot for subdomains)
 *   - Path=/
 *   - Secure (when https)
 *   - SameSite=Lax (same-site subdomains; cookies sent on top-level nav)
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
 * Cookie-based storage adapter for Supabase auth.
 * Must be used on BOTH invest and dealcheck so they share the same session.
 * On localhost, omits domain so cookies work; on production uses .elitesolutionsnetwork.com.
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
 * Create Supabase client with cross-subdomain cookie storage.
 * Use in browser modules (async import of @supabase/supabase-js from CDN).
 *
 * @param {string} url - Supabase project URL
 * @param {string} anonKey - Supabase anon key
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function createSupabaseAuthClient(url, anonKey) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const authOpts = {
    storage: getCookieStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  };
  const client = createClient(url, anonKey, { auth: authOpts });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[supabase-auth] Client created:', { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true });
  }
  return client;
}
