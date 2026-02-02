# Admin Panel Documentation

## Overview

This directory contains the admin-only dashboard for user management and auditing for the Elite Investor Academy platform.

## Files

- **admin.html** - Admin panel UI with modern, responsive design
- **admin.js** - Client-side logic with comprehensive security checks
- **README.md** - This documentation file

## Security Architecture

### Multi-Layer Security

The admin panel implements defense-in-depth with multiple security layers:

#### 1. Client-Side Protection (admin.js)

- Verifies user has active Supabase session
- Checks `profiles.role = 'admin'` before showing UI
- Redirects non-admins to dashboard
- **Note:** This is UX protection only, not security. Real security is server-side.

#### 2. Database Protection (Supabase RLS)

Row Level Security policies enforce:

- **audit_log table**: Only admins can SELECT
- **profiles table**: Admins can UPDATE any row; users can only update their own (excluding tier/role)
- **entitlements table**: Only service_role can INSERT/UPDATE

#### 3. API Protection (Serverless Functions)

All admin mutations go through secured API endpoints:

- `/api/admin/tier-override` - Verifies admin role server-side before allowing tier changes
- `/api/admin/grant-entitlement` - Verifies admin role server-side before granting access

**Security Decision:** Never trust client-side checks. Always verify admin role in the API endpoint using the service_role key.

#### 4. Audit Trail

Every admin action is logged to the `audit_log` table with:

- `actor_user_id` - Admin who performed the action
- `actor_email` - Admin's email
- `action` - Type of action (tier_override, entitlement_grant, etc.)
- `target_user_id` - User affected by the action
- `target_email` - Target user's email
- `metadata` - JSON object with before/after values and reason

**Security Decision:** Audit logs cannot be deleted via RLS. They provide an immutable record of all admin actions.

## Features

### 1. User Search

**Purpose:** Find users by email to view their current tier and products

**How it works:**
1. Admin enters email address
2. System queries `profiles` table (RLS allows admin to read all profiles)
3. Displays user details including current tier, role, and member since date

**Security:** RLS policy "Admins can view all profiles" allows this operation.

### 2. Tier Override

**Purpose:** Manually change a user's tier (e.g., for support, refunds, or promotions)

**How it works:**
1. Admin selects new tier from dropdown
2. Optionally adds reason (e.g., "Support ticket #123")
3. Clicks "Save Tier"
4. API endpoint verifies admin role server-side
5. Updates `profiles.tier`
6. Writes audit log with old_tier, new_tier, and reason

**Available Tiers:**
- `guest` - Default, no access
- `starter` - Starter Investor ($29/mo)
- `serious` - Serious Investor ($79/mo)
- `elite` - Elite / Pro ($149/mo)
- `academy_starter` - Academy Starter ($500)
- `academy_pro` - Academy Pro ($999)
- `academy_premium` - Academy Premium ($1499)

**Security:** 
- Client-side check prevents UI access by non-admins
- Server-side check in `/api/admin/tier-override` verifies admin role
- Uses service_role key to bypass RLS
- Writes audit log automatically

### 3. Entitlement Control

**Purpose:** Grant or revoke specific product access to users

**How it works:**
1. Admin enters target email
2. Selects product key (calc_starter, academy_pro, etc.)
3. Optionally sets expiration date
4. API endpoint verifies admin role
5. Inserts row into `entitlements` table
6. Writes audit log

**Product Keys:**
- `calc_starter` - Basic calculators
- `calc_serious` - All calculators
- `calc_elite` - Everything + Academy
- `academy_starter` - Academy only
- `academy_pro` - Academy Pro
- `academy_premium` - Academy Premium

**Expiration:**
- Leave empty for permanent access
- Set datetime-local for time-limited access

**Security:**
- API verifies admin role server-side
- Uses service_role key to insert entitlement
- Writes audit log with product_key and expires_at

### 4. Audit Log Viewer

**Purpose:** View history of all admin actions and system events

**Features:**
- Filter by action type (tier_override, entitlement_grant, etc.)
- Filter by target email
- Filter by date range
- Shows last 200 records (most recent first)

**Columns:**
- **Date** - When the action occurred
- **Action** - Type of action
- **Actor** - Admin who performed the action
- **Target** - User affected by the action
- **Metadata** - JSON with before/after values and details

