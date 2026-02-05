// ============================================
// Square Payment Verify (Vercel Serverless)
// ============================================
// GET ?orderId= | ?checkoutId= | ?transactionId= [&tier= for fallback]
// Returns { email?, tier?, error? }. Square = billing source of truth; tier from order or query.

const SQUARE_TIER_MAP = {
  '5L6KRBG7XEBJWAM3QQTKTQRM': 'starter',
  '7YCAILWUHUOSLA4AB4FDON63': 'serious',
  'YY2K4SD2IEAQT7WT633D4ARV': 'elite',
  'TKG3QM5DHNVMYVO7D54YUS7G': 'academy_starter',
  'EZ5TGODGBBAHDZP6WY7JCFW7': 'academy_pro',
  'OYTJWURAXGUWHPHPPMNOYYKI': 'academy_premium'
};

function getSquareBaseUrl() {
  const env = process.env.SQUARE_ENV || 'sandbox';
  return env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

async function getOrderFromSquare(orderId) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return null;
  const base = getSquareBaseUrl();
  const res = await fetch(`${base}/v2/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.order || null;
}

async function searchOrdersByCheckout(checkoutId) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return null;
  const base = getSquareBaseUrl();
  const body = {
    query: {
      filter: {
        customer_filter: {},
        state_filter: { states: ['COMPLETED'] }
      },
      sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' }
    },
    limit: 5
  };
  const res = await fetch(`${base}/v2/orders/search`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) return null;
  const data = await res.json();
  const orders = data.orders || [];
  return orders.find(o => (o.metadata && o.metadata.checkout_id === checkoutId)) || orders[0] || null;
}

function emailFromOrder(order) {
  if (!order) return null;
  const fulfillments = order.fulfillments || [];
  for (const f of fulfillments) {
    if (f.shipment_details && f.shipment_details.recipient && f.shipment_details.recipient.email) {
      return f.shipment_details.recipient.email;
    }
  }
  if (order.metadata && order.metadata.buyer_email) return order.metadata.buyer_email;
  return null;
}

function tierFromOrder(order) {
  if (!order || !order.line_items) return null;
  for (const item of order.line_items) {
    if (item.catalog_object_id) {
      const tier = SQUARE_TIER_MAP[item.catalog_object_id];
      if (tier) return tier;
    }
  }
  if (order.metadata && order.metadata.tier) return order.metadata.tier;
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { orderId, checkoutId, transactionId, tier: tierFallback, email: emailFallback } = req.query || {};
  let order = null;
  if (orderId) {
    order = await getOrderFromSquare(orderId);
  } else if (checkoutId) {
    order = await searchOrdersByCheckout(checkoutId);
  }
  const email = emailFromOrder(order) || emailFallback || null;
  const tier = tierFromOrder(order) || tierFallback || null;
  if (!email && !tier) {
    return res.status(200).json({
      email: null,
      tier: null,
      error: process.env.SQUARE_ACCESS_TOKEN ? 'Order not found or missing email' : 'Configure SQUARE_ACCESS_TOKEN or pass email/tier for testing'
    });
  }
  return res.status(200).json({ email: email || undefined, tier: tier || undefined });
}
