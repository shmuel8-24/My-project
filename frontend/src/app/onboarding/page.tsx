'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const API = 'http://127.0.0.1:5003';

// ─── Static data ──────────────────────────────────────────────────────────────

const COUNTRIES = [
  { value: 'Israel',                label: 'ישראל' },
  { value: 'United States',         label: 'ארצות הברית' },
  { value: 'United Kingdom',        label: 'בריטניה' },
  { value: 'Canada',                label: 'קנדה' },
  { value: 'Australia',             label: 'אוסטרליה' },
  { value: 'Germany',               label: 'גרמניה' },
  { value: 'France',                label: 'צרפת' },
  { value: 'Netherlands',           label: 'הולנד' },
  { value: 'Spain',                 label: 'ספרד' },
  { value: 'Italy',                 label: 'איטליה' },
  { value: 'Switzerland',           label: 'שוויץ' },
  { value: 'Sweden',                label: 'שוודיה' },
  { value: 'Norway',                label: 'נורווגיה' },
  { value: 'Denmark',               label: 'דנמרק' },
  { value: 'Finland',               label: 'פינלנד' },
  { value: 'Belgium',               label: 'בלגיה' },
  { value: 'Austria',               label: 'אוסטריה' },
  { value: 'Japan',                 label: 'יפן' },
  { value: 'South Korea',           label: 'קוריאה הדרומית' },
  { value: 'China',                 label: 'סין' },
  { value: 'India',                 label: 'הודו' },
  { value: 'Brazil',                label: 'ברזיל' },
  { value: 'Argentina',             label: 'ארגנטינה' },
  { value: 'Mexico',                label: 'מקסיקו' },
  { value: 'Turkey',                label: 'טורקיה' },
  { value: 'Russia',                label: 'רוסיה' },
  { value: 'Ukraine',               label: 'אוקראינה' },
  { value: 'Poland',                label: 'פולין' },
  { value: 'Czech Republic',        label: "צ'כיה" },
  { value: 'Hungary',               label: 'הונגריה' },
  { value: 'Portugal',              label: 'פורטוגל' },
  { value: 'Greece',                label: 'יוון' },
  { value: 'Romania',               label: 'רומניה' },
  { value: 'South Africa',          label: 'דרום אפריקה' },
  { value: 'Egypt',                 label: 'מצרים' },
  { value: 'Jordan',                label: 'ירדן' },
  { value: 'New Zealand',           label: 'ניו זילנד' },
  { value: 'Singapore',             label: 'סינגפור' },
  { value: 'Malaysia',              label: 'מלזיה' },
  { value: 'Thailand',              label: 'תאילנד' },
  { value: 'Indonesia',             label: 'אינדונזיה' },
  { value: 'Pakistan',              label: 'פקיסטן' },
  { value: 'Nigeria',               label: 'ניגריה' },
  { value: 'Morocco',               label: 'מרוקו' },
  { value: 'Chile',                 label: "צ'ילה" },
  { value: 'Colombia',              label: 'קולומביה' },
  { value: 'United Arab Emirates',  label: 'איחוד האמירויות' },
  { value: 'Saudi Arabia',          label: 'ערב הסעודית' },
  { value: 'Other',                 label: 'אחר' },
];

const MAJOR_SUGGESTIONS = [
  'מדעי המחשב',
  'הנדסת תוכנה',
  'הנדסת חשמל ואלקטרוניקה',
  'הנדסה מכנית',
  'הנדסה אזרחית',
  'הנדסה כימית',
  'הנדסת ביוטכנולוגיה',
  'רפואה',
  'רפואת שיניים',
  'פרמקולוגיה',
  'סיעוד',
  'פיזיותרפיה',
  'משפטים',
  'מנהל עסקים',
  'כלכלה',
  'חשבונאות',
  'מימון',
  'שיווק',
  'ניהול',
  'פסיכולוגיה',
  'עבודה סוציאלית',
  'סוציולוגיה',
  'מדע המדינה',
  'יחסים בינלאומיים',
  'תקשורת ועיתונאות',
  'חינוך',
  'אדריכלות',
  'עיצוב פנים',
  'מתמטיקה',
  'סטטיסטיקה',
  'פיזיקה',
  'כימיה',
  'ביולוגיה',
  'ביוכימיה',
  'מדעי הסביבה',
  'גיאוגרפיה',
  'היסטוריה',
  'פילוסופיה',
  'ספרות',
  'בלשנות',
  'אמנות',
  'מוזיקה',
  'קולנוע ותיאטרון',
  'עיצוב גרפי',
  'ארכיאולוגיה',
];

