// ============================================
// Elite Investor Academy - Admin Grant Entitlement
// ============================================
// POST: target_email, product_key, expires_at (optional). Verifies admin, upserts entitlement, writes audit.

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PRODUCT_KEYS = [
  'calc_starter', 'calc_serious', 'calc_elite',
  'academy_starter', 'academy_pro', 'academy_premium',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { target_email, product_key, expires_at } = req.body || {};
  if (!target_email || !product_key) {
    return res.status(400).json({ error: 'Missing target_email or product_key' });
  }
  if (!PRODUCT_KEYS.includes(product_key)) {
    return res.status(400).json({ error: 'Invalid product_key' });
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

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', target_email.toLowerCase())
    .single();

  const userId = targetProfile?.id ?? null;
  const emailLower = target_email.toLowerCase();

  await supabase.from('entitlements').insert({
    user_id: userId,
    email: userId ? null : emailLower,
    product_key,
    status: 'active',
    started_at: new Date().toISOString(),
    expires_at: expires_at || null,
    source: 'admin_grant',
  });

  await supabase.from('audit_log').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action: 'entitlement_grant',
    target_user_id: userId,
    target_email: emailLower,
    metadata: { product_key, expires_at: expires_at || null },
  });

  return res.status(200).json({
    message: 'Entitlement granted',
    product_key,
    target_email: emailLower,
  });
}