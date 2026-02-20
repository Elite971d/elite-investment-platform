/**
 * Vercel Edge Middleware - Server-side HTML protection
 *
 * Session check: Reads Supabase session cookie after login completes.
 * - No session (guest) → redirect to /login.html
 * - Has session (user or admin) → allow through
 *
 * Role mapping (admin, user, guest) and tool unlocking are client-side:
 * - Admin: dashboard/protected pages unlock all tools via role
 * - Guest: no session, never overrides admin permissions
 *
 * Protects: /dashboard, /dashboard.html, /tools/*, /member/*
 * No Supabase client, no DB calls. Protected pages handle tier logic.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Paths that bypass ALL middleware logic - checked FIRST before any other code */
const PUBLIC_PATHS = [
  '/',
  '/login.html',
  '/signup.html',
  '/pricing.html',
  '/about.html',
];

function isPublicPath(pathname: string): boolean {
  if (!pathname) return true;
  return PUBLIC_PATHS.some((path) => {
    if (path === '/') {
      return pathname === '/' || pathname === '' || pathname === '/index.html';
    }
    return pathname === path || pathname.startsWith(path + '?') || pathname.startsWith(path + '/');
  });
}

/**
 * Check if request has a Supabase session cookie (set after login).
 * Matches: sb-access-token, sb-<project>-auth-token, sb-<project>-refresh-token
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
      if (name.startsWith('sb-') && name.includes('-refresh-token')) return true;
    }
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

export async function middleware(req: NextRequest) {
  try {
    const pathname = req.nextUrl.pathname ?? '';

    // 1. BYPASS: Public paths never go through auth gating
    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }

    // 2. Protect only /dashboard, /tools, /member (matcher handles this, but double-check)
    const isProtected =
      pathname === '/dashboard' ||
      pathname === '/dashboard.html' ||
      pathname.startsWith('/dashboard/') ||
      pathname.startsWith('/tools/') ||
      pathname.startsWith('/member/');

    if (!isProtected) {
      return NextResponse.next();
    }

    // 3. Check session - no Supabase client, cookie-only. Admin override bypasses session.
    const hasSession = hasSupabaseSession(req);
    const hasAdminOverride = (() => {
      try {
        const cookieHeader = req.headers.get('cookie');
        if (!cookieHeader) return false;
        return /esn_admin_override=1(?:\s|;|$)/.test(cookieHeader);
      } catch { return false; }
    })();
    if (!hasSession && !hasAdminOverride) {
      return NextResponse.redirect(new URL('/login.html', req.url));
    }

    const response = NextResponse.next();
    Object.entries(securityHeaders()).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  } catch (error) {
    console.error('Middleware failure:', error);
    return NextResponse.next(); // FAIL OPEN
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/dashboard.html',
    '/tools/:path*',
    '/member/:path*',
  ],
};
