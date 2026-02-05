-- ============================================
-- Elite Investor Academy - Billing Events & Promo Codes
-- ============================================
-- Phase 1: Failed payment recovery pipeline (safe mode)
-- Phase 2: Coupons / promo codes (non-destructive)
-- No automatic emails; no change to tier enforcement.

-- ============================================
-- BILLING_EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('payment_failed', 'retry_scheduled', 'recovered', 'recovery_email_preview', 'promo_redemption')),
  provider TEXT NOT NULL DEFAULT 'square' CHECK (provider IN ('square')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_billing_events_user_id ON billing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_event_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON billing_events(created_at DESC);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Service role can insert/select (webhooks, serverless)
CREATE POLICY "billing_events_service_role_all"
  ON billing_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- MEMBER_PROFILES: last_recovery_email_sent_at
-- ============================================
ALTER TABLE member_profiles
  ADD COLUMN IF NOT EXISTS last_recovery_email_sent_at TIMESTAMPTZ;

-- ============================================
-- record_payment_failure: also insert billing_event
-- ============================================
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

  INSERT INTO public.billing_events (user_id, event_type, provider, metadata)
  VALUES (
    p_user_id,
    'payment_failed',
    'square',
    jsonb_build_object(
      'retry_count', v_retry_count,
      'next_retry_at', v_grace_until,
      'grace_days', v_grace_days
    )
  );

  INSERT INTO public.audit_logs (actor_id, action, target_user_id, meta)
  VALUES (v_actor, 'BILLING_RETRY_FAILED', p_user_id, jsonb_build_object(
    'retry_count', v_retry_count,
    'grace_until', v_grace_until,
    'grace_days', v_grace_days
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_payment_failure(UUID, UUID, INT, INT, INT) IS 'Increment retry_count, set grace_until, set past_due, insert billing_event. Call from Square webhook/server. Do NOT send email here.';

-- ============================================
-- PROMO_CODES
-- ============================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  applies_to_tiers TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  max_redemptions INTEGER NOT NULL DEFAULT 0 CHECK (max_redemptions >= 0),
  redemptions_used INTEGER NOT NULL DEFAULT 0 CHECK (redemptions_used >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active_expires ON promo_codes(active, expires_at) WHERE active = true;

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Only service role / backend: full access (no anon access to list or mutate)
CREATE POLICY "promo_codes_service_role_all"
  ON promo_codes FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- validate_promo(code, tier) -> JSONB
-- ============================================
-- Returns: { "valid": true|false, "discount_type": "...", "discount_value": N, "description": "..." }
-- Invalid: { "valid": false, "reason": "..." }
-- Promo codes NEVER override admin; never reduce active paid tier (enforced at app layer).
CREATE OR REPLACE FUNCTION public.validate_promo(p_code TEXT, p_tier TEXT)
RETURNS JSONB AS $$
DECLARE
  v_row promo_codes%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'no_code');
  END IF;
  IF p_tier IS NULL OR trim(p_tier) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'no_tier');
  END IF;

  SELECT * INTO v_row
  FROM public.promo_codes
  WHERE lower(trim(code)) = lower(trim(p_code))
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF NOT COALESCE(v_row.active, false) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_now >= v_row.expires_at THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  IF v_row.max_redemptions > 0 AND COALESCE(v_row.redemptions_used, 0) >= v_row.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'max_redemptions_reached');
  END IF;

  IF array_length(v_row.applies_to_tiers, 1) > 0 AND NOT (p_tier = ANY(v_row.applies_to_tiers)) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'tier_not_eligible');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'discount_type', v_row.discount_type,
    'discount_value', v_row.discount_value,
    'description', v_row.description,
    'code', v_row.code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.validate_promo(TEXT, TEXT) IS 'Validate promo code for a tier. Apply only at checkout/renewal. Never overrides admin or reduces active tier.';

GRANT EXECUTE ON FUNCTION public.validate_promo(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_promo(TEXT, TEXT) TO service_role;

-- ============================================
-- record_promo_redemption(code, user_id)
-- ============================================
-- Call ONLY after successful payment. Increments redemptions_used and logs billing_event.
CREATE OR REPLACE FUNCTION public.record_promo_redemption(p_code TEXT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_row promo_codes%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_code');
  END IF;

  SELECT * INTO v_row
  FROM public.promo_codes
  WHERE lower(trim(code)) = lower(trim(p_code))
  FOR UPDATE
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT COALESCE(v_row.active, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'inactive');
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_now >= v_row.expires_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF v_row.max_redemptions > 0 AND v_row.redemptions_used >= v_row.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'max_redemptions_reached');
  END IF;

  UPDATE public.promo_codes
  SET redemptions_used = redemptions_used + 1,
      updated_at = NOW()
  WHERE id = v_row.id;

  INSERT INTO public.billing_events (user_id, event_type, provider, metadata)
  VALUES (
    p_user_id,
    'promo_redemption',
    'square',
    jsonb_build_object(
      'promo_code', v_row.code,
      'discount_type', v_row.discount_type,
      'discount_value', v_row.discount_value
    )
  );

  RETURN jsonb_build_object('ok', true, 'code', v_row.code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_promo_redemption(TEXT, UUID) IS 'Increment promo redemptions_used and log billing_event. Call only after successful payment.';

GRANT EXECUTE ON FUNCTION public.record_promo_redemption(TEXT, UUID) TO service_role;
