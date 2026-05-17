/**
 * Server-side proxy for all Flask API endpoints.
 *
 * The browser calls  /api/flask/<anything>  (same-origin — no CORS).
 * This handler runs on the Next.js server and forwards the request to
 * the Flask backend, then streams the response back.
 *
 * Benefits:
 *  • Zero browser CORS — the browser only ever talks to localhost:3000.
 *  • All errors are printed here, in the server terminal (Cursor's output).
 *  • Flask URL is a server-only env var (API_URL) — never sent to the browser.
 *
 * Set the Flask URL in frontend/.env.local:
 *   API_URL=http://127.0.0.1:5003
 */
import { NextRequest, NextResponse } from 'next/server';

const FLASK = process.env.API_URL ?? 'http://127.0.0.1:5003';

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const upstream = `${FLASK}/${segments.join('/')}`;

  // ── Every request is logged — visible in `npm run dev` terminal ──────────
  console.log(`\n[Flask Proxy] ${req.method} → ${upstream}`);

  // Forward only the headers Flask cares about
  const fwdHeaders: Record<string, string> = {};
  const auth = req.headers.get('authorization');
  const ct   = req.headers.get('content-type');
  if (auth) fwdHeaders['authorization'] = auth;
  if (ct)   fwdHeaders['content-type']  = ct;

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.arrayBuffer()
    : undefined;

  try {
    const res     = await fetch(upstream, { method: req.method, headers: fwdHeaders, body });
    const payload = await res.arrayBuffer();
    const mime    = res.headers.get('content-type') ?? 'application/json';

    console.log(`[Flask Proxy] ← HTTP ${res.status} (${upstream})`);

    return new NextResponse(payload, {
      status:  res.status,
      headers: { 'content-type': mime },
    });
  } catch (err) {
    const msg       = err instanceof Error ? err.message : String(err);
    const isRefused = /ECONNREFUSED|fetch failed/i.test(msg);

    // ── Full error always printed to the terminal ─────────────────────────
    console.error(
      `[Flask Proxy] ✗ ${req.method} ${upstream}\n` +
      `  Error   : ${msg}\n` +
      (isRefused
        ? `  Cause   : Flask server is not running\n` +
          `  Fix     : source .venv/bin/activate && python app.py\n`
        : ''),
    );

    return NextResponse.json(
      {
        error: isRefused
          ? `Flask server not running at ${FLASK}. Start it with: source .venv/bin/activate && python app.py`
          : `Proxy error: ${msg}`,
        hint:     isRefused ? 'source .venv/bin/activate && python app.py' : undefined,
        upstream: upstream,
      },
      { status: 502 },
    );
  }
}

// Next.js 15+ wraps dynamic segment params in a Promise — must be awaited.
type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path);
}
