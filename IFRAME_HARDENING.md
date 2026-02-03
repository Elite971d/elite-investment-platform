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
- **CSP frame-ancestors** — Blocks embedding unless parent origin matches approved domains
- **Referrer check** — Protected wrappers reject requests from unknown origins
- **Auth required** — Direct calculator URLs redirect to protected wrapper; auth + tier verified before load
- **Origin verification in calculator-gate** — When loaded in iframe, verifies referrer origin before rendering

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
| `vercel.json` | CSP `frame-ancestors` headers on calculator pages, protected.html, dealcheck/protected.html, /tools/* |
| `protected.html` | Referrer check before auth (block if referrer from unknown origin) |
| `dealcheck/protected.html` | Referrer check (extended localhost origins) |
| `js/calculator-gate.js` | Origin verification when in iframe; block if referrer not in allowed list |
| `js/iframe-config.js` | Central config for allowed origins and hardened tool list |
