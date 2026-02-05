// ============================================
// DealCheck Subdomain - Tier Guard Utilities
// ============================================
// Tier access control for calculators. Redirect to /pricing if unauthorized.

import { supabase } from './supabase.js';

const PRICING_URL = 'https://invest.elitesolutionsnetwork.com/index.html';

// Tier hierarchy configuration (higher number = more access)
// admin = logic override, bypasses tier gating; not stored in DB
const TIER_RANK = {
  guest: 0,
  starter: 1,
  serious: 2,
  elite: 3,
  academy_starter: 1,
  academy_pro: 2,
  academy_premium: 3,
  admin: 999
};

const TIER_NAMES = {
  guest: 'Guest',
  starter: 'Starter Investor',
  serious: 'Serious Investor',
  elite: 'Elite / Pro',
  academy_starter: 'Academy Starter',
  academy_pro: 'Academy Pro',
  academy_premium: 'Academy Premium',
  admin: 'Admin'
};

export function canAccessTier(userTier, requiredTier) {
  const userRank = TIER_RANK[userTier] || 0;
  const requiredRank = TIER_RANK[requiredTier] || 999;
  return userRank >= requiredRank;
}

async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

/**
 * Resolve effective tier for access control.
 * Role takes precedence over stored tier (logic override, no DB mutation).
 */
function resolveEffectiveTier(profile) {
  if (!profile) return 'guest';
  if (profile.role === 'admin') return 'admin';
  return profile.tier || 'guest';
}

export async function getUserTier() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
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
export async function canAccessTool(requiredTier) {
  const userTier = await getUserTier();
  return canAccessTier(userTier, requiredTier);
}

// Require tier (redirect to /pricing if insufficient)
export async function requireTier(requiredTier, redirectTo = PRICING_URL) {
  const userTier = await getUserTier();
  const hasAccess = canAccessTier(userTier, requiredTier);
  if (!hasAccess) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

// Format tier name for display
export function prettyTier(tier) {
  return TIER_NAMES[tier] || tier;
}

// Get tier info object
export function getTierInfo(tier) {
  return {
    name: prettyTier(tier),
    rank: TIER_RANK[tier] || 0,
    canAccess: (requiredTier) => canAccessTier(tier, requiredTier)
  };
}

// Get upgrade link for a tier
export function getUpgradeLink(targetTier) {
  const links = {
    starter: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/5L6KRBG7XEBJWAM3QQTKTQRM',
    serious: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/7YCAILWUHUOSLA4AB4FDON63',
    elite: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/YY2K4SD2IEAQT7WT633D4ARV',
    academy_starter: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/TKG3QM5DHNVMYVO7D54YUS7G',
    academy_pro: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/EZ5TGODGBBAHDZP6WY7JCFW7',
    academy_premium: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/OYTJWURAXGUWHPHPPMNOYYKI'
  };
  return links[targetTier] || links.elite;
}

// Export tier rank for external use
export { TIER_RANK, TIER_NAMES };
