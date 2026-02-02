// ============================================
// Elite Investor Academy - Update Payment Record API
// ============================================
// This endpoint creates/updates payment records in Supabase
// Uses service role key for admin access

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id, email, tier, square_transaction_id, square_link_id, amount_cents } = req.body;

  if (!email || !tier || !square_transaction_id) {
    return res.status(400).json({ error: 'Missing required fields: email, tier, square_transaction_id' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase credentials not configured');
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Insert payment record
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: user_id || null,
        email,
        tier,
        square_transaction_id,
        square_link_id: square_link_id || null,
        amount_cents: amount_cents || null
      })
      .select()
      .single();

    if (error) {
      // If duplicate transaction, that's okay
      if (error.code === '23505') { // Unique violation
        return res.status(200).json({ 
          message: 'Payment record already exists',
          data: null 
        });
      }
      throw error;
    }

    return res.status(200).json({ 
      message: 'Payment record created',
      data 
    });

  } catch (error: any) {
    console.error('Payment record creation error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to create payment record' 
    });
  }
}
