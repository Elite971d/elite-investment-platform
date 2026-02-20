-- ============================================
-- Elite Investor Academy - Backfill Tier Entitlements from profiles
-- ============================================
-- DO NOT AUTO-EXECUTE. Run manually in Supabase SQL Editor when ready.
--
-- Creates tier entitlements for users who have profile.tier but no tier entitlement row.
-- Ensures backward compatibility: users with profile.tier continue to work with the
-- new entitlement-based resolution (resolveUserTier checks entitlements first, then profile.tier).
--
-- Requires: migration 009 (entitlements.type column) to be applied.

-- Backfill missing tier entitlements
INSERT INTO entitlements (user_id, type, product_key, status, created_at)
SELECT
  p.id,
  'tier',
  'tier_' || p.tier,
  'active',
  NOW()
FROM profiles p
WHERE p.tier IS NOT NULL
  AND p.tier != 'guest'
  AND NOT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = p.id
      AND e.status = 'active'
      AND (e.type = 'tier' OR e.product_key LIKE 'tier_%')
  );
