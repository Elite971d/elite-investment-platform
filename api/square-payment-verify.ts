// ============================================
// Elite Investor Academy - Square Payment Verify (Post-Payment Success)
// ============================================
// GET /api/square-payment-verify?transactionId=... or ?checkoutId=...
// Verifies payment with Square, returns email + link_id (and tier). Used by success.html
// to confirm payment and sync tier via claim; supports magic-link auto-login flow.

import { VercelRequest, VercelResponse } from '@vercel/node';

const PAYMENT_LINK_TO_TIER: Record<string, string> = {
  '5L6KRBG7XEBJWAM3QQTKTQRM': 'starter',
  '7YCAILWUHUOSLA4AB4FDON63': 'serious',
  'YY2K4SD2IEAQT7WT633D4ARV': 'elite',
  'TKG3QM5DHNVMYVO7D54YUS7G': 'academy_starter',
  'EZ5TGODGBBAHDZP6WY7JCFW7': 'academy_pro',
  'OYTJWURAXGUWHPHPPMNOYYKI': 'academy_premium',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const transactionId = req.query.transactionId as string | undefined;
  const checkoutId = req.query.checkoutId as string | undefined;

  if (!transactionId && !checkoutId) {
    return res.status(400).json({ error: 'Missing transactionId or checkoutId' });
  }

  const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || 'production';
  const SQUARE_API_URL =
    SQUARE_ENVIRONMENT === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

  if (!SQUARE_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Square API not configured' });
  }

  try {
    let paymentId = transactionId;

    if (checkoutId && !transactionId) {
      const checkoutRes = await fetch(
        `${SQUARE_API_URL}/v2/checkouts/${checkoutId}`,
        {
          method: 'GET',
          headers: {
            'Square-Version': '2023-10-18',
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!checkoutRes.ok) {
        const err = await checkoutRes.json();
        throw new Error(`Square checkout: ${JSON.stringify(err)}`);
      }
      const checkoutData = await checkoutRes.json();
      const orderId = checkoutData.checkout?.order_id;
      if (orderId) {
        const orderRes = await fetch(
          `${SQUARE_API_URL}/v2/orders/${orderId}`,
          {
            method: 'GET',
            headers: {
              'Square-Version': '2023-10-18',
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          if (orderData.order?.tenders?.length > 0) {
            paymentId = orderData.order.tenders[0].payment_id;
          }
        }
      }
    }

    if (!paymentId) {
      return res.status(400).json({ error: 'Could not resolve payment from checkout' });
    }

    const paymentRes = await fetch(
      `${SQUARE_API_URL}/v2/payments/${paymentId}`,
      {
        method: 'GET',
        headers: {
          'Square-Version': '2023-10-18',
          Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!paymentRes.ok) {
      const err = await paymentRes.json();
      throw new Error(`Square payment: ${JSON.stringify(err)}`);
    }

    const paymentData = await paymentRes.json();
    const payment = paymentData.payment;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    let email: string | null =
      (payment.buyer_email_address as string) || null;
    if (!email && payment.customer_id) {
      try {
        const custRes = await fetch(
          `${SQUARE_API_URL}/v2/customers/${payment.customer_id}`,
          {
            method: 'GET',
            headers: {
              'Square-Version': '2023-10-18',
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (custRes.ok) {
          const custData = await custRes.json();
          email = custData.customer?.email_address || null;
        }
      } catch {
        // ignore
      }
    }

    let linkId: string | null = null;
    if (payment.metadata) {
      linkId =
        (payment.metadata as Record<string, string>).link_id ||
        (payment.metadata as Record<string, string>).payment_link_id ||
        null;
    }
    if (!linkId && payment.order_id) {
      try {
        const orderRes = await fetch(
          `${SQUARE_API_URL}/v2/orders/${payment.order_id}`,
          {
            method: 'GET',
            headers: {
              'Square-Version': '2023-10-18',
              Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          linkId = (orderData.order?.source as { name?: string })?.name || null;
        }
      } catch {
        // ignore
      }
    }

    const tier = linkId ? PAYMENT_LINK_TO_TIER[linkId] || null : null;

    if (!email) {
      return res.status(400).json({
        error: 'Could not retrieve customer email from payment. Please contact support.',
      });
    }

    return res.status(200).json({
      email: email.trim().toLowerCase(),
      link_id: linkId,
      tier,
      transaction_id: payment.id,
      amount: payment.amount_money?.amount,
      currency: payment.amount_money?.currency,
    });
  } catch (error: unknown) {
    console.error('Square payment verify error:', error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to verify payment with Square',
    });
  }
}
