-- ============================================
-- Elite Investor Academy - Membership Automation
-- ============================================
-- Run after complete-schema.sql (profiles + payments exist).
-- Adds: entitlements, audit_log, webhook_events; updates RLS.

-- ============================================
-- ENTITLEMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  product_key TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  source TEXT,
  square_order_id TEXT,
  square_payment_id TEXT,
  square_customer_id TEXT,
  square_checkout_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT entitlements_user_or_email CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

-- ============================================
-- AUDIT_LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WEBHOOK_EVENTS TABLE (idempotency)
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_email ON entitlements(email);
CREATE INDEX IF NOT EXISTS idx_entitlements_status_expires ON entitlements(status, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_entitlements_square_payment ON entitlements(square_payment_id) WHERE square_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_email ON audit_log(target_email);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log(actor_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

-- ============================================
-- RLS: PROFILES (update policies)
-- ============================================
-- Drop existing permissive update policies if they allow tier/role update by anyone.
-- Users may update own profile but NOT tier, NOT role. Admins may update anyone.

-- Recreate profiles policies for clarity (run after complete-schema)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Users can update own row only when not changing tier or role (enforced by trigger below)
CREATE POLICY "Users can update own profile non-sensitive"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Trigger: prevent non-admins from updating tier or role
CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive()
RETURNS TRIGGER AS $$
BEGIN
  IF (auth.uid() = NEW.id) THEN
    IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RETURN NEW;
    END IF;
    IF OLD.tier IS DISTINCT FROM NEW.tier OR OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'Only admins can update tier or role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_guard_sensitive_trigger ON profiles;
CREATE TRIGGER profiles_guard_sensitive_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_sensitive();

-- ============================================
-- RLS: ENTITLEMENTS
-- ============================================
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own entitlements"
  ON entitlements FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE for anon or authenticated; service role bypasses RLS
CREATE POLICY "Service role can manage entitlements"
  ON entitlements FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- RLS: AUDIT_LOG
-- ============================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users cannot read audit_log
CREATE POLICY "No public read audit_log"
  ON audit_log FOR SELECT
  USING (false);

-- Admins can read audit_log
CREATE POLICY "Admins can read audit_log"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only service role can insert (webhook, claim, cron) or admin via API
CREATE POLICY "Service role can insert audit_log"
  ON audit_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- RLS: WEBHOOK_EVENTS
-- ============================================
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only webhook_events"
  ON webhook_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
