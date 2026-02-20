/**
 * Elite Investor Academy - Supabase client (auth)
 * Uses the single shared client from js/supabase-auth-cookies.js.
 * No duplicate createClient here.
 */

import { getSupabase } from '../js/supabase-auth-cookies.js';

/** Get the shared Supabase client (use in async context). */
export async function getSupabaseAuth() {
  return await getSupabase();
}
