/**
 * Access utilities - Edge/Node safe, no browser deps.
 * Shared by middleware (via TS wrapper) and API.
 */

/** Filename -> tool_key for hasToolAccess */
const TOOL_PATH_MAP = {
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

const TIER_RANK = {
  guest: 0, starter: 1, serious: 2, elite: 3,
  academy_starter: 1, academy_pro: 2, academy_premium: 3,
  admin: 999,
};

const TOOL_ACCESS = {
  offer: 'starter', brrrr: 'starter', dealcheck: 'serious',
  rehab: 'serious', rehabtracker: 'serious', pwt: 'serious',
  wholesale: 'serious', commercial: 'elite', buybox: 'elite',
  profitsplit: 'serious',
};

const TOOL_PRODUCT_KEYS = {
  offer: 'tool_offer', brrrr: 'tool_brrrr', dealcheck: 'tool_dealcheck',
  rehab: 'tool_rehabtracker', rehabtracker: 'tool_rehabtracker',
  pwt: 'tool_pwt', wholesale: 'tool_wholesale', commercial: 'tool_commercial',
  buybox: 'tool_buybox', profitsplit: 'tool_profitsplit',
};

function canAccessTier(userTier, requiredTier) {
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[requiredTier] ?? 999;
  return userRank >= requiredRank;
}

function tierIncludesTool(tier, toolKey) {
  const requiredTier = TOOL_ACCESS[toolKey];
  if (!requiredTier) return false;
  return canAccessTier(tier, requiredTier);
}

function resolveUserTier(profile, entitlements) {
  try {
    const arr = Array.isArray(entitlements) ? entitlements : [];
    const activeTier = arr.find(
      (e) => e && (e.type === 'tier' || (e.product_key && String(e.product_key).startsWith('tier_'))) && e.status === 'active'
    );
    if (activeTier?.product_key) {
      const t = String(activeTier.product_key).replace(/^tier_/, '');
      if (t) return t;
    }
    if (profile?.tier != null && profile.tier !== '') return String(profile.tier);
    return 'guest';
  } catch {
    return 'guest';
  }
}

function hasToolAccess(profile, entitlements, toolKey) {
  try {
    if (!toolKey) return false;
    if (profile?.role === 'admin') return true;
    const tier = resolveUserTier(profile, entitlements);
    if (tier === 'admin') return true;
    if (tierIncludesTool(tier, toolKey)) return true;
    const productKey = TOOL_PRODUCT_KEYS[toolKey] ?? 'tool_' + toolKey;
    const arr = Array.isArray(entitlements) ? entitlements : [];
    return arr.some(
      (e) => e && (e.type === 'tool' || (e.product_key && String(e.product_key).startsWith('tool_'))) && e.product_key === productKey && e.status === 'active'
    );
  } catch {
    return false;
  }
}

function getToolKeyFromPath(pathname) {
  try {
    if (!pathname || !pathname.includes('/tools/')) return null;
    const segments = pathname.split('/').filter(Boolean);
    const toolsIdx = segments.indexOf('tools');
    if (toolsIdx < 0 || toolsIdx >= segments.length - 1) return null;
    const filename = segments[toolsIdx + 1];
    return TOOL_PATH_MAP[filename] ?? null;
  } catch {
    return null;
  }
}

module.exports = { hasToolAccess, getToolKeyFromPath, resolveUserTier, TOOL_PATH_MAP };
