// ============================================
// Elite Investor Academy - Calculator Gate
// ============================================
// Include on every member-facing calculator page (offer, brrrr, rehabtracker, pwt, dealcheck, commercial).
// Ensures: (1) user is authenticated, (2) user tier allows the tool.
// Redirects to login or pricing when unauthorized. Does not expose calculator HTML in iframe without auth.
// CONFIRMED: Investor Buy Box is NOT gated by this script.
//
// Usage on calculator page:
// 1. Add class to hide content until gate passes, e.g. in CSS:
//    .esn-gate-pending .calculator-content { display: none; }
// 2. Wrap calculator UI in <div class="calculator-content">...</div>
// 3. Load: <script type="module" src="/js/calculator-gate.js" data-tool="offer" data-supabase-url="..." data-supabase-anon-key="..."></script>
//    then call runCalculatorGateFromScript() or: import { runCalculatorGate } from '/js/calculator-gate.js'; runCalculatorGate('offer').then(...)

const LOGIN_PATH = '/login.html';
const PRICING_PATH = '/index.html';
const INVEST_ORIGIN = 'https://invest.elitesolutionsnetwork.com';

/** Approved embed origins (iframe hardening). Investor Buy Box excluded from gate. */
const ALLOWED_EMBED_ORIGINS = [
  'https://invest.elitesolutionsnetwork.com',
  'https://dealcheck.elitesolutionsnetwork.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

function isAllowedEmbedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_EMBED_ORIGINS.includes(origin);
}

/** Tool ID → minimum required tier (must match tier-config.js). guest: none | starter: offer, brrrr | serious: + dealcheck, rehab, pwt, wholesale | elite: + commercial */
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

const TIER_RANK = {
  guest: 0,
  starter: 1,
  serious: 2,
  elite: 3,
  academy_starter: 1,
  academy_pro: 2,
  academy_premium: 3,
  admin: 999  // Role override: bypasses tier gating
};

function canAccessTier(userTier, requiredTier) {
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[requiredTier] ?? 999;
  return userRank >= requiredRank;
}

function canAccessTool(userTier, toolId) {
  const requiredTier = TOOL_ACCESS[toolId];
  if (!requiredTier) return false;
  return canAccessTier(userTier, requiredTier);
}

function getOrigin() {
  if (typeof window !== 'undefined' && window.location && window.location.origin)
    return window.location.origin;
  return INVEST_ORIGIN;
}

/** Auth URLs: use invest origin when on dealcheck (login/pricing live on invest) */
function getAuthBase() {
  if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.indexOf('dealcheck') !== -1)
    return INVEST_ORIGIN;
  return getOrigin();
}

function loginUrl(returnUrl) {
  const base = getAuthBase().replace(/\/$/, '');
  const path = LOGIN_PATH.startsWith('/') ? LOGIN_PATH : '/' + LOGIN_PATH;
  const url = base + path;
  return returnUrl ? url + '?redirect=' + encodeURIComponent(returnUrl) : url;
}

function pricingUrl() {
  const base = getAuthBase().replace(/\/$/, '');
  const path = PRICING_PATH.startsWith('/') ? PRICING_PATH : '/' + PRICING_PATH;
  return base + path;
}

/**
 * Run the gate: require auth and tier for the given tool.
 * - No session: redirect to login (or show message if in iframe from another origin).
 * - Insufficient tier: redirect to pricing.
 * @param {string} toolId - Tool id (e.g. 'offer', 'brrrr', 'rehabtracker', 'pwt', 'dealcheck', 'commercial')
 * @param {{ supabaseUrl?: string, supabaseAnonKey?: string }} options - Optional Supabase config (else from data attributes or window.ESN_*)
 * @returns {Promise<{ allowed: boolean, user?: object, tier?: string }>}
 */
