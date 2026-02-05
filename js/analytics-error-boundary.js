// ============================================
// Elite Investor Academy - Global Error Boundary (Passive)
// ============================================
// Capture unexpected JS errors and unhandled rejections; log via analytics. No raw errors shown to users.
// Load early (e.g. right after auth/config.js) so it catches errors from subsequent scripts.

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  function logError(eventType, payload) {
    try {
      import('./analytics.js').then(function (m) {
        if (m.ENABLE_ANALYTICS) {
          m.track(eventType, { metadata: payload });
        }
      }).catch(function () {});
    } catch (_) {}
  }

  window.addEventListener('error', function (event) {
    logError('client_error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error && event.error.stack ? String(event.error.stack).slice(0, 2000) : undefined
    });
    // Do not show raw error to user; allow default if needed for dev tools
    // event.preventDefault() not used so console still shows error for developers
  });

  window.addEventListener('unhandledrejection', function (event) {
    logError('client_error', {
      reason: event.reason != null ? String(event.reason) : 'unknown',
      type: 'unhandledrejection'
    });
    // Do not prevent default so promise rejection still appears in console
  });
})();
