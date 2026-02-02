# Elite Investor Academy - Production Platform

Production-ready investor membership platform with real authentication, tier gating, and Square payment integration.

## 🏗️ Architecture

- **Frontend**: HTML, CSS, Vanilla JavaScript (no build step)
- **Backend/Auth/DB**: Supabase
- **Payments**: Square Payment Links
- **Hosting**: Vercel
- **Domain**: invest.elitesolutionsnetwork.com

## 📋 Prerequisites

1. **Supabase Account**
   - Create a new project at https://app.supabase.com
   - Get your project URL and API keys

2. **Square Account**
   - Create Payment Links for each tier
   - Get your Square Access Token
   - Configure redirect URLs to: `https://invest.elitesolutionsnetwork.com/success.html`

3. **Vercel Account**
   - Connect your Git repository
   - Configure environment variables

## 🚀 Setup Instructions

### Step 1: Supabase Setup

1. Create a new Supabase project
2. Go to **SQL Editor** → **New Query**
3. Run schema in order:
   - Run `supabase/complete-schema.sql` (profiles, payments, RLS, triggers)
   - Run `supabase/migrations/001_membership_automation.sql` (entitlements, audit_log, webhook_events, updated RLS)
   - Run `supabase/migrations/002_pending_entitlements.sql` (pending_entitlements)
   - Run `supabase/migrations/003_usage_teams.sql` (usage_logs, teams, team_members, RLS)
4. Set your first admin user:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
   ```
5. Get your credentials:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon Key (public)
   - Service Role Key (secret - keep secure)

### Step 2: Square Payment Links

Create Payment Links in Square Dashboard for each tier:

- **Starter** ($29/mo): Link ID → `starter` tier
- **Serious** ($79/mo): Link ID → `serious` tier
- **Elite** ($149/mo): Link ID → `elite` tier
- **Academy Starter** ($500): Link ID → `academy_starter` tier
- **Academy Pro** ($999): Link ID → `academy_pro` tier
- **Academy Premium** ($1499): Link ID → `academy_premium` tier

**Important**: Set each Payment Link's redirect URL to:
```
https://invest.elitesolutionsnetwork.com/success.html
```

### Step 3: Update Configuration

1. **Update `js/config.js`**:
   - Replace `YOUR_PROJECT_ID` with your Supabase project ID
   - Replace `YOUR_PUBLIC_ANON_KEY` with your Supabase anon key
   - Update Square Payment Link IDs in `tierMap` if different

2. **Update HTML files** (login.html, dashboard.html, etc.):
   - Replace `YOUR_PROJECT_ID` with your Supabase project ID
   - Replace `YOUR_PUBLIC_ANON_KEY` with your Supabase anon key

### Step 4: Vercel Deployment

1. **Install Vercel CLI** (optional):
   ```bash
   npm i -g vercel
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel
   ```

3. **Set Environment Variables** in Vercel Dashboard:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (secret)
   - `SQUARE_ACCESS_TOKEN` - Your Square access token (secret)
   - `SQUARE_ENVIRONMENT` - `production` or `sandbox`
   - `SQUARE_WEBHOOK_SIGNATURE_KEY` - Square webhook signature key (from Square Developer Dashboard → Webhooks)
   - `CRON_SECRET` - (optional) Secret for cron endpoint; set and use as Bearer token when invoking `/api/cron/expiring-entitlements`
   - `RESEND_API_KEY` - (optional) For expiry reminder emails; if unset, cron logs to console only
   - `EXPIRY_FROM_EMAIL` - (optional) From address for expiry emails (e.g. `noreply@yourdomain.com`)

4. **Configure Custom Domain**:
   - Add `invest.elitesolutionsnetwork.com` in Vercel project settings
   - Update DNS records as instructed

### Step 5: Square Payment Links & Webhook

- Set each Payment Link **redirect URL** to:
  ```
  https://invest.elitesolutionsnetwork.com/success.html?source=square
  ```
- In Square Developer Dashboard → **Webhooks**, subscribe to payment/checkout/order events and set **Notification URL** to:
  ```
  https://invest.elitesolutionsnetwork.com/api/square/webhook
  ```
  Use the provided **Signature Key** as `SQUARE_WEBHOOK_SIGNATURE_KEY` in Vercel.

## 📁 Project Structure

```
.
├── api/                    # Serverless API functions
│   ├── square/webhook.ts   # Square webhook (signature verify, tier sync, audit)
│   ├── square-payment-verify.ts  # Post-payment verify (success page, tier + email)
│   ├── members/claim.ts    # Claim pending entitlements after login
│   ├── admin/tier-override.ts   # Admin tier override + audit
│   ├── admin/grant-entitlement.ts # Admin grant entitlement + audit
│   ├── cron/expiring-entitlements.ts # Daily cron, expiry reminders (Resend)
│   ├── cron/subscription-renewal.ts # Monthly: downgrade >30d, renewal emails
│   ├── square-payment.ts   # Verify Square payments (legacy)
│   ├── create-user.ts      # Create user accounts (legacy)
│   ├── update-payment.ts   # Create payment records (legacy)
│   └── update-profile.ts   # Update user profiles (legacy)
├── dealcheck/             # DealCheck subdomain files
│   ├── protected.html     # Calculator wrapper (SSO)
│   ├── auth-guard.js      # Session + tier check, redirect to pricing
│   ├── supabase.js        # Shared Supabase client
│   └── tier-guard.js      # Tier utilities
├── js/                     # Client-side utilities
│   ├── config.js          # Configuration
│   ├── supabase-client.js # Supabase client helpers
│   ├── tier-guard.js      # Tier access control
│   ├── admin-utils.js     # Admin utilities
│   └── tier-config.js     # Central tier config
├── supabase/
│   ├── complete-schema.sql # Base schema (profiles, payments, RLS)
│   └── migrations/
│       ├── 001_membership_automation.sql # entitlements, audit_log, webhook_events, RLS
│       ├── 002_pending_entitlements.sql  # pending_entitlements
│       └── 003_usage_teams.sql           # usage_logs, teams, team_members, RLS
├── index.html             # Landing page with pricing
├── login.html             # Login (email/password), redirect → dashboard
├── reset.html             # Password reset (request + update)
├── magic-link.html        # Magic link login (signInWithOtp)
├── reset-password.html    # Password reset (legacy)
├── dashboard.html         # Member dashboard (protected, usage_logs on tool click)
├── admin.html             # Admin panel (admin only)
├── success.html           # Post-payment success handler
├── protected.html         # Calculator wrapper (protected)
├── vercel.json            # Vercel configuration
├── package.json           # Dependencies
├── README.md              # This file
├── SETUP.md               # Quick setup guide
├── DEALCHECK_SETUP.md     # DealCheck subdomain setup
└── SSO_ADMIN_SUMMARY.md   # SSO & Admin implementation
```

## 🔐 Authentication & Payment Flow

1. User completes payment via Square Payment Link; Square sends webhook to `/api/square/webhook`.
2. Webhook creates/updates entitlements (and profile tier if user exists); pending entitlements are keyed by email if no Supabase user yet.
3. Square redirects buyer to `https://invest.elitesolutionsnetwork.com/success.html?source=square`.
4. If not logged in: success page prompts sign up / log in with the **same email** used for payment.
5. Once logged in, success page calls `/api/members/claim?email=<user_email>` with Bearer token; API attaches pending entitlements to the user and sets tier.
6. User is redirected to `/dashboard.html`.

