// ============================================
// Internal: Verify Tool Access (for middleware)
// ============================================
// Called by middleware for /tools/* requests. Returns { ok: boolean }.
// Uses session cookie to identify user; fetches profile + entitlements; runs hasToolAccess.

const { createClient } = require('@supabase/supabase-js');
const { hasToolAccess, getToolKeyFromPath } = require('../../lib/access-utils.js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getUserFromToken(accessToken) {
  const url = process.env.SUPABASE_URL;
  if (!url) return { user: null };
  const base = url.replace(/\/$/, '');
  const res = await fetch(`${base}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { user: null };
  return { user: data };
}

/** Extract Supabase access token from request cookies */
function getAccessTokenFromCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const eq = cookie.indexOf('=');
    if (eq < 0) continue;
    const name = cookie.slice(0, eq).trim();
    let value = cookie.slice(eq + 1).trim();
    if (name === 'sb-access-token') {
      try {
        const decoded = decodeURIComponent(value);
        const parsed = JSON.parse(decoded);
        return parsed?.access_token || parsed?.accessToken || value;
      } catch {
        return value;
      }
    }
    if (name.startsWith('sb-') && name.includes('-auth-token')) {
      try {
        value = decodeURIComponent(value);
        const parsed = JSON.parse(value);
        return parsed?.access_token || parsed?.accessToken || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false });
  }
  try {
    const path = (req.query && req.query.path) || '';
    const toolKey = getToolKeyFromPath(path);
    if (!toolKey) {
      return res.status(200).json({ ok: true });
    }

    const cookieHeader = req.headers?.cookie || '';
    const accessToken = getAccessTokenFromCookies(cookieHeader);
    if (!accessToken) {
      return res.status(200).json({ ok: false });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(200).json({ ok: true });
    }

    const { user } = await getUserFromToken(accessToken);
    if (!user) {
      return res.status(200).json({ ok: false });
    }

    const [profilesRes, memberRes, entRes] = await Promise.all([
      supabase.from('profiles').select('tier, role').eq('id', user.id).maybeSingle(),
      supabase.from('member_profiles').select('tier, role').eq('id', user.id).maybeSingle(),
      supabase.from('entitlements').select('type, product_key, status').eq('user_id', user.id).eq('status', 'active'),
    ]);

    const profile = memberRes?.data || profilesRes?.data || {};
    const role = profile?.role || user?.user_metadata?.role || user?.app_metadata?.role;
    const mergedProfile = { tier: profile?.tier, role };
    const entitlements = Array.isArray(entRes?.data) ? entRes.data : [];

    const allowed = hasToolAccess(mergedProfile, entitlements, toolKey);
    return res.status(200).json({ ok: allowed });
  } catch (err) {
    console.error('[verify-tool-access]', err?.message || err);
    return res.status(200).json({ ok: true });
  }
};
