// ============================================
// Elite Investor Academy - Tool page guard
// ============================================
// Member-facing calculators only: offer, brrrr, rehabtracker, pwt, dealcheck, commercial.
// If the page is loaded directly (not in iframe), redirect to protected wrapper so auth + tier are checked.
// Do NOT use on Investor Buy Box or any internal/non-gated tools.
// Usage: <script src="/js/tool-guard.js" data-tool="offer"></script>
// Or set window.ESN_TOOL_ID = 'offer' before this script.

(function () {
  if (window.top === window.self) {
    var script = document.currentScript;
    var tool = (script && script.getAttribute('data-tool')) || window.ESN_TOOL_ID;
    if (tool) {
      var isDealCheck = window.location.hostname.indexOf('dealcheck') !== -1;
      var target = isDealCheck
        ? 'https://invest.elitesolutionsnetwork.com/protected.html?tool=' + encodeURIComponent(tool)
        : window.location.pathname.replace(/\/[^/]+$/, '') + '/protected.html?tool=' + encodeURIComponent(tool);
      if (!target.startsWith('http')) target = window.location.origin + (target.startsWith('/') ? '' : '/') + target;
      window.location.replace(target);
    }
  }
})();
