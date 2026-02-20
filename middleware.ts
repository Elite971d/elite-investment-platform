/**
 * Vercel Edge Middleware - Server-side HTML protection
 *
 * Runs BEFORE static file delivery. Protects:
 * - /dealcheck/*
 * - /protected.html (root)
 * - Root-level .html files except login, index, reset, magic-link, reset-password
 *
 * Does NOT interfere with: /api/*, /_next/*, webhooks, cron, admin API routes.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Paths that are always allowed without authentication */
const PUBLIC_PATHS = [
  '/',
  '/index.html',
  '/login.html',
  '/reset.html',
  '/reset-password.html',
  '/magic-link.html',
  '/favicon.ico',
];

/** Path prefixes that bypass protection (API, assets, etc.) */
const BYPASS_PREFIXES = ['/api/', '/_next/', '/favicon.ico'];

/**
 * Check if request has a Supabase session cookie.
 * Supabase uses: sb-<project-ref>-auth-token or sb-access-token
 */
function hasSupabaseSession(request: NextRequest): boolean {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [name] = cookie.split('=');
    if (!name) continue;
    // sb-access-token or sb-*-auth-token
    if (name === 'sb-access-token') return true;
    if (name.startsWith('sb-') && name.includes('-auth-token')) return true;
  }
  return false;
}

/**
 * Check if path should be protected
 */
function isProtectedPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';

  // Bypass API, _next, favicon
  for (const prefix of BYPASS_PREFIXES) {
    if (path.startsWith(prefix) || path === prefix.replace(/\/$/, '')) return false;
  }

  // Public paths
  if (PUBLIC_PATHS.includes(path)) return false;
  if (PUBLIC_PATHS.includes(path + '/')) return false;

  // /dealcheck/* is always protected
  if (path.startsWith('/dealcheck')) return true;

  // Root protected.html
  if (path === '/protected.html') return true;

  // Root-level .html files (excluding public)
  if (/^\/[^/]+\.html$/.test(path)) return true;

  // Subdir HTML (e.g. /dealcheck/protected.html, calculator pages in subdirs)
  if (/\.html$/.test(path)) return true;

  return false;
}

/**
 * Build security headers for protected HTML responses
 */
function securityHeaders(): Record<string, string> {
  return {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only run protection logic on protected paths
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = hasSupabaseSession(request);

  if (!hasSession) {
    const loginUrl = new URL('/login.html', request.url);
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl, 302);
  }

  // Authenticated: pass through and add security headers to response
  const response = NextResponse.next();
  Object.entries(securityHeaders()).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export const config = {
  matcher: [
    '/dealcheck/:path*',
    '/((?!api|_next|favicon\\.ico)[^/]*\\.html)',
    '/protected\\.html',
  ],
};
