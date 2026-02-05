# Iframe Hardening — Calculator Access (Public Safety)

## Summary

Member-facing calculators are hardened against unauthorized embedding and direct access. Internal tools are explicitly excluded.

---

## Hardened Calculators

The following **member-facing calculators** have iframe protections applied:

| Calculator | Tool ID | Min Tier |
|------------|---------|----------|
| Property Offer Calculator | `offer` | starter |
| BRRRR Analyzer | `brrrr` | starter |
| Rehab Tracker | `rehab` / `rehabtracker` | serious |
| Property Walkthrough Tool | `pwt` | serious |
| Deal Check | `dealcheck` | starter |
| Commercial Calculator | `commercial` | serious |

**Protections applied:**
- **Vercel security headers** — `X-Frame-Options: SAMEORIGIN`, full CSP (frame-ancestors + script/style/font/connect), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- **CSP frame-ancestors** — Embedding allowed only from approved domains (invest, dealcheck, localhost)
- **Runtime embed guard** — On calculator pages, first script in `<body>` is `js/embed-guard.js`: if in iframe and referrer not from approved domains, replaces body with "Unauthorized embed" and stops execution
- **Referrer check** — Protected wrappers reject requests from unknown origins
- **Auth required** — Direct calculator URLs redirect to protected wrapper; auth + tier verified before load
- **Origin verification in calculator-gate** — When loaded in iframe, verifies referrer origin before rendering; shows "Unauthorized embed" if disallowed

**Calculator page requirement:** Each calculator HTML (e.g. `offer.html`, `brrrr.html`, `/tools/*.html`) must include the runtime embed guard as the **first** script in `<body>` so execution stops before any other script if embedded from an unauthorized site:

```html
<body>
  <script src="/js/embed-guard.js"></script>
  <!-- rest of page: calculator-gate, content, etc. -->
</body>
```

---

## Excluded (Internal Tools)

| Tool | Status |
|------|--------|
| **Investor Buy Box** | Explicitly excluded. No tool-guard, calculator-gate, or frame restrictions. |

Internal tools and public widgets (e.g., Investor Buy Box) are not hardened and must never be added to `TOOL_MAP`, `TOOL_ACCESS`, `tool-guard`, or `calculator-gate` configurations.

---

## Approved Embed Origins

- `https://invest.elitesolutionsnetwork.com`
- `https://dealcheck.elitesolutionsnetwork.com`
- `http://localhost:3000`
- `http://localhost:5173`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`

---

## Implementation Details

| Component | Change |
|-----------|--------|
| `vercel.json` | Global headers for all routes: `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy` (default-src, script-src, style-src, font-src, img-src, connect-src, frame-ancestors), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Embedding only from invest, dealcheck, localhost. |
| `js/embed-guard.js` | **Include as the first script in `<body>` on every calculator page.** If `window.top !== window.self` and `document.referrer` is not from an approved domain, replaces body with "Unauthorized embed" and stops execution. No-op when opened normally. |
| `protected.html` | Referrer check before auth (block if referrer from unknown origin) |
| `dealcheck/protected.html` | Referrer check (extended localhost origins) |
| `js/calculator-gate.js` | Origin verification when in iframe; replaces body with "Unauthorized embed" if referrer not in allowed list |
| `js/iframe-config.js` | Central config for allowed origins and hardened tool list |
