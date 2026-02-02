// ============================================
// Elite Investor Academy - Square Payment Verification API
// ============================================
// This endpoint verifies Square payments and returns customer email + link ID
// Never expose Square access token client-side

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transactionId, checkoutId } = req.query;

  if (!transactionId && !checkoutId) {
    return res.status(400).json({ error: 'Missing transactionId or checkoutId' });
  }

  const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || 'production'; // 'sandbox' or 'production'
  const SQUARE_API_URL = SQUARE_ENVIRONMENT === 'sandbox' 
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';

  if (!SQUARE_ACCESS_TOKEN) {
    console.error('SQUARE_ACCESS_TOKEN not configured');
    return res.status(500).json({ error: 'Square API not configured' });
  }

  try {
    // First, try to get payment by transaction ID
    let paymentId = transactionId as string;
    
    if (checkoutId && !transactionId) {
      // If we have checkoutId, we need to get the payment from the checkout
      // Square Payment Links create checkouts, which then create payments
      const checkoutResponse = await fetch(
        `${SQUARE_API_URL}/v2/checkouts/${checkoutId}`,
        {
          method: 'GET',
          headers: {
            'Square-Version': '2023-10-18',
            'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!checkoutResponse.ok) {
        const errorData = await checkoutResponse.json();
        throw new Error(`Square API error: ${JSON.stringify(errorData)}`);
      }

      const checkoutData = await checkoutResponse.json();
      // Extract payment ID from checkout if available
      if (checkoutData.checkout?.order_id) {
        // Get order to find payment
        const orderId = checkoutData.checkout.order_id;
        const orderResponse = await fetch(
          `${SQUARE_API_URL}/v2/orders/${orderId}`,
          {
            method: 'GET',
            headers: {
              'Square-Version': '2023-10-18',
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (orderResponse.ok) {
          const orderData = await orderResponse.json();
          // Find payment from order
          if (orderData.order?.tenders && orderData.order.tenders.length > 0) {
            paymentId = orderData.order.tenders[0].payment_id;
          }
        }
      }
    }

    // Get payment details
    const paymentResponse = await fetch(
      `${SQUARE_API_URL}/v2/payments/${paymentId}`,
      {
        method: 'GET',
        headers: {
          'Square-Version': '2023-10-18',
          'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json();
      throw new Error(`Square API error: ${JSON.stringify(errorData)}`);
    }

    const paymentData = await paymentResponse.json();
    const payment = paymentData.payment;

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Extract customer email
    // Square payments may have customer info in different places
    let email = null;
    let linkId = null;

    // Try to get email from payment metadata or customer
    if (payment.buyer_email_address) {
      email = payment.buyer_email_address;
    } else if (payment.customer_id) {
      // Fetch customer details
      try {
        const customerResponse = await fetch(
          `${SQUARE_API_URL}/v2/customers/${payment.customer_id}`,
          {
            method: 'GET',
            headers: {
              'Square-Version': '2023-10-18',
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (customerResponse.ok) {
          const customerData = await customerResponse.json();
          email = customerData.customer?.email_address;
        }
      } catch (err) {
        console.warn('Could not fetch customer:', err);
      }
    }

    // Get link ID from payment metadata or source
    // Square Payment Links store the link ID in payment metadata
    if (payment.metadata) {
      linkId = payment.metadata.link_id || payment.metadata.payment_link_id;
    }

    // Alternative: Search for payment link by payment ID
    if (!linkId) {
      try {
        // List payment links and match by payment
        const linksResponse = await fetch(
          `${SQUARE_API_URL}/v2/online-checkout/payment-links`,
          {
            method: 'GET',
            headers: {
              'Square-Version': '2023-10-18',
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (linksResponse.ok) {
          const linksData = await linksResponse.json();
          // Find link that matches this payment
          // This is a simplified approach - in production, you might store link_id in payment metadata
          // or use webhooks to track payments to links
        }
      } catch (err) {
        console.warn('Could not fetch payment links:', err);
      }
    }

    // If we still don't have linkId, try to extract from order source
    if (!linkId && payment.order_id) {
      try {
        const orderResponse = await fetch(
          `${SQUARE_API_URL}/v2/orders/${payment.order_id}`,
          {
            method: 'GET',
            headers: {
              'Square-Version': '2023-10-18',
              'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (orderResponse.ok) {
          const orderData = await orderResponse.json();
          if (orderData.order?.source) {
            // Payment link ID might be in source
            linkId = orderData.order.source.name;
          }
        }
      } catch (err) {
        console.warn('Could not fetch order:', err);
      }
    }

    if (!email) {
      return res.status(400).json({ 
        error: 'Could not retrieve customer email from payment. Please contact support.' 
      });
    }

    // Return payment data
    return res.status(200).json({
      email,
      link_id: linkId,
      transaction_id: payment.id,
      amount: payment.amount_money?.amount,
      currency: payment.amount_money?.currency
    });

  } catch (error: any) {
    console.error('Square payment verification error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to verify payment with Square' 
    });
  }
}
