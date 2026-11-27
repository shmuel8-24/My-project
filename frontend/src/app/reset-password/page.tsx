'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5003';

const INPUT_STYLE: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(200,190,170,0.75)',
  background: 'rgba(255,255,255,0.75)',
  fontSize: '0.9375rem',
  color: '#1a2540',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};
const focusInput = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#517B3E';
  e.target.style.boxShadow = '0 0 0 3px rgba(81,123,62,0.15)';
};
const blurInput = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'rgba(200,190,170,0.75)';
  e.target.style.boxShadow = 'none';
};

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('הסיסמה חייבת להכיל לפחות 6 תווים'); return; }
    if (password !== confirm)  { setError('הסיסמאות אינן תואמות'); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה באיפוס הסיסמה. ייתכן שהקישור פג תוקפו.'); return; }
      setDone(true);
      setTimeout(() => router.push('/'), 3000);
    } catch {
      setError('לא ניתן להתחבר לשרת. בדוק את החיבור ונסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ fontSize: '1rem', color: '#b91c1c', fontWeight: 600 }}>
          קישור לאיפוס לא תקין.
        </p>
        <button
          onClick={() => router.push('/')}
          style={{ marginTop: '16px', fontSize: '0.875rem', color: '#517B3E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          חזרה לדף הבית
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {done ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '16px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(81,123,62,0.12)', border: '1.5px solid rgba(81,123,62,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#517B3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e2a45', textAlign: 'center', margin: 0 }}>
            הסיסמה אופסה בהצלחה!
          </p>
          <p style={{ fontSize: '0.875rem', color: '#7a8a9a', textAlign: 'center', margin: 0 }}>
            מעביר אותך לדף הכניסה...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.22)', color: '#b91c1c', fontSize: '0.8125rem', textAlign: 'center' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>סיסמה חדשה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="לפחות 6 תווים"
              required
              autoComplete="new-password"
              style={INPUT_STYLE}
              onFocus={focusInput}
              onBlur={blurInput}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>אימות סיסמה</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="הזן שוב את הסיסמה"
              required
              autoComplete="new-password"
              style={{
                ...INPUT_STYLE,
                borderColor: confirm && confirm !== password ? 'rgba(220,38,38,0.5)' : 'rgba(200,190,170,0.75)',
              }}
              onFocus={focusInput}
              onBlur={blurInput}
            />
            {confirm && confirm !== password && (
              <span style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '2px' }}>הסיסמאות אינן תואמות</span>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '13px 32px',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'white',
              backgroundColor: loading ? '#6B9053' : '#517B3E',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(81,123,62,0.38)',
              transition: 'background-color 0.2s, box-shadow 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {loading && (
              <span
                className="animate-spin"
                style={{
                  width: '15px', height: '15px',
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTopColor: 'white',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
            )}
            {loading ? 'מאפס...' : 'אפס סיסמה'}
          </button>
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => router.push('/')}
              style={{ fontSize: '0.8125rem', color: '#517B3E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              ← חזרה לדף הכניסה
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#e8e4d9', fontFamily: "'Heebo', system-ui, sans-serif", padding: '40px 24px' }}
    >
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #e2ddd0 0%, #d8d3c5 40%, #e5e0d5 100%)' }} />
        <div className="absolute" style={{ top: '-15%', right: '-8%', width: '55%', height: '65%', background: 'radial-gradient(ellipse at 60% 40%, #1e2a45 0%, #263354 50%, transparent 80%)', borderRadius: '40% 60% 60% 40% / 40% 40% 60% 60%', opacity: 0.9 }} />
        <div className="absolute" style={{ top: '25%', left: '-12%', width: '40%', height: '55%', background: 'radial-gradient(ellipse at 40% 60%, #5A7F4E 0%, #4C6E3E 60%, transparent 85%)', borderRadius: '60% 40% 40% 60% / 60% 60% 40% 40%', opacity: 0.75 }} />
      </div>

      <div
        className="relative animate-slide-up-fade"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '48px 44px 44px',
          boxShadow: '0 16px 64px rgba(30,42,69,0.22), 0 2px 12px rgba(30,42,69,0.10)',
          border: '1px solid rgba(255,255,255,0.88)',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e2a45', lineHeight: 1.2, marginBottom: '6px', fontFamily: 'Georgia, serif', textAlign: 'center' }}>
          איפוס סיסמה
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#8899aa', textAlign: 'center', marginBottom: '28px' }}>
          בחר סיסמה חדשה לחשבונך
        </p>

        <Suspense fallback={<div style={{ textAlign: 'center', color: '#8899aa' }}>טוען...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
