'use client';

/**
 * Root-level error boundary — catches errors that originate inside the root layout
 * itself (providers, fonts, global CSS). Must own its own <html>/<body> tags because
 * the root layout is what failed. Replaces the raw Next.js "Internal Server Error"
 * white screen with a friendly matcha-themed fallback.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('GLOBAL APP ERROR:', error.message, error.digest ?? '', error.stack ?? '');
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>שגיאה – U-Note</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            background: #F9FCFA;
            color: #1C3329;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .card {
            background: rgba(255,255,255,0.92);
            border: 1px solid #E2EBE5;
            border-radius: 1.25rem;
            padding: 2.5rem;
            max-width: 420px;
            width: 90%;
            text-align: center;
            box-shadow: 0 4px 24px rgba(28,51,41,0.08);
          }
          .icon { font-size: 2.5rem; margin-bottom: 1rem; }
          h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.5rem; color: #1C3329; }
          p  { font-size: 0.95rem; color: #527061; margin-bottom: 1.5rem; line-height: 1.6; }
          .btn {
            display: inline-block;
            padding: 0.625rem 1.5rem;
            background: #517B3E;
            color: #fff;
            border: none;
            border-radius: 0.625rem;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            margin-inline: 0.4rem;
          }
          .btn-sec {
            background: transparent;
            border: 1.5px solid #517B3E;
            color: #517B3E;
          }
          .digest { font-size: 0.72rem; color: #9db8a8; margin-top: 1.5rem; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">⚠️</div>
          <h1>משהו השתבש</h1>
          <p>
            האפליקציה נתקלה בשגיאה בלתי צפויה.<br />
            נסה לטעון מחדש — לרוב זה פותר את הבעיה.
          </p>
          <button className="btn" onClick={reset}>נסה שוב</button>
          <button className="btn btn-sec" onClick={() => { window.location.href = '/'; }}>
            חזור לדף הבית
          </button>
          {error.digest && (
            <div className="digest">שגיאה: {error.digest}</div>
          )}
        </div>
      </body>
    </html>
  );
}
