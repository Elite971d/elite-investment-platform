/**
 * Elite Investor Academy - Login handler
 * Wrapped in DOMContentLoaded. Uses supabase.auth.signInWithPassword, verifies session
 * with getSession() after login, redirects to /dashboard on success.
 * Hardcoded admin: admin@elitesolutionsnetwork.com bypasses normal role check.
 */
document.addEventListener('DOMContentLoaded', async function () {
  const form = document.getElementById('loginForm');
  if (!form) {
    console.warn('[login] #loginForm not found');
    return;
  }

  const ADMIN_EMAIL = 'admin@elitesolutionsnetwork.com';

  function setHardcodeAdminCookie() {
    const maxAge = 7 * 24 * 60 * 60;
    const domain = typeof window !== 'undefined' && window.location?.hostname?.includes('elitesolutionsnetwork.com')
      ? ';domain=.elitesolutionsnetwork.com'
      : '';
    const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? ';Secure' : '';
    document.cookie = 'esn_hardcode_admin=1;path=/' + domain + ';max-age=' + maxAge + ';SameSite=Lax' + secure;
  }

  try {
    const { getSupabase } = await import('./supabase-auth-cookies.js');
    const { track } = await import('./analytics.js');

    const supabase = await getSupabase();
    console.log('[login] Supabase client (shared):', { auth: supabase?.auth ? 'present' : 'missing' });

    // Check if already logged in (redirect to dashboard)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('[login] getSession failed:', error.message || error);
        try { track('auth_state', { role: 'guest', tier: 'guest', page: 'login', metadata: { error: 'getSession_failed' } }); } catch (_) {}
        return;
      }
      if (session) {
        try {
          const role = session.user?.user_metadata?.role ?? session.user?.app_metadata?.role ?? 'user';
          const tier = session.user?.user_metadata?.tier ?? session.user?.app_metadata?.tier ?? 'guest';
          track('auth_state', { user_id: session.user?.id, role, tier, page: 'login', metadata: { state: 'already_signed_in' } });
        } catch (_) {}
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        const path = redirect && redirect.startsWith('/') ? redirect : '/dashboard.html';
        window.location.replace(path);
      } else {
        try { track('auth_state', { role: 'guest', tier: 'guest', page: 'login' }); } catch (_) {}
      }
    }).catch((err) => {
      console.warn('[login] getSession error:', err?.message || err);
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const errorMsg = document.getElementById('errorMsg');
      const successMsg = document.getElementById('successMsg');
      const loading = document.getElementById('loading');
      const submitBtn = document.getElementById('submitBtn');

      const email = document.getElementById('email')?.value?.trim() || '';
      const password = document.getElementById('password')?.value || '';

      errorMsg?.classList.remove('show');
      successMsg?.classList.remove('show');
      loading?.classList.add('show');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error('[login] Login error:', error?.message || error);
          if (errorMsg) errorMsg.textContent = error.message;
          errorMsg?.classList.add('show');
          loading?.classList.remove('show');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        // Wait for session confirmation before any redirect
        const sessionData = await supabase.auth.getSession();
        if (sessionData.error) {
          console.error('[login] Session verification failed:', sessionData.error?.message || sessionData.error);
          if (errorMsg) errorMsg.textContent = 'Session could not be verified. Please try again.';
          errorMsg?.classList.add('show');
          loading?.classList.remove('show');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (!sessionData.data?.session) {
          console.error('[login] Session not established after signIn');
          if (errorMsg) errorMsg.textContent = 'Session could not be established. Please try again or clear cookies.';
          errorMsg?.classList.add('show');
          loading?.classList.remove('show');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const isAdmin = email.toLowerCase() === ADMIN_EMAIL;
        const role = isAdmin ? 'admin' : (data.user?.user_metadata?.role ?? data.user?.app_metadata?.role ?? 'user');
        if (isAdmin) {
          setHardcodeAdminCookie();
          localStorage.setItem('esn_admin_override', 'true');
          localStorage.setItem('esn_user_role', 'admin');
          const maxAge = 7 * 24 * 60 * 60;
          const domain = typeof window !== 'undefined' && window.location?.hostname?.includes('elitesolutionsnetwork.com')
            ? ';domain=.elitesolutionsnetwork.com'
            : '';
          const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? ';Secure' : '';
          document.cookie = 'esn_admin_override=1;path=/' + domain + ';max-age=' + maxAge + ';SameSite=Lax' + secure;
        }

        console.log('[login] Session established:', { user_id: data.user?.id, role });
        try {
          const tier = data.user?.user_metadata?.tier ?? data.user?.app_metadata?.tier ?? 'guest';
          track('login_success', { user_id: data.user?.id, role, tier, page: 'login' });
        } catch (_) {}

        if (successMsg) successMsg.textContent = 'Login successful! Redirecting...';
        successMsg?.classList.add('show');

        const allowedPaths = ['/dashboard.html', '/', '/index.html', '/success.html', '/protected.html'];
        const allowedOrigins = [
          'https://invest.elitesolutionsnetwork.com',
          'https://dealcheck.elitesolutionsnetwork.com',
          'http://localhost:3000',
          'http://localhost:5173'
        ];
        const isAllowedOrigin = (o) =>
          allowedOrigins.includes(o) || (o.startsWith('https://') && o.endsWith('.vercel.app'));
        const redirectParam = new URLSearchParams(window.location.search).get('redirect');
        let target = '/dashboard.html';
        if (redirectParam) {
          try {
            const url = redirectParam.startsWith('http') ? new URL(redirectParam) : new URL(redirectParam, window.location.origin);
            const path = url.pathname || '/';
            if (isAllowedOrigin(url.origin) && allowedPaths.includes(path)) target = url.href;
            else if (redirectParam.startsWith('/') && allowedPaths.includes(path)) target = redirectParam;
          } catch (_) {}
        }
        setTimeout(() => {
          window.location.href = target;
        }, 500);
      } catch (err) {
        console.error('[login] Unexpected login failure:', err?.message || err, err);
        if (errorMsg) errorMsg.textContent = (err && err.message) ? err.message : 'Login failed unexpectedly.';
        errorMsg?.classList.add('show');
        loading?.classList.remove('show');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  } catch (err) {
    console.error('[login] Init failed:', err?.message || err, err);
  }
});
