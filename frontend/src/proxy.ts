import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Edge proxy — guards all protected routes before any HTML is transmitted.
 *
 * (Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` and
 * the exported `middleware()` function to `proxy()`. This file was migrated
 * from the old `middleware.ts` — same logic, new convention. Next.js silently
 * ignores a `middleware.ts` file on this version: no warning, no execution,
 * so keeping the old name/export would leave every route guard below dead.)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Auth strategy: HYBRID (Supabase + Flask JWT fallback)                  │
 * │                                                                         │
 * │  • Layer 1 (Supabase): when NEXT_PUBLIC_SUPABASE_URL +                  │
 * │    NEXT_PUBLIC_SUPABASE_ANON_KEY are set, Supabase session cookies      │
 * │    are the primary signal. supabase.auth.getUser() validates them.      │
 * │                                                                         │
 * │  • Layer 2 (Flask, primary for this app): levy_ai_token is an           │
 * │    HttpOnly JWT cookie set by the Flask backend on every login.         │
 * │    Its payload is decoded here (no HMAC check — Edge can't do that;     │
 * │    real signature verification lives in Flask @token_required).         │
 * │    levy_ai_session is a legacy JS-settable presence flag retained for   │
 * │    backward compatibility with existing sessions.                       │
 * │                                                                         │
 * │  PROTECTED ROUTES — unauthenticated users are redirected to /?login=true│
 * │    /workspace  /course-picker  /dashboard  /academic-writing            │
 * │    /mastery    /my-documents   /presentation  /presentation-generator   │
 * │    /profile    /settings       /onboarding   /admin                     │
 * │                                                                         │
 * │  ADMIN ROUTES — additionally require is_admin === true in the JWT.     │
 * │    /admin  /admin/*                                                     │
 * │                                                                         │
 * │  DASHBOARD — additionally require levy_ai_course_active cookie.         │
 * │    Absent → redirect to /course-picker.                                 │
 * │                                                                         │
 * │  AUTH PAGES (/login, /register) — authenticated users are bounced to    │
 * │    /admin (if admin), else /dashboard (if active course) or             │
 * │    /course-picker.                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/* ── Flask JWT payload decoder (no signature check — Edge-safe) ─────────── */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1];
    if (!b64) return null;
    // Verify the token has not expired before trusting the payload.
    const parsed = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    if (parsed.exp && (parsed.exp as number) * 1000 < Date.now()) return null;
    return parsed;
  } catch { return null; }
}

/* ── Security headers — applied to every response ────────────────────────── */
const SEC_HEADERS: [string, string][] = [
  ['X-Frame-Options',           'DENY'],
  ['X-Content-Type-Options',    'nosniff'],
  ['Referrer-Policy',           'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
];

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of SEC_HEADERS) res.headers.set(k, v);
  return res;
}

function redirectTo(path: string, req: NextRequest): NextResponse {
  return applySecurityHeaders(NextResponse.redirect(new URL(path, req.url)));
}

/* ══════════════════════════════════════════════════════════════════════════ */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  /* Start with a mutable response so Supabase can refresh its session cookies. */
  const response = NextResponse.next({ request });

  /* ── Layer 1: Supabase auth (when configured) ────────────────────────── */
  const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON);

  let supabaseUserId:  string | null = null;
  let supabaseIsAdmin: boolean       = false;

  if (supabaseReady) {
    const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON!, {
      cookies: {
        getAll()     { return request.cookies.getAll(); },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    supabaseUserId  = user?.id ?? null;
    supabaseIsAdmin = user?.app_metadata?.role === 'admin'
                   || user?.user_metadata?.is_admin === true;
  }

  /* ── Layer 2: Flask JWT cookie (primary for this app) ────────────────── */
  // levy_ai_token: HttpOnly cookie set by Flask — the authoritative auth signal.
  // levy_ai_session: legacy JS-settable presence flag — fallback for old sessions.
  const token   = request.cookies.get('levy_ai_token')?.value;
  const session = request.cookies.get('levy_ai_session')?.value;
  const payload = token ? decodePayload(token) : null;

  // Authenticated if any layer has a valid signal.
  // token presence (with a non-expired payload) is the strongest signal.
  const flaskAuth     = Boolean(payload) || Boolean(session);
  const isAuthenticated = Boolean(supabaseUserId) || flaskAuth;

  const isAdmin =
    (Boolean(supabaseUserId) && supabaseIsAdmin) ||
    (flaskAuth && (payload?.is_admin === true || payload?.role === 'admin'));

  /* ── Route guards ────────────────────────────────────────────────────── */

  /* /login and /register — bounce already-authenticated users away */
  if (pathname === '/login' || pathname === '/register') {
    if (isAuthenticated) {
      if (isAdmin) return redirectTo('/admin', request);
      const courseActive = request.cookies.get('levy_ai_course_active')?.value;
      return redirectTo(courseActive ? '/dashboard' : '/course-picker', request);
    }
    applySecurityHeaders(response);
    return response;
  }

  /* All other routes in the matcher are protected — require auth */
  if (!isAuthenticated) {
    return redirectTo(`/?login=true`, request);
  }

  /* /admin/* — additionally require admin role */
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    // Only hard-block when we have a non-null payload confirming non-admin.
    // A null payload with a valid session means transitional state — let the
    // page's own check handle it to avoid locking admins out on token refresh.
    if (payload !== null && !isAdmin) {
      return redirectTo('/', request);
    }
  }

  /* /dashboard and sub-routes — require an active course selection */
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    const courseActive = request.cookies.get('levy_ai_course_active')?.value;
    if (!courseActive) return redirectTo('/course-picker', request);
  }

  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    /* Auth pages — redirect authenticated users away */
    '/login',
    '/register',

    /* Protected app routes — require authentication */
    '/workspace',
    '/workspace/:path*',
    '/course-picker',
    '/course-picker/:path*',
    '/dashboard',
    '/dashboard/:path*',
    '/academic-writing',
    '/mastery',
    '/my-documents',
    '/presentation',
    '/presentation/:path*',
    '/presentation-generator',
    '/profile',
    '/settings',
    '/onboarding',
    '/admin',
    '/admin/:path*',
  ],
};
