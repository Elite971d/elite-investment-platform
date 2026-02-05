-- ============================================
-- One-time fix: set admin by ROLE, not tier
-- ============================================
-- If you got: "profiles_tier_check" when setting someone as admin,
-- you changed the wrong column. Admin access is in "role", not "tier".
--
-- Run this in Supabase SQL Editor to make admin@elitesolutionsnetwork.com an admin
-- (keeps their tier as guest; only role is set to admin).

UPDATE profiles
SET role = 'admin'
WHERE email = 'admin@elitesolutionsnetwork.com';

-- Optional: if you had mistakenly set tier to 'admin', reset it to guest:
-- UPDATE profiles SET tier = 'guest' WHERE email = 'admin@elitesolutionsnetwork.com' AND tier = 'admin';
