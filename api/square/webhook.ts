// ============================================
// Elite Investor Academy - Square Webhook Handler (Production)
// ============================================
// Single source of truth for entitlement grants. No frontend/query-param trust.
// Verifies HMAC signature, enforces idempotency, maps payment links → products.
// All secrets server-side only. Completes < 2 seconds.

import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// Vercel: Disable body parsing — Square requires RAW body for signature verification
// -----------------------------------------------------------------------------
export const config = {
  api: { bodyParser: false },
};

// -----------------------------------------------------------------------------
// Payment Link ID → Product Mapping (Square Payment Links)
// -----------------------------------------------------------------------------
const PAYMENT_LINK_TO_PRODUCT: Record<string, { product_key: string; tier: string }> = {
  '5L6KRBG7XEBJWAM3QQTKTQRM': { product_key: 'calc_starter', tier: 'starter' },
  '7YCAILWUHUOSLA4AB4FDON63': { product_key: 'calc_serious', tier: 'serious' },
  'YY2K4SD2IEAQT7WT633D4ARV': { product_key: 'calc_elite', tier: 'elite' },
  'TKG3QM5DHNVMYVO7D54YUS7G': { product_key: 'academy_starter', tier: 'academy_starter' },
  'EZ5TGODGBBAHDZP6WY7JCFW7': { product_key: 'academy_pro', tier: 'academy_pro' },
  'OYTJWURAXGUWHPHPPMNOYYKI': { product_key: 'academy_premium', tier: 'academy_premium' },
};

const TIER_RANK: Record<string, number> = {
  guest: 0,
  starter: 1,
  serious: 2,
  elite: 3,
  academy_starter: 1,
  academy_pro: 2,
  academy_premium: 3,
};

const HANDLED_EVENT_TYPES = new Set([
  'payment.created',
  'payment.updated',
  'checkout.created',
  'checkout.updated',
]);

