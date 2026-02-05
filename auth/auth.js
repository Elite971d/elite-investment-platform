/**
 * Elite Investor Academy - Global auth guard and helpers
 * Production-ready: no auth logic in HTML; all behavior here.
 * Redirects validated; graceful error handling.
 */

import { supabase } from './supabase.js';

/** Allowed redirect targets (no open redirect) */
const ALLOWED_REDIRECTS = [
  '/dashboard.html',
  '/',
  '/index.html',
  '/success.html',
  '/protected.html'
];

/**
 * Resolve redirect URL: only allow known paths.
 * @param {string} [fallback] - Default redirect when none or invalid
 * @returns {string}
 */
function resolveRedirect(fallback = '/dashboard.html') {
  try {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (!redirect) return fallback;
    const path = new URL(redirect, window.location.origin).pathname;
    if (ALLOWED_REDIRECTS.includes(path)) {
      return path;
    }
  } catch (_) {}
  return fallback;
}

/**
 * Require authentication. Redirects to login if no session or on auth failure.
 * Use on protected pages (e.g. dashboard).
 * @returns {Promise<boolean>} true if authenticated, false after redirect
 */
export async function requireAuth() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[auth] getSession failed:', error.message || error);
      window.location.replace('/login.html');
      return false;
    }
    if (!session) {
      const loginUrl = '/login.html';
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(redirect ? `${loginUrl}?redirect=${redirect}` : loginUrl);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[auth] requireAuth failed:', err?.message || err);
    window.location.replace('/login.html');
    return false;
  }
}

/**
 * Redirect if already authenticated. Use on login/magic/reset request pages.
 * @param {string} [target] - Where to send logged-in users
 */
export async function redirectIfAuthenticated(target = '/dashboard.html') {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[auth] getSession failed (redirectIfAuthenticated):', error.message || error);
      return;
    }
    if (session) {
      window.location.replace(resolveRedirect(target));
    }
  } catch (err) {
    console.warn('[auth] redirectIfAuthenticated failed:', err?.message || err);
  }
}

/**
 * Get current user or null.
 * @returns {Promise<import('@supabase/supabase-js').User | null>}
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) console.warn('[auth] getUser failed:', error.message || error);
    return user ?? null;
  } catch (err) {
    console.warn('[auth] getCurrentUser failed:', err?.message || err);
    return null;
  }
}

/**
 * Log out and redirect to login.
 */
export async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[auth] signOut failed:', err?.message || err);
  }
  window.location.replace('/login.html');
}

/**
 * Email/password login. Used by login.html (no inline logic there).
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ data?: object, error?: import('@supabase/supabase-js').AuthError }>}
 */
export async function loginWithPassword(email, password) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
}

/**
 * Send magic link. Used by magic.html.
 * @param {string} email
 * @returns {Promise<{ data?: object, error?: import('@supabase/supabase-js').AuthError }>}
 */
export async function sendMagicLink(email) {
  const redirectTo = 'https://invest.elitesolutionsnetwork.com/dashboard.html';
  return supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo }
  });
}

/**
 * Request password reset email. Used by reset.html (request mode).
 * @param {string} email
 * @returns {Promise<{ data?: object, error?: import('@supabase/supabase-js').AuthError }>}
 */
export async function requestPasswordReset(email) {
  const redirectTo = 'https://invest.elitesolutionsnetwork.com/reset.html';
  return supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
}

/**
 * Update password (recovery flow). Used by reset.html when user lands from link.
 * @param {string} newPassword
 * @returns {Promise<{ data?: object, error?: import('@supabase/supabase-js').AuthError }>}
 */
export async function updateUserPassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

/**
 * Parse hash for recovery tokens and set session if present.
 * Call on reset.html when hash contains access_token/refresh_token.
 * @returns {Promise<boolean>} true if session was set from hash
 */
export async function setSessionFromHash() {
  const hash = window.location.hash?.replace(/^#/, '');
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return false;
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return !error;
}
