'use client';

/**
 * NoCourseState — full-screen frosted overlay shown whenever the user
 * tries to access a course-specific page without having selected a course.
 *
 * Renders as `position:fixed` so it sits above the page content without
 * requiring structural changes to the host page.
 */

import { useRouter } from 'next/navigation';
import { useLanguage } from '../app/providers/language';

export default function NoCourseState() {
  const router = useRouter();
  const { lang } = useLanguage();
  const he = lang === 'he';

  return (
    <div
      dir={he ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      style={{
        background: 'rgba(244,250,243,0.96)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div
        className="max-w-sm w-full flex flex-col items-center gap-6 text-center"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.82)',
          boxShadow: '0 8px 40px rgba(60,90,40,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
          padding: '40px 32px',
        }}
      >
        <span style={{ fontSize: '3rem', lineHeight: 1, userSelect: 'none' }}>📚</span>

        <div className="flex flex-col gap-2">
          <h2 style={{ color: '#1a2e14', fontWeight: 800, fontSize: '1.125rem' }}>
            {he ? 'לא נבחר קורס' : 'No Course Selected'}
          </h2>
          <p style={{ color: '#4a5e3a', fontSize: '0.875rem', lineHeight: 1.65, maxWidth: 260 }}>
            {he
              ? 'אנא בחר קורס מהסרגל העליון כדי להתחיל ללמוד'
              : 'Please select a course from the top bar to start learning'}
          </p>
        </div>

        <button
          onClick={() => router.push('/course-picker')}
          style={{
            background: 'linear-gradient(135deg, #517B3E, #2A3B22)',
            color: 'white',
            fontWeight: 700,
            fontSize: '0.875rem',
            padding: '10px 28px',
            borderRadius: 14,
            cursor: 'pointer',
            border: 'none',
            boxShadow: '0 4px 18px rgba(81,123,62,0.38)',
            transition: 'box-shadow 0.18s ease, transform 0.12s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0 8px 28px rgba(81,123,62,0.55)';
            e.currentTarget.style.transform = 'scale(1.03)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = '0 4px 18px rgba(81,123,62,0.38)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {he ? 'בחר קורס' : 'Select a Course'}
        </button>
      </div>
    </div>
  );
}
