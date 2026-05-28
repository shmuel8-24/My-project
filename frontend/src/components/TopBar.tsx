'use client';

/**
 * TopBar — persistent global navigation bar rendered above every
 * authenticated app page via layout.tsx.
 *
 * Shows the CoursePill near the logo so users always know which course
 * is active and can switch it from anywhere in the app.
 *
 * Hides itself on auth/landing routes.
 */

import { usePathname } from 'next/navigation';
import { useAuth }     from '../app/providers/auth';
import { useLanguage } from '../app/providers/language';
import CoursePill      from './CoursePill';

const APP_PREFIXES = ['/dashboard', '/workspace', '/mastery', '/profile'];

export default function TopBar() {
  const pathname = usePathname();
  const { user }  = useAuth();
  const { lang }  = useLanguage();
  const he = lang === 'he';

  if (!user || !APP_PREFIXES.some(p => pathname.startsWith(p))) return null;

  return (
    <div
      dir={he ? 'rtl' : 'ltr'}
      className="sticky top-0 z-50 w-full flex items-center px-5 py-2"
      style={{
        background: 'rgba(255,255,255,0.70)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(200,200,200,0.35)',
      }}
    >
      {/* Logo — always at the inline-start edge */}
      <div className="flex items-center gap-2 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.PNG" alt="U-Note" style={{ height: 22, width: 'auto', objectFit: 'contain' }} />
      </div>

      {/* Course Pill — immediately after the logo */}
      <div className="ms-3">
        <CoursePill />
      </div>

      {/* Remaining space — pages handle their own right-side controls */}
      <div className="flex-1" />
    </div>
  );
}
