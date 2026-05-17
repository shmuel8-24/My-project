'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../providers/language';

// ─── Degree-type label map (bilingual) ───────────────────────────────────────

const DEGREE_LABELS: Record<string, { he: string; en: string }> = {
  regular:     { he: 'תואר רגיל (B.Sc / B.A)',  en: "Bachelor's Degree (B.Sc / B.A)" },
  double:      { he: 'תואר דו-חוגי',              en: 'Double Major' },
  specialized: { he: 'תואר עם התמחות',             en: 'With Specialization' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfileModalProps {
  isOpen:         boolean;
  onClose:        () => void;
  onLogout:       () => void;
  firstName:      string;
  lastName:       string;
  email:          string;
  initials:       string;
  country:        string;
  institution:    string;
  degreeType:     string;
  primaryMajor:   string;
  secondaryMajor: string;
  isAdmin:        boolean;
}

// ─── Detail row helper ────────────────────────────────────────────────────────

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base leading-none mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide block leading-none mb-0.5">
          {label}
        </span>
        <span className="text-[#2d3b25] text-sm font-medium leading-snug block">{value}</span>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function UserProfileModal({
  isOpen, onClose, onLogout,
  firstName, lastName, email, initials,
  country, institution, degreeType, primaryMajor, secondaryMajor,
  isAdmin,
}: UserProfileModalProps) {
  const router = useRouter();
  const { lang } = useLanguage();
  const he = lang === 'he';

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const degreeLabel    = (DEGREE_LABELS[degreeType]?.[lang]) ?? degreeType;
  const hasAcademic    = !!(country || institution || degreeType || primaryMajor);
  const showSecondary  = !!(secondaryMajor && (degreeType === 'double' || degreeType === 'specialized'));
  const secondaryLabel = degreeType === 'double'
    ? (he ? 'חוג משני'  : 'Minor')
    : (he ? 'התמחות' : 'Specialization');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        dir={he ? 'rtl' : 'ltr'}
        className="w-full max-w-sm rounded-3xl overflow-hidden animate-slide-up-fade"
        style={{
          background: 'rgba(255,255,255,0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(157,192,139,0.35)',
          boxShadow: '0 20px 60px rgba(20,40,15,0.22), 0 4px 16px rgba(20,40,15,0.08)',
        }}
      >

        {/* ── Top bar ── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ background: 'rgba(81,123,62,0.06)', borderBottom: '1px solid rgba(157,192,139,0.22)' }}
        >
          <span className="text-sm font-bold text-[#2A3B22]">
            {he ? 'הפרופיל שלי' : 'My Profile'}
          </span>
          <button
            onClick={onClose}
            aria-label={he ? 'סגור' : 'Close'}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors text-[#7a9268] text-xl leading-none select-none"
          >
            ×
          </button>
        </div>

        {/* ── Identity ── */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(157,192,139,0.18)' }}>
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-black shrink-0 select-none"
              style={{
                background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)',
                boxShadow: '0 4px 14px rgba(81,123,62,0.38)',
              }}
            >
              {initials || '?'}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-[#1a2e14] text-base leading-snug truncate">
                {firstName} {lastName}
              </p>
              <p className="text-xs text-[#7a9268] mt-0.5 truncate" title={email}>
                {email}
              </p>
              {isAdmin && (
                <span
                  className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(81,123,62,0.12)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.22)' }}
                >
                  ⚡ Admin
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Academic details ── */}
        {hasAcademic && (
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(157,192,139,0.18)' }}>
            <p className="text-[10px] font-bold text-[#7a9268] uppercase tracking-widest mb-3.5">
              {he ? 'פרטי לימודים' : 'Academic Details'}
            </p>
            <div className="space-y-3">
              {country      && <DetailRow icon="🌍" label={he ? 'מדינה'        : 'Country'}      value={country} />}
              {institution  && <DetailRow icon="🏛️" label={he ? 'מוסד לימודים' : 'Institution'}  value={institution} />}
              {degreeType   && <DetailRow icon="🎓" label={he ? 'סוג תואר'     : 'Degree Type'}  value={degreeLabel} />}
              {primaryMajor && <DetailRow icon="📚" label={he ? 'חוג ראשי'     : 'Major'}        value={primaryMajor} />}
              {showSecondary && (
                <DetailRow icon="📖" label={secondaryLabel} value={secondaryMajor} />
              )}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="px-4 py-4 flex flex-col gap-2">

          {/* Profile settings */}
          <button
            onClick={() => { onClose(); router.push('/profile'); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              color: '#2d3b25',
              background: 'rgba(81,123,62,0.07)',
              border: '1px solid rgba(81,123,62,0.15)',
              textAlign: 'start',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.14)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.07)'; }}
          >
            <svg className="w-4 h-4 shrink-0" style={{ color: '#517B3E' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            {he ? 'הגדרות פרופיל' : 'Profile Settings'}
          </button>

          {/* Close + Logout */}
          <div className="flex gap-2 mt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
              style={{ color: '#7a9268', borderColor: 'rgba(157,192,139,0.45)', background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.06)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              {he ? 'סגור' : 'Close'}
            </button>
            <button
              onClick={onLogout}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
              style={{ color: '#dc2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; }}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              {he ? 'יציאה' : 'Log Out'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
