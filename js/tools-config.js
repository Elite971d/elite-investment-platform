// ============================================
// Elite Investor Academy - Tools Configuration
// ============================================
// Single source of truth: MEMBER TOOLS vs INTERNAL TOOLS
//
// • Member tools: Shown in dashboard, gated by tier, appear in pricing.
// • Internal tools: Admin-only grant/revoke, NEVER in dashboard or pricing.
//
// Explicit tier matrix (calculators only):
//   guest:   none
//   starter: Property Offer Calculator, BRRRR Analyzer
//   serious: starter + DealCheck Analyzer, Rehab Tracker, Property Walkthrough Tool, Wholesale Analyzer
//   elite:   serious + Commercial Analyzer
//   admin:   everything (role override)

/** Member tools — calculators and academy. Used by dashboard and pricing only. */
export const MEMBER_TOOLS = [
  { id: 'offer', name: 'Property Offer Calculator', minTier: 'starter', pills: ['Offer', 'MAO', 'Comps'], path: 'offer.html' },
  { id: 'brrrr', name: 'BRRRR Analyzer', minTier: 'starter', pills: ['BRRRR', 'Refi', 'ROI'], path: 'brrrr.html' },
  { id: 'dealcheck', name: 'DealCheck Analyzer', minTier: 'serious', pills: ['Deal', 'Analysis'], path: 'dealcheck.html' },
  { id: 'rehab', name: 'Rehab Tracker', minTier: 'serious', pills: ['Budget', 'Receipts', 'Export'], path: 'rehabtracker.html' },
  { id: 'pwt', name: 'Property Walkthrough Tool', minTier: 'serious', pills: ['Scope', 'Rooms', 'Photos'], path: 'pwt.html' },
  { id: 'wholesale', name: 'Wholesale Analyzer', minTier: 'serious', pills: ['Wholesale'], path: 'wholesale.html' },
  { id: 'commercial', name: 'Commercial Analyzer', minTier: 'elite', pills: ['Commercial', 'Cap Rate'], path: 'commercial.html' }
];

/** Member offerings: Academy access (not a "tool" card but member-facing). */
export const MEMBER_ACADEMY = {
  id: 'academy',
  name: 'Investor Academy',
  minTier: 'elite',
  description: 'Elite/Pro tier unlocks the full training library.'
};

/** Internal tools — never in member dashboard, never in pricing. Admin grant/revoke only. */
export const INTERNAL_TOOLS = [
  { id: 'investor_buy_box', name: 'Investor Buy Box', productKey: 'internal_investor_buy_box', description: 'Internal-only tool' }
  // Add future internal tools here, e.g.:
  // { id: 'internal_xyz', name: 'Internal XYZ', productKey: 'internal_xyz', description: '...' }
];

/**
 * Product keys used for internal tool entitlements (stored in entitlements.product_key).
 * Used by admin panel and backend to grant/revoke internal access.
 */
export const INTERNAL_PRODUCT_KEYS = INTERNAL_TOOLS.map(t => t.productKey);

/**
 * @param {string} toolId
 * @returns {boolean} true if tool is internal-only
 */
export function isInternalTool(toolId) {
  return INTERNAL_TOOLS.some(t => t.id === toolId);
}

/**
 * @param {string} productKey
 * @returns {boolean} true if product_key is for an internal tool
 */
export function isInternalProductKey(productKey) {
  return typeof productKey === 'string' && productKey.startsWith('internal_');
}

/** Get member tools only (for dashboard grid). */
export function getMemberTools() {
  return [...MEMBER_TOOLS];
}

/** Get internal tools only (for admin panel). */
export function getInternalTools() {
  return [...INTERNAL_TOOLS];
}

/** Get internal tool by product_key */
export function getInternalToolByProductKey(productKey) {
  return INTERNAL_TOOLS.find(t => t.productKey === productKey) || null;
}

/** Get tool path by id (for opening actual calculator file). */
export function getToolPath(toolId) {
  const t = MEMBER_TOOLS.find(tool => tool.id === toolId);
  return t?.path || null;
}
