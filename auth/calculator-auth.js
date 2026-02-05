/**
 * Elite Investor Academy - Calculator page auth guard
 * Include on every member-facing calculator HTML page (offer, brrrr, rehabtracker, pwt, dealcheck, wholesale, commercial).
 * When the page is opened directly (not in iframe), checks session + tier and redirects to login.html or dashboard.html if unauthorized.
 * Include after auth/config.js. Usage: <script src="auth/calculator-auth.js" data-tool="offer"></script>
 * Optional: add .esn-calc-auth-pending .calculator-content { display: none; } to hide content until allowed.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var toolId = (script && script.getAttribute('data-tool')) || (typeof window !== 'undefined' && window.ESN_TOOL_ID) || '';
  if (!toolId) return;

  var LOGIN_PATH = '/login.html';
  var DASHBOARD_PATH = '/dashboard.html';
  var BASE = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin.replace(/\/$/, '') : '';

  var TOOL_ACCESS = {
    offer: 'starter', brrrr: 'starter', dealcheck: 'serious', rehab: 'serious', rehabtracker: 'serious',
    pwt: 'serious', wholesale: 'serious', commercial: 'elite'
  };
  var TIER_RANK = {
    guest: 0, starter: 1, serious: 2, elite: 3,
    academy_starter: 1, academy_pro: 2, academy_premium: 3, admin: 999
  };

  function canAccess(userTier, requiredTier) {
    var userRank = TIER_RANK[userTier] || 0;
    var requiredRank = TIER_RANK[requiredTier] !== undefined ? TIER_RANK[requiredTier] : 999;
    return userRank >= requiredRank;
  }

  document.documentElement.classList.add('esn-calc-auth-pending');

  (async function runGuard() {
    var inIframe = typeof window !== 'undefined' && window.self !== window.top;
    var requiredTier = TOOL_ACCESS[toolId];
    if (!requiredTier) {
      if (!inIframe) window.location.replace(BASE + '/index.html');
      else showInFrameMessage('This tool is not available.');
      return;
    }

    var supabaseUrl = typeof window !== 'undefined' && window.__SUPABASE_URL__;
    var supabaseKey = typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__;
    if (!supabaseUrl || !supabaseKey) {
      if (!inIframe) window.location.replace(BASE + '/index.html');
      else showInFrameMessage('Auth is not configured.');
      return;
    }

    var createClient, supabase, sessionResult, session;
    try {
      createClient = (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')).createClient;
      supabase = createClient(supabaseUrl, supabaseKey);
      sessionResult = await supabase.auth.getSession();
      session = sessionResult.data && sessionResult.data.session;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[calculator-auth] init/getSession failed:', e && e.message ? e.message : e);
      if (!inIframe) window.location.replace(BASE + LOGIN_PATH);
      else showInFrameMessage('Unable to verify access. Please try again.', BASE + LOGIN_PATH);
      return;
    }
    if (!session) {
      if (!inIframe) {
        var loginUrl = BASE + LOGIN_PATH + '?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(loginUrl);
      } else {
        showInFrameMessage('You must be logged in to use this calculator.', BASE + LOGIN_PATH);
      }
      return;
    }

    var user = session.user;
    var role = (user && (user.user_metadata && user.user_metadata.role) || (user.app_metadata && user.app_metadata.role)) || 'user';
    if (role === 'admin') {
      document.documentElement.classList.remove('esn-calc-auth-pending');
      return;
    }

    var now = new Date().toISOString();
    var overrideResult = await supabase.from('tier_overrides').select('override_tier').eq('user_id', user.id).or('expires_at.is.null,expires_at.gt.' + now).order('created_at', { ascending: false }).limit(1).maybeSingle();
    var overrideTier = overrideResult.data && overrideResult.data.override_tier;
    if (overrideTier) {
      if (canAccess(overrideTier, requiredTier)) {
        document.documentElement.classList.remove('esn-calc-auth-pending');
        return;
      }
      if (!inIframe) window.location.replace(BASE + DASHBOARD_PATH);
      else showInFrameMessage('Your tier does not include this tool. Upgrade to unlock.', BASE + '/index.html');
      return;
    }

    var memberResult = await supabase.from('member_profiles').select('tier').eq('id', user.id).single();
    var profileTier = (memberResult.data && memberResult.data.tier) || null;
    if (!profileTier) {
      var legacyResult = await supabase.from('profiles').select('tier').eq('id', user.id).single();
      profileTier = (legacyResult.data && legacyResult.data.tier) || null;
    }
    if (!profileTier && user.user_metadata) profileTier = user.user_metadata.tier || null;
    if (!profileTier && user.app_metadata) profileTier = user.app_metadata.tier || null;
    var userTier = (profileTier === undefined || profileTier === null || profileTier === '') ? 'guest' : profileTier;

    if (!canAccess(userTier, requiredTier)) {
      if (!inIframe) window.location.replace(BASE + DASHBOARD_PATH);
      else showInFrameMessage('Your tier does not include this tool. Upgrade to unlock.', BASE + '/index.html');
      return;
    }

    document.documentElement.classList.remove('esn-calc-auth-pending');
  })().catch(function (err) {
    if (typeof console !== 'undefined') console.warn('[calculator-auth] runGuard failed:', err && err.message ? err.message : err);
    document.documentElement.classList.remove('esn-calc-auth-pending');
    var inIframe = typeof window !== 'undefined' && window.self !== window.top;
    var BASE = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin.replace(/\/$/, '') : '';
    if (!inIframe) window.location.replace(BASE + '/login.html');
    else {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'font-family:sans-serif;padding:2rem;text-align:center;color:#333;max-width:400px;margin:2rem auto;';
      wrap.innerHTML = '<p><strong>Something went wrong. Please try again.</strong></p><p><a href="/login.html" style="color:#FF7300;">Log in</a></p>';
      if (document.body) { document.body.innerHTML = ''; document.body.appendChild(wrap); }
    }
  });

  function showInFrameMessage(text, linkUrl) {
    document.documentElement.classList.remove('esn-calc-auth-pending');
    var wrap = document.createElement('div');
    wrap.style.cssText = 'font-family:sans-serif;padding:2rem;text-align:center;color:#333;max-width:400px;margin:2rem auto;';
    wrap.innerHTML = '<p><strong>' + (text || 'Access restricted') + '</strong></p>' + (linkUrl ? '<p><a href="' + linkUrl + '" style="color:#FF7300;">Go to Elite Investor Academy</a></p>' : '');
    var body = document.body;
    if (body) {
      body.innerHTML = '';
      body.appendChild(wrap);
    }
  }
})();
