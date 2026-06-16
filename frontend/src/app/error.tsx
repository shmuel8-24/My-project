'use client';

/**
 * Route-segment error boundary — catches any unhandled error thrown by a page or
 * layout in the / route segment (and all nested segments that don't have their own
 * error.tsx). The root layout itself (providers, fonts) remains intact so this
 * component renders inside the normal <html>/<body> shell.
 *
 * This replaces the raw "Internal Server Error" white screen with a friendly
 * matcha-themed fallback UI. The `reset` prop re-runs the segment's render cycle —
 * useful for transient backend-unreachable errors.
 */

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('PAGE LOAD ERROR:', error.message, error.digest ?? '', error.stack ?? '');
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        direction: 'rtl',
      }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #E2EBE5',
          borderRadius: '1.25rem',
          padding: '2.5rem',
          maxWidth: 420,
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(28,51,41,0.08)',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>

        <h1
          style={{
            fontSize: '1.35rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            color: '#1C3329',
          }}
        >
          שגיאה בטעינת הדף
        </h1>

        <p
          style={{
            fontSize: '0.95rem',
            color: '#527061',
            marginBottom: '1.5rem',
            lineHeight: 1.6,
          }}
        >
          משהו השתבש בטעינת הדף הזה.<br />
          לחץ על &ldquo;נסה שוב&rdquo; או חזור לדף הבית.
        </p>

        <button
          onClick={reset}
          style={{
            display: 'inline-block',
            padding: '0.625rem 1.5rem',
            background: '#517B3E',
            color: '#fff',
            border: 'none',
            borderRadius: '0.625rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            marginInline: '0.4rem',
          }}
        >
          נסה שוב
        </button>

        <button
          onClick={() => { window.location.href = '/'; }}
          style={{
            display: 'inline-block',
            padding: '0.625rem 1.5rem',
            background: 'transparent',
            border: '1.5px solid #517B3E',
            color: '#517B3E',
            borderRadius: '0.625rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            marginInline: '0.4rem',
          }}
        >
          דף הבית
        </button>

        {error.digest && (
          <div style={{ fontSize: '0.72rem', color: '#9db8a8', marginTop: '1.5rem' }}>
            שגיאה: {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}
