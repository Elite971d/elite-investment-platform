# Production Fix: Tools Access / Tier Sync

## Root Cause

**Session storage mismatch across subdomains**: Users log in at `invest.elitesolutionsnetwork.com` but tools are served from `dealcheck.elitesolutionsnetwork.com`. Supabase auth used **localStorage** (default), which is per-origin. The dealcheck subdomain could not read the session because it was stored in invest's localStorage.

## Fixes Applied

### 1. Cross-Subdomain Cookie Storage (Primary Fix)

- **Created** `js/supabase-auth-cookies.js`: Shared cookie storage adapter with:
  - `Domain=.elitesolutionsnetwork.com` (shared across all subdomains)
  - `Path=/`
  - `Secure` (when https)
  - `SameSite=Lax` (allows top-level navigation between subdomains)

- **Updated** all Supabase client creation to use cookie storage:
  - `auth/supabase.js`
  - `dealcheck/supabase.js`
  - `js/supabase-client.js`
  - `js/calculator-gate.js`
  - `auth/calculator-auth.js`
  - `dashboard.html`, `login.html`, `admin.html`, `protected.html`
  - `success.html`, `magic-link.html`, `reset.html`, `reset-password.html`

### 2. Admin Tier Resolution

- Admin **never** defaults to guest. Logic:
  - `if (user.role === 'admin') tier = 'admin'` (bypasses all locks)
  - Admin checked from: JWT metadata, `profiles.role`, `member_profiles.role`

- Updated:
  - `dealcheck/auth-guard.js`: Fallback to member_profiles when profiles fails; role from both tables
  - `auth/calculator-auth.js`: Check member_profiles.role and profiles.role for admin
  - `dashboard.html`: Check member_profiles.role for admin

### 3. Redirect URLs for Dealcheck

- Login/pricing redirects now use invest origin when on dealcheck subdomain
- `auth/calculator-auth.js`: Uses `LOGIN_BASE = INVEST_ORIGIN` when hostname contains `dealcheck`
- `js/calculator-gate.js`: `getAuthBase()` returns invest origin for auth redirects when on dealcheck

### 4. Login Redirect Handling

- `login.html`: Allows redirect to dealcheck URLs (e.g. `https://dealcheck.elitesolutionsnetwork.com/protected.html?tool=offer`)

### 5. Dashboard Tool Links

- Tool "Open Tool" links now point to `https://dealcheck.elitesolutionsnetwork.com/protected.html?tool={id}`
- Added `DEALCHECK_TOOLS_BASE` to `js/tools-config.js`

### 6. Temporary Auth Debug Logging

Console logs added (prefix `[ESN-Auth]`) for production validation:

- `dealcheck/auth-guard.js`: User, Tier, Role, Raw Tier
- `js/calculator-gate.js`: User, Tier, Role
- `dashboard.html`: User, Role, Resolved Tier

**Remove these after validation** (search for `[ESN-Auth]` or `TEMP: Auth debug`).

## Post-Deploy Validation

1. **Admin login at invest** → Dashboard shows "Admin / Full Access"
2. **Admin visits dealcheck** → All tools unlocked, no "Guest Tier"
3. **Admin opens calculator** → No lock, full access
4. **Console** → `[ESN-Auth]` logs show correct user, tier=admin, role=admin
5. **Cookie** → Supabase auth cookie with `Domain=.elitesolutionsnetwork.com` in browser DevTools

## Remove Debug Logs

After confirming production works:

```bash
# Search for debug logs to remove
rg "\[ESN-Auth\]|TEMP: Auth debug" --type-add 'code:*.{js,html}' -t code
```

Remove the `console.log('[ESN-Auth]'...` blocks and the `TEMP: Auth debug` comments.
