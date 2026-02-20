# Supabase Auth Redirect URLs

Configure these in **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**.

## Required URLs

Add the following (one per line or comma-separated, per Supabase UI):

- `https://invest.elitesolutionsnetwork.com/**`
- `https://dealcheck.elitesolutionsnetwork.com/**`
- `http://localhost:3000/**`
- `http://localhost:5173/**`
- `https://*.vercel.app/**` (if supported for preview deployments)

If wildcards are not supported, add explicit Vercel preview URLs, for example:

- `https://invest-elitesolutionsnetwork-com.vercel.app/**`
- `https://invest-elitesolutionsnetwork-com-*.vercel.app/**` (if pattern supported)

## Site URL

Set **Site URL** to your production domain:

- `https://invest.elitesolutionsnetwork.com`

## Notes

- Middleware reads session from Supabase cookies after login completes.
- Ensure preview domains (e.g. Vercel) are in the list for OAuth/magic-link flows.
- Login redirect logic in the app allows `.vercel.app` origins for `?redirect=` param.
