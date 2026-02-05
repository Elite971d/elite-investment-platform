// ============================================
// Members Claim (Vercel Serverless)
// ============================================
// GET ?email=... [&tier=...] — requires Authorization: Bearer <session>.
// Updates member_profiles: subscription_status=active, tier (if provided), reset retry_count, clear grace_until.
// Idempotent; duplicate checkout events safe. Never downgrade existing tier if tier param missing.

const { createClient } = require('@supabase/supabase-js');

const ALLOWED_TIERS = ['starter', 'serious', 'elite', 'pro', 'academy_starter', 'academy_pro', 'academy_premium'];

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getUserFromToken(accessToken) {
  const url = process.env.SUPABASE_URL;
  if (!url) return { user: null, error: new Error('No SUPABASE_URL') };
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { user: null, error: new Error(data.msg || 'Invalid session') };
  return { user: data, error: null };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const { email, tier: tierParam } = req.query || {};
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!emailNorm) {
    return res.status(400).json({ error: 'email query parameter required' });
  }
  const supabaseService = getServiceSupabase();
  if (!supabaseService) {
    return res.status(503).json({ error: 'Server configuration error' });
  }
  const { user, error: authError } = await getUserFromToken(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const userEmail = (user.email || '').toLowerCase();
  if (userEmail && userEmail !== emailNorm) {
    return res.status(403).json({ error: 'Email does not match your account' });
  }
  const tier = tierParam && ALLOWED_TIERS.includes(String(tierParam)) ? String(tierParam) : null;
  let profile = (await supabaseService.from('member_profiles').select('id, tier, subscription_status').eq('email', emailNorm).maybeSingle()).data;
  let byId = null;
  if (!profile) {
    byId = (await supabaseService.from('member_profiles').select('id, tier, subscription_status').eq('id', user.id).maybeSingle()).data;
    if (!byId) {
      return res.status(404).json({ error: 'Profile not found. Sign up first with this email.' });
    }
  }
  const resolved = profile || byId;
  const userId = resolved.id;
  const updates = {
    subscription_status: 'active',
    last_payment_status: 'paid',
    retry_count: 0,
    grace_until: null,
    updated_at: new Date().toISOString()
  };
  if (tier) updates.tier = tier;
  const { error: updateError } = await supabaseService
    .from('member_profiles')
    .update(updates)
    .eq('id', userId);
  if (updateError) {
    return res.status(500).json({ error: 'Failed to update access' });
  }
  const effectiveTier = updates.tier || resolved.tier || 'guest';
  await supabaseService.from('audit_logs').insert({
    actor_id: userId,
    action: 'SUBSCRIPTION_ACTIVATED',
    target_user_id: userId,
    meta: { tier: effectiveTier, source: 'claim_api' }
  }).catch(() => {});
  return res.status(200).json({ ok: true, tier: effectiveTier });
}
