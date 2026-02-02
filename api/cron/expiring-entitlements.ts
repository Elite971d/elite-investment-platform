// ============================================
// Elite Investor Academy - Expiring Entitlements Cron
// ============================================
// Vercel Cron: find entitlements expiring in 7 days and 1 day,
// send reminders via Resend or log to console if no API key.

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EXPIRY_FROM_EMAIL || 'noreply@elitesolutionsnetwork.com';

const DASHBOARD_URL = 'https://invest.elitesolutionsnetwork.com/dashboard.html';
const PRICING_URL = 'https://invest.elitesolutionsnetwork.com/index.html';
const SUPPORT_EMAIL = 'support@elitesolutionsnetwork.com';
const SUPPORT_PHONE = '214-800-9779';

async function sendReminderEmail(to: string, productKey: string, daysLeft: number): Promise<void> {
  const html = `
    <p>Your Elite Investor Academy membership (${productKey}) expires in ${daysLeft} day(s).</p>
    <p>Renew to keep access to calculators and resources.</p>
    <p><a href="${PRICING_URL}">Renew now</a> | <a href="${DASHBOARD_URL}">Dashboard</a></p>
    <p>Questions? Contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> or ${SUPPORT_PHONE}.</p>
  `;
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject: `Your Elite Investor Academy access expires in ${daysLeft} day(s)`,
          html,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('Resend error:', err);
      }
    } catch (e) {
      console.error('Send email error:', e);
    }
  } else {
    console.log(`[STUB] Would email ${to}: ${productKey} expires in ${daysLeft} day(s)`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in1 = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  const { data: expiring7, error: e7 } = await supabase
    .from('entitlements')
    .select('id, email, user_id, product_key, expires_at')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .gte('expires_at', now.toISOString())
    .lte('expires_at', in7.toISOString());

  const { data: expiring1, error: e1 } = await supabase
    .from('entitlements')
    .select('id, email, user_id, product_key, expires_at')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .gte('expires_at', now.toISOString())
    .lte('expires_at', in1.toISOString());

  if (e7 || e1) {
    return res.status(500).json({ error: 'Failed to fetch entitlements' });
  }

  const userIds = new Set<string>();
  for (const row of [...(expiring7 || []), ...(expiring1 || [])]) {
    if (row.user_id && !row.email) userIds.add(row.user_id);
  }
  let profilesByUser: Record<string, string> = {};
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', Array.from(userIds));
    for (const p of profiles || []) {
      if (p.email) profilesByUser[p.id] = p.email;
    }
  }

  const emailsSent: string[] = [];
  const seen7 = new Set<string>();
  for (const row of expiring7 || []) {
    const email = row.email || (row.user_id ? profilesByUser[row.user_id] : null) || null;
    if (!email) continue;
    const key = `${email}-7`;
    if (seen7.has(key)) continue;
    seen7.add(key);
    const exp = row.expires_at ? new Date(row.expires_at) : null;
    const daysLeft = exp ? Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : 7;
    await sendReminderEmail(email, row.product_key, Math.max(1, daysLeft));
    emailsSent.push(`${email}:7d`);
  }

  const seen1 = new Set<string>();
  for (const row of expiring1 || []) {
    const email = row.email || (row.user_id ? profilesByUser[row.user_id] : null) || null;
    if (!email) continue;
    const key = `${email}-1`;
    if (seen1.has(key)) continue;
    seen1.add(key);
    const exp = row.expires_at ? new Date(row.expires_at) : null;
    const daysLeft = exp ? Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : 1;
    await sendReminderEmail(email, row.product_key, Math.max(1, daysLeft));
    emailsSent.push(`${email}:1d`);
  }

  return res.status(200).json({
    ok: true,
    expiring_in_7_days: (expiring7 || []).length,
    expiring_in_1_day: (expiring1 || []).length,
    reminders_sent: emailsSent.length,
  });
}
