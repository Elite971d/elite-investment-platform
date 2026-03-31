// ============================================
// Elite Investor Academy - Tool page guard
// ============================================
// Member-facing calculators only: offer, brrrr, rehabtracker, pwt, dealcheck, commercial.
// If loaded directly (not in iframe), route to hosted tool URL.
// Do NOT use on Investor Buy Box or any internal/non-gated tools.
// Usage: <script src="/js/tool-guard.js" data-tool="offer"></script>
// Or set window.ESN_TOOL_ID = 'offer' before this script.

(function () {
  if (window.top === window.self) {
    var script = document.currentScript;
    var tool = (script && script.getAttribute('data-tool')) || window.ESN_TOOL_ID;
    if (tool) {
      var target = 'https://dealcheck.elitesolutionsnetwork.com/tools/' + encodeURIComponent(tool) + '.html';
      window.location.replace(target);
    }
  }
})();
