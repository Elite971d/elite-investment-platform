/**
 * DealCheck Subdomain - Supabase Client (SSO)
 * Same Supabase project as invest.elitesolutionsnetwork.com.
 * Cookies scoped to .elitesolutionsnetwork.com so session persists across subdomains.
 * For SSO: invest must also persist auth to cookies with domain=.elitesolutionsnetwork.com
 * (e.g. same cookie storage adapter on invest auth/supabase.js).
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const COOKIE_DOMAIN = '.elitesolutionsnetwork.com';
const COOKIE_MAX_AGE_DAYS = 7;

const SUPABASE_URL =
  (typeof window !== 'undefined' && window.__SUPABASE_URL__) ||
  'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY =
  (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__) ||
  'YOUR_PUBLIC_ANON_KEY';

/**
 * Storage adapter that uses cookies with domain=.elitesolutionsnetwork.com
 * so auth session is shared across invest.* and dealcheck.* subdomains.
 */
const cookieStorage = {
  getItem(key) {
    const match = document.cookie.match(new RegExp('(^| )' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    const value = match ? decodeURIComponent(match[2]) : null;
    return value;
  },
  setItem(key, value) {
    const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
    let cookie = key + '=' + encodeURIComponent(value) + ';path=/;domain=' + COOKIE_DOMAIN + ';max-age=' + maxAge + ';SameSite=Lax';
    if (window.location.protocol === 'https:') cookie += ';Secure';
    document.cookie = cookie;
  },
  removeItem(key) {
    document.cookie = key + '=;path=/;domain=' + COOKIE_DOMAIN + ';max-age=0';
  }
};

/** Single Supabase client with auth persistence and cross-subdomain cookies */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
