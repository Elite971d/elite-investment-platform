# Vercel Static-Only Configuration

This project is a **static HTML site**. Configure Vercel as follows so that no framework or build runs.

## Required Vercel Dashboard Settings

1. **Project → Settings → General**
   - **Framework Preset:** `Other` (do not use Next.js, Create React App, etc.)
   - **Build Command:** leave **empty**
   - **Install Command:** leave **empty**
   - **Output Directory:** `.` (root)

2. **Project → Settings → Git**
   - **Production Branch:** `main` only
   - Disable or ignore other branches so only `main` deploys.

3. **Do not**
   - Add a build step
   - Use framework detection
   - Require environment variables for the static HTML to be served (/, /index.html, /login.html, /dashboard.html, /success.html)

## Valid URLs (must not 404)

- `https://invest.elitesolutionsnetwork.com/` → serves `index.html`
- `https://invest.elitesolutionsnetwork.com/index.html`
- `https://invest.elitesolutionsnetwork.com/login.html`
- `https://invest.elitesolutionsnetwork.com/dashboard.html`
- `https://invest.elitesolutionsnetwork.com/success.html`

All of these files live in the repository root. With Output Directory `.`, Vercel serves them as static files.

## Unused for static deployment

- **`api/`** – Serverless functions are not deployed (no `vercel.json` or build). Kept in repo for reference only; this deployment serves static HTML only.
- **`tsconfig.json`** – Removed so no TypeScript/build tooling is assumed.
