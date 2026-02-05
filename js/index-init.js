// index.html: AOS, pricing tabs, countdown (no module to avoid CSP issues with inline)
(function () {
  function init() {
    if (typeof AOS !== 'undefined') AOS.init({ once: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.openPricingTab = function (btn, id) {
    document.querySelectorAll('.pricing-tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.pricing-tab').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
  };

  var launchDate = new Date();
  launchDate.setDate(launchDate.getDate() + 10);
  var countEl = document.getElementById('countdown');
  if (countEl) {
    setInterval(function () {
      var d = launchDate - new Date();
      var days = Math.floor(d / (1000 * 60 * 60 * 24));
      countEl.textContent = days + ' days remaining';
    }, 1000);
  }
})();
