/**
 * DealCheck Subdomain - Auth Guard
 * 1. Check supabase.auth.getSession()
 * 2. If no session → redirect to invest login page
 * 3. Fetch user profile + tier
 * 4. Validate tier vs requested tool
 * 5. Redirect to pricing page if insufficient access
 * All calculator access MUST go through this guard; no direct calculator URLs.
 */

import { supabase } from './supabase.js';

const INVEST_ORIGIN = 'https://invest.elitesolutionsnetwork.com';
const LOGIN_URL = INVEST_ORIGIN + '/login.html';
const PRICING_URL = INVEST_ORIGIN + '/index.html';

/** Tool ID → minimum required tier (tier matrix only; no internal tools). starter: offer, brrrr | serious: + dealcheck, rehab, pwt, wholesale | elite: + commercial */
export const TOOL_ACCESS = {
  offer: 'starter',
  brrrr: 'starter',
  dealcheck: 'serious',
  rehab: 'serious',
  rehabtracker: 'serious',
  pwt: 'serious',
  wholesale: 'serious',
  commercial: 'elite'
};

/** Tier rank for comparison (higher = more access). admin = role override, full access. */
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
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[requiredTier] ?? 999;
  return userRank >= requiredRank;
}

export function canAccessTool(userTier, toolId) {
  const requiredTier = TOOL_ACCESS[toolId];
  if (!requiredTier) return false;
  return canAccessTier(userTier, requiredTier);
}

export function prettyTier(tier) {
  return TIER_NAMES[tier] || tier;
}

/**
 * Run auth guard: session check, profile + tier fetch, tool tier validation.
 * Redirects to login if no session, to pricing if insufficient tier.
 * @param {{ tool?: string }} options - { tool: 'offer' | 'brrrr' | 'rehab' | ... }
 * @returns {Promise<{ allowed: boolean, user?: object, profile?: object, tier?: string }>}
 */
export async function runAuthGuard(options = {}) {
  const { tool: requestedTool } = options;

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.replace(returnUrl ? `${LOGIN_URL}?redirect=${returnUrl}` : LOGIN_URL);
    return { allowed: false };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.replace(LOGIN_URL + '?redirect=' + returnUrl);
    return { allowed: false };
  }

  // Role precedence: admin bypasses tier gating (logic override, no DB mutation)
  const tier = profile.role === 'admin' ? 'admin' : (profile.tier || 'guest');

  if (requestedTool) {
    const requiredTier = TOOL_ACCESS[requestedTool];
    if (!requiredTier) {
      window.location.replace(PRICING_URL);
      return { allowed: false };
    }
    if (!canAccessTier(tier, requiredTier)) {
      window.location.replace(PRICING_URL);
      return { allowed: false };
    }
  }

  return {
    allowed: true,
    user: session.user,
    profile,
    tier
  };
}
