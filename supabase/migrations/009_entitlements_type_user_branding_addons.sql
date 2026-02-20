-- ============================================
-- Elite Investor Academy - Entitlements Extension + Add-ons + White-label
-- ============================================
-- SAFE MIGRATION: Only extends structure. Does NOT delete rows or remove RLS.
-- Supports: tier | tool | feature product keys.
-- Adds: user_branding for white-label feature.
--
-- Product keys:
--   Tiers: tier_starter, tier_serious, tier_elite
--   Tools: tool_brrrr, tool_commercial, tool_dealcheck, tool_buybox, tool_offer,
--          tool_profitsplit, tool_pwt, tool_rehabtracker, tool_wholesale
--   Feature: feature_whitelabel

-- ============================================
-- EXTEND ENTITLEMENTS: type column (optional, inferred from product_key)
-- ============================================
-- Add type column; existing rows remain valid (product_key already exists).
-- For legacy tier rows: product_key may be tier name or square-related; type helps distinguish.
ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS type TEXT
  CHECK (type IS NULL OR type IN ('tier', 'tool', 'feature'));

-- Index for fast lookups: user + product_key + status
CREATE INDEX IF NOT EXISTS idx_entitlements_user_product_status
  ON entitlements(user_id, product_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_entitlements_product_key ON entitlements(product_key);

COMMENT ON COLUMN entitlements.type IS 'tier | tool | feature. Optional; product_key is canonical.';

-- ============================================
-- USER_BRANDING TABLE (white-label)
-- ============================================
CREATE TABLE IF NOT EXISTS user_branding (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  logo_url TEXT,
  footer_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at trigger (uses shared update_updated_at_column from complete-schema)
DROP TRIGGER IF EXISTS user_branding_updated_at ON user_branding;
CREATE TRIGGER user_branding_updated_at
  BEFORE UPDATE ON user_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE user_branding ENABLE ROW LEVEL SECURITY;

-- Users can only access their own branding row
CREATE POLICY "user_branding_select_own"
  ON user_branding FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_branding_insert_own"
  ON user_branding FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_branding_update_own"
  ON user_branding FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read/update for support
CREATE POLICY "user_branding_admin_select"
  ON user_branding FOR SELECT
  USING (public.is_admin_from_jwt());

CREATE POLICY "user_branding_admin_update"
  ON user_branding FOR UPDATE
  USING (public.is_admin_from_jwt())
  WITH CHECK (public.is_admin_from_jwt());
