# Soft Launch — Monitoring & Readiness

This document describes the **passive monitoring** and **subscription-readiness** work added for soft launch. No user flows, gating, or auth were changed.

---

## 1. Analytics events captured

| Event type | When | Payload (typical) |
|------------|------|-------------------|
| **page_view** | Every page load | `page` (e.g. `index`, `login`, `dashboard`, `magic-link`, `reset`, `success`, `protected`, `admin`) |
| **auth_state** | After auth resolution on login page (guest or already signed in); after tier resolution on dashboard (user/admin) | `user_id?`, `role`, `tier`, `page`, `metadata.resolvedFrom?` |
| **calculator_access** | When calculator gate runs (allowed or blocked) | `page` (tool id), `metadata.allowed`, `metadata.reason?` (e.g. `login_required`, `insufficient_tier`, `unauthorized_embed`) |
| **login_success** | After successful email/password sign-in on login.html | `user_id`, `role`, `tier`, `page: 'login'` |
| **logout** | When user clicks Log out on dashboard | `user_id`, `role`, `tier`, `page: 'dashboard'` |
| **client_error** | Global `error` and `unhandledrejection` (passive) | `metadata.message`, `metadata.filename`, `metadata.lineno`, `metadata.reason?`, `metadata.type?` |
| **tier_mismatch** | Calculator: user tier &lt; required tier; Dashboard: role is admin but resolved tier ≠ admin | `tier`, `role`, `page`, `metadata.required_tier?`, `metadata.expected?` |
| **auth_session_event** | Supabase auth state change on dashboard (e.g. SIGNED_OUT, TOKEN_REFRESHED) | `user_id`, `role`, `tier`, `page`, `metadata.event` |

**Schema (Supabase `analytics_events`):**  
`event_type`, `user_id` (nullable), `role`, `tier`, `page`, `occurred_at`, `metadata` (jsonb).

---

## 2. Confirmation: no user flow altered

- **Login:** Same redirects, same form submit, same error/success UI. Only added non-blocking `track('login_success')` and `track('auth_state')` after success or on load.
- **Dashboard:** Same auth check, same tier resolution, same tools grid and logout. Only added `track('auth_state')`, `track('logout')`, and `track('auth_session_event')`; no redirect or UI change.
- **Calculator gate:** Same logic (redirect to login/pricing, body replacement in iframe). Only added fire-and-forget `track('calculator_access')` and `track('tier_mismatch')` at existing exit points.
- **Index / landing:** No auth. Only added optional pageview + error-boundary scripts; no UI or navigation change.

---

## 3. Confirmation: no gating logic changed

- **Tier / role:** No change to `resolveEffectiveTier`, `canAccessTool`, `requireTier`, or any redirect/alert logic.
- **Calculator gate:** All `runCalculatorGate` branches (no tool, unknown tool, embed, config, session, tier) behave as before; analytics calls are after the decision, non-blocking.
- **Auth:** No change to `requireAuth`, `redirectIfAuthenticated`, or session checks.

---

## 4. Confirmation: safe for soft launch

- **Analytics:** Wrapped in try/catch; fail silently (console fallback if Supabase insert fails). Single kill switch: `ENABLE_ANALYTICS` in `js/analytics.js`.
- **Error boundary:** Logs to analytics only; does not show raw errors to users or alter default browser behavior.
- **Entitlements abstraction:** `getUserEntitlements()` is additive; no existing code was refactored to use it yet. Placeholder fields (`subscription_status`, `billing_provider`, `renewal_date`) are optional and never used for access control.
- **RLS:** `analytics_events` allows INSERT from anyone (anon + authenticated) for guest events; SELECT only for admin.

**Calculator iframe load:** When the gate blocks (no session, unauthorized embed, insufficient tier), we log `calculator_access` with `metadata.reason`. Network-level iframe load failures (e.g. tab closed before load) are not captured from inside the iframe; a parent page that embeds the calculator could add an `iframe.onerror` listener to track those if needed.

---

## 5. Where subscriptions will plug in later (not implemented)

- **`js/entitlements.js` — `getUserEntitlements()`**  
  Central place that already returns `tier`, `role`, `permissions`. When you add subscriptions:
  - Populate `subscription_status`, `billing_provider`, `renewal_date` from your billing/subscription table or webhook.
  - Keep them optional; do not block access based on these fields in this pass.
- **Database:** No new subscription or payment tables were added. When ready, add tables (e.g. `subscriptions`, `billing_provider`) and join or backfill into the entitlements abstraction.
- **Gating:** Current tier gating stays as-is; subscription status can later be used to hide CTAs or show renewal prompts without changing access logic in this codebase.

---

## Files added/updated

| File | Purpose |
|------|--------|
| `supabase/migrations/006_analytics_events.sql` | Table `analytics_events` + RLS (insert any, select admin) |
| `js/analytics.js` | `ENABLE_ANALYTICS`, `track()`, Supabase insert or console fallback |
| `js/analytics-pageview.js` | Fires `page_view` (data-page or pathname) |
| `js/analytics-error-boundary.js` | Global `error` / `unhandledrejection` → `client_error` |
| `js/entitlements.js` | `getUserEntitlements()` + optional `subscription_status`, `billing_provider`, `renewal_date` |
| `js/calculator-gate.js` | Passive `calculator_access` and `tier_mismatch` tracking only |
| `index.html` | Error boundary + pageview scripts |
| `login.html` | Error boundary, pageview, `auth_state`, `login_success` |
| `dashboard.html` | Error boundary, pageview, `auth_state`, `logout`, `auth_session_event`, tier mismatch check |
| `magic-link.html`, `reset.html`, `reset-password.html`, `success.html`, `protected.html`, `admin.html` | Error boundary + pageview only |

---

## Turning analytics off

Set in `js/analytics.js`:

```js
export const ENABLE_ANALYTICS = false;
```

All tracking calls become no-ops; no other code changes required.
