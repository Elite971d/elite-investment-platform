-- ============================================
-- Elite Investor Academy - Analytics Events (Soft Launch Monitoring)
-- ============================================
-- Passive client-side event storage. No gating. Admin-only read.
-- Schema: event_type, user_id (nullable), role, tier, page, timestamp, metadata (jsonb)

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT,
  tier TEXT,
  page TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at ON analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_page ON analytics_events(page) WHERE page IS NOT NULL;

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon or authenticated) to insert — required for guest page views and login attempts
CREATE POLICY "analytics_events_insert_any"
  ON analytics_events FOR INSERT
  WITH CHECK (true);

-- Only admin can read (for future dashboards/reports)
CREATE POLICY "analytics_events_admin_select"
  ON analytics_events FOR SELECT
  USING (public.is_admin_from_jwt());
