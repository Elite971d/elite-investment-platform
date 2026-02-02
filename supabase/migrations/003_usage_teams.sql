-- ============================================
-- Elite Investor Academy - usage_logs, teams, team_members
-- ============================================
-- Run after 002_pending_entitlements.sql
-- RLS: users write usage_logs only for themselves; teams/team_members per spec.

-- ============================================
-- USAGE_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_tool ON usage_logs(tool);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can INSERT only for themselves (user_id = auth.uid())
CREATE POLICY "Users can insert own usage_logs"
  ON usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can SELECT only their own
CREATE POLICY "Users can select own usage_logs"
  ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can SELECT all (for analytics)
CREATE POLICY "Admins can select all usage_logs"
  ON usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No UPDATE/DELETE for usage_logs (append-only)

-- ============================================
-- TEAMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seat_limit INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage own teams"
  ON teams FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Team members can read team"
  ON teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = teams.id AND user_id = auth.uid()
    )
  );

-- ============================================
-- TEAM_MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team owner can manage members"
  ON team_members FOR ALL
  USING (
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND owner_id = auth.uid())
  );

CREATE POLICY "Users can read own memberships"
  ON team_members FOR SELECT
  USING (auth.uid() = user_id);
