// View Pricing scroll + pricing tabs (external to satisfy CSP on Vercel - no inline scripts)
document.addEventListener("DOMContentLoaded", function () {
  // ---- View Pricing button -> scroll to pricing section ----
  var viewBtn = document.getElementById("viewPricingBtn");
  var pricingEl = document.getElementById("pricing");
  if (viewBtn && pricingEl) {
    viewBtn.addEventListener("click", function (e) {
      e.preventDefault();
      pricingEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ---- Pricing tabs: Tools vs Academy ----
  var toolsBtn = document.getElementById("tabToolsBtn");
  var academyBtn = document.getElementById("tabAcademyBtn");
  var toolsTab = document.getElementById("tools");
  var academyTab = document.getElementById("academy");

  function setActiveTab(which) {
    if (!toolsBtn || !academyBtn || !toolsTab || !academyTab) return;

    toolsBtn.classList.toggle("active", which === "tools");
    academyBtn.classList.toggle("active", which === "academy");
    toolsTab.classList.toggle("active", which === "tools");
    academyTab.classList.toggle("active", which === "academy");
  }

  if (toolsBtn) toolsBtn.addEventListener("click", function (e) { e.preventDefault(); setActiveTab("tools"); });
  if (academyBtn) academyBtn.addEventListener("click", function (e) { e.preventDefault(); setActiveTab("academy"); });
});
