/**
 * Vercel Edge Middleware - TEMPORARY BYPASS
 *
 * Middleware logic disabled to resolve MIDDLEWARE_INVOCATION_FAILED (500).
 * All requests pass through. Re-enable protection after stabilizing auth.
 *
 * - No Supabase client
 * - No browser-only APIs (window, localStorage)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  return NextResponse.next();
}
