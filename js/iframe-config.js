// ============================================
// Elite Investor Academy - Iframe Hardening Config
// ============================================
// Approved domains that may embed member-facing calculators.
// Used by: protected wrappers, calculator-gate, CSP frame-ancestors.
// Investor Buy Box and internal tools are NOT subject to these restrictions.

/** Origins allowed to embed calculators (and to load protected.html) */
export const ALLOWED_EMBED_ORIGINS = [
  'https://invest.elitesolutionsnetwork.com',
  'https://dealcheck.elitesolutionsnetwork.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

/** CSP frame-ancestors value for calculator pages */
export const FRAME_ANCESTORS_CSP = [
  "'self'",
  ...ALLOWED_EMBED_ORIGINS
].join(' ');

/** Member-facing calculators (hardened). Investor Buy Box is EXCLUDED. */
export const HARDENED_CALCULATORS = [
  'offer',           // Property Offer Calculator
  'brrrr',           // BRRRR Analyzer
  'rehab',           // Rehab Tracker (alias)
  'rehabtracker',    // Rehab Tracker
  'pwt',             // Property Walkthrough Tool
  'dealcheck',       // DealCheck Analyzer
  'wholesale',       // Wholesale Analyzer
  'commercial'       // Commercial Analyzer
];

/** Check if an origin is in the approved list */
export function isAllowedEmbedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_EMBED_ORIGINS.some(allowed => {
    try {
      return new URL(origin).origin === new URL(allowed).origin;
    } catch {
      return origin === allowed;
    }
  });
}
