// ============================================
// Elite Investor Academy - Entitlements (Subscription Enforcement)
// ============================================
// Single place to read tier + permissions. Server-authoritative resolution with session cache.
// Subscription status controls enforcement; admin ALWAYS bypasses. Fail gracefully.

import { getSupabase } from './supabase-client.js';
import { getCurrentUser } from './supabase-client.js';
import { CONFIG } from './config.js';

const TOOL_ACCESS = {
  offer: 'starter',
  brrrr: 'starter',
  dealcheck: 'serious',
  rehab: 'serious',
  rehabtracker: 'serious',
  pwt: 'serious',
  wholesale: 'serious',
  commercial: 'elite'
};

/** Tool ID → product_key for add-on entitlements */
const TOOL_PRODUCT_KEYS = {
  offer: 'tool_offer',
  brrrr: 'tool_brrrr',
  dealcheck: 'tool_dealcheck',
  rehab: 'tool_rehabtracker',
  rehabtracker: 'tool_rehabtracker',
  pwt: 'tool_pwt',
  wholesale: 'tool_wholesale',
  commercial: 'tool_commercial',
  buybox: 'tool_buybox',
  profitsplit: 'tool_profitsplit'
};

const CACHE_KEY_PREFIX = 'eia_effective_tier_';
const ENTITLEMENTS_CACHE_PREFIX = 'eia_entitlements_';
const ENTITLEMENTS_CACHE_TTL_MS = 60 * 1000; // 1 min

function canAccessTier(userTier, requiredTier) {
  const userRank = CONFIG.tierRank[userTier] || 0;
  const requiredRank = CONFIG.tierRank[requiredTier] ?? 999;
  return userRank >= requiredRank;
}

/** Check if tier includes access to tool (tier-based only). */
function tierIncludesTool(tier, toolKey) {
  const requiredTier = TOOL_ACCESS[toolKey];
  if (!requiredTier) return false;
  return canAccessTier(tier, requiredTier);
}

/**
 * Check if user has active entitlement for product_key.
 * @param {string} userId - User UUID
 * @param {string} productKey - e.g. 'tool_offer', 'feature_whitelabel'
 * @param {object} supabase - Supabase client
 * @returns {Promise<boolean>}
 */