export async function runCalculatorGate(toolId, options = {}) {
  const script = typeof document !== 'undefined' && document.currentScript;
  const dataset = (script && script.getAttribute && script.dataset) || {};
  const supabaseUrl = options.supabaseUrl || dataset.supabaseUrl || (typeof window !== 'undefined' && window.ESN_SUPABASE_URL) || '';
  const supabaseAnonKey = options.supabaseAnonKey || dataset.supabaseAnonKey || (typeof window !== 'undefined' && window.ESN_SUPABASE_ANON_KEY) || '';

  function trackCalculatorAccess(allowed, meta = {}) {
    try {
      import('./analytics.js').then(function (m) {
        m.track('calculator_access', { page: toolId, metadata: { allowed, ...meta } });
      }).catch(function () {});
    } catch (_) {}
  }

  if (!toolId) {
    trackCalculatorAccess(false, { reason: 'no_tool_id' });
    if (window.top === window.self) window.location.replace(pricingUrl());
    return { allowed: false };
  }

  if (!TOOL_ACCESS[toolId]) {
    trackCalculatorAccess(false, { reason: 'unknown_tool' });
    if (window.top === window.self) window.location.replace(pricingUrl());
    return { allowed: false };
  }

  const inIframe = typeof window !== 'undefined' && window.top !== window.self;

  // Iframe hardening: block if embedded by unknown origin
  if (inIframe) {
    const ref = typeof document !== 'undefined' ? document.referrer : '';
    if (ref) {
      try {
        const refOrigin = new URL(ref).origin;
        if (!isAllowedEmbedOrigin(refOrigin)) {
          trackCalculatorAccess(false, { reason: 'unauthorized_embed' });
          document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;text-align:center;">Unauthorized embed</p>';
          return { allowed: false };
        }
      } catch (e) {
        trackCalculatorAccess(false, { reason: 'embed_error' });
        document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;text-align:center;">Unauthorized embed</p>';
        return { allowed: false };
      }
    }
  }

  const supabaseUrlResolved = supabaseUrl || (typeof window !== 'undefined' && window.__SUPABASE_URL__);
  const supabaseAnonKeyResolved = supabaseAnonKey || (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__);
  if (!supabaseUrlResolved || !supabaseAnonKeyResolved || supabaseUrlResolved === 'https://YOUR_PROJECT_ID.supabase.co') {
    trackCalculatorAccess(false, { reason: 'gate_not_configured' });
    if (inIframe) {
      document.body.innerHTML = '<div style="font-family:sans-serif;padding:2rem;text-align:center;color:#333;">' +
        '<p>Calculator gate is not configured.</p><a href="' + loginUrl() + '">Log in</a></div>';
    } else {
      window.location.replace(pricingUrl());
    }
    return { allowed: false };
  }

  const { getSupabase } = await import('./supabase-auth-cookies.js');
  const supabase = await getSupabase();

  let session, sessionError;
  try {
    const result = await supabase.auth.getSession();
    session = result.data?.session;
    sessionError = result.error;
  } catch (e) {
    sessionError = e;
    session = null;
    console.warn('[calculator-gate] getSession failed:', e?.message || e);
  }
  if (sessionError || !session) {
    trackCalculatorAccess(false, { reason: 'login_required' });
    if (inIframe) {
      document.body.innerHTML = '<div style="font-family:sans-serif;padding:2rem;text-align:center;color:#333;max-width:400px;margin:2rem auto;">' +
        '<p><strong>Login required</strong></p><p>You must be logged in to use this calculator.</p>' +
        '<p><a href="' + loginUrl(window.location.href) + '" style="color:#FF7300;">Log in at Elite Investor Academy</a></p></div>';
    } else {
      window.location.replace(loginUrl(window.location.href));
    }
    return { allowed: false };
  }

  // Resolve role and tier: admin email (failsafe) > profile.role > JWT metadata > member_profiles > profiles
  const user = session.user;
  let role = user?.user_metadata?.role ?? user?.app_metadata?.role ?? 'user';
  let tier = (role === 'admin' ? 'admin' : null) || user?.user_metadata?.tier ?? user?.app_metadata?.tier ?? null;
  if (user?.email?.toLowerCase() === 'admin@elitesolutionsnetwork.com') {
    role = 'admin';
    tier = 'admin';
  }
  try {
    const { data: mp } = await supabase.from('member_profiles').select('role, tier').eq('id', user.id).maybeSingle();
    if (mp?.role === 'admin') role = 'admin';
    if (mp?.tier) tier = mp.tier;
  } catch (_) {}
  try {
    const { data: p } = await supabase.from('profiles').select('role, tier').eq('id', user.id).maybeSingle();
    if (p?.role === 'admin') { role = 'admin'; tier = 'admin'; }
    else if (p?.tier && !tier) tier = p.tier;
  } catch (_) {}
  tier = tier || 'guest';

  // TEMP: Auth debug - remove after production validation
  if (typeof console !== 'undefined' && console.log) {
    console.log('[ESN-Auth] Auth User:', user?.id, user?.email);
    console.log('[ESN-Auth] Resolved Tier:', tier);
    console.log('[ESN-Auth] Role:', role);
  }

  let hasAccess = canAccessTool(tier, toolId);
  if (!hasAccess) {
    try {
      const { hasToolAccess } = await import('./entitlements.js');
      hasAccess = await hasToolAccess({ id: user.id, tier }, toolId, supabase);
    } catch (_) {}
  }
  if (!hasAccess) {
    try {
      import('./analytics.js').then(function (m) {
        m.track('tier_mismatch', { tier, role, page: toolId, metadata: { required_tier: TOOL_ACCESS[toolId] } });
      }).catch(function () {});
    } catch (_) {}
    console.warn('[calculator-gate] tier mismatch: user tier=' + (tier || 'guest') + ', tool=' + toolId + ' requires ' + (TOOL_ACCESS[toolId] || '?'));
    trackCalculatorAccess(false, { reason: 'insufficient_tier', user_tier: tier, required_tier: TOOL_ACCESS[toolId] });
    window.location.replace(pricingUrl());
    return { allowed: false };
  }

  trackCalculatorAccess(true, { tier });
  return { allowed: true, user: session.user, tier };
}

// Capture at module load time (currentScript is set when module runs)
const _gateScript = typeof document !== 'undefined' ? document.currentScript : null;
function _getToolFromScript() {
  if (_gateScript && _gateScript.getAttribute) return _gateScript.getAttribute('data-tool') || '';
  if (typeof window !== 'undefined' && window.ESN_TOOL_ID) return window.ESN_TOOL_ID;
  return '';
}

/**
 * Run gate from a script tag: tool from data-tool or window.ESN_TOOL_ID.
 * Call this when the script loads; it will redirect or show error if not allowed.
 * On success, removes .esn-gate-pending from document.documentElement so calculator content can show.
 */
export function runCalculatorGateFromScript() {
  const toolId = _getToolFromScript();
  document.documentElement.classList.add('esn-gate-pending');
  runCalculatorGate(toolId).then(function (result) {
    if (result.allowed) {
      document.documentElement.classList.remove('esn-gate-pending');
    }
  }).catch(function (err) {
    console.warn('[calculator-gate] run failed:', err?.message || err);
    document.documentElement.classList.remove('esn-gate-pending');
    if (window.top === window.self) {
      window.location.replace(pricingUrl());
    } else {
      document.body.innerHTML = '<div style="font-family:sans-serif;padding:2rem;text-align:center;color:#333;">Something went wrong. <a href="' + loginUrl() + '">Log in</a></div>';
    }
  });
}
