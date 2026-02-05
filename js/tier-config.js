// ============================================
// Elite Investor Academy - Tier Configuration
// ============================================
// Central configuration for tier permissions and hierarchy
// Future-ready for webhooks, subscriptions, lifetime licenses, team accounts
//
// CONFIRMED: Investor Buy Box is NOT part of any tier.
// Only tools in the public tier matrix are exposed in pricing, dashboard, and logic.

/**
 * Tier hierarchy configuration
 * Higher rank = more access
 */
export const TIER_HIERARCHY = {
  guest: {
    rank: 0,
    name: 'Guest',
    price: 0,
    features: []
  },
  starter: {
    rank: 1,
    name: 'Starter Investor',
    price: 29,
    period: 'month',
    features: [
      'Property Offer Calculator',
      'BRRRR Analyzer'
    ],
    squareLinkId: '5L6KRBG7XEBJWAM3QQTKTQRM'
  },
  serious: {
    rank: 2,
    name: 'Serious Investor',
    price: 79,
    period: 'month',
    features: [
      'Everything in Starter',
      'Rehab Tracker',
      'Property Walkthrough Tool (PWT)',
      'Save & export deals'
    ],
    squareLinkId: '7YCAILWUHUOSLA4AB4FDON63'
  },
  elite: {
    rank: 3,
    name: 'Elite / Pro',
    price: 149,
    period: 'month',
    features: [
      'Everything in Serious',
      'Investor Academy access',
      'Deal templates',
      'Priority updates'
    ],
    squareLinkId: 'YY2K4SD2IEAQT7WT633D4ARV'
  },
  academy_starter: {
    rank: 1,
    name: 'Academy Starter',
    price: 500,
    period: 'one-time',
    features: [
      'Core Academy modules',
      'Templates'
    ],
    squareLinkId: 'TKG3QM5DHNVMYVO7D54YUS7G'
  },
  academy_pro: {
    rank: 2,
    name: 'Academy Pro',
    price: 999,
    period: 'one-time',
    features: [
      'All Starter features',
      'Advanced analysis',
      'Rehab tools'
    ],
    squareLinkId: 'EZ5TGODGBBAHDZP6WY7JCFW7'
  },
  academy_premium: {
    rank: 3,
    name: 'Academy Premium',
    price: 1499,
    period: 'one-time',
    features: [
      'All Pro features',
      'Live coaching',
      'Deal reviews'
    ],
    squareLinkId: 'OYTJWURAXGUWHPHPPMNOYYKI'
  },
  admin: {
    rank: 999,
    name: 'Admin',
    price: 0,
    features: ['Full access (role override)']
  }
};

/**
 * Tool access requirements
 * Maps tool IDs to minimum required tier
 */
// Only MEMBER tools (tier matrix). Internal tools (e.g. Investor Buy Box) are in js/tools-config.js
// and must NEVER be added here — they are not gated by tier and never appear in dashboard/pricing.
// guest: none | starter: offer, brrrr | serious: + dealcheck, rehab, pwt, wholesale | elite: + commercial | admin: all
export const TOOL_ACCESS = {
  'offer': 'starter',
  'brrrr': 'starter',
  'dealcheck': 'serious',
  'rehab': 'serious',
  'rehabtracker': 'serious',
  'pwt': 'serious',
  'wholesale': 'serious',
  'commercial': 'elite'
};

/**
 * Check if a tier can access a required tier
 * @param {string} userTier - User's current tier
 * @param {string} requiredTier - Required tier for access
 * @returns {boolean}
 */
export function canAccessTier(userTier, requiredTier) {
  const userRank = TIER_HIERARCHY[userTier]?.rank || 0;
  const requiredRank = TIER_HIERARCHY[requiredTier]?.rank || 999;
  return userRank >= requiredRank;
}

/**
 * Check if user can access a tool
 * @param {string} userTier - User's current tier
 * @param {string} toolId - Tool ID to check
 * @returns {boolean}
 */
export function canAccessTool(userTier, toolId) {
  const requiredTier = TOOL_ACCESS[toolId];
  if (!requiredTier) return false;
  return canAccessTier(userTier, requiredTier);
}

/**
 * Get tier display name
 * @param {string} tier - Tier ID
 * @returns {string}
 */
export function getTierName(tier) {
  return TIER_HIERARCHY[tier]?.name || tier;
}

/**
 * Get tier info object
 * @param {string} tier - Tier ID
 * @returns {object}
 */
export function getTierInfo(tier) {
  return TIER_HIERARCHY[tier] || null;
}

/**
 * Get all available tiers
 * @returns {array}
 */
export function getAllTiers() {
  return Object.keys(TIER_HIERARCHY);
}

/**
 * Get upgrade path for a tier
 * @param {string} currentTier - Current tier
 * @returns {array} - Array of tier IDs that are upgrades
 */
export function getUpgradePath(currentTier) {
  const currentRank = TIER_HIERARCHY[currentTier]?.rank || 0;
  return Object.entries(TIER_HIERARCHY)
    .filter(([tier, info]) => info.rank > currentRank)
    .map(([tier]) => tier);
}

/**
 * Get Square payment link for a tier
 * @param {string} tier - Tier ID
 * @returns {string|null}
 */
export function getTierPaymentLink(tier) {
  const tierInfo = TIER_HIERARCHY[tier];
  if (!tierInfo?.squareLinkId) return null;
  
  return `https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/${tierInfo.squareLinkId}`;
}

/**
 * Check if tier is subscription-based
 * @param {string} tier - Tier ID
 * @returns {boolean}
 */
export function isSubscriptionTier(tier) {
  return TIER_HIERARCHY[tier]?.period === 'month';
}

/**
 * Check if tier is one-time payment
 * @param {string} tier - Tier ID
 * @returns {boolean}
 */
export function isOneTimeTier(tier) {
  return TIER_HIERARCHY[tier]?.period === 'one-time';
}

// Future: Lifetime license support
export const LIFETIME_TIERS = []; // Can be populated for lifetime access grants

// Future: Team account support
export const TEAM_TIERS = []; // Can be populated for team/organization accounts
