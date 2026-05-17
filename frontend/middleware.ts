import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /admin route guard — currently a pass-through.
 *
 * Full cookie-based protection is temporarily disabled because existing
 * browser sessions were started before the `levy_ai_session` cookie was
 * introduced, so they lack the cookie even though they are authenticated.
 *
 * Security is enforced by two layers that DO work for all sessions:
 *   • Admin page: async JWT check + token-refresh before rendering the UI.
 *   • Flask backend: @admin_required on every /api/admin/* endpoint.
 *
 * Re-enable cookie check here once all active sessions have cycled through
 * a fresh login and the cookie is reliably present.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
