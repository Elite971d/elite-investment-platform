# Billing Events & Promo — Implementation Verification

After applying migration `008_billing_events_promo_codes.sql` and deploying JS changes, confirm the following.

## Phase 1 — Failed Payment Email Pipeline (Safe Mode)

- [ ] **Failed payments are logged**  
  When `record_payment_failure(user_id)` is called (e.g. from Square webhook or server):  
  - `member_profiles`: `subscription_status = 'past_due'`, `retry_count` incremented, `grace_until` set.  
  - `billing_events`: one row with `event_type = 'payment_failed'`, `provider = 'square'`, `metadata` includes `retry_count` and `next_retry_at`.

- [ ] **Recovery emails are generated but not sent**  
  - `shouldSendRecoveryEmail(user)` returns `true` only when: `subscription_status === 'past_due'`, `retry_count >= 1`, `last_recovery_email_sent_at` is null or &gt; 48h ago, and user is not admin.  
  - `previewRecoveryEmail(userId, user)` builds payload (subject: "Payment issue — keep your access active", CTA: "Update payment", link: placeholder) and logs to console; no external email is sent while `ENABLE_RECOVERY_EMAILS === false`.

- [ ] **No change to existing tier enforcement**  
  - `resolve_effective_tier` and grace-period logic are unchanged.  
  - No automatic downgrade; no new email sends without explicit enable.

## Phase 2 — Coupons / Promo (Non-Destructive)

- [ ] **Promo codes validate correctly**  
  - `validate_promo(code, tier)` (SQL) and `validatePromo(code, tier)` (JS) return valid/invalid and discount metadata.  
  - Checks: `active = true`, `now < expires_at`, tier in `applies_to_tiers`, `redemptions_used < max_redemptions`.  
  - Invalid or missing code → `valid: false`; checkout continues without discount (no block).

- [ ] **Redemption tracking**  
  - `record_promo_redemption(code, user_id)` is called only after successful payment (e.g. from claim API or webhook when you add promo to flow).  
  - It increments `promo_codes.redemptions_used` and inserts `billing_events` with `event_type = 'promo_redemption'`.

- [ ] **Promo never overrides admin or reduces active tier**  
  - Promos apply only at checkout/renewal.  
  - Admin tier bypass is unchanged; no logic downgrades a paying user due to promo.

## Phase 3 — Safety & Feature Flags

- [ ] **Feature flags**  
  - `ENABLE_RECOVERY_EMAILS = false` → no automated recovery emails sent.  
  - `ENABLE_PROMOS = true` → promo validation and redemption logic active; invalid promo fails silently.

- [ ] **No user loses access**  
  - Promo logic does not affect `resolve_effective_tier` or access control.  
  - Checkout never blocked by promo failure.

## Phase 4 — No Regressions

- [ ] **No change to existing tier enforcement**  
  - Same behavior for guest, trial, active, past_due, canceled.  
  - Admin and tier overrides unchanged.

- [ ] **No UI changes**  
  - No new checkout UI or promo input added (preparation only).

- [ ] **No cron or email provider**  
  - No cron jobs or external email service added.

---

**Rollout:** When ready to enable recovery emails, set `ENABLE_RECOVERY_EMAILS = true` and plug in your email provider in `previewRecoveryEmail` (still respecting `shouldSendRecoveryEmail` and throttle). When adding checkout UI, keep promo optional and never block checkout on promo failure.
