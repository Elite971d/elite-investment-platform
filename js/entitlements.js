// ============================================
// Elite Investor Academy - Entitlements Abstraction (Subscription Readiness)
// ============================================
// Single place to read tier + permissions. No gating changes. Optional placeholders for future subscriptions.

import { getSupabase } from './supabase-client.js';
import { getCurrentUser } from './supabase-client.js';
import { getUserProfile } from './supabase-client.js';
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

function canAccessTier(userTier, requiredTier) {
  const userRank = CONFIG.tierRank[userTier] || 0;
  const requiredRank = CONFIG.tierRank[requiredTier] ?? 999;
  return userRank >= requiredRank;
}

/**
 * Resolve effective tier from user and DB (same logic as dashboard). Role override, then override, member_profiles, profiles, metadata, default guest.
 * @param {object} user - Supabase auth user
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ effectiveTier: string, resolvedFrom: string }>}
 */
async function resolveEffectiveTier(user, supabase) {
  if (!user) return { effectiveTier: 'guest', resolvedFrom: 'default' };
  const isAdmin = user?.user_metadata?.role === 'admin' || user?.app_metadata?.role === 'admin';
  if (isAdmin) return { effectiveTier: 'admin', resolvedFrom: 'admin' };

  const now = new Date().toISOString();
  const { data: override } = await supabase
    .from('tier_overrides')
    .select('override_tier')
    .eq('user_id', user.id)
    .or('expires_at.is.null,expires_at.gt.' + now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (override?.override_tier) return { effectiveTier: String(override.override_tier), resolvedFrom: 'override' };

  const { data: memberProfile } = await supabase
    .from('member_profiles')
    .select('tier')
    .eq('id', user.id)
    .maybeSingle();
  if (memberProfile?.tier) return { effectiveTier: String(memberProfile.tier), resolvedFrom: 'profile' };

  const { data: legacyProfile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .maybeSingle();
  if (legacyProfile?.tier) return { effectiveTier: String(legacyProfile.tier), resolvedFrom: 'profile' };

  const metaTier = user?.user_metadata?.tier ?? user?.app_metadata?.tier;
  if (metaTier) return { effectiveTier: String(metaTier), resolvedFrom: 'metadata' };

  return { effectiveTier: 'guest', resolvedFrom: 'default' };
}

/**
 * Get user entitlements (tier + permissions). Centralized read — no behavior change.
 * Optional placeholders for future subscriptions: subscription_status, billing_provider, renewal_date.
 * These are never used for gating or access control.
 *
 * @returns {Promise<{
 *   tier: string,
 *   role: string,
 *   permissions: { [toolId: string]: boolean },
 *   subscription_status?: string,
 *   billing_provider?: string,
 *   renewal_date?: string
 * }>}
 */
export async function getUserEntitlements() {
  try {
    const supabase = await getSupabase();
    const user = await getCurrentUser();
    const role = user?.user_metadata?.role ?? user?.app_metadata?.role ?? 'user';

    if (!user) {
    return {
      tier: 'guest',
      role: 'user',
      permissions: Object.keys(TOOL_ACCESS).reduce((acc, id) => ({ ...acc, [id]: false }), {}),
      subscription_status: undefined,
      billing_provider: undefined,
      renewal_date: undefined
    };
    }

    const { effectiveTier } = await resolveEffectiveTier(user, supabase);
    const tier = effectiveTier === undefined || effectiveTier === null || effectiveTier === '' ? 'guest' : String(effectiveTier);

    const permissions = {};
    for (const [toolId, requiredTier] of Object.entries(TOOL_ACCESS)) {
      permissions[toolId] = canAccessTier(tier, requiredTier);
    }

    return {
      tier,
      role,
      permissions,
      // Optional placeholders for future subscriptions. Never block access or affect current behavior.
      subscription_status: undefined,
      billing_provider: undefined,
      renewal_date: undefined
    };
  } catch (err) {
    console.warn('[entitlements] getUserEntitlements failed:', err?.message || err);
    return {
      tier: 'guest',
      role: 'user',
      permissions: Object.keys(TOOL_ACCESS).reduce((acc, id) => ({ ...acc, [id]: false }), {}),
      subscription_status: undefined,
      billing_provider: undefined,
      renewal_date: undefined
    };
  }
}
