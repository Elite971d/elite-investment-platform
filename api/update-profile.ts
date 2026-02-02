// ============================================
// Elite Investor Academy - Update Profile API
// ============================================
// This endpoint updates user profiles in Supabase
// Uses service role key for admin access

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id, email, tier } = req.body;

  if (!user_id || !email || !tier) {
    return res.status(400).json({ error: 'Missing required fields: user_id, email, tier' });
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

    // Upsert profile (create if doesn't exist, update if it does)
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: user_id,
        email,
        tier,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({ 
      message: 'Profile updated',
      data 
    });

  } catch (error: any) {
    console.error('Profile update error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to update profile' 
    });
  }
}
