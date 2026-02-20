// ============================================
// Square Webhook Handler (Vercel Serverless)
// ============================================
// Extends subscription handling. Does NOT replace existing logic.
// Maps Square plan/catalog IDs → product_key (tier_* | tool_* | feature_whitelabel).
// On subscription active: insert/update entitlement.
// On cancellation/expiration: set status = 'expired'.

const { createClient } = require('@supabase/supabase-js');

/**
 * Square catalog/plan/checkout ID → product_key mapping.
 * Tiers, tools, and feature_whitelabel.
 * Add new Square link IDs here as you create them in Square.
 */
const SQUARE_TO_PRODUCT_KEY = {
  // Tiers (existing)
  '5L6KRBG7XEBJWAM3QQTKTQRM': 'tier_starter',
  '7YCAILWUHUOSLA4AB4FDON63': 'tier_serious',
  'YY2K4SD2IEAQT7WT633D4ARV': 'tier_elite',
  'TKG3QM5DHNVMYVO7D54YUS7G': 'tier_academy_starter',
  'EZ5TGODGBBAHDZP6WY7JCFW7': 'tier_academy_pro',
  'OYTJWURAXGUWHPHPPMNOYYKI': 'tier_academy_premium',
  // Tools (add placeholder IDs; replace with actual Square payment link IDs)
  // tool_brrrr, tool_commercial, tool_dealcheck, tool_buybox, tool_offer,
  // tool_profitsplit, tool_pwt, tool_rehabtracker, tool_wholesale
  // Example: 'SQUARE_LINK_ID_TOOL_OFFER': 'tool_offer',
  // Features
  // 'SQUARE_LINK_ID_WHITELABEL': 'feature_whitelabel',
};

/** Infer product type from product_key */
function productKeyToType(productKey) {
  if (!productKey) return null;
  if (productKey.startsWith('tier_')) return 'tier';
  if (productKey.startsWith('tool_')) return 'tool';
  if (productKey.startsWith('feature_')) return 'feature';
  return null;
}

