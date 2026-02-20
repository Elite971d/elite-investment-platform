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
 * Run auth guard: session check, profile + tier fetch, tool access validation (tier OR add-on).
 * Redirects to login if no session, to pricing if insufficient access.
 * @param {{ tool?: string }} options - { tool: 'offer' | 'brrrr' | 'rehab' | ... }
 * @returns {Promise<{ allowed: boolean, user?: object, profile?: object, tier?: string }>}
 */
export async function runAuthGuard(options = {}) {
  const { tool: requestedTool } = options;

  let session, sessionError;
  try {
    const result = await supabase.auth.getSession();
    session = result.data?.session;
    sessionError = result.error;
  } catch (e) {
    sessionError = e;
    session = null;
    console.warn('[dealcheck/auth-guard] getSession failed:', e?.message || e);
  }
  if (sessionError || !session) {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.replace(returnUrl ? `${LOGIN_URL}?redirect=${returnUrl}` : LOGIN_URL);
    return { allowed: false };
  }

  let profile = null;
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();
  profile = profileData;

  const { data: mp } = await supabase.from('member_profiles').select('role, tier').eq('id', session.user.id).maybeSingle();

  let role = profile?.role ?? mp?.role ?? session.user?.user_metadata?.role ?? session.user?.app_metadata?.role ?? 'user';
  if (mp?.role === 'admin' || profile?.role === 'admin') role = 'admin';

  const rawTier = profile?.tier ?? mp?.tier ?? session.user?.user_metadata?.tier ?? session.user?.app_metadata?.tier;
  const tier = role === 'admin' ? 'admin' : (rawTier === undefined || rawTier === null || rawTier === '' ? 'guest' : String(rawTier));

  // TEMP: Auth debug - remove after production validation
  if (typeof console !== 'undefined' && console.log) {
    console.log('[ESN-Auth] Auth User:', session.user?.id, session.user?.email);
    console.log('[ESN-Auth] Resolved Tier:', tier);
    console.log('[ESN-Auth] Role:', role);
    console.log('[ESN-Auth] Raw Tier:', rawTier);
  }

  if (!profile && !mp) {
    console.warn('[dealcheck/auth-guard] no profile in profiles or member_profiles');
  }

  if (requestedTool) {
    const requiredTier = TOOL_ACCESS[requestedTool];
    if (!requiredTier) {
      window.location.replace(PRICING_URL);
      return { allowed: false };
    }
    let hasAccess = canAccessTier(tier, requiredTier);
    if (!hasAccess) {
      try {
        const { hasToolAccess } = await import('../js/entitlements.js');
        const userObj = { id: session.user.id, tier };
        hasAccess = await hasToolAccess(userObj, requestedTool, supabase);
      } catch (_) {}
    }
    if (!hasAccess) {
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
