-- ============================================
-- Production Stabilization - Backfill Missing Tier Entitlements
-- ============================================
-- DO NOT AUTO-EXECUTE. Run manually in Supabase SQL Editor when ready.
--
-- Creates tier entitlements for users who have profile.tier but no tier entitlement row.
-- Ensures: tier users work even without entitlement rows (backward compatible).
--
-- Requires: migration 009 (entitlements.type column) to be applied.

-- Backfill missing tier entitlements (profiles.id = auth user id)
INSERT INTO entitlements (user_id, type, product_key, status, created_at)
SELECT
  p.id,
  'tier',
  'tier_' || p.tier,
  'active',
  NOW()
FROM profiles p
WHERE p.tier IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = p.id
      AND e.type = 'tier'
  );
