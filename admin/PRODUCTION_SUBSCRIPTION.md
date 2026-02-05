# Production Subscription — Safety & Behaviour

## Source of truth
- **Supabase** = access source of truth (`member_profiles`: tier, subscription_status, grace_until, etc.).
- **Square** = billing source of truth. Payment verification and tier from Square order/link.

## Enforcement (server-authoritative)
- **`resolve_effective_tier(user_id)`** (SQL) and **`resolveEffectiveTier` / `getEffectiveTierCached`** (JS) implement the same rules:
  - **Admin** → full access (always).
  - **Active tier override** (not expired) → override tier.
  - **subscription_status = active or trial/null** → profile tier applies.
  - **subscription_status = past_due** and **now < grace_until** → tier applies (grace).
  - **subscription_status = past_due** and **now ≥ grace_until** → effective tier = guest (downgrade; logged).
  - **subscription_status = canceled** → effective tier = guest (logged).
- Downgrades are **never silent**: `enforcement_downgrade` and/or audit/analytics events.

## Safety & failures
- **Square webhook delays**: Grace period keeps access until `grace_until`; no hard-lock on delay.
- **Duplicate checkout events**: Claim API is idempotent (same email/tier can be applied again).
- **Partial subscription records**: Missing or null `subscription_status` / tier → **fail-safe**: keep access (trial/null), never hard-lock.
- **Missing billing data**: Default to lowest-risk option (keep access), log error, never lock a paid user.

## Logging
- **Tier downgrade**: `analytics_events` (e.g. `enforcement_downgrade`) and/or audit.
- **Billing retry**: `record_payment_failure()` → `audit_logs` action `BILLING_RETRY_FAILED`.
- **Upgrade / claim**: Claim API → `audit_logs` action `SUBSCRIPTION_ACTIVATED`.

## Confirmation checklist
1. Subscription enforcement is active (effective tier respects subscription_status and grace).
2. Admins are never blocked (role = admin bypasses enforcement).
3. Grace periods prevent accidental lockouts (past_due + now < grace_until → tier kept).
4. Tier upgrades apply immediately (claim API updates `member_profiles`; dashboard revalidates cache on load).
5. Revenue dashboard is admin-only (RLS + admin-only UI tab).
6. System is production-safe (fail-safe defaults, idempotent claim, no silent downgrades).

## Billing retries (Square workaround)
- **`record_payment_failure(user_id, …)`** in Supabase: increments `retry_count`, sets `grace_until` (3 / 5 / 7 days), sets `subscription_status = 'past_due'`.
- Recovery email: **not sent** in this implementation; use **`triggerRecoveryEmailReady()`** in `js/billing-retry.js` as the placeholder (logs only). Implement sending when ready.
