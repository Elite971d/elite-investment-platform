// ============================================
// Elite Investor Academy - Client-Side Analytics (Passive Monitoring)
// ============================================
// Non-blocking, fail silently, never affects UI or auth. Toggle via ENABLE_ANALYTICS.
// Schema: event_type, user_id (nullable), role, tier, page, timestamp, metadata (json)

/** Single flag to enable/disable all analytics. Set to false to turn off. */
export const ENABLE_ANALYTICS = true;

const TABLE_NAME = 'analytics_events';

function getSupabaseConfig() {
  if (typeof window === 'undefined') return null;
  const url = window.__SUPABASE_URL__ || '';
  const anonKey = window.__SUPABASE_ANON_KEY__ || '';
  if (!url || !anonKey || url === 'https://YOUR_PROJECT_ID.supabase.co' || anonKey === 'YOUR_PUBLIC_ANON_KEY') {
    return null;
  }
  return { url, anonKey };
}

/**
 * Record an analytics event. Non-blocking; never throws.
 * @param {string} eventType - e.g. 'page_view', 'auth_state', 'calculator_access', 'login_success', 'logout', 'client_error', 'tier_mismatch', 'auth_session_event'
 * @param {object} payload - { user_id?, role?, tier?, page?, metadata? }
 */
export function track(eventType, payload = {}) {
  if (!ENABLE_ANALYTICS) return;

  try {
    const row = {
      event_type: String(eventType),
      user_id: payload.user_id ?? null,
      role: payload.role ?? null,
      tier: payload.tier ?? null,
      page: payload.page ?? null,
      occurred_at: new Date().toISOString(),
      metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {}
    };

    const config = getSupabaseConfig();
    if (config) {
      import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
        .then(({ createClient }) => {
          const supabase = createClient(config.url, config.anonKey);
          return supabase.from(TABLE_NAME).insert(row);
        })
        .then(({ error }) => {
          if (error) throw error;
        })
        .catch(() => {
          // Fallback: console only (passive, no user impact)
          if (typeof console !== 'undefined' && console.log) {
            console.log('[analytics]', eventType, row);
          }
        });
    } else {
      if (typeof console !== 'undefined' && console.log) {
        console.log('[analytics]', eventType, row);
      }
    }
  } catch (_) {
    // Fail silently
  }
}
