// ============================================
// Elite Investor Academy - Create User API
// ============================================
// This endpoint creates a user account after payment
// Uses service role key for admin access

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, tier } = req.body;

  if (!email || !tier) {
    return res.status(400).json({ error: 'Missing required fields: email, tier' });
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

    // Generate password if not provided
    const userPassword = password || Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!';

    // Create user account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true // Auto-confirm email
    });

    if (authError) {
      // User might already exist
      if (authError.message.includes('already registered')) {
        // Get existing user
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === email);
        
        if (existingUser) {
          // Update profile for existing user
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: existingUser.id,
              email,
              tier,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'id'
            })
            .select()
            .single();

          if (profileError) {
            throw profileError;
          }

          return res.status(200).json({ 
            message: 'User already exists, profile updated',
            user_id: existingUser.id,
            email: existingUser.email
          });
        }
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user');
    }

    // Create profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email,
        tier,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (profileError) {
      // Delete user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return res.status(200).json({ 
      message: 'User created successfully',
      user_id: authData.user.id,
      email: authData.user.email
    });

  } catch (error: any) {
    console.error('User creation error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to create user' 
    });
  }
}
