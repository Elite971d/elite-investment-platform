-- ============================================
-- Elite Investor Academy - Member Profiles, Tier Overrides, Audit Logs
-- ============================================
-- Static-first admin: member_profiles + tier_overrides + audit_logs.
-- Admin determined by auth: user_metadata.role = 'admin' OR app_metadata.role = 'admin'.

-- ============================================
-- HELPER: Is current user admin (from JWT metadata)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin_from_jwt()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    (auth.jwt()->'app_metadata'->>'role') = 'admin'
    OR (auth.jwt()->'user_metadata'->>'role') = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- MEMBER_PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS member_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'guest' CHECK (tier IN ('starter', 'serious', 'elite', 'guest')),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_profiles_email ON member_profiles(email);
CREATE INDEX IF NOT EXISTS idx_member_profiles_tier ON member_profiles(tier);

ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;

-- User can select/update their own row
CREATE POLICY "member_profiles_select_own"
  ON member_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "member_profiles_update_own"
  ON member_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admin can select/update all rows (from JWT metadata)
CREATE POLICY "member_profiles_admin_select"
  ON member_profiles FOR SELECT
  USING (public.is_admin_from_jwt());

CREATE POLICY "member_profiles_admin_update"
  ON member_profiles FOR UPDATE
  USING (public.is_admin_from_jwt());

-- Allow insert for new users (trigger) via service role or auth
CREATE POLICY "member_profiles_insert_own"
  ON member_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- TIER_OVERRIDES
-- ============================================
CREATE TABLE IF NOT EXISTS tier_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  override_tier TEXT NOT NULL CHECK (override_tier IN ('starter', 'serious', 'elite', 'guest')),
  reason TEXT,
  expires_at TIMESTAMPTZ NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tier_overrides_user_id ON tier_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_tier_overrides_expires_at ON tier_overrides(expires_at);

ALTER TABLE tier_overrides ENABLE ROW LEVEL SECURITY;

-- Admin can select all; user can select own (for dashboard tier resolution)
CREATE POLICY "tier_overrides_admin_select"
  ON tier_overrides FOR SELECT
  USING (public.is_admin_from_jwt());

CREATE POLICY "tier_overrides_select_own"
  ON tier_overrides FOR SELECT
  USING (auth.uid() = user_id);

-- Only admin can insert
CREATE POLICY "tier_overrides_admin_insert"
  ON tier_overrides FOR INSERT
  WITH CHECK (public.is_admin_from_jwt());

-- Only admin can update (e.g. set expires_at)
CREATE POLICY "tier_overrides_admin_update"
  ON tier_overrides FOR UPDATE
  USING (public.is_admin_from_jwt())
  WITH CHECK (public.is_admin_from_jwt());

-- Only admin can delete (remove override)
CREATE POLICY "tier_overrides_admin_delete"
  ON tier_overrides FOR DELETE
  USING (public.is_admin_from_jwt());

-- ============================================
-- AUDIT_LOGS (admin-only read; admin-only insert)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admin can select
CREATE POLICY "audit_logs_admin_select"
  ON audit_logs FOR SELECT
  USING (public.is_admin_from_jwt());

-- Only admin can insert
CREATE POLICY "audit_logs_admin_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (public.is_admin_from_jwt());

-- ============================================
-- TRIGGER: Create member_profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_member_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.member_profiles (id, email, tier, role)
  VALUES (NEW.id, NEW.email, 'guest', 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_member_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_member_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_member_profile();

-- ============================================
-- Backfill member_profiles from profiles (if exists)
-- ============================================
INSERT INTO public.member_profiles (id, email, tier, role, created_at, updated_at)
SELECT p.id, p.email,
  CASE
    WHEN p.tier IN ('starter', 'serious', 'elite', 'guest') THEN p.tier
    ELSE 'guest'
  END,
  COALESCE(p.role, 'user'),
  COALESCE(p.created_at, NOW()),
  COALESCE(p.updated_at, NOW())
FROM public.profiles p
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  tier = CASE WHEN member_profiles.tier = 'guest' AND EXCLUDED.tier IN ('starter','serious','elite','guest') THEN EXCLUDED.tier ELSE member_profiles.tier END,
  role = COALESCE(NULLIF(member_profiles.role, 'admin'), EXCLUDED.role),
  updated_at = NOW();

-- ============================================
-- updated_at trigger for member_profiles
-- ============================================
DROP TRIGGER IF EXISTS member_profiles_updated_at ON member_profiles;
CREATE TRIGGER member_profiles_updated_at
  BEFORE UPDATE ON member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ENTITLEMENTS: Allow admin to insert/update (static-first, no API)
-- ============================================
CREATE POLICY "entitlements_admin_insert"
  ON entitlements FOR INSERT
  WITH CHECK (public.is_admin_from_jwt());

CREATE POLICY "entitlements_admin_update"
  ON entitlements FOR UPDATE
  USING (public.is_admin_from_jwt())
  WITH CHECK (public.is_admin_from_jwt());

CREATE POLICY "entitlements_admin_select"
  ON entitlements FOR SELECT
  USING (public.is_admin_from_jwt());
