// ============================================
// Elite Investor Academy - Admin Utilities
// ============================================
// Utilities for admin role checking and tier management

import { getSupabaseClient } from './supabase-client.js';

/**
 * Check if current user is an admin
 * @returns {Promise<boolean>}
 */
export async function isAdmin() {
  try {
    const supabase = await getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return false;
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (error || !profile) return false;
    
    return profile.role === 'admin';
  } catch (err) {
    console.error('Error checking admin status:', err);
    return false;
  }
}

/**
 * Require admin role (redirect if not admin)
 * @param {string} redirectTo - URL to redirect to if not admin
 * @returns {Promise<boolean>}
 */
export async function requireAdmin(redirectTo = '/dashboard.html') {
  const admin = await isAdmin();
  if (!admin) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

/**
 * Get admin status for a specific user
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>}
 */
export async function isUserAdmin(userId) {
  try {
    const supabase = await getSupabaseClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (error || !profile) return false;
    
    return profile.role === 'admin';
  } catch (err) {
    console.error('Error checking user admin status:', err);
    return false;
  }
}

/**
 * Update user tier (admin only)
 * @param {string} email - User email
 * @param {string} tier - New tier
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateUserTier(email, tier) {
  try {
    const supabase = await getSupabaseClient();
    
    // Verify current user is admin
    const admin = await isAdmin();
    if (!admin) {
      return { success: false, error: 'Unauthorized: Admin access required' };
    }
    
    // Update profile
    const { data, error } = await supabase
      .from('profiles')
      .update({ tier })
      .eq('email', email)
      .select()
      .single();
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get user profile by email (admin only)
 * @param {string} email - User email
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getUserByEmail(email) {
  try {
    const supabase = await getSupabaseClient();
    
    // Verify current user is admin
    const admin = await isAdmin();
    if (!admin) {
      return { success: false, error: 'Unauthorized: Admin access required' };
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * List all users (admin only, paginated)
 * @param {number} limit - Number of users to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<{success: boolean, data?: array, error?: string}>}
 */
export async function listUsers(limit = 50, offset = 0) {
  try {
    const supabase = await getSupabaseClient();
    
    // Verify current user is admin
    const admin = await isAdmin();
    if (!admin) {
      return { success: false, error: 'Unauthorized: Admin access required' };
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
