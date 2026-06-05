import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Edge middleware — guards /admin and /dashboard before any HTML is transmitted.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Auth strategy: HYBRID (Supabase + Flask JWT fallback)                  │
 * │                                                                         │
 * │  • When NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are    │
 * │    set, Supabase session cookies are the primary auth signal.           │
 * │    supabase.auth.getUser() validates the session on every request.      │
 * │                                                                         │
 * │  • When those env vars are absent (or Supabase returns no user),        │
 * │    the middleware falls back to the existing Flask cookie layer:        │
 * │      levy_ai_session — presence flag proving the user completed auth    │
 * │      levy_ai_token   — raw Flask JWT; payload decoded to check is_admin │
 * │                                                                         │
 * │  Both auth systems can coexist during a migration.                      │
 * │  JWT signature is NOT verified here — Edge has no HMAC-SHA256 with the  │
 * │  server secret.  Real API authorization lives in Flask @admin_required. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Security headers are attached to every response that passes through.
 */

/* ── Flask JWT payload decoder (no signature check — Edge-safe) ─────────── */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1];
    if (!b64) return null;
    return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
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

function redirectTo(path: string, req: NextRequest, base: NextResponse): NextResponse {
  void base; // base response discarded on redirect — headers re-applied below
  return applySecurityHeaders(NextResponse.redirect(new URL(path, req.url)));
}

/* ══════════════════════════════════════════════════════════════════════════ */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  /* Start with a mutable response so Supabase can refresh its session cookies. */
  let response = NextResponse.next({ request });

  /* ── Layer 1: Supabase auth (when configured) ────────────────────────── */
  const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON);

  let supabaseUserId:  string | null = null;
  let supabaseIsAdmin: boolean       = false;

  if (supabaseReady) {
    const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON!, {
      cookies: {
        getAll()      { return request.cookies.getAll(); },
        setAll(list)  {
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

  /* ── Layer 2: Flask JWT cookies (fallback / coexistence) ─────────────── */
  const session = request.cookies.get('levy_ai_session')?.value;
  const token   = request.cookies.get('levy_ai_token')?.value;
  const payload = token ? decodePayload(token) : null;

  /* Combine both layers: Supabase takes precedence when it has a user;
     Flask cookies serve as the fallback (existing sessions keep working). */
  const isAuthenticated = Boolean(supabaseUserId) || Boolean(session);
  const isAdmin =
    (Boolean(supabaseUserId) && supabaseIsAdmin) ||
    (Boolean(session) && (payload?.is_admin === true || payload?.role === 'admin'));

  /* ── Route guards ────────────────────────────────────────────────────── */

  /* /admin/* — authenticated + admin */
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!isAuthenticated) return redirectTo('/?login=true', request, response);

    /* Only block when we have enough signal to confirm non-admin.
       If payload is null (token cookie absent: transitional session) we let
       the page's own JWT check handle it — avoids locking out admin on refresh. */
    if (isAuthenticated && !isAdmin && payload !== null) {
      return redirectTo('/', request, response);
    }
  }

  /* /dashboard/* — authenticated + active course */
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (!isAuthenticated) return redirectTo('/?login=true', request, response);

    const courseActive = request.cookies.get('levy_ai_course_active')?.value;
    if (!courseActive) return redirectTo('/course-picker', request, response);
  }

  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/dashboard', '/dashboard/:path*'],
};
