// ============================================
// Elite Investor Academy - Claim Pending Entitlements
// ============================================
// Logged-in user calls with their email; attaches pending entitlements (from Square
// webhook) to their user_id and updates profile tier. Uses Supabase service key.

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const TIER_RANK: Record<string, number> = {
  guest: 0,
  starter: 1,
  serious: 2,
  elite: 3,
  academy_starter: 1,
  academy_pro: 2,
  academy_premium: 3,
};

function highestTierFromEntitlements(entitlements: { product_key: string }[]): string {
  const tierFromProduct: Record<string, string> = {
    calc_starter: 'starter',
    calc_serious: 'serious',
    calc_elite: 'elite',
    academy_starter: 'academy_starter',
    academy_pro: 'academy_pro',
    academy_premium: 'academy_premium',
  };
  let best = 'guest';
  let bestRank = 0;
  for (const e of entitlements) {
    const tier = tierFromProduct[e.product_key] || e.product_key;
    const rank = TIER_RANK[tier] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = tier;
    }
  }
  return best;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email =
    (req.method === 'GET' ? req.query.email : req.body?.email) as string | undefined;
  const authHeader = req.headers.authorization;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve user: require Bearer token (Supabase JWT) so only the logged-in user can claim
  let userId: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user && user.email?.toLowerCase() === email.toLowerCase()) {
      userId = user.id;
    }
  }
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized or email does not match session' });
  }

  const emailLower = email.toLowerCase();

  // 1) Entitlements with user_id=null (legacy flow)
  const { data: pendingEnt, error: fetchEntError } = await supabase
    .from('entitlements')
    .select('*')
    .eq('email', emailLower)
    .is('user_id', null)
    .in('status', ['active']);

  if (fetchEntError) {
    console.error('Claim fetch entitlements error:', fetchEntError);
    return res.status(500).json({ error: 'Failed to load pending entitlements' });
  }

  // 2) Pending_entitlements (from Square webhook when user did not exist)
  const { data: pendingTable, error: fetchPendingError } = await supabase
    .from('pending_entitlements')
    .select('*')
    .eq('email', emailLower);

  if (fetchPendingError) {
    console.error('Claim fetch pending_entitlements error:', fetchPendingError);
    return res.status(500).json({ error: 'Failed to load pending entitlements' });
  }

  const fromEntitlements = pendingEnt ?? [];
  const fromPending = pendingTable ?? [];

  if (fromEntitlements.length === 0 && fromPending.length === 0) {
    return res.status(200).json({
      claimed: 0,
      message: 'No pending entitlements for this email',
      tier: null,
    });
  }

  // Attach entitlements (user_id null) to user
  if (fromEntitlements.length > 0) {
    const ids = fromEntitlements.map((r) => r.id);
    const { error: updateError } = await supabase
      .from('entitlements')
      .update({ user_id: userId })
      .in('id', ids);

    if (updateError) {
      console.error('Claim update error:', updateError);
      return res.status(500).json({ error: 'Failed to attach entitlements' });
    }
  }

  // Migrate pending_entitlements → entitlements, then delete
  const isCalculatorTier = (pk: string) =>
    ['calc_starter', 'calc_serious', 'calc_elite'].includes(pk);
  for (const p of fromPending) {
    const expiresAt = isCalculatorTier(p.product_key)
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    await supabase.from('entitlements').insert({
      user_id: userId,
      email: emailLower,
      product_key: p.product_key,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
      source: 'square',
      square_payment_id: p.square_payment_id ?? null,
      square_checkout_id: p.square_checkout_id ?? null,
    });
    await supabase.from('pending_entitlements').delete().eq('id', p.id);
  }

  const allClaimed = [...fromEntitlements, ...fromPending];
  const newTier = highestTierFromEntitlements(allClaimed);
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', userId)
    .single();

  const currentTier = profile?.tier || 'guest';
  const currentRank = TIER_RANK[currentTier] ?? 0;
  const newRank = TIER_RANK[newTier] ?? 0;
  const tierToSet = newRank >= currentRank ? newTier : currentTier;

  await supabase
    .from('profiles')
    .update({ tier: tierToSet, updated_at: new Date().toISOString() })
    .eq('id', userId);

  await supabase.from('audit_log').insert({
    action: 'entitlement_claim',
    actor_user_id: userId,
    actor_email: emailLower,
    target_user_id: userId,
    target_email: emailLower,
    metadata: {
      claimed_count: allClaimed.length,
      product_keys: allClaimed.map((e) => e.product_key),
      tier_set: tierToSet,
    },
  });

  return res.status(200).json({
    claimed: allClaimed.length,
    tier: tierToSet,
    message: 'Entitlements claimed successfully',
  });
}
