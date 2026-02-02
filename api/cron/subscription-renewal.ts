// ============================================
// Elite Investor Academy - Subscription Renewal Cron (Monthly)
// ============================================
// Verify last successful payment / entitlement; if > 30 days: downgrade tier,
// flag account, send renewal email. Square Payment Links don't support subscriptions
// so we use this workaround.

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EXPIRY_FROM_EMAIL || 'noreply@elitesolutionsnetwork.com';
const DASHBOARD_URL = 'https://invest.elitesolutionsnetwork.com/dashboard.html';
const PRICING_URL = 'https://invest.elitesolutionsnetwork.com/index.html';
const SUPPORT_EMAIL = 'support@elitesolutionsnetwork.com';
const SUPPORT_PHONE = '214-800-9779';

const RENEWAL_LINKS: Record<string, string> = {
  starter: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/5L6KRBG7XEBJWAM3QQTKTQRM',
  serious: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/7YCAILWUHUOSLA4AB4FDON63',
  elite: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/YY2K4SD2IEAQT7WT633D4ARV',
};

async function sendRenewalEmail(
  to: string,
  previousTier: string,
  paymentLink: string
): Promise<void> {
  const html = `
    <p>Your Elite Investor Academy membership has expired.</p>
    <p>Renew to restore access to calculators and resources.</p>
    <p><a href="${paymentLink}">Renew now (${previousTier})</a></p>
    <p><a href="${DASHBOARD_URL}">Dashboard</a> | <a href="${PRICING_URL}">View plans</a></p>
    <p>Questions? Contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> or ${SUPPORT_PHONE}.</p>
  `;
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject: 'Elite Investor Academy – Renew your membership',
          html,
        }),
      });
    } catch (e) {
      console.error('Renewal email error:', e);
    }
  } else {
    console.log(`[STUB] Renewal email to ${to} (${previousTier})`);
  }
}

async function sendExpiredAccessEmail(to: string, productKey: string): Promise<void> {
  const html = `
    <p>Your Elite Investor Academy access has expired.</p>
    <p>Renew to continue using calculators and resources.</p>
    <p><a href="${PRICING_URL}">Renew now</a></p>
    <p><a href="${DASHBOARD_URL}">Dashboard</a></p>
    <p>Support: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> | ${SUPPORT_PHONE}</p>
  `;
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject: 'Elite Investor Academy – Your access has expired',
          html,
        }),
      });
    } catch (e) {
      console.error('Expired email error:', e);
    }
  } else {
    console.log(`[STUB] Expired access email to ${to}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
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
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Calculator tiers that expire (monthly)
  const calcTiers = ['starter', 'serious', 'elite'];
  const calcProductKeys = ['calc_starter', 'calc_serious', 'calc_elite'];

  // 1) Find entitlements that have expired (expires_at < now), mark status = 'expired'
  const { data: expiredEntitlements } = await supabase
    .from('entitlements')
    .select('id, user_id, email, product_key, expires_at')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lt('expires_at', now.toISOString());

  const userIdsFromExpired = [...new Set((expiredEntitlements || []).map((e) => e.user_id).filter(Boolean))] as string[];
  let profilesByUserId: Record<string, { email: string }> = {};
  if (userIdsFromExpired.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIdsFromExpired);
    for (const p of profiles || []) {
      if (p.email) profilesByUserId[p.id] = { email: p.email };
    }
  }

  const expiredEmailsSent = new Set<string>();
  for (const ent of expiredEntitlements || []) {
    await supabase.from('entitlements').update({ status: 'expired' }).eq('id', ent.id);
    const email = ent.email || (ent.user_id ? profilesByUserId[ent.user_id]?.email : null) || null;
    if (email && !expiredEmailsSent.has(email)) {
      expiredEmailsSent.add(email);
      await sendExpiredAccessEmail(email, ent.product_key);
    }
  }

  // 2) Users with tier in (starter, serious, elite) who have NO active entitlement and
  //    their latest entitlement expired more than 30 days ago → downgrade to guest, send renewal email
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, email, tier')
    .in('tier', ['starter', 'serious', 'elite']);

  const downgraded: string[] = [];
  const renewalEmailsSent: string[] = [];

  for (const profile of allProfiles || []) {
    const { data: activeEntitlements } = await supabase
      .from('entitlements')
      .select('id')
      .eq('user_id', profile.id)
      .eq('status', 'active');
    if ((activeEntitlements?.length ?? 0) > 0) continue;

    const { data: lastEntitlement } = await supabase
      .from('entitlements')
      .select('expires_at')
      .eq('user_id', profile.id)
      .in('product_key', calcProductKeys)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastExpiry = lastEntitlement?.expires_at ? new Date(lastEntitlement.expires_at) : null;
    if (!lastExpiry || lastExpiry >= thirtyDaysAgo) continue;

    await supabase
      .from('profiles')
      .update({ tier: 'guest', updated_at: now.toISOString() })
      .eq('id', profile.id);
    downgraded.push(profile.email);

    if (profile.email && !renewalEmailsSent.includes(profile.email)) {
      renewalEmailsSent.push(profile.email);
      const paymentLink = RENEWAL_LINKS[profile.tier] || RENEWAL_LINKS.starter;
      await sendRenewalEmail(profile.email, profile.tier, paymentLink);
    }

    await supabase.from('audit_log').insert({
      action: 'subscription_renewal_downgrade',
      actor_user_id: null,
      actor_email: 'cron',
      target_email: profile.email,
      metadata: { previous_tier: profile.tier, reason: 'no_payment_30_days' },
    });
  }

  return res.status(200).json({
    ok: true,
    entitlements_marked_expired: (expiredEntitlements || []).length,
    downgraded_count: downgraded.length,
    renewal_emails_sent: renewalEmailsSent.length,
  });
}
