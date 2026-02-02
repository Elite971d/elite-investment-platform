// ============================================
// Elite Investor Academy - Admin Tier Override
// ============================================
// POST: target_email, new_tier, reason. Verifies caller is admin, updates profile, writes audit_log.

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { target_email, new_tier, reason } = req.body || {};
  if (!target_email || !new_tier) {
    return res.status(400).json({ error: 'Missing target_email or new_tier' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabaseAnon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(
    authHeader.slice(7)
  );
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (adminProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { data: targetProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email, tier')
    .eq('email', target_email.toLowerCase())
    .single();

  if (fetchError || !targetProfile) {
    return res.status(404).json({ error: 'User not found' });
  }

  const oldTier = targetProfile.tier || 'guest';
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ tier: new_tier, updated_at: new Date().toISOString() })
    .eq('id', targetProfile.id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  await supabase.from('audit_log').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action: 'tier_override',
    target_user_id: targetProfile.id,
    target_email: targetProfile.email,
    metadata: { old_tier: oldTier, new_tier: new_tier, reason: reason || null },
  });

  return res.status(200).json({
    message: 'Tier updated',
    old_tier: oldTier,
    new_tier: new_tier,
  });
}