**Security:** 
- RLS policy "Admins can read audit_log" allows this
- Non-admins get empty result set
- Read-only (no DELETE or UPDATE allowed)

## Access Control

### On Load Checks

The admin panel performs these checks on page load:

1. **Session Check** - Verifies user has valid Supabase session
   - If no session → redirect to `/login.html`

2. **Role Check** - Queries `profiles.role` for current user
   - If role !== 'admin' → show "Access Denied" message

3. **UI Display** - Only admins see the admin panel
   - Non-admins see "Access Denied" with link to dashboard

### Setting Admin Role

To make a user an admin, run this SQL in Supabase SQL Editor:

```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

**Important:** Only run this for trusted administrators. Admin role gives access to all user data and the ability to modify tiers/entitlements.

## Usage

### Accessing the Admin Panel

1. Navigate to `/admin/admin.html`
2. Must be logged in with admin role
3. Panel will load if authorized

### Common Tasks

#### Change User Tier

1. Click "User & Tier" tab
2. Enter user email in search box
3. Click "Search"
4. Select new tier from dropdown
5. Optionally add reason
6. Click "Save Tier"

#### Grant Product Access

1. Click "Grant Entitlement" tab
2. Enter target email
3. Select product key
4. Set expiration if needed (or leave empty)
5. Click "Grant Entitlement"

#### View Audit History

1. Click "Audit Log" tab
2. Apply filters (action, email, date range)
3. Click "Load"
4. Review records

## Error Handling

The admin panel handles errors gracefully:

- **Session expired** → Redirect to login
- **User not found** → Show error message
- **API failure** → Show error message with details
- **Network error** → Show connection error

All errors are logged to browser console for debugging.

## Best Practices

### When to Use Tier Override

- Support requests (refunds, billing issues)
- Promotional upgrades
- Testing new features with specific users
- Correcting payment processing errors

**Always include a reason** in the audit log for accountability.

### When to Use Grant Entitlement

- Giving trial access to specific products
- Compensating users for service issues
- Testing entitlement system
- Backdating access after late payments

### Audit Log Review

Regularly review audit logs to:

- Monitor admin actions for compliance
- Investigate unusual account changes
- Track system health (webhook events)
- Generate reports for management

## Technical Notes

### Browser Compatibility

Requires modern browser with ES6 module support:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 79+

### Dependencies

- **Supabase JS SDK** - Loaded from CDN (v2)
- **ES6 Modules** - Native browser support

### Environment Variables

The admin panel uses these config values:

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (public)

**Security Note:** The anon key is safe to expose. It has limited permissions via RLS policies. The service_role key is NEVER exposed to the client.

## Troubleshooting

### "Access Denied" Error

**Cause:** User doesn't have admin role

**Solution:** Run SQL to set role = 'admin' for the user

### "User not found" Error

**Cause:** Email doesn't exist in profiles table

**Solution:** Check email spelling or have user sign up first

### "Failed to update tier" Error

**Possible causes:**
1. Network issue
2. API endpoint down
3. Database permissions issue

**Solution:** Check browser console for details

### Audit Log Empty

**Cause:** No records match filters OR user isn't admin

**Solution:** 
1. Remove filters and try again
2. Verify user has admin role
3. Check RLS policies in Supabase

## API Endpoints

### POST /api/admin/tier-override

**Request:**
```json
{
  "target_email": "user@example.com",
  "new_tier": "elite",
  "reason": "Support ticket #123"
}
```

**Response:**
```json
{
  "message": "Tier updated",
  "old_tier": "starter",
  "new_tier": "elite"
}
```

**Security:** Verifies admin role via Bearer token

### POST /api/admin/grant-entitlement

**Request:**
```json
{
  "target_email": "user@example.com",
  "product_key": "academy_pro",
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "message": "Entitlement granted",
  "product_key": "academy_pro",
  "target_email": "user@example.com"
}
```

**Security:** Verifies admin role via Bearer token

## Database Schema

### audit_log Table

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  target_email TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies

```sql
-- Only admins can read audit_log
CREATE POLICY "Admins can read audit_log"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only service_role can insert
CREATE POLICY "Service role can insert audit_log"
  ON audit_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
```

## Support

For issues or questions:
- Email: support@elitesolutionsnetwork.com
- Phone: 214-800-9779

## License

© 2025 Elite Solutions Network - Internal Use Only
