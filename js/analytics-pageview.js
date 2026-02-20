// ============================================
// Elite Investor Academy - Page View Analytics (load once per page)
// ============================================
// Include: <script type="module" src="/js/analytics-pageview.js" data-page="dashboard"></script>
// data-page optional; falls back to pathname (e.g. /dashboard.html -> dashboard)

(function () {
  try {
    const script = typeof document !== 'undefined' && document.currentScript;
    const page = (script && script.getAttribute && script.getAttribute('data-page')) ||
      (typeof window !== 'undefined' && window.location && window.location.pathname
        ? (window.location.pathname.replace(/^\//, '').replace(/\.html$/, '') || 'index')
        : 'unknown');
    import('./analytics.js').then(function (m) {
      m.track('page_view', { page: page });
    }).catch(function () {});
  } catch (_) {}
})();
