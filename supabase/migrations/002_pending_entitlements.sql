-- ============================================
-- Elite Investor Academy - Pending Entitlements
-- ============================================
-- Run after 001_membership_automation.sql
-- Used when Square webhook receives payment but user does not exist yet.
-- Claim API should migrate these to entitlements when user signs up.

CREATE TABLE IF NOT EXISTS pending_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  product_key TEXT NOT NULL,
  square_payment_id TEXT,
  square_checkout_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_entitlements_email ON pending_entitlements(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_entitlements_square_payment ON pending_entitlements(square_payment_id) WHERE square_payment_id IS NOT NULL;

ALTER TABLE pending_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage pending_entitlements"
  ON pending_entitlements FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
