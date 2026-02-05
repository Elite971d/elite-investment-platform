// ============================================
// Elite Investor Academy - Promo Code Validation
// ============================================
// Optional, non-breaking. Invalid code → continue without discount.
// Promo codes NEVER override admin tier; apply only at checkout/renewal.

import { ENABLE_PROMOS } from './feature-flags.js';
import { getSupabase } from './supabase-client.js';

/**
 * Validate a promo code for a tier. Safe: invalid → return { valid: false }; never throws.
 * @param {string} code - Promo code (e.g. from input)
 * @param {string} tier - Tier being purchased (e.g. 'starter', 'elite')
 * @returns {Promise<{ valid: boolean, reason?: string, discount_type?: string, discount_value?: number, description?: string }>}
 */
export async function validatePromo(code, tier) {
  const invalid = (reason) => ({ valid: false, reason });

  if (!ENABLE_PROMOS) {
    return invalid('promos_disabled');
  }
  if (typeof code !== 'string' || !code.trim()) {
    return invalid('no_code');
  }
  if (typeof tier !== 'string' || !tier.trim()) {
    return invalid('no_tier');
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('validate_promo', {
      p_code: code.trim(),
      p_tier: tier.trim()
    });
    if (error) {
      return invalid('error');
    }
    const result = data && typeof data === 'object' ? data : {};
    if (result.valid === true) {
      return {
        valid: true,
        discount_type: result.discount_type,
        discount_value: result.discount_value != null ? Number(result.discount_value) : 0,
        description: result.description,
        code: result.code
      };
    }
    return invalid(result.reason || 'invalid');
  } catch (_) {
    return invalid('error');
  }
}
