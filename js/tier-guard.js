// ============================================
// Elite Investor Academy - Tier Guard Utilities
// ============================================

import { CONFIG, prettyTier } from './config.js';
import { getCurrentUser, getUserProfile } from './supabase-client.js';

// Check if user can access a tier
export function canAccessTier(userTier, requiredTier) {
  const userRank = CONFIG.tierRank[userTier] || 0;
  const requiredRank = CONFIG.tierRank[requiredTier] || 999;
  return userRank >= requiredRank;
}

/**
 * Resolve effective tier for access control.
 * Role takes precedence over stored tier (logic override, no DB mutation).
 * - If role === 'admin' → effectiveTier = 'admin' (full access)
 * - Else if profile.tier exists → use profile.tier
 * - Else → 'guest'
 */
export function resolveEffectiveTier(profile) {
  if (!profile) return 'guest';
  if (profile.role === 'admin') return 'admin';
  const t = profile.tier;
  return (t === undefined || t === null || t === '') ? 'guest' : String(t);
}

// Get user's effective tier (used for access control; admin bypasses tier gating)
export async function getUserTier() {
  try {
    const user = await getCurrentUser();
    if (!user) return 'guest';

    const { data: profile, error } = await getUserProfile(user.id);
    if (error || !profile) return 'guest';

    return resolveEffectiveTier(profile);
  } catch (err) {
    console.error('Error getting user tier:', err);
    return 'guest';
  }
}

// Check if user can access a specific tool
export async function canAccessTool(minTier) {
  const userTier = await getUserTier();
  return canAccessTier(userTier, minTier);
}

// Require tier (redirect if insufficient)
export async function requireTier(requiredTier, redirectTo = '/index.html') {
  const userTier = await getUserTier();
  const hasAccess = canAccessTier(userTier, requiredTier);
  
  if (!hasAccess) {
    alert(`This feature requires ${prettyTier(requiredTier)} tier. Please upgrade to continue.`);
    window.location.href = redirectTo;
    return false;
  }
  
  return true;
}

// Get tier display info
export function getTierInfo(tier) {
  return {
    name: prettyTier(tier),
    rank: CONFIG.tierRank[tier] || 0,
    canAccess: (requiredTier) => canAccessTier(tier, requiredTier)
  };
}

// Get upgrade link for a tier
export function getUpgradeLink(targetTier) {
  return CONFIG.squareLinks[targetTier] || CONFIG.squareLinks.elite;
}
