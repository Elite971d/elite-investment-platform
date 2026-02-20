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
 * Resolve user tier from entitlements, profile, or default.
 * NEVER throws. Handles undefined/null safely. Does not assume entitlements exist.
 * Order: 1) active tier entitlement, 2) legacy profile.tier, 3) default 'guest'
 *
 * @param {object} user - Auth user (optional, for future use)
 * @param {object} profile - Profile with tier/role (profiles or member_profiles)
 * @param {Array} entitlements - Entitlements rows (type, product_key, status)
 * @returns {string} Resolved tier (never undefined)
 */
export function resolveUserTier(user, profile, entitlements) {
  try {
    // 1) Check active tier entitlement FIRST
    const arr = Array.isArray(entitlements) ? entitlements : [];
    const activeTier = arr.find(function (e) {
      return e && (e.type === 'tier' || (e.product_key && String(e.product_key).startsWith('tier_'))) && (e.status === 'active');
    });
    if (activeTier && activeTier.product_key) {
      const t = String(activeTier.product_key).replace(/^tier_/, '');
      if (t) return t;
    }

    // 2) FALLBACK to legacy profile tier
    if (profile && profile.tier != null && profile.tier !== '') {
      return String(profile.tier);
    }

    // 3) Default safe fallback
    return 'guest';
  } catch (_) {
    return 'guest';
  }
}

/**
 * Sync tool access check when profile + entitlements are pre-fetched.
 * Null-safe. Does not assume entitlements array exists.
 *
 * @param {object} user - Auth user
 * @param {object} profile - Profile with tier/role
 * @param {Array} entitlements - Entitlements rows
 * @param {string} toolKey - Tool ID (offer, brrrr, dealcheck, etc.)
 * @returns {boolean}
 */
export function hasToolAccessSync(user, profile, entitlements, toolKey) {
  try {
    if (!toolKey) return false;
    // Admin bypass: profile.role or user metadata
    const role = (profile && profile.role) || (user && (user.user_metadata?.role || user.app_metadata?.role));
    if (role === 'admin') return true;

    const tier = resolveUserTier(user, profile, entitlements);
    if (tier === 'admin') return true;
    if (tierIncludesTool(tier, toolKey)) return true;

    const productKey = TOOL_PRODUCT_KEYS[toolKey] || ('tool_' + toolKey);
    const arr = Array.isArray(entitlements) ? entitlements : [];
    return arr.some(function (e) {
      return e && (e.type === 'tool' || (e.product_key && String(e.product_key).startsWith('tool_'))) && e.product_key === productKey && e.status === 'active';
    });
  } catch (_) {
    return false;
  }
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
 * Null-safe. Supports: hasToolAccess(user, profile, entitlements, toolKey) or hasToolAccess(user, toolKey, supabase).
 *
 * @param {object} user - Auth user or { id, tier }
 * @param {object|string} profileOrToolKey - Profile (when 4 args) or toolKey (when 3 args)
 * @param {Array|object} entitlementsOrSupabase - Entitlements rows (when 4 args) or Supabase client (when 3 args)
 * @param {string} [toolKey] - Tool ID when 4 args
 * @returns {Promise<boolean>}
 */
export async function hasToolAccess(user, profileOrToolKey, entitlementsOrSupabase, toolKey) {
  try {
    if (!user) return false;

    // 4-arg form: hasToolAccess(user, profile, entitlements, toolKey) - sync path
    if (typeof profileOrToolKey === 'object' && Array.isArray(entitlementsOrSupabase) && typeof toolKey === 'string') {
      return hasToolAccessSync(user, profileOrToolKey, entitlementsOrSupabase, toolKey);
    }

    // 3-arg form: hasToolAccess(user, toolKey, supabase) - async path
    const key = typeof profileOrToolKey === 'string' ? profileOrToolKey : toolKey;
    if (!key) return false;

    const tier = (user.tier ?? user.effectiveTier ?? 'guest') || 'guest';
    if (tier === 'admin') return true;
    if (tierIncludesTool(tier, key)) return true;

    const productKey = TOOL_PRODUCT_KEYS[key] || ('tool_' + key);
    const client = entitlementsOrSupabase && typeof entitlementsOrSupabase.from === 'function' ? entitlementsOrSupabase : await getSupabase();
    return userHasActiveEntitlement(user.id, productKey, client);
  } catch (_) {
    return false;
  }
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

  // 1) Admin: JWT metadata OR profiles.role OR member_profiles.role (never lock out admins)
  const isAdminFromMeta = user?.user_metadata?.role === 'admin' || user?.app_metadata?.role === 'admin';
  if (isAdminFromMeta) return { effectiveTier: 'admin', resolvedFrom: 'admin' };

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

  // 3) member_profiles: tier + subscription_status + grace_until + role
  const { data: memberProfile, error: mpError } = await supabase
    .from('member_profiles')
    .select('tier, subscription_status, grace_until, role')
    .eq('id', user.id)
    .maybeSingle();

  // Fail-safe: if we can't read profile, keep lowest-risk (guest) but don't hard-lock
  if (mpError) {
    console.warn('[entitlements] member_profiles read failed:', mpError.message);
    return { effectiveTier: 'guest', resolvedFrom: 'error_failsafe' };
  }

  if (memberProfile && memberProfile.role === 'admin') return { effectiveTier: 'admin', resolvedFrom: 'admin_member_profiles' };

  let tier = memberProfile?.tier;
  const subStatus = memberProfile?.subscription_status ?? null;
  const graceUntil = memberProfile?.grace_until ?? null;

  if (!tier) {
    const { data: legacyProfile } = await supabase
      .from('profiles')
      .select('tier, role')
      .eq('id', user.id)
      .maybeSingle();
    if (legacyProfile && legacyProfile.role === 'admin') return { effectiveTier: 'admin', resolvedFrom: 'admin_profiles' };
    tier = legacyProfile?.tier;
  }
  // Admin may be in profiles.role even when tier came from member_profiles
  if (tier && tier !== 'admin') {
    try {
      const { data: pRole } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (pRole && pRole.role === 'admin') return { effectiveTier: 'admin', resolvedFrom: 'admin_profiles' };
    } catch (_) {}
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

    let role = user?.user_metadata?.role ?? user?.app_metadata?.role ?? 'user';
    try {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (p?.role === 'admin') role = 'admin';
    } catch (_) {}
    try {
      const { data: mp } = await supabase.from('member_profiles').select('role').eq('id', user.id).maybeSingle();
      if (mp?.role === 'admin') role = 'admin';
    } catch (_) {}

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
