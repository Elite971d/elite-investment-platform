-- ============================================
-- Elite Investor Academy - Subscription & Billing (Source of Truth)
-- ============================================
-- Supabase = ACCESS source of truth. Square = BILLING source of truth.
-- tier controls access; subscription_status controls enforcement. Admin ALWAYS bypasses.

-- ============================================
-- ADD SUBSCRIPTION COLUMNS TO member_profiles
-- ============================================
-- (tier and role already exist)

ALTER TABLE member_profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial'
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trial')),
  ADD COLUMN IF NOT EXISTS billing_provider TEXT DEFAULT 'square'
    CHECK (billing_provider IN ('square')),
  ADD COLUMN IF NOT EXISTS square_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS square_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_status TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ;

-- Allow 'pro' in tier (keep existing values)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member_profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE member_profiles DROP CONSTRAINT IF EXISTS member_profiles_tier_check;
    ALTER TABLE member_profiles ADD CONSTRAINT member_profiles_tier_check
      CHECK (tier IN ('guest', 'starter', 'serious', 'elite', 'pro', 'academy_starter', 'academy_pro', 'academy_premium'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if constraint name differs or already applied
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_profiles_subscription_status ON member_profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_member_profiles_grace_until ON member_profiles(grace_until) WHERE grace_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_profiles_square_subscription_id ON member_profiles(square_subscription_id) WHERE square_subscription_id IS NOT NULL;

-- ============================================
-- SERVER-AUTHORITATIVE: resolve_effective_tier(user_id)
-- ============================================
-- Returns effective_tier for access. Admin always bypasses. Never downgrade silently.

CREATE OR REPLACE FUNCTION public.resolve_effective_tier(p_user_id UUID)
RETURNS TABLE(effective_tier TEXT, reason TEXT) AS $$
DECLARE
  v_role TEXT;
  v_override_tier TEXT;
  v_tier TEXT;
  v_sub_status TEXT;
  v_grace_until TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1) Admin: full access (from member_profiles.role or profiles.role)
  SELECT role INTO v_role FROM public.member_profiles WHERE id = p_user_id LIMIT 1;
  IF v_role IS NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id LIMIT 1;
  END IF;
  IF v_role = 'admin' THEN
    RETURN QUERY SELECT 'admin'::TEXT, 'role_admin'::TEXT;
    RETURN;
  END IF;

  -- 2) Active tier override (do not downgrade override)
  SELECT to.override_tier INTO v_override_tier
  FROM public.tier_overrides to
  WHERE to.user_id = p_user_id
    AND (to.expires_at IS NULL OR to.expires_at > v_now)
  ORDER BY to.created_at DESC
  LIMIT 1;
  IF v_override_tier IS NOT NULL AND v_override_tier <> '' THEN
    RETURN QUERY SELECT v_override_tier::TEXT, 'override'::TEXT;
    RETURN;
  END IF;

  -- 3) Load subscription state (member_profiles is source of truth)
  SELECT mp.tier, mp.subscription_status, mp.grace_until
  INTO v_tier, v_sub_status, v_grace_until
  FROM public.member_profiles mp
  WHERE mp.id = p_user_id
  LIMIT 1;

  IF v_tier IS NULL THEN
    SELECT p.tier INTO v_tier FROM public.profiles p WHERE p.id = p_user_id LIMIT 1;
  END IF;
  IF v_tier IS NULL OR v_tier = '' THEN
    RETURN QUERY SELECT 'guest'::TEXT, 'default_no_profile'::TEXT;
    RETURN;
  END IF;

  -- subscription_status null or trial: treat as active (no auto-downgrade)
  IF v_sub_status IS NULL OR v_sub_status = 'trial' THEN
    RETURN QUERY SELECT v_tier::TEXT, 'subscription_trial_or_null'::TEXT;
    RETURN;
  END IF;

  IF v_sub_status = 'active' THEN
    RETURN QUERY SELECT v_tier::TEXT, 'subscription_active'::TEXT;
    RETURN;
  END IF;

  IF v_sub_status = 'past_due' THEN
    IF v_grace_until IS NOT NULL AND v_now < v_grace_until THEN
      RETURN QUERY SELECT v_tier::TEXT, 'grace_period'::TEXT;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'guest'::TEXT, 'past_due_grace_exceeded'::TEXT;
    RETURN;
  END IF;

  IF v_sub_status = 'canceled' THEN
    RETURN QUERY SELECT 'guest'::TEXT, 'subscription_canceled'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_tier::TEXT, 'unknown_status_keep_access'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- AUDIT: Log tier downgrade / enforcement events
