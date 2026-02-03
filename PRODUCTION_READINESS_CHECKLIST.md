# Production Staging Safety Check — Checklist

**Date:** 2025-02-03  
**Scope:** Routes, index staticness, dashboard auth, admin access, 404s.

---

## 1. No broken routes

| Check | Status | Notes |
|-------|--------|--------|
| `vercel.json` rewrites | **OK** | No rewrites; only CSP headers. No routes altered. |
| Entry points | **OK** | `index.html`, `login.html`, `dashboard.html`, `admin.html` exist and are linked. |
| Auth flow pages | **OK** | `login.html`, `reset.html`, `magic-link.html`, `success.html`, `reset-password.html` exist. |
| Protected wrappers | **OK** | `protected.html`, `dealcheck/protected.html` exist. |

**Action:** See “404s” below for referenced-but-missing assets.

---

## 2. index.html remains static

| Check | Status | Notes |
|-------|--------|--------|
| No auth script on index | **OK** | No Supabase/auth script; page does not check session. |
| No redirect when unauthenticated | **OK** | No redirect to login; page always renders. |
| Static content only | **OK** | HTML/CSS/JS only; countdown and pricing tabs are client-side only. |
| Outbound links | **OK** | Footer links to `login.html` and `dashboard.html` (both exist). |

**Verdict:** **PASS** — index is suitable for static hosting and remains the public landing page.

---

## 3. Dashboard requires auth

| Check | Status | Notes |
|-------|--------|--------|
| Auth check on load | **OK** | `checkAuth()` runs in main init (line ~459). |
| Redirect when no session | **OK** | `getSession()` then `window.location.href = '/login.html'` if no session. |
| No dashboard content without session | **OK** | Init returns early if `checkAuth()` returns null; no profile/tools rendered. |

**Verdict:** **PASS** — dashboard is not usable without being logged in.

---

## 4. Internal tools unreachable without admin role

| Check | Status | Notes |
|-------|--------|--------|
| Admin page requires session | **OK** | `admin.html` redirects to `login.html?redirect=...` if no session. |
| Admin role enforced | **OK** | `isAdmin(userId)` checks `profiles.role === 'admin'`; non-admins see “You must be an administrator” and `#adminPanel` stays hidden. |
| Internal tools only in admin UI | **OK** | Internal tools (e.g. Investor Buy Box) are grant/revoke only in admin panel; not in dashboard or pricing. |
| Admin link on dashboard | **OK** | “Admin” link shown only when `profile?.role === 'admin'`. |

**Verdict:** **PASS** — internal tools and admin actions are only reachable with admin role (and backend must enforce `/api/admin/*` separately).

---

## 5. No 404s introduced

| Asset | Referenced in | Exists in repo? | Risk |
|-------|----------------|------------------|------|
| `login.html` | index, redirects | Yes | None |
| `dashboard.html` | index, redirects | Yes | None |
| `admin.html` | dashboard (when admin) | Yes | None |
| `protected.html` | dashboard tool links | Yes | None |
| `dealcheck/protected.html` | dealcheck flow | Yes | None |
| `reset.html`, `magic-link.html`, `success.html`, `reset-password.html` | auth flows | Yes | None |
| **`academy.html`** | **dashboard.html** (Academy section) | **No** | **404 if user clicks “Open Academy Page”** |
| **`offer.html`, `brrrr.html`, `rehabtracker.html`, `pwt.html`, `dealcheck.html`, `commercial.html`** | **protected.html** iframe `calculatorFrame.src` | **No** (no `tools/` or root copies) | **404 when opening any calculator in iframe** |

**Verdict:** **CONDITIONAL** — 404s will occur for:

1. **academy.html** — Linked from dashboard for users with academy access. Add the file or change the link (e.g. to an external URL or “Request Access” only).
2. **Calculator pages** — `protected.html` loads relative paths (`offer.html`, `brrrr.html`, etc.). These files are not in the repo. Either add them (or under `/tools/` and fix paths in `protected.html` / `js/config.js`) or host them elsewhere and point iframe `src` to that origin.

---

## Summary

| Category | Result |
|----------|--------|
| No broken routes (config) | **PASS** |
| index.html static | **PASS** |
| Dashboard requires auth | **PASS** |
| Admin/internal tools gated by role | **PASS** |
| No 404s | **FIX NEEDED** (academy.html + calculator HTML files) |

**Production readiness:** **Conditional.** Safe to ship from an auth and static-index perspective. Resolve missing `academy.html` and calculator pages (or adjust links/iframe URLs) to avoid user-facing 404s.