const DEGREE_TYPES = [
  { value: 'regular',     label: 'תואר רגיל',        sub: 'B.Sc / B.A' },
  { value: 'double',      label: 'תואר דו-חוגי',       sub: 'Double Major' },
  { value: 'specialized', label: 'תואר עם התמחות',     sub: 'With Specialization' },
];

// ─── Shared style helpers ─────────────────────────────────────────────────────

function applyFocusStyle(el: { style: CSSStyleDeclaration }) {
  el.style.borderColor = '#517B3E';
  el.style.boxShadow = '0 0 0 3px rgba(81,123,62,0.15)';
}
function applyBlurStyle(el: { style: CSSStyleDeclaration }) {
  el.style.borderColor = 'rgba(200,190,170,0.75)';
  el.style.boxShadow = 'none';
}

const baseInputStyle: React.CSSProperties = {
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px solid rgba(200,190,170,0.75)',
  background: 'rgba(255,255,255,0.80)',
  fontSize: '0.9375rem',
  color: '#1a2540',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  background: 'rgba(255,255,255,0.98)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(200,190,170,0.75)',
  borderRadius: 10,
  boxShadow: '0 4px 24px rgba(30,42,69,0.13)',
  zIndex: 50,
  maxHeight: 224,
  overflowY: 'auto' as const,
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8125rem', fontWeight: 600, color: '#374151',
};

// ─── Tiny icon components ─────────────────────────────────────────────────────

