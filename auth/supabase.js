/**
 * Elite Investor Academy - Supabase client (auth)
 * Production-ready: PUBLIC anon key only, no secrets in frontend.
 * CRITICAL: Uses cookie storage (domain=.elitesolutionsnetwork.com) so session
 * is shared across invest.* and dealcheck.* subdomains. Without this, tools on
 * dealcheck cannot see the session when user logs in on invest.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getCookieStorage } from '../js/supabase-auth-cookies.js';

const SUPABASE_URL =
  (typeof window !== 'undefined' && window.__SUPABASE_URL__) ||
  'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY =
  (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__) ||
  'YOUR_PUBLIC_ANON_KEY';

/** Single Supabase client with cross-subdomain cookie storage */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getCookieStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
