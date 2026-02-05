// ============================================
// Elite Investor Academy - Billing Retry (Placeholders)
// ============================================
// Retry logic: metadata (retry_count, grace_until) is in member_profiles; updated via
// Supabase function record_payment_failure() from server/webhook.
// DO NOT send emails yet — only log readiness hooks.

const RECOVERY_LOG_PREFIX = '[billing-retry] recovery_email_ready';

/**
 * Placeholder: when payment fails and grace period is set, call this to log readiness for recovery email.
 * Replace with actual email send when ready.
 * @param {string} userId - User UUID
 * @param {{ reason?: string, retryCount?: number, graceUntil?: string }} opts
 */
export function triggerRecoveryEmailReady(userId, opts = {}) {
  if (typeof console !== 'undefined' && console.info) {
    console.info(RECOVERY_LOG_PREFIX, {
      user_id: userId,
      reason: opts.reason || 'payment_failed',
      retry_count: opts.retryCount,
      grace_until: opts.graceUntil
    });
  }
}
