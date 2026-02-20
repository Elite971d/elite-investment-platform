// ============================================
// Elite Investor Academy - Supabase Client
// ============================================
// Re-exports shared client from supabase-auth-cookies.js (single source of truth).

import { getSupabase as getSupabaseShared } from './supabase-auth-cookies.js';

// Get Supabase client instance (shared singleton)
export async function getSupabase() {
  return await getSupabaseShared();
}

// Alias for admin-utils compatibility
export const getSupabaseClient = getSupabase;

// Check if user is authenticated
export async function isAuthenticated() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

// Get current user
export async function getCurrentUser() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Get current session
export async function getCurrentSession() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Sign in with email and password
export async function signIn(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
}

// Sign up with email and password
export async function signUp(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });
  return { data, error };
}

// Sign out
export async function signOut() {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  return { error };
}

// Reset password (send email)
export async function resetPassword(email) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`
  });
  return { data, error };
}

// Update password
export async function updatePassword(newPassword) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });
  return { data, error };
}

// Get user profile
export async function getUserProfile(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

// Update user profile
export async function updateUserProfile(userId, updates) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

// Get user payments
export async function getUserPayments(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
}

// Require authentication (redirect if not logged in)
export async function requireAuth() {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}