-- ============================================
-- Call from app or webhook when downgrade or billing event occurs.

CREATE OR REPLACE FUNCTION public.log_subscription_event(
  p_actor_id UUID,
  p_action TEXT,
  p_target_user_id UUID,
  p_meta JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, target_user_id, meta)
  VALUES (p_actor_id, p_action, p_target_user_id, p_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow service role and authenticated (for client-side logging with actor_id = user)
-- RLS on audit_logs already restricts who can insert (admin only in 005). So we need a way for
-- server/service to log. The function is SECURITY DEFINER so it runs as owner and can insert.
-- Client should not call this with arbitrary target_user_id unless admin. Prefer calling from
-- API/serverless only for billing events. For client-side "enforcement decision" we can use
-- analytics_events which allows insert. So: use audit_logs for server-logged events (webhook,
-- cron). Use analytics_events for client-side enforcement logging.
-- Leave log_subscription_event for server-side use (API routes).

COMMENT ON FUNCTION public.resolve_effective_tier(UUID) IS 'Server-authoritative effective tier. Admin bypasses. Past-due past grace = guest. Canceled = guest. Missing data = keep access (fail-safe).';
COMMENT ON FUNCTION public.log_subscription_event(UUID, TEXT, UUID, JSONB) IS 'Log subscription/billing event to audit_logs. Call from server only.';

-- ============================================
-- BILLING RETRY: record failed payment (call from webhook/server)
-- ============================================
-- Grace days: 1st retry 3d, 2nd 5d, 3rd+ 7d (configurable via param).

CREATE OR REPLACE FUNCTION public.record_payment_failure(
  p_user_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_grace_days_1 INT DEFAULT 3,
  p_grace_days_2 INT DEFAULT 5,
  p_grace_days_3 INT DEFAULT 7
)
RETURNS void AS $$
DECLARE
  v_retry_count INT;
  v_grace_days INT;
  v_grace_until TIMESTAMPTZ;
  v_actor UUID := COALESCE(p_actor_id, p_user_id);
BEGIN
  SELECT COALESCE(retry_count, 0) INTO v_retry_count
  FROM public.member_profiles
  WHERE id = p_user_id;

  v_retry_count := v_retry_count + 1;
  v_grace_days := CASE
    WHEN v_retry_count = 1 THEN p_grace_days_1
    WHEN v_retry_count = 2 THEN p_grace_days_2
    ELSE p_grace_days_3
  END;
  v_grace_until := NOW() + (v_grace_days || ' days')::INTERVAL;

  UPDATE public.member_profiles
  SET
    subscription_status = 'past_due',
    last_payment_status = 'failed',
    retry_count = v_retry_count,
    grace_until = v_grace_until,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_user_id, meta)
  VALUES (v_actor, 'BILLING_RETRY_FAILED', p_user_id, jsonb_build_object(
    'retry_count', v_retry_count,
    'grace_until', v_grace_until,
    'grace_days', v_grace_days
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_payment_failure(UUID, UUID, INT, INT, INT) IS 'Increment retry_count, set grace_until (3/5/7 days), set past_due. Call from Square webhook/server. Do NOT send email here — use app-level recovery hook.';
