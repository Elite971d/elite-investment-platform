// ============================================
// Elite Investor Academy - Branding Loader
// ============================================
// Shared utility for calculators. If user has white-label access, load
// user_branding from Supabase and apply. Otherwise use default ESN branding.

import { getSupabase } from './supabase-client.js';
import { getCurrentUser } from './supabase-client.js';
import { hasWhiteLabelAccess, getEffectiveTierCached } from './entitlements.js';

/** Default ESN branding (when no white-label) */
const DEFAULT_BRANDING = {
  company_name: 'Elite Investor Academy',
  primary_color: '#FF7300',
  secondary_color: '#0A2342',
  logo_url: null,
  footer_text: null
};

/**
 * Load branding for the current user.
 * Returns default ESN branding if no white-label access or no custom branding.
 * @returns {Promise<{
 *   company_name: string,
 *   primary_color: string,
 *   secondary_color: string,
 *   logo_url: string|null,
 *   footer_text: string|null,
 *   isWhitelabel: boolean
 * }>}
 */
export async function loadBranding() {
  try {
    const user = await getCurrentUser();
    if (!user) return { ...DEFAULT_BRANDING, isWhitelabel: false };

    const { effectiveTier } = await getEffectiveTierCached(user);
    const hasAccess = await hasWhiteLabelAccess({ id: user.id, tier: effectiveTier });
    if (!hasAccess) return { ...DEFAULT_BRANDING, isWhitelabel: false };

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('user_branding')
      .select('company_name, primary_color, secondary_color, logo_url, footer_text')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) return { ...DEFAULT_BRANDING, isWhitelabel: true };

    return {
      company_name: data.company_name || DEFAULT_BRANDING.company_name,
      primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
      secondary_color: data.secondary_color || DEFAULT_BRANDING.secondary_color,
      logo_url: data.logo_url || null,
      footer_text: data.footer_text || null,
      isWhitelabel: true
    };
  } catch (err) {
    console.warn('[branding-loader] loadBranding failed:', err?.message || err);
    return { ...DEFAULT_BRANDING, isWhitelabel: false };
  }
}

/**
 * Apply branding to the document (CSS variables, logo, company name, footer).
 * Call after loadBranding() when embedding in a calculator wrapper.
 * @param {object} branding - Result from loadBranding()
 * @param {object} opts - { logoSelector?: string, companySelector?: string, footerSelector?: string }
 */
export function applyBranding(branding, opts = {}) {
  if (!branding) return;
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', branding.primary_color);
  root.style.setProperty('--brand-secondary', branding.secondary_color);
  if (branding.logo_url) root.style.setProperty('--brand-logo-url', `url(${branding.logo_url})`);

  const logoSel = opts.logoSelector || '[data-brand-logo]';
  const companySel = opts.companySelector || '[data-brand-company]';
  const footerSel = opts.footerSelector || '[data-brand-footer]';

  const logoEl = document.querySelector(logoSel);
  if (logoEl && branding.logo_url) {
    if (logoEl.tagName === 'IMG') logoEl.src = branding.logo_url;
    else logoEl.style.backgroundImage = `url(${branding.logo_url})`;
  }

  const companyEl = document.querySelector(companySel);
  if (companyEl) companyEl.textContent = branding.company_name;

  const footerEl = document.querySelector(footerSel);
  if (footerEl && branding.footer_text) footerEl.textContent = branding.footer_text;
}

/**
 * Load and apply branding in one call. Use in calculator wrapper/header.
 * @param {object} opts - Same as applyBranding opts
 * @returns {Promise<object>} The branding object
 */
export async function loadAndApplyBranding(opts = {}) {
  const branding = await loadBranding();
  applyBranding(branding, opts);
  return branding;
}