export async function userHasActiveEntitlement(userId, productKey, supabase) {
  if (!userId || !productKey) return false;
  const client = supabase || await getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('product_key', productKey)
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Check if user has tool access (tier OR add-on subscription).
 * @param {object} user - { id, tier } (tier from effective tier)
 * @param {string} toolKey - Tool ID: offer, brrrr, dealcheck, etc.
 * @param {object} [supabase] - Optional Supabase client (for calculator-gate when getSupabase unavailable)
 * @returns {Promise<boolean>}
 */
export async function hasToolAccess(user, toolKey, supabase) {
  if (!user) return false;
  const tier = user.tier ?? user.effectiveTier ?? 'guest';
  if (tier === 'admin') return true;
  if (tierIncludesTool(tier, toolKey)) return true;
  const productKey = TOOL_PRODUCT_KEYS[toolKey] || `tool_${toolKey}`;
  const client = supabase || await getSupabase();
  return userHasActiveEntitlement(user.id, productKey, client);
}

/**
 * Check if user has white-label access (entitlement OR elite tier).
 * @param {object} user - { id, tier }
 * @returns {Promise<boolean>}
 */
export async function hasWhiteLabelAccess(user) {
  if (!user) return false;
  const tier = user.tier ?? user.effectiveTier ?? 'guest';
  if (tier === 'admin' || tier === 'elite') return true;
  const supabase = await getSupabase();
  return userHasActiveEntitlement(user.id, 'feature_whitelabel', supabase);
}

/**
 * Server-authoritative effective tier resolution.
 * Order: admin → tier_override → subscription_status + tier from member_profiles.
 * Never downgrade silently; missing data = keep access (fail-safe).
 *
 * @param {object} user - Supabase auth user
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ effectiveTier: string, resolvedFrom: string }>}
 */
export async function resolveEffectiveTier(user, supabase) {
  if (!user) return { effectiveTier: 'guest', resolvedFrom: 'default' };

  const isAdmin = user?.user_metadata?.role === 'admin' || user?.app_metadata?.role === 'admin';
  if (isAdmin) return { effectiveTier: 'admin', resolvedFrom: 'admin' };

  const now = new Date().toISOString();

  // 2) Active tier override
  const { data: override } = await supabase
    .from('tier_overrides')
    .select('override_tier')
    .eq('user_id', user.id)
    .or('expires_at.is.null,expires_at.gt.' + now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (override?.override_tier) return { effectiveTier: String(override.override_tier), resolvedFrom: 'override' };

  // 3) member_profiles: tier + subscription_status + grace_until
  const { data: memberProfile, error: mpError } = await supabase
    .from('member_profiles')
    .select('tier, subscription_status, grace_until')
    .eq('id', user.id)
    .maybeSingle();

  // Fail-safe: if we can't read profile, keep lowest-risk (guest) but don't hard-lock
  if (mpError) {
    console.warn('[entitlements] member_profiles read failed:', mpError.message);
    return { effectiveTier: 'guest', resolvedFrom: 'error_failsafe' };
  }

  let tier = memberProfile?.tier;
  const subStatus = memberProfile?.subscription_status ?? null;
  const graceUntil = memberProfile?.grace_until ?? null;

  if (!tier) {
    const { data: legacyProfile } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .maybeSingle();
    tier = legacyProfile?.tier;
  }
  if (!tier) {
    const metaTier = user?.user_metadata?.tier ?? user?.app_metadata?.tier;
    tier = metaTier || 'guest';
  }
  tier = tier ? String(tier) : 'guest';

  // subscription_status enforcement
  if (subStatus === null || subStatus === 'trial' || subStatus === '') {
    return { effectiveTier: tier, resolvedFrom: 'subscription_trial_or_null' };
  }
  if (subStatus === 'active') {
    return { effectiveTier: tier, resolvedFrom: 'subscription_active' };
  }
  if (subStatus === 'past_due') {
    if (graceUntil && new Date(graceUntil) > new Date()) {
      return { effectiveTier: tier, resolvedFrom: 'grace_period' };
    }
    // Past grace: downgrade to guest (caller should log)
    return { effectiveTier: 'guest', resolvedFrom: 'past_due_grace_exceeded' };
  }
  if (subStatus === 'canceled') {
    return { effectiveTier: 'guest', resolvedFrom: 'subscription_canceled' };
  }

  // Unknown status: fail-safe keep access
  return { effectiveTier: tier, resolvedFrom: 'unknown_status_keep_access' };
}

/**
 * Get effective tier with session cache. Call revalidateEffectiveTier() on login so next get is fresh.
 * @param {object} user - Supabase auth user (optional; will fetch if not provided)
 * @param {{ revalidate?: boolean }} opts - revalidate: true to clear cache and refetch
 * @returns {Promise<{ effectiveTier: string, resolvedFrom: string }>}
 */
export async function getEffectiveTierCached(user, opts = {}) {
  const u = user || await getCurrentUser();
  if (!u) return { effectiveTier: 'guest', resolvedFrom: 'default' };

  const key = CACHE_KEY_PREFIX + u.id;
  if (!opts.revalidate && typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.effectiveTier === 'string') {
          return { effectiveTier: parsed.effectiveTier, resolvedFrom: parsed.resolvedFrom || 'cache' };
        }
      }
    } catch (_) {}
  }

  const supabase = await getSupabase();
  const result = await resolveEffectiveTier(u, supabase);
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(key, JSON.stringify({
        effectiveTier: result.effectiveTier,
        resolvedFrom: result.resolvedFrom,
        ts: Date.now()
      }));
    } catch (_) {}
  }
  return result;
}

