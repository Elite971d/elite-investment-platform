/**
 * Vercel Edge Middleware - Server-side HTML protection
 *
 * Runs BEFORE static file delivery. Protects:
 * - /dealcheck/*
 * - /tools/* (calculator tools: brrrr.html, commercial.html, etc.)
 * - /protected.html (root)
 * - Root-level .html files except login, index, reset, magic-link, reset-password
 *
 * Does NOT interfere with: /api/*, /_next/*, webhooks, cron, admin API routes.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToolKeyFromPath } from './lib/access-utils';

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
 */
function hasSupabaseSession(request: NextRequest): boolean {
  try {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return false;
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      const [name] = cookie.split('=');
      if (!name) continue;
      if (name === 'sb-access-token') return true;
      if (name.startsWith('sb-') && name.includes('-auth-token')) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if path should be protected
 */
function isProtectedPath(pathname: string): boolean {
  try {
    const path = pathname.replace(/\/$/, '') || '/';
    for (const prefix of BYPASS_PREFIXES) {
      if (path.startsWith(prefix) || path === prefix.replace(/\/$/, '')) return false;
    }
    if (PUBLIC_PATHS.includes(path)) return false;
    if (PUBLIC_PATHS.includes(path + '/')) return false;
    if (path.startsWith('/dealcheck')) return true;
    if (path.startsWith('/tools/')) return true;
    if (path === '/protected.html') return true;
    if (/^\/[^/]+\.html$/.test(path)) return true;
    if (/\.html$/.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function securityHeaders(): Record<string, string> {
  return {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    if (!isProtectedPath(pathname)) {
      return NextResponse.next();
    }

    const hasSession = hasSupabaseSession(request);
    if (!hasSession) {
      const loginUrl = new URL('/login.html', request.url);
      loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl, 302);
    }

    if (pathname.includes('/tools/')) {
      const toolKey = getToolKeyFromPath(pathname);
      if (toolKey) {
        try {
          const origin = request.nextUrl.origin;
          const verifyUrl = `${origin}/api/internal/verify-tool-access?path=${encodeURIComponent(pathname)}`;
          const res = await fetch(verifyUrl, {
            headers: { cookie: request.headers.get('cookie') || '' },
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
          if (data?.ok === false) {
            const pricingUrl = new URL('/index.html', request.url);
            return NextResponse.redirect(pricingUrl, 302);
          }
        } catch (err) {
          console.error('[middleware] verify-tool-access error:', err);
        }
      }
    }

    const response = NextResponse.next();
    Object.entries(securityHeaders()).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  } catch (err) {
    console.error('[middleware] failure:', err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/dealcheck/:path*',
    '/tools/:path*',
    '/((?!api|_next|favicon\\.ico)[^/]*\\.html)',
    '/protected\\.html',
  ],
};
