// ============================================
// Elite Investor Academy - Billing Retry (Placeholders)
// ============================================
// Retry logic: metadata (retry_count, grace_until) is in member_profiles; updated via
// Supabase function record_payment_failure() from server/webhook.
// Emails are PREVIEW only until ENABLE_RECOVERY_EMAILS is true.

import { ENABLE_RECOVERY_EMAILS } from './feature-flags.js';

const RECOVERY_LOG_PREFIX = '[billing-retry] recovery_email_ready';
const PREVIEW_LOG_PREFIX = '[billing-retry] recovery_email_preview';

/** Placeholder Square hosted payment update URL (replace with real link when ready). */
export const SQUARE_PAYMENT_UPDATE_URL_PLACEHOLDER = 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/update-payment';

const RECOVERY_EMAIL_THROTTLE_HOURS = 48;

/**
 * Whether we should send a recovery email for this user. Does NOT send; call preview only when this is true.
 * Rules: subscription_status === 'past_due', retry_count >= 1, last email NULL or > 48h ago, user is NOT admin.
 * @param {{ subscription_status?: string, retry_count?: number, last_recovery_email_sent_at?: string | null, role?: string }} user - Member profile (and role)
 * @returns {boolean}
 */
export function shouldSendRecoveryEmail(user) {
  if (!user) return false;
  if (user.subscription_status !== 'past_due') return false;
  const retryCount = Number(user.retry_count);
  if (!Number.isFinite(retryCount) || retryCount < 1) return false;
  if (user.role === 'admin') return false;

  const lastSent = user.last_recovery_email_sent_at;
  if (lastSent) {
    try {
      const sentAt = new Date(lastSent).getTime();
      const throttleMs = RECOVERY_EMAIL_THROTTLE_HOURS * 60 * 60 * 1000;
      if (Date.now() - sentAt < throttleMs) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

/**
 * Generate recovery email payload (PREVIEW only). Logs to console; does NOT send unless ENABLE_RECOVERY_EMAILS.
 * @param {string} userId - User UUID
 * @param {{ email?: string, subscription_status?: string, retry_count?: number, grace_until?: string }} user - Member profile
 * @returns {{ subject: string, to: string, cta: string, link: string, preview: true }}
 */
export function buildRecoveryEmailPayload(userId, user = {}) {
  return {
    subject: 'Payment issue — keep your access active',
    to: user.email || '',
    cta: 'Update payment',
    link: SQUARE_PAYMENT_UPDATE_URL_PLACEHOLDER,
    userId,
    retryCount: user.retry_count,
    graceUntil: user.grace_until,
    preview: true
  };
}

/**
 * Preview recovery email: build payload and log to console. Does NOT send externally.
 * Call this when shouldSendRecoveryEmail(user) is true. Never sends if ENABLE_RECOVERY_EMAILS is false.
 * @param {string} userId - User UUID
 * @param {{ email?: string, subscription_status?: string, retry_count?: number, grace_until?: string }} user - Member profile
 */
export function previewRecoveryEmail(userId, user = {}) {
  const payload = buildRecoveryEmailPayload(userId, user);
  if (typeof console !== 'undefined' && console.info) {
    console.info(PREVIEW_LOG_PREFIX, payload);
  }
  if (ENABLE_RECOVERY_EMAILS) {
    // Future: send via email provider here. For now we do NOT send.
    // (No email provider integrated yet.)
  }
  return payload;
}

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