/**
 * Clear cached effective tier for current user. Call after login so next getEffectiveTierCached fetches fresh.
 * @param {string} [userId] - If provided, clear cache for this user id; otherwise clear for current user only.
 */
export function revalidateEffectiveTier(userId) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (userId) {
      sessionStorage.removeItem(CACHE_KEY_PREFIX + userId);
    } else {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(CACHE_KEY_PREFIX)) keys.push(k);
      }
      keys.forEach(k => sessionStorage.removeItem(k));
    }
  } catch (_) {}
}

/**
 * Get user entitlements (tier + permissions). Uses cached effective tier when possible; revalidate on login.
 * @returns {Promise<{
 *   tier: string,
 *   role: string,
 *   permissions: { [toolId: string]: boolean },
 *   subscription_status?: string,
 *   billing_provider?: string,
 *   renewal_date?: string,
 *   resolvedFrom?: string
 * }>}
 */
export async function getUserEntitlements(opts = {}) {
  try {
    const supabase = await getSupabase();
    const user = await getCurrentUser();
    const role = user?.user_metadata?.role ?? user?.app_metadata?.role ?? 'user';

    if (!user) {
      const perms = Object.keys(TOOL_ACCESS).reduce((acc, id) => ({ ...acc, [id]: false }), {});
      const sources = Object.keys(TOOL_ACCESS).reduce((acc, id) => ({ ...acc, [id]: null }), {});
      return {
        tier: 'guest',
        role: 'user',
        permissions: perms,
        toolAccessSource: sources,
        subscription_status: undefined,
        billing_provider: undefined,
        renewal_date: undefined
      };
    }

    const { effectiveTier, resolvedFrom } = await getEffectiveTierCached(user, opts);
    const tier = effectiveTier === undefined || effectiveTier === null || effectiveTier === '' ? 'guest' : String(effectiveTier);

    const permissions = {};
    const toolAccessSource = {}; // 'tier' | 'addon' for each tool
    const userObj = { id: user.id, tier };
    for (const [toolId] of Object.entries(TOOL_ACCESS)) {
      const fromTier = canAccessTier(tier, TOOL_ACCESS[toolId]);
      const productKey = TOOL_PRODUCT_KEYS[toolId] || `tool_${toolId}`;
      const fromAddon = fromTier ? false : await userHasActiveEntitlement(user.id, productKey, supabase);
      permissions[toolId] = fromTier || fromAddon;
      toolAccessSource[toolId] = fromTier ? 'tier' : (fromAddon ? 'addon' : null);
    }

    // Optional: include subscription info from member_profiles (read-only, no gating here)
    let subscription_status;
    let renewal_date;
    try {
      const { data: mp } = await supabase.from('member_profiles').select('subscription_status, current_period_end, billing_provider').eq('id', user.id).maybeSingle();
      subscription_status = mp?.subscription_status;
      renewal_date = mp?.current_period_end ?? undefined;
    } catch (_) {}

    return {
      tier,
      role,
      permissions,
      toolAccessSource, // 'tier' | 'addon' per tool for badge display
      subscription_status,
      billing_provider: 'square',
      renewal_date,
      resolvedFrom
    };
  } catch (err) {
    console.warn('[entitlements] getUserEntitlements failed:', err?.message || err);
    const perms = Object.keys(TOOL_ACCESS).reduce((acc, id) => ({ ...acc, [id]: false }), {});
    const sources = Object.keys(TOOL_ACCESS).reduce((acc, id) => ({ ...acc, [id]: null }), {});
    return {
      tier: 'guest',
      role: 'user',
      permissions: perms,
      toolAccessSource: sources,
      subscription_status: undefined,
      billing_provider: undefined,
      renewal_date: undefined
    };
  }
}

export { canAccessTier };