## 🎯 Tier System

Tiers are stored in Supabase `profiles` table:

- **guest** - Default, no access
- **starter** - Basic calculators ($29/mo)
- **serious** - All calculators ($79/mo)
- **elite** - Everything + Academy ($149/mo)
- **academy_starter** - Academy only ($500)
- **academy_pro** - Academy Pro ($999)
- **academy_premium** - Academy Premium ($1499)

## 🛡️ Security Features

- **Row Level Security (RLS)** enabled on all tables
- **Service Role Key** only used server-side (never exposed)
- **Square Access Token** only used server-side
- **Session-based authentication** (no localStorage hacks)
- **Tier verification** on every protected route

## 🔧 Development

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run Vercel dev server:
   ```bash
   npm run dev
   ```

3. Access at `http://localhost:3000`

### Environment Variables (Local)

Create `.env.local`:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SQUARE_ACCESS_TOKEN=your_square_token
SQUARE_ENVIRONMENT=sandbox
SQUARE_WEBHOOK_SIGNATURE_KEY=your_webhook_signature_key
CRON_SECRET=optional_secret_for_cron
RESEND_API_KEY=optional_for_expiry_emails
EXPIRY_FROM_EMAIL=noreply@yourdomain.com
```

## 📝 Notes

- **Square Payment Links**: The API tries multiple methods to extract the link ID. For best results, configure Square webhooks to store link_id in payment metadata.

- **User Creation**: If a user doesn't exist, the system creates one automatically after payment. Users can reset their password via email.

- **Calculator Access**: Calculators should be accessed via `/protected.html?url=calculator.html&tier=starter` for proper tier verification.

- **DealCheck Subdomain**: The DealCheck subdomain (`dealcheck.elitesolutionsnetwork.com`) shares authentication with the main site. Users logged in on `invest.*` are automatically authenticated on `dealcheck.*`. See `DEALCHECK_SETUP.md` for details.

- **Admin Panel**: Access at `/admin.html` (admin role required). Run `supabase/complete-schema.sql` and `supabase/migrations/001_membership_automation.sql`, then set your profile role to `admin` in the database. Admin can search users, override tier (with audit), grant entitlements, and view the Audit Log tab.

## 🐛 Troubleshooting

### Payment verification fails
- Check Square Access Token is correct
- Verify Square environment (sandbox vs production)
- Check Square API version compatibility

### User profile not updating
- Verify Service Role Key has correct permissions
- Check RLS policies allow service role access
- Review Supabase logs for errors

### Authentication redirects
- Ensure Supabase URL and keys are correct
- Check browser console for errors
- Verify session persistence is working

## 📞 Support

For issues or questions:
- Email: support@elitesolutionsnetwork.com
- Phone: 214-800-9779

## 📄 License

© 2025 Elite Solutions Network
