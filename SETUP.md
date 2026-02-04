# Quick Setup Guide

## 1. Supabase Setup (5 minutes)

1. Go to https://app.supabase.com and create a new project
2. Wait for project to initialize
3. Go to **SQL Editor** → **New Query**
4. Copy and paste the entire contents of `supabase/schema.sql`
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Go to **Settings** → **API** and copy:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key (keep this secure!)

## 2. Update Configuration Files

### Supabase credentials (fixes "Failed to fetch")

Edit **one file** only: **`auth/config.js`**

Replace:
- `YOUR_PROJECT_ID` → Your Supabase project ID (from URL: `https://xxxxx.supabase.co`)
- `YOUR_PUBLIC_ANON_KEY` → Your Supabase anon key

All pages (login, dashboard, admin, protected, reset, magic-link, success) load this file first. If you see "Failed to fetch" on login or dashboard, the app is still using the placeholders — update `auth/config.js` with your real project URL and anon key.

### Update API Files (Optional - uses env vars)

The API files use environment variables, so they'll work once you set them in Vercel. But if you want to test locally, you can hardcode them temporarily in:
- `api/square-payment.ts`
- `api/update-payment.ts`
- `api/update-profile.ts`

## 3. Square Payment Links Setup

1. Go to Square Dashboard → **Online** → **Payment Links**
2. For each tier, create or edit a Payment Link:
   - **Starter** ($29/mo)
   - **Serious** ($79/mo)
   - **Elite** ($149/mo)
   - **Academy Starter** ($500)
   - **Academy Pro** ($999)
   - **Academy Premium** ($1499)

3. For each link, set **Redirect URL** to:
   ```
   https://invest.elitesolutionsnetwork.com/success.html
   ```
   (Use `http://localhost:3000/success.html` for local testing)

4. Copy each Payment Link ID (the last part of the URL)
5. Update `success.html` - find the `TIER_MAP` object and update with your link IDs

## 4. Square API Access Token

1. Go to Square Developer Portal: https://developer.squareup.com
2. Create an application
3. Get your **Access Token** (Production or Sandbox)
4. Keep this secure - you'll add it to Vercel environment variables

## 5. Deploy to Vercel

### Option A: Via Vercel Dashboard

1. Push your code to GitHub/GitLab/Bitbucket
2. Go to https://vercel.com
3. Click **New Project**
4. Import your repository
5. Add environment variables:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SQUARE_ACCESS_TOKEN=your_square_token
   SQUARE_ENVIRONMENT=production
   ```
6. Click **Deploy**

### Option B: Via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Set environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SQUARE_ACCESS_TOKEN
vercel env add SQUARE_ENVIRONMENT

# Deploy to production
vercel --prod
```

## 6. Configure Custom Domain

1. In Vercel project settings → **Domains**
2. Add `invest.elitesolutionsnetwork.com`
3. Follow DNS instructions to add CNAME record
4. Wait for DNS propagation (usually 5-15 minutes)

## 7. Test the Flow

1. **Test Payment**:
   - Go to your live site
   - Click a payment link
   - Complete test payment (use Square test card: `4111 1111 1111 1111`)
   - Should redirect to success page
   - Should create account and redirect to dashboard

2. **Test Login**:
   - Go to `/login.html`
   - Try logging in with the email from test payment
   - If account was created, you may need to reset password first

3. **Test Dashboard**:
   - Should show your tier
   - Should show available tools based on tier
   - Locked tools should show upgrade CTAs

## Troubleshooting

### "Payment verification failed"
- Check Square Access Token is correct
- Verify Square environment matches (sandbox vs production)
- Check Square API version in `api/square-payment.ts`

### "User not found" after payment
- Check Supabase Service Role Key is correct
- Verify RLS policies allow service role access
- Check Supabase logs for errors

### "Cannot read property 'tier'"
- User profile might not exist
- Check if profile was created in Supabase
- Verify trigger function `handle_new_user` ran

### API returns 500 error
- Check Vercel function logs
- Verify all environment variables are set
- Check API code for TypeScript errors

## Next Steps

- Set up Square webhooks for better payment tracking
- Add email notifications for new signups
- Customize calculator URLs in dashboard
- Add analytics tracking
- Set up monitoring/error tracking (Sentry, etc.)
