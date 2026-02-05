// ============================================
// Elite Investor Academy - Embed Guard (Calculator Iframe Hardening)
// ============================================
// Include as the FIRST script in <body> on every calculator page.
// If the page is in an iframe and document.referrer is not from an approved domain,
// replaces body with "Unauthorized embed" and stops execution (no further scripts run).
// Does nothing when opened normally (window.top === window.self) so normal navigation is unchanged.

(function () {
  'use strict';
  if (window.top === window.self) return;
  if (!document.body) return;

  var allowed = [
    'https://invest.elitesolutionsnetwork.com',
    'https://dealcheck.elitesolutionsnetwork.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ];
  var ref = document.referrer;
  if (!ref) {
    document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;text-align:center;">Unauthorized embed</p>';
    return;
  }
  try {
    var origin = new URL(ref).origin;
    for (var i = 0; i < allowed.length; i++) {
      if (allowed[i] === origin) return;
    }
  } catch (e) {}
  document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;text-align:center;">Unauthorized embed</p>';
})();
