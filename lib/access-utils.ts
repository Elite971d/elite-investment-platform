/**
 * Access utilities for middleware - Edge-safe, no browser/Node deps.
 * Used for tool path mapping and tier resolution.
 * DO NOT modify tierIncludesTool / TOOL_ACCESS - existing tier logic preserved.
 */

/** Filename -> tool_key for hasToolAccess */
export const TOOL_PATH_MAP: Record<string, string> = {
  'brrrr.html': 'brrrr',
  'commercial.html': 'commercial',
  'dealcheck.html': 'dealcheck',
  'investorbuy-box.html': 'buybox',
  'offer.html': 'offer',
  'profitsplit.html': 'profitsplit',
  'pwt.html': 'pwt',
  'rehabtracker.html': 'rehabtracker',
  'wholesale.html': 'wholesale',
};

/** Tier rank for comparison - matches existing tier-config */
const TIER_RANK: Record<string, number> = {
  guest: 0,
  starter: 1,
  serious: 2,
  elite: 3,
  academy_starter: 1,
  academy_pro: 2,
  academy_premium: 3,
  admin: 999,
};

/** Tool key -> minimum required tier - matches entitlements.js TOOL_ACCESS */
const TOOL_ACCESS: Record<string, string> = {
  offer: 'starter',
  brrrr: 'starter',
  dealcheck: 'serious',
  rehab: 'serious',
  rehabtracker: 'serious',
  pwt: 'serious',
  wholesale: 'serious',
  commercial: 'elite',
  buybox: 'elite',
  profitsplit: 'serious',
};

/** Product keys for add-on entitlements - matches entitlements.js TOOL_PRODUCT_KEYS */
const TOOL_PRODUCT_KEYS: Record<string, string> = {
  offer: 'tool_offer',
  brrrr: 'tool_brrrr',
  dealcheck: 'tool_dealcheck',
  rehab: 'tool_rehabtracker',
  rehabtracker: 'tool_rehabtracker',
  pwt: 'tool_pwt',
  wholesale: 'tool_wholesale',
  commercial: 'tool_commercial',
  buybox: 'tool_buybox',
  profitsplit: 'tool_profitsplit',
};

function canAccessTier(userTier: string, requiredTier: string): boolean {
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[requiredTier] ?? 999;
  return userRank >= requiredRank;
}

/** Check if tier includes access to tool (tier-based only). */
function tierIncludesTool(tier: string, toolKey: string): boolean {
  const requiredTier = TOOL_ACCESS[toolKey];
  if (!requiredTier) return false;
  return canAccessTier(tier, requiredTier);
}

/**
 * Resolve user tier from entitlements, profile, or default.
 * NEVER throws. Fully null-safe. Order: 1) active tier entitlement, 2) profile.tier, 3) 'guest'
 */
export function resolveUserTier(
  profile: { tier?: string | null } | null | undefined,
  entitlements: Array<{ type?: string; product_key?: string; status?: string }> | null | undefined
): string {
  try {
    const arr = Array.isArray(entitlements) ? entitlements : [];
    const activeTier = arr.find(
      (e) =>
        e &&
        (e.type === 'tier' || (e.product_key && String(e.product_key).startsWith('tier_'))) &&
        e.status === 'active'
    );
    if (activeTier?.product_key) {
      const t = String(activeTier.product_key).replace(/^tier_/, '');
      if (t) return t;
    }
    if (profile?.tier != null && profile.tier !== '') {
      return String(profile.tier);
    }
    return 'guest';
  } catch {
    return 'guest';
  }
}

/**
 * Check if user has tool access (tier or add-on).
 * NEVER throws. Admin bypass: profile.role === 'admin' returns true.
 */
export function hasToolAccess(
  profile: { role?: string; tier?: string | null } | null | undefined,
  entitlements: Array<{ type?: string; product_key?: string; status?: string }> | null | undefined,
  toolKey: string
): boolean {
  try {
    if (!toolKey) return false;
    if (profile?.role === 'admin') return true;

    const tier = resolveUserTier(profile, entitlements);
    if (tier === 'admin') return true;
    if (tierIncludesTool(tier, toolKey)) return true;

    const productKey = TOOL_PRODUCT_KEYS[toolKey] ?? `tool_${toolKey}`;
    const arr = Array.isArray(entitlements) ? entitlements : [];
    return arr.some(
      (e) =>
        e &&
        (e.type === 'tool' || (e.product_key && String(e.product_key).startsWith('tool_'))) &&
        e.product_key === productKey &&
        e.status === 'active'
    );
  } catch {
    return false;
  }
}

/**
 * Extract tool key from path like /tools/brrrr.html.
 * Returns toolKey or null if not found.
 */
export function getToolKeyFromPath(pathname: string): string | null {
  try {
    if (!pathname || !pathname.includes('/tools/')) return null;
    const segments = pathname.split('/').filter(Boolean);
    const toolsIdx = segments.indexOf('tools');
    if (toolsIdx < 0 || toolsIdx >= segments.length - 1) return null;
    const filename = segments[toolsIdx + 1];
    if (!filename) return null;
    const toolKey = TOOL_PATH_MAP[filename];
    return toolKey ?? null;
  } catch {
    return null;
  }
}
