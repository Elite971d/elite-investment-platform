# DealCheck Subdomain Setup Guide

## Overview

The DealCheck subdomain (`dealcheck.elitesolutionsnetwork.com`) shares authentication with the main site (`invest.elitesolutionsnetwork.com`) using Supabase's cross-subdomain session support.

## How It Works

1. **Shared Supabase Project**: Both subdomains use the same Supabase project
2. **JWT Session Cookies**: Supabase automatically handles cross-subdomain authentication via JWT cookies scoped to the root domain
3. **No Re-login Required**: Users logged in on `invest.*` are automatically authenticated on `dealcheck.*`

## Setup Steps

### 1. DNS Configuration

Ensure both subdomains point to your Vercel deployment:
- `invest.elitesolutionsnetwork.com` → Vercel
- `dealcheck.elitesolutionsnetwork.com` → Vercel

### 2. Vercel Configuration

In your Vercel project settings, add both domains:
1. Go to **Settings** → **Domains**
2. Add `dealcheck.elitesolutionsnetwork.com`
3. Follow DNS instructions for CNAME record

### 3. Supabase Configuration

**Important**: Both subdomains must use the **same Supabase project**:
- Same `SUPABASE_URL`
- Same `SUPABASE_ANON_KEY`
- Same `SUPABASE_SERVICE_ROLE_KEY`

No additional Supabase configuration needed - cross-subdomain auth works automatically.

### 4. Calculator Structure

Organize calculators under `/tools/` directory:
```
dealcheck/
  protected.html      # Wrapper that verifies auth + tier
  supabase.js         # Shared Supabase client
  tier-guard.js       # Tier checking utilities
  tools/
    offer.html
    brrrr.html
    dealcheck.html
    ...
```

### 5. Access Calculators

Always use the protected wrapper:
```
https://dealcheck.elitesolutionsnetwork.com/protected.html?tool=offer
https://dealcheck.elitesolutionsnetwork.com/protected.html?tool=brrrr
```

**Never expose calculators directly** - always use the protected wrapper.

## Testing

1. **Login on main site**:
   - Go to `invest.elitesolutionsnetwork.com`
   - Log in with your account

2. **Access calculator**:
   - Go to `dealcheck.elitesolutionsnetwork.com/protected.html?tool=offer`
   - Should automatically authenticate (no login prompt)
   - Should load calculator if tier allows

3. **Test tier gating**:
   - Try accessing a calculator that requires higher tier
   - Should show upgrade message

## Troubleshooting

### "Not authenticated" on DealCheck

**Cause**: Supabase session not shared

**Solution**:
- Ensure both subdomains use same Supabase project
- Check browser cookies - should see Supabase session cookie
- Clear cookies and re-login

### "Cannot access calculator"

**Cause**: Insufficient tier

**Solution**:
- Check user's tier in admin panel
- Upgrade tier if needed
- Verify tier mapping in `tier-guard.js`

### Calculators not loading

**Cause**: Calculator files missing or wrong path

**Solution**:
- Verify calculator files exist in `/tools/` directory
- Check `TOOL_PATHS` in `protected.html`
- Ensure calculator URLs are correct

## Security Notes

- ✅ All calculators go through protected wrapper
- ✅ Session verified on every request
- ✅ Tier checked before loading calculator
- ✅ No localStorage hacks - real Supabase auth
- ✅ RLS policies enforce access control

## Future Enhancements

- Webhook integration for real-time tier updates
- Subscription management
- Lifetime license support
- Team/organization accounts
