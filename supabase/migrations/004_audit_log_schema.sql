-- ============================================
-- Elite Investor Academy - Audit Log Schema (Clean + Safe)
-- ============================================
-- Run after 001_membership_automation.sql
-- Replaces legacy audit_log with structured schema; enforces immutability.

-- ============================================
-- MIGRATE LEGACY TABLE
-- ============================================
-- Drop policies from existing audit_log (created in 001)
DROP POLICY IF EXISTS "No public read audit_log" ON audit_log;
DROP POLICY IF EXISTS "Admins can read audit_log" ON audit_log;
DROP POLICY IF EXISTS "Service role can insert audit_log" ON audit_log;

-- Preserve existing rows for reference
ALTER TABLE IF EXISTS audit_log RENAME TO audit_log_legacy;

-- ============================================
-- NEW AUDIT_LOG TABLE
-- ============================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('GRANT', 'REVOKE', 'TIER_CHANGE')),
  target_email TEXT,
  tool_scope TEXT NOT NULL CHECK (tool_scope IN ('calculator', 'academy', 'internal')),
  tool_name TEXT,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INTEGRITY & IMMUTABILITY
-- ============================================
-- 1. reason is required (enforced by NOT NULL above).
-- 2. No UPDATE/DELETE: RLS has no UPDATE or DELETE policies.
-- 3. Trigger blocks UPDATE/DELETE at DB level (defense in depth).

CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; updates and deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_email ON audit_log(target_email);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_email ON audit_log(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_log_tool_scope ON audit_log(tool_scope);

-- ============================================
-- RLS (Read: admins only; Write: INSERT only, no UPDATE/DELETE)
-- ============================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- No public read
CREATE POLICY "audit_log_no_public_read"
  ON audit_log FOR SELECT
  USING (false);

-- Admins can read
CREATE POLICY "audit_log_admins_read"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can insert (backend / Edge Functions)
CREATE POLICY "audit_log_service_role_insert"
  ON audit_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Authenticated admins can insert (required reason enforced by NOT NULL)
CREATE POLICY "audit_log_admins_insert"
  ON audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    AND reason IS NOT NULL
  );

-- No UPDATE or DELETE policies: table is append-only.
