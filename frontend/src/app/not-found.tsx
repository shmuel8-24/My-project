'use client';

import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();
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
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1C3329' }}>
          הדף לא נמצא
        </h1>
        <p style={{ fontSize: '0.95rem', color: '#527061', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          הדף שחיפשת אינו קיים או שהקישור שגוי.
        </p>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '0.625rem 1.5rem',
            background: '#517B3E',
            color: '#fff',
            border: 'none',
            borderRadius: '0.625rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          חזור לדף הבית
        </button>
      </div>
    </div>
  );
}
