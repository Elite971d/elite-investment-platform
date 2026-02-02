/**
 * Elite Investor Academy - Supabase client (auth)
 * Production-ready: PUBLIC anon key only, no secrets in frontend.
 * Set window.__SUPABASE_URL__ and window.__SUPABASE_ANON_KEY__ before loading
 * to override placeholders (e.g. via build env); otherwise replace below.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL =
  (typeof window !== 'undefined' && window.__SUPABASE_URL__) ||
  'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY =
  (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__) ||
  'YOUR_PUBLIC_ANON_KEY';

/** Single Supabase client instance for reuse across auth pages */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