// -----------------------------------------------------------------------------
// Raw body reader — Vercel with bodyParser:false gives us the raw stream
// Must use exact bytes for HMAC; Buffer preserves integrity
// -----------------------------------------------------------------------------
function getRawBodyBuffer(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// -----------------------------------------------------------------------------
// Square signature verification: x-square-signature = base64(HMAC_SHA256(key, body))
// Timing-safe compare to prevent timing attacks
// -----------------------------------------------------------------------------
function verifySquareSignature(
  rawBody: Buffer,
  signature: string | undefined,
  signingKey: string
): boolean {
  if (!signature || !signingKey) return false;
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(rawBody);
  const expected = hmac.digest('base64');
  const sigBuf = Buffer.from(signature, 'base64');
  const expBuf = Buffer.from(expected, 'base64');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// -----------------------------------------------------------------------------
// Extract email in priority order per spec
// -----------------------------------------------------------------------------
function extractEmail(event: Record<string, unknown>): string | null {
  const obj = event.data as Record<string, unknown> | undefined;
  if (!obj || typeof obj !== 'object') return null;
  const dataObj = obj.object as Record<string, unknown> | undefined;
  if (!dataObj || typeof dataObj !== 'object') return null;

  const payment = dataObj.payment as Record<string, unknown> | undefined;
  const checkout = dataObj.checkout as Record<string, unknown> | undefined;
  const customer = dataObj.customer as Record<string, unknown> | undefined;

  const payEmail = payment?.buyer_email_address;
  if (typeof payEmail === 'string' && payEmail) return payEmail.trim().toLowerCase();

  const checkEmail = checkout?.buyer_email_address;
  if (typeof checkEmail === 'string' && checkEmail) return checkEmail.trim().toLowerCase();

  const custEmail = customer?.email_address;
  if (typeof custEmail === 'string' && custEmail) return custEmail.trim().toLowerCase();

  return null;
}

// -----------------------------------------------------------------------------
// Extract identifiers for entitlements and audit
// -----------------------------------------------------------------------------
function extractIds(event: Record<string, unknown>): {
  payment_id?: string;
  order_id?: string;
  checkout_id?: string;
  customer_id?: string;
  payment_link_id?: string;
} {
  const obj = event.data as Record<string, unknown> | undefined;
  if (!obj || typeof obj !== 'object') return {};
  const dataObj = obj.object as Record<string, unknown> | undefined;
  if (!dataObj || typeof dataObj !== 'object') return {};

  const payment = dataObj.payment as Record<string, unknown> | undefined;
  const order = dataObj.order as Record<string, unknown> | undefined;
  const checkout = dataObj.checkout as Record<string, unknown> | undefined;
  const customer = dataObj.customer as Record<string, unknown> | undefined;

  const pid = payment?.id;
  const oid = payment?.order_id ?? order?.id;
  const cid = checkout?.id;
  const custId = payment?.customer_id ?? customer?.id;
  const linkId = checkout?.payment_link_id ?? (dataObj.payment_link_id as string | undefined);

  return {
    payment_id: typeof pid === 'string' ? pid : undefined,
    order_id: typeof oid === 'string' ? oid : undefined,
    checkout_id: typeof cid === 'string' ? cid : undefined,
    customer_id: typeof custId === 'string' ? custId : undefined,
    payment_link_id: typeof linkId === 'string' ? linkId : undefined,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Fail fast if required env vars missing
  // ---------------------------------------------------------------------------
  const signingKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const squareToken = process.env.SQUARE_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!signingKey || !squareToken || !supabaseUrl || !serviceKey) {
    console.error('Missing required env: SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_ACCESS_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Raw body + signature verification (security-critical)
  // ---------------------------------------------------------------------------
  let rawBody: Buffer;
  try {
    rawBody = await getRawBodyBuffer(req);
  } catch (err) {
    console.error('Webhook raw body read error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }

  const signature = req.headers['x-square-signature'] as string | undefined;
  if (!verifySquareSignature(rawBody, signature, signingKey)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventId = (payload.event_id ?? (payload.data as Record<string, unknown>)?.id) as string | undefined;
  const eventType = (payload.type ?? (payload.data as Record<string, unknown>)?.type ?? '') as string;

  // ---------------------------------------------------------------------------
  // Ignore non-handled events — return 200 to avoid Square retries
  // ---------------------------------------------------------------------------
  if (!HANDLED_EVENT_TYPES.has(eventType)) {
    return res.status(200).json({ received: true });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---------------------------------------------------------------------------
  // STEP 3: Idempotency — never double-process
  // ---------------------------------------------------------------------------
  if (eventId) {
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const { error: insertEvErr } = await supabase.from('webhook_events').insert({ event_id: eventId });
    if (insertEvErr) {
      const code = (insertEvErr as { code?: string }).code;
      if (code === '23505') {
        return res.status(200).json({ received: true, duplicate: true });
      }
      console.error('Webhook event insert error:', insertEvErr);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  const email = extractEmail(payload);
  const ids = extractIds(payload);
  const paymentLinkId = ids.payment_link_id;
  const mapping = paymentLinkId ? PAYMENT_LINK_TO_PRODUCT[paymentLinkId] : null;

  // ---------------------------------------------------------------------------
  // Unknown payment link — log audit, return 200, do NOT throw
  // ---------------------------------------------------------------------------
  if (!mapping) {
    await supabase.from('audit_log').insert({
      action: 'webhook_processed',
      actor_user_id: null,
      actor_email: 'square',
      target_email: email ?? null,
      metadata: {
        event_id: eventId,
        event_type: eventType,
        payment_id: ids.payment_id,
        checkout_id: ids.checkout_id,
        payment_link_id: paymentLinkId ?? null,
        product_key: null,
        tier: null,
        reason: 'unknown_payment_link',
      },
    });
    return res.status(200).json({ received: true });
  }

  const { product_key, tier } = mapping;
  const isCalculatorTier = ['starter', 'serious', 'elite'].includes(tier);
  const expiresAt = isCalculatorTier
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // ---------------------------------------------------------------------------
  // Idempotency: avoid double-insert by payment_id or checkout_id
  // (Square may send payment.created and checkout.updated separately)
  // ---------------------------------------------------------------------------
  const dedupeById = ids.payment_id ?? ids.checkout_id;
  if (dedupeById) {
    const col = ids.payment_id ? 'square_payment_id' : 'square_checkout_id';
    const { data: existingEnt } = await supabase
      .from('entitlements')
      .select('id')
      .eq(col, dedupeById)
      .maybeSingle();
    if (existingEnt) return res.status(200).json({ received: true, duplicate: true });

    const { data: existingPending } = await supabase
      .from('pending_entitlements')
      .select('id')
      .eq(col, dedupeById)
      .maybeSingle();
    if (existingPending) return res.status(200).json({ received: true, duplicate: true });
  }

  // ---------------------------------------------------------------------------
  // Find user: profiles.email (profiles created on auth signup)
  // ---------------------------------------------------------------------------
  let userId: string | null = null;
  if (email) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, tier')
      .eq('email', email)
      .maybeSingle();
    userId = profile?.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // STEP 7: Supabase writes (service role only)
  // ---------------------------------------------------------------------------
  if (userId) {
    // User exists — upsert entitlements, upgrade tier if higher
    await supabase.from('entitlements').insert({
      user_id: userId,
      email: email ?? undefined,
      product_key,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
      source: 'square',
      square_order_id: ids.order_id ?? null,
      square_payment_id: ids.payment_id ?? null,
      square_customer_id: ids.customer_id ?? null,
      square_checkout_id: ids.checkout_id ?? null,
    });

    const { data: profile } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .single();

    const currentTier = (profile?.tier as string) || 'guest';
    const currentRank = TIER_RANK[currentTier] ?? 0;
    const newRank = TIER_RANK[tier] ?? 0;
    if (newRank > currentRank) {
      await supabase
        .from('profiles')
        .update({ tier, updated_at: new Date().toISOString() })
        .eq('id', userId);
    }
  } else {
    // User does NOT exist — insert pending_entitlements
    if (email) {
      await supabase.from('pending_entitlements').insert({
        email,
        product_key,
        square_payment_id: ids.payment_id ?? null,
        square_checkout_id: ids.checkout_id ?? null,
      });
    } else {
      // Missing email — store with email=null for manual resolution (audit marks pending_email)
      await supabase.from('pending_entitlements').insert({
        email: null,
        product_key,
        square_payment_id: ids.payment_id ?? null,
        square_checkout_id: ids.checkout_id ?? null,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 8: Audit log (mandatory)
  // ---------------------------------------------------------------------------
  await writeAuditLog(supabase, {
    eventId,
    eventType,
    ids,
    product_key,
    tier,
    email,
    userId,
    pendingEmail: !email,
  });

  return res.status(200).json({ received: true });
}

function writeAuditLog(
  supabase: { from: (table: string) => { insert: (row: object) => unknown } },
  opts: {
    eventId?: string;
    eventType: string;
    ids: { payment_id?: string; checkout_id?: string; payment_link_id?: string };
    product_key: string;
    tier: string;
    email: string | null;
    userId: string | null;
    pendingEmail?: boolean;
  }
) {
  const metadata: Record<string, unknown> = {
    event_id: opts.eventId,
    event_type: opts.eventType,
    payment_id: opts.ids.payment_id,
    checkout_id: opts.ids.checkout_id,
    payment_link_id: opts.ids.payment_link_id,
    product_key: opts.product_key,
    tier: opts.tier,
  };
  if (opts.pendingEmail) metadata.pending_email = true;

  return supabase.from('audit_log').insert({
    action: 'webhook_processed',
    actor_user_id: null,
    actor_email: 'square',
    target_email: opts.email,
    metadata,
  } as object);
}