/** Map legacy tier names to product_key for backward compat */
const TIER_TO_PRODUCT_KEY = {
  starter: 'tier_starter',
  serious: 'tier_serious',
  elite: 'tier_elite',
  academy_starter: 'tier_academy_starter',
  academy_pro: 'tier_academy_pro',
  academy_premium: 'tier_academy_premium'
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Extract product_key from Square order (line items catalog_object_id or metadata)
 */
function productKeyFromOrder(order) {
  if (!order?.line_items) return null;
  for (const item of order.line_items) {
    const pk = SQUARE_TO_PRODUCT_KEY[item.catalog_object_id];
    if (pk) return pk;
  }
  if (order.metadata?.product_key) return order.metadata.product_key;
  const tier = order.metadata?.tier;
  if (tier && TIER_TO_PRODUCT_KEY[tier]) return TIER_TO_PRODUCT_KEY[tier];
  return null;
}

/**
 * Extract email from order
 */
function emailFromOrder(order) {
  if (!order) return null;
  const fulfillments = order.fulfillments || [];
  for (const f of fulfillments) {
    if (f.shipment_details?.recipient?.email) return f.shipment_details.recipient.email;
  }
  return order.metadata?.buyer_email || order.metadata?.email || null;
}

/**
 * Handle subscription active: upsert entitlement
 */
async function handleSubscriptionActive(supabase, { userId, email, productKey, orderId, subscriptionId, customerId, checkoutId }) {
  if (!productKey) return;
  const type = productKeyToType(productKey);
  const now = new Date().toISOString();

  const row = {
    user_id: userId || null,
    email: email || null,
    product_key: productKey,
    type: type,
    status: 'active',
    started_at: now,
    expires_at: null,
    source: 'square_webhook',
    square_order_id: orderId || null,
    square_customer_id: customerId || null,
    square_checkout_id: checkoutId || null,
    updated_at: now
  };

  if (userId) {
    const { data: existing } = await supabase
      .from('entitlements')
      .select('id')
      .eq('user_id', userId)
      .eq('product_key', productKey)
      .maybeSingle();

    if (existing) {
      await supabase.from('entitlements').update({
        status: 'active',
        started_at: row.started_at,
        expires_at: null,
        source: row.source,
        square_order_id: row.square_order_id,
        square_customer_id: row.square_customer_id,
        square_checkout_id: row.square_checkout_id
      }).eq('id', existing.id);
    } else {
      await supabase.from('entitlements').insert(row);
    }
  } else if (email) {
    await supabase.from('pending_entitlements').insert({
      email: email.toLowerCase(),
      product_key: productKey,
      square_payment_id: orderId,
      square_checkout_id: checkoutId
    }).catch(() => {});
  }
}

/**
 * Handle subscription canceled/expired: set status = 'expired'
 */
async function handleSubscriptionExpired(supabase, { userId, email, productKey }) {
  if (!productKey) return;
  const now = new Date().toISOString();

  if (userId) {
    await supabase.from('entitlements')
      .update({ status: 'expired', expires_at: now })
      .eq('user_id', userId)
      .eq('product_key', productKey)
      .eq('status', 'active');
  }
  if (email) {
    await supabase.from('entitlements')
      .update({ status: 'expired', expires_at: now })
      .eq('email', email.toLowerCase())
      .eq('product_key', productKey)
      .eq('status', 'active');
  }
}

/**
 * Resolve user_id from email
 */
async function resolveUserIdFromEmail(supabase, email) {
  if (!email) return null;
  const { data } = await supabase
    .from('member_profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  return data?.id || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Server configuration error' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventId = body.event_id || body.id || body.eventId;
  if (!eventId) {
    return res.status(200).json({ ok: true, message: 'No event_id, skipping' });
  }

  // Idempotency
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_id', String(eventId))
    .maybeSingle();
  if (existing) {
    return res.status(200).json({ ok: true, message: 'Already processed' });
  }

  await supabase.from('webhook_events').insert({ event_id: String(eventId) }).catch(() => {});

  const type = body.type || body.event_type || '';
  const data = body.data || body;

  let productKey = null;
  let email = null;
  let userId = null;
  let orderId = null;
  let subscriptionId = null;
  let customerId = null;
  let checkoutId = null;

  if (type.includes('order') || type === 'order.paid' || type === 'payment.completed') {
    const order = data.object?.order || data.order || data;
    productKey = productKeyFromOrder(order);
    email = emailFromOrder(order);
    orderId = order?.id || data.object?.id;
    checkoutId = order?.metadata?.checkout_id || data.checkout_id;
    if (email) userId = await resolveUserIdFromEmail(supabase, email);
  } else if (type.includes('subscription')) {
    const sub = data.object?.subscription || data.subscription || data;
    productKey = sub.plan_id ? SQUARE_TO_PRODUCT_KEY[sub.plan_id] : null;
    if (!productKey && sub.catalog_object_id) productKey = SQUARE_TO_PRODUCT_KEY[sub.catalog_object_id];
    subscriptionId = sub.id;
    customerId = sub.customer_id;
    const cust = sub.customer || data.customer;
    if (cust?.email) email = cust.email;
    if (email) userId = await resolveUserIdFromEmail(supabase, email);
    if (type.includes('deactivated') || type.includes('canceled') || type.includes('expired')) {
      if (productKey) await handleSubscriptionExpired(supabase, { userId, email, productKey });
      return res.status(200).json({ ok: true });
    }
  }

  if (productKey) {
    await handleSubscriptionActive(supabase, {
      userId,
      email,
      productKey,
      orderId,
      subscriptionId,
      customerId,
      checkoutId
    });
    // Tier subscriptions: also update member_profiles (preserve existing claim behavior)
    const tierFromKey = productKey.startsWith('tier_') ? productKey.replace('tier_', '') : null;
    if (tierFromKey && ['starter', 'serious', 'elite', 'academy_starter', 'academy_pro', 'academy_premium'].includes(tierFromKey)) {
      const uid = userId || await resolveUserIdFromEmail(supabase, email);
      if (uid) {
        await supabase.from('member_profiles').update({
          subscription_status: 'active',
          last_payment_status: 'paid',
          retry_count: 0,
          grace_until: null,
          tier: tierFromKey,
          square_customer_id: customerId || undefined,
          square_subscription_id: subscriptionId || undefined,
          updated_at: new Date().toISOString()
        }).eq('id', uid).catch(() => {});
      }
    }
  }

  return res.status(200).json({ ok: true });
};
