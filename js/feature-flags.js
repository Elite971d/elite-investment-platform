// ============================================
// Elite Investor Academy - Feature Flags
// ============================================
// Safety: no automatic emails without explicit enable.
// Promos are optional and fail silently. Admin tier bypasses all promo + billing enforcement.

/** When true, recovery emails may be sent (when shouldSendRecoveryEmail allows). When false, only preview/log. */
export const ENABLE_RECOVERY_EMAILS = false;

/** When true, promo validation and redemption are active. When false, promo logic is no-op; checkout continues without discount. */
export const ENABLE_PROMOS = true;