function Chevron() {
  return (
    <svg className="w-4 h-4" style={{ color: '#9ca3af' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
    </svg>
  );
}

function ChevronRotate({ open }: { open: boolean }) {
  return (
    <svg
      className="w-4 h-4"
      style={{ color: '#9ca3af', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" style={{ color: '#9ca3af' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function MiniSpinner() {
  return (
    <span style={{
      width: 14, height: 14, borderRadius: '50%',
      border: '2px solid rgba(81,123,62,0.25)',
      borderTopColor: '#517B3E',
      display: 'inline-block',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

// ─── Dropdown item ────────────────────────────────────────────────────────────

function DropItem({
  text, highlighted, last,
  onSelect, onHover,
}: {
  text: string;
  highlighted: boolean;
  last: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <div
      onMouseDown={e => { e.preventDefault(); onSelect(); }}
      onMouseEnter={onHover}
      style={{
        padding: '10px 14px',
        cursor: 'pointer',
        background: highlighted ? 'rgba(81,123,62,0.09)' : 'transparent',
        color: highlighted ? '#517B3E' : '#1a2540',
        fontSize: '0.875rem',
        borderBottom: last ? 'none' : '1px solid rgba(200,190,170,0.25)',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {text}
    </div>
  );
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('levy_ai_token') : null;
}

async function authFetch(url: string, init: RequestInit = {}) {
  const token = getToken();
  return fetch(url, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function LogoMark() {
  return (
    <img src="/logo.PNG" alt="U-Note" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();

  // Step state — gender screen is bypassed; 'profile' is the entry point
  const [step, setStep] = useState<'gender' | 'profile'>('profile');

  // Field values
  const [gender,         setGender]         = useState('');
  const [country,        setCountry]        = useState('');
  const [institution,    setInstitution]    = useState('');
  const [degreeType,     setDegreeType]     = useState('regular');
  const [primaryMajor,   setPrimaryMajor]   = useState('');
  const [secondaryMajor, setSecondaryMajor] = useState('');

  // Form state
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Institution async combobox state
  const [instOptions,   setInstOptions]   = useState<string[]>([]);
  const [instLoading,   setInstLoading]   = useState(false);
  const [instOpen,      setInstOpen]      = useState(false);
  const [instHighlight, setInstHighlight] = useState(-1);
  const instRef = useRef<HTMLDivElement>(null);

  // Primary major combobox state
  const [primaryOpen,      setPrimaryOpen]      = useState(false);
  const [primaryHighlight, setPrimaryHighlight] = useState(-1);
  const primaryRef = useRef<HTMLDivElement>(null);

  // Secondary major combobox state
  const [secondaryOpen,      setSecondaryOpen]      = useState(false);
  const [secondaryHighlight, setSecondaryHighlight] = useState(-1);
  const secondaryRef = useRef<HTMLDivElement>(null);

  const showSecondary  = degreeType === 'double' || degreeType === 'specialized';
  const secondaryLabel = degreeType === 'double' ? 'חוג משני' : 'התמחות';

  // Redirect unauthenticated users
  useEffect(() => {
    if (!getToken()) router.replace('/?login=true');
  }, [router]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (instRef.current      && !instRef.current.contains(e.target as Node))      setInstOpen(false);
      if (primaryRef.current   && !primaryRef.current.contains(e.target as Node))   setPrimaryOpen(false);
      if (secondaryRef.current && !secondaryRef.current.contains(e.target as Node)) setSecondaryOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Debounced university search (fires when country or institution text changes)
  useEffect(() => {
    if (!country || institution.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(
          `https://universities.hipolabs.com/search?country=${encodeURIComponent(country)}&name=${encodeURIComponent(institution)}`
        );
        const data = await res.json() as { name: string }[];
        if (!cancelled) {
          const names = [...new Set(data.map(u => u.name))].slice(0, 8);
          setInstOptions(names);
          setInstOpen(names.length > 0);
        }
      } catch {
        if (!cancelled) setInstOptions([]);
      } finally {
        if (!cancelled) setInstLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [country, institution]);

  // Filtered major lists
  const filteredPrimary = MAJOR_SUGGESTIONS.filter(m =>
    primaryMajor.trim() === '' || m.includes(primaryMajor)
  );
  const filteredSecondary = MAJOR_SUGGESTIONS.filter(m =>
    secondaryMajor.trim() === '' || m.includes(secondaryMajor)
  );

  // ── Keyboard handlers ──────────────────────────────────────────────────────

  const handleInstKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!instOpen || instOptions.length === 0) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setInstHighlight(h => Math.min(h + 1, instOptions.length - 1)); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setInstHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && instHighlight >= 0) {
      e.preventDefault();
      setInstitution(instOptions[instHighlight]);
      setInstOpen(false);
      setInstHighlight(-1);
    } else if (e.key === 'Escape') setInstOpen(false);
  };

  const handlePrimaryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!primaryOpen || filteredPrimary.length === 0) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setPrimaryHighlight(h => Math.min(h + 1, filteredPrimary.length - 1)); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setPrimaryHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && primaryHighlight >= 0) {
      e.preventDefault();
      setPrimaryMajor(filteredPrimary[primaryHighlight]);
      setPrimaryOpen(false);
      setPrimaryHighlight(-1);
    } else if (e.key === 'Escape') setPrimaryOpen(false);
  };

  const handleSecondaryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!secondaryOpen || filteredSecondary.length === 0) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setSecondaryHighlight(h => Math.min(h + 1, filteredSecondary.length - 1)); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setSecondaryHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && secondaryHighlight >= 0) {
      e.preventDefault();
      setSecondaryMajor(filteredSecondary[secondaryHighlight]);
      setSecondaryOpen(false);
      setSecondaryHighlight(-1);
    } else if (e.key === 'Escape') setSecondaryOpen(false);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/user/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gender,
          country,
          institution,
          degree_type:     degreeType,
          primary_major:   primaryMajor.trim(),
          secondary_major: secondaryMajor.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? 'שגיאה בשמירת הנתונים');
        return;
      }
      localStorage.setItem('levy_ai_gender',           gender);
      localStorage.setItem('levy_ai_country',          country);
      localStorage.setItem('levy_ai_institution',      institution);
      localStorage.setItem('levy_ai_degree_type',      degreeType);
      localStorage.setItem('levy_ai_primary_major',    primaryMajor.trim());
      localStorage.setItem('levy_ai_secondary_major',  degreeType !== 'regular' ? secondaryMajor.trim() : '');
      router.push('/workspace');
    } catch {
      setError('לא ניתן להתחבר לשרת');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ backgroundColor: '#e8e4d9', fontFamily: 'var(--font-heebo), system-ui, sans-serif' }}
    >
      {/* Organic background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute" style={{ top: '-15%', right: '-8%', width: '55%', height: '65%', background: 'radial-gradient(ellipse at 60% 40%, #1e2a45 0%, #263354 50%, transparent 80%)', borderRadius: '40% 60% 60% 40% / 40% 40% 60% 60%', opacity: 0.9 }} />
        <div className="absolute" style={{ top: '25%', left: '-12%', width: '40%', height: '55%', background: 'radial-gradient(ellipse at 40% 60%, #5A7F4E 0%, #4C6E3E 60%, transparent 85%)', borderRadius: '60% 40% 40% 60% / 60% 60% 40% 40%', opacity: 0.75 }} />
        <div className="absolute" style={{ bottom: '-15%', left: '0%', width: '38%', height: '45%', background: 'radial-gradient(ellipse at 30% 30%, #6A8E5E 0%, #4C6E3E 70%, transparent 90%)', borderRadius: '50% 70% 70% 30% / 30% 30% 70% 70%', opacity: 0.65 }} />
        <div className="absolute" style={{ bottom: '0%', right: '5%', width: '30%', height: '40%', background: 'radial-gradient(ellipse at 60% 70%, #1e2a45 0%, #263354 60%, transparent 85%)', borderRadius: '70% 30% 30% 70% / 30% 70% 30% 70%', opacity: 0.8 }} />
      </div>

      {/* ── Gender Step — floats directly on the matcha-green page background, no glass card ── */}
      {step === 'gender' && (
        <div className="relative z-10 w-full animate-slide-up-fade" style={{ maxWidth: 480 }}>
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <LogoMark />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 8px' }}>
            {/* Welcome heading — dark text readable on the warm beige/green background */}
            <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#1e2a45', textAlign: 'center', marginBottom: 6, fontFamily: 'Georgia, serif' }}>
              ברוך הבא ל-U-Note!
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#5a6a5a', textAlign: 'center', marginBottom: 36, lineHeight: 1.6 }}>
              ספר לנו קצת על עצמך כדי שנוכל להתאים את החוויה
            </p>

            {/* Section label */}
            <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 28 }}>
              בחר מגדר
            </p>

            {/* Male + Female avatar circles — floating directly on background, zero card behind them */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 52, marginBottom: 32 }}>
              {([
                { value: 'זכר',  img: '/assets/avatars/IMG_1.PNG', desc: 'גבר'  },
                { value: 'נקבה', img: '/assets/avatars/IMG_2.PNG', desc: 'אישה' },
              ] as { value: string; img: string; desc: string }[]).map(opt => {
                const sel = gender === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGender(opt.value)}
                    className="group flex flex-col items-center bg-transparent border-none outline-none cursor-pointer appearance-none p-0 m-0"
                    style={{ gap: 16 }}
                  >
                    {/* rounded-full + overflow-hidden = primary circular clip.
                        img is scaled to 150% (228 px) so the PNG's solid-white
                        border (outside the colored circle) lies outside the 76 px
                        clip radius. clip-path adds a second cut on the raw pixels. */}
                    <div
                      className="relative rounded-full overflow-hidden transition-all duration-300 group-hover:scale-105 group-active:scale-95"
                      style={{
                        width: 152,
                        height: 152,
                        flexShrink: 0,
                        backgroundColor: 'transparent',
                        border: 'none',
                        outline: 'none',
                        boxShadow: sel
                          ? '0 0 0 2px #e8e4d9, 0 0 0 6px #517B3E, 0 8px 24px rgba(81,123,62,0.25)'
                          : 'none',
                      }}
                    >
                      <img
                        src={opt.img}
                        alt={opt.value}
                        style={{
                          width: '150%',
                          height: '150%',
                          objectFit: 'cover',
                          display: 'block',
                          marginLeft: '-25%',
                          marginTop: '-25%',
                          clipPath: 'circle(50% at 50% 50%)',
                        }}
                      />
                    </div>

                    {/* Name label */}
                    <p style={{
                      fontSize: '1.0625rem',
                      fontWeight: 700,
                      color: sel ? '#517B3E' : '#1e2a45',
                      margin: 0,
                      transition: 'color 0.2s',
                    }}>
                      {opt.value}
                    </p>

                    {/* Radio dot + description — only border/colour change on select */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: -8 }}>
                      <span style={{
                        width: 17,
                        height: 17,
                        borderRadius: '50%',
                        border: sel ? '5px solid #517B3E' : '2px solid rgba(100,120,100,0.4)',
                        background: 'rgba(255,255,255,0.85)',
                        flexShrink: 0,
                        transition: 'border 0.2s',
                        display: 'inline-block',
                      }} />
                      <span style={{ fontSize: '0.8125rem', color: sel ? '#517B3E' : '#8a9a8a', fontWeight: 500 }}>
                        {opt.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* "אחר" pill — subtle, no card */}
            <button
              type="button"
              onClick={() => setGender('אחר')}
              style={{
                padding: '8px 32px',
                borderRadius: 24,
                border: gender === 'אחר' ? '1.5px solid #517B3E' : '1.5px solid rgba(90,106,90,0.35)',
                background: gender === 'אחר' ? 'rgba(81,123,62,0.10)' : 'transparent',
                color: gender === 'אחר' ? '#517B3E' : '#7a8a7a',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.18s',
                marginBottom: 44,
              }}
            >
              אחר
            </button>

            {/* חזור / המשך buttons */}
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button
                type="button"
                onClick={() => router.push('/')}
                style={{
                  flex: 1,
                  padding: '13px 0',
                  borderRadius: 12,
                  border: '1.5px solid rgba(90,106,90,0.4)',
                  background: 'rgba(255,255,255,0.45)',
                  backdropFilter: 'blur(8px)',
                  color: '#374151',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                חזור
              </button>
              <button
                type="button"
                onClick={() => setStep('profile')}
                style={{
                  flex: 2,
                  padding: '13px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: '#517B3E',
                  color: 'white',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 18px rgba(81,123,62,0.42)',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
              >
                המשך
              </button>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center mt-6 text-xs" style={{ color: 'rgba(30,42,69,0.45)' }}>
            ניתן לעדכן פרטים אלה בכל עת דרך הגדרות הפרופיל
          </p>
        </div>
      )}

      {/* ── Profile Step — inside the glass card ── */}
      {step === 'profile' && (
      <div className="relative z-10 w-full animate-slide-up-fade" style={{ maxWidth: 480 }}>
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <LogoMark />
        </div>

        {/* Glass card */}
        <div
          className="rounded-3xl px-8 py-9"
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.75)',
            boxShadow: '0 20px 60px rgba(30,42,69,0.18), 0 2px 12px rgba(30,42,69,0.08)',
          }}
        >
          {/* Heading */}
          <div className="mb-7 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
              style={{ background: 'rgba(81,123,62,0.12)', border: '1.5px solid rgba(81,123,62,0.25)' }}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#517B3E" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4.26 10.147a60.436 60.436 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
              </svg>
            </div>
            <h1
              className="text-2xl font-extrabold mb-1"
              style={{ color: '#1e2a45', fontFamily: 'Georgia, serif', lineHeight: 1.25 }}
            >
              פרטי הלימודים
            </h1>
            <p className="text-sm" style={{ color: '#8899aa', lineHeight: 1.6 }}>
              ספר לנו על הלימודים שלך כדי שנוכל להתאים את החוויה
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── 1. Country ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>מדינה</label>
              <div className="relative">
                <select
                  value={country}
                  onChange={e => {
                    setCountry(e.target.value);
                    setInstitution('');
                    setInstOptions([]);
                    setInstOpen(false);
                  }}
                  style={{
                    ...baseInputStyle,
                    appearance: 'none',
                    paddingInlineEnd: 40,
                    cursor: 'pointer',
                    color: country ? '#1a2540' : '#9ca3af',
                  }}
                  onFocus={e => applyFocusStyle(e.target)}
                  onBlur={e => applyBlurStyle(e.target)}
                >
                  <option value="" disabled>בחר מדינה...</option>
                  {COUNTRIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 12 }}>
                  <Chevron />
                </span>
              </div>
            </div>

            {/* ── 2. Institution (async combobox) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>
                מוסד לימודים
                {!country && (
                  <span style={{ fontWeight: 400, color: '#9ca3af', marginRight: 6, fontSize: '0.75rem' }}>
                    (בחר מדינה תחילה)
                  </span>
                )}
              </label>
              <div ref={instRef} style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={institution}
                  onChange={e => {
                    const val = e.target.value;
                    setInstitution(val);
                    setInstHighlight(-1);
                    if (val.length < 2) { setInstOptions([]); setInstOpen(false); setInstLoading(false); }
                    else if (country) setInstLoading(true);
                  }}
                  onFocus={e => {
                    applyFocusStyle(e.target);
                    if (instOptions.length > 0) setInstOpen(true);
                  }}
                  onBlur={e => applyBlurStyle(e.target)}
                  onKeyDown={handleInstKeyDown}
                  placeholder={!country ? 'בחר מדינה תחילה' : 'הקלד לחיפוש מוסד לימודים...'}
                  disabled={!country}
                  style={{
                    ...baseInputStyle,
                    paddingInlineEnd: 40,
                    opacity: !country ? 0.55 : 1,
                    cursor: !country ? 'not-allowed' : 'text',
                  }}
                />
                <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 12 }}>
                  {instLoading ? <MiniSpinner /> : <SearchIcon />}
                </span>

                {instOpen && instOptions.length > 0 && (
                  <div style={dropdownStyle}>
                    {instOptions.map((opt, i) => (
                      <DropItem
                        key={opt}
                        text={opt}
                        highlighted={i === instHighlight}
                        last={i === instOptions.length - 1}
                        onSelect={() => { setInstitution(opt); setInstOpen(false); setInstHighlight(-1); }}
                        onHover={() => setInstHighlight(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── 3. Degree type ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>סוג התואר</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {DEGREE_TYPES.map(dt => {
                  const isSelected = degreeType === dt.value;
                  return (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => { setDegreeType(dt.value); if (dt.value === 'regular') setSecondaryMajor(''); }}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 10,
                        border: isSelected ? '1.5px solid #517B3E' : '1.5px solid rgba(200,190,170,0.6)',
                        background: isSelected ? 'rgba(81,123,62,0.09)' : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isSelected
                        ? (
                          <div className="flex justify-center mb-1">
                            <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#517B3E' }}>
                              <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="white">
                                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                              </svg>
                            </span>
                          </div>
                        )
                        : <div style={{ height: 24 }} />
                      }
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: isSelected ? '#517B3E' : '#374151', lineHeight: 1.3 }}>
                        {dt.label}
                      </p>
                      <p style={{ fontSize: '0.6875rem', color: isSelected ? '#6B904A' : '#9ca3af', marginTop: 2 }}>
                        {dt.sub}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 4. Primary major (static combobox) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>חוג ראשי</label>
              <div ref={primaryRef} style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={primaryMajor}
                  onChange={e => { setPrimaryMajor(e.target.value); setPrimaryHighlight(-1); }}
                  onFocus={e => { applyFocusStyle(e.target); setPrimaryOpen(true); }}
                  onBlur={e => applyBlurStyle(e.target)}
                  onKeyDown={handlePrimaryKeyDown}
                  placeholder="לדוגמה: מדעי המחשב, הנדסה, כלכלה..."
                  style={{ ...baseInputStyle, paddingInlineEnd: 40 }}
                />
                <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 12 }}>
                  <ChevronRotate open={primaryOpen} />
                </span>

                {primaryOpen && filteredPrimary.length > 0 && (
                  <div style={dropdownStyle}>
                    {filteredPrimary.map((m, i) => (
                      <DropItem
                        key={m}
                        text={m}
                        highlighted={i === primaryHighlight}
                        last={i === filteredPrimary.length - 1}
                        onSelect={() => { setPrimaryMajor(m); setPrimaryOpen(false); setPrimaryHighlight(-1); }}
                        onHover={() => setPrimaryHighlight(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── 5. Secondary major / specialization (conditional) ── */}
            {showSecondary && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} className="animate-slide-up-fade">
                <label style={labelStyle}>{secondaryLabel}</label>
                <div ref={secondaryRef} style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={secondaryMajor}
                    onChange={e => { setSecondaryMajor(e.target.value); setSecondaryHighlight(-1); }}
                    onFocus={e => { applyFocusStyle(e.target); setSecondaryOpen(true); }}
                    onBlur={e => applyBlurStyle(e.target)}
                    onKeyDown={handleSecondaryKeyDown}
                    placeholder={degreeType === 'double' ? 'לדוגמה: פיזיקה, פילוסופיה...' : 'לדוגמה: בינה מלאכותית, ניהול...'}
                    style={{ ...baseInputStyle, paddingInlineEnd: 40 }}
                  />
                  <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 12 }}>
                    <ChevronRotate open={secondaryOpen} />
                  </span>

                  {secondaryOpen && filteredSecondary.length > 0 && (
                    <div style={dropdownStyle}>
                      {filteredSecondary.map((m, i) => (
                        <DropItem
                          key={m}
                          text={m}
                          highlighted={i === secondaryHighlight}
                          last={i === filteredSecondary.length - 1}
                          onSelect={() => { setSecondaryMajor(m); setSecondaryOpen(false); setSecondaryHighlight(-1); }}
                          onHover={() => setSecondaryHighlight(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p style={{ fontSize: '0.875rem', color: '#dc2626', textAlign: 'center' }}>{error}</p>
            )}

            {/* Back + Submit row */}
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => router.back()}
                style={{
                  flex: 1,
                  padding: '13px 0',
                  borderRadius: 12,
                  border: '1.5px solid rgba(180,170,155,0.55)',
                  background: 'transparent',
                  color: '#6b7280',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                חזור
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  padding: '13px 0',
                  borderRadius: 12,
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'white',
                  backgroundColor: loading ? '#6B9053' : '#517B3E',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(81,123,62,0.38)',
                  transition: 'background-color 0.2s, box-shadow 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {loading && (
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.35)',
                    borderTopColor: 'white',
                    display: 'inline-block',
                    animation: 'spin 0.8s linear infinite',
                    flexShrink: 0,
                  }} />
                )}
                {loading ? 'שומר...' : 'המשך לדשבורד'}
              </button>
            </div>
          </form>

          {/* Skip */}
          <div className="mt-5 text-center">
            <button
              onClick={() => router.push('/workspace')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#9ca3af',
                textDecoration: 'underline',
                textDecorationColor: 'transparent',
                transition: 'color 0.15s, text-decoration-color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#517B3E';
                (e.currentTarget as HTMLButtonElement).style.textDecorationColor = '#517B3E';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
                (e.currentTarget as HTMLButtonElement).style.textDecorationColor = 'transparent';
              }}
            >
              דלג על שלב זה
            </button>
          </div>
        </div> {/* glass card */}

        {/* Footer note */}
        <p className="text-center mt-5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
          ניתן לעדכן פרטים אלה בכל עת דרך הגדרות הפרופיל
        </p>
      </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
