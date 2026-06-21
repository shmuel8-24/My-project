'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
  Globe, Building2, GraduationCap, Layers, Award, BookOpen,
  PartyPopper, ArrowRight, ArrowLeft, Check, AlertCircle,
} from 'lucide-react';

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

const DEGREE_ICONS: Record<string, React.ElementType> = {
  regular:     GraduationCap,
  double:      Layers,
  specialized: Award,
};

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

const centeredInputStyle: React.CSSProperties = {
  ...baseInputStyle,
  textAlign: 'center',
  fontSize: '1rem',
  fontWeight: 600,
  padding: '15px 44px',
  borderRadius: 14,
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
  textAlign: 'start' as const,
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

function MiniSpinner({ size = 14 }: { size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
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

// ─── Step chrome helpers ──────────────────────────────────────────────────────

function StepIconBadge({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div
      className="inline-flex items-center justify-center w-14 h-14 rounded-2xl"
      style={{ background: 'rgba(81,123,62,0.12)', border: '1.5px solid rgba(81,123,62,0.25)' }}
    >
      <Icon className="w-7 h-7" style={{ color: '#517B3E' }} strokeWidth={1.8} />
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-2xl font-extrabold mb-1.5" style={{ color: '#1e2a45', fontFamily: 'Georgia, serif', lineHeight: 1.3 }}>
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm" style={{ color: '#8899aa', lineHeight: 1.6 }}>{subtitle}</p>
      )}
    </div>
  );
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function authFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, credentials: 'include' });
}

function LogoMark() {
  return (
    <img src="/logo.PNG" alt="U-Note" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
  );
}

// ─── Steps + animation ─────────────────────────────────────────────────────────

type StepId = 'country' | 'institution' | 'degree' | 'primaryMajor' | 'secondaryMajor' | 'celebrate';

const slideVariants: Variants = {
  enter:  (dir: number) => ({ x: dir >= 0 ? 56 : -56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir >= 0 ? -56 : 56, opacity: 0 }),
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();

  // Field values
  const [country,        setCountry]        = useState('');
  const [institution,    setInstitution]    = useState('');
  const [degreeType,     setDegreeType]     = useState('regular');
  const [primaryMajor,   setPrimaryMajor]   = useState('');
  const [secondaryMajor, setSecondaryMajor] = useState('');

  // Step / save state
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [error,     setError]     = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'success' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(false);

  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const secondaryLabel = degreeType === 'double' ? 'מה החוג המשני שלך?' : 'מה תחום ההתמחות שלך?';

  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = ['country', 'institution', 'degree', 'primaryMajor'];
    if (showSecondary) base.push('secondaryMajor');
    base.push('celebrate');
    return base;
  }, [showSecondary]);

  const currentStepId = steps[stepIndex] ?? 'celebrate';

  // Redirect unauthenticated users
  useEffect(() => {
    if (!localStorage.getItem('levy_ai_email')) router.replace('/?login=true');
  }, [router]);

  // Defensive clamp if `steps` shrinks while pointing past its end
  useEffect(() => {
    if (stepIndex <= steps.length - 1) return;
    void Promise.resolve().then(() => setStepIndex(steps.length - 1));
  }, [steps, stepIndex]);

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

  // Clear any pending auto-advance timer on unmount
  useEffect(() => () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
  }, []);

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

  // ── Step navigation ────────────────────────────────────────────────────────

  const goNext = () => {
    if (autoAdvanceTimer.current) { clearTimeout(autoAdvanceTimer.current); autoAdvanceTimer.current = null; }
    setDirection(1);
    setStepIndex(i => i + 1);
  };

  const goBack = () => {
    if (autoAdvanceTimer.current) { clearTimeout(autoAdvanceTimer.current); autoAdvanceTimer.current = null; }
    if (currentStepId === 'celebrate') { setSaveState('idle'); setError(''); }
    setDirection(-1);
    setStepIndex(i => Math.max(i - 1, 0));
  };

  const skip = () => router.push('/workspace');

  const submitForm = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError('');
    const payload = {
      country,
      institution,
      degree_type:     degreeType,
      primary_major:   primaryMajor.trim(),
      secondary_major: secondaryMajor.trim(),
    };
    try {
      const res = await authFetch(`${API}/api/user/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? 'שגיאה בשמירת הנתונים');
        setSaveState('error');
        return;
      }
      await res.json().catch(() => ({}));
      localStorage.setItem('levy_ai_country',         country);
      localStorage.setItem('levy_ai_institution',     institution);
      localStorage.setItem('levy_ai_degree_type',     degreeType);
      localStorage.setItem('levy_ai_primary_major',   primaryMajor.trim());
      localStorage.setItem('levy_ai_secondary_major', degreeType !== 'regular' ? secondaryMajor.trim() : '');
      setError('');
      setSaveState('success');
      void import('canvas-confetti').then(({ default: confetti }) => {
        void confetti({
          particleCount: 90, spread: 70, startVelocity: 30,
          gravity: 0.75, decay: 0.93, ticks: 320,
          colors: ['#517B3E', '#9DC08B', '#D1E6D9', '#F9DE8B'],
          shapes: ['circle', 'square'],
          origin: { y: 0.6 },
        });
      });
    } catch (err) {
      console.error('[onboarding] save request threw', err);
      setError('לא ניתן להתחבר לשרת');
      setSaveState('error');
    } finally {
      setIsLoading(false);
    }
  };

  const selectDegree = (value: string) => {
    setDegreeType(value);
    if (value === 'regular') setSecondaryMajor('');
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      setDirection(1);
      setStepIndex(i => i + 1);
    }, 500);
  };

  const progressPct = steps.length > 1 ? (stepIndex / (steps.length - 1)) * 100 : 100;
  const nextDisabled = currentStepId === 'country' && !country;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full relative overflow-hidden"
      style={{ backgroundColor: '#e8e4d9', fontFamily: 'var(--font-heebo), system-ui, sans-serif' }}
    >
      {/* Organic background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute" style={{ top: '-15%', right: '-8%', width: '55%', height: '65%', background: 'radial-gradient(ellipse at 60% 40%, #1e2a45 0%, #263354 50%, transparent 80%)', borderRadius: '40% 60% 60% 40% / 40% 40% 60% 60%', opacity: 0.9 }} />
        <div className="absolute" style={{ top: '25%', left: '-12%', width: '40%', height: '55%', background: 'radial-gradient(ellipse at 40% 60%, #5A7F4E 0%, #4C6E3E 60%, transparent 85%)', borderRadius: '60% 40% 40% 60% / 60% 60% 40% 40%', opacity: 0.75 }} />
        <div className="absolute" style={{ bottom: '-15%', left: '0%', width: '38%', height: '45%', background: 'radial-gradient(ellipse at 30% 30%, #6A8E5E 0%, #4C6E3E 70%, transparent 90%)', borderRadius: '50% 70% 70% 30% / 30% 30% 70% 70%', opacity: 0.65 }} />
        <div className="absolute" style={{ bottom: '0%', right: '5%', width: '30%', height: '40%', background: 'radial-gradient(ellipse at 60% 70%, #1e2a45 0%, #263354 60%, transparent 85%)', borderRadius: '70% 30% 30% 70% / 30% 70% 30% 70%', opacity: 0.8 }} />
      </div>

      {/* Persistent top bar — logo, progress, skip — shared across every slide */}
      <div className="fixed top-0 inset-x-0 z-20 px-4 pt-6">
        <div className="mx-auto w-full" style={{ maxWidth: 420 }}>
          <div className="flex justify-center mb-4">
            <LogoMark />
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(81,123,62,0.12)', overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #6B9053, #517B3E)' }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs font-medium" style={{ color: '#9ca3af' }}>
              שלב {Math.min(stepIndex + 1, steps.length)} מתוך {steps.length}
            </span>
            {currentStepId !== 'celebrate' && (
              <button
                type="button"
                onClick={skip}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#9ca3af', textDecoration: 'underline', textDecorationColor: 'transparent', transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#517B3E'; (e.currentTarget as HTMLButtonElement).style.textDecorationColor = '#517B3E'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.textDecorationColor = 'transparent'; }}
              >
                דלג על שלב זה
              </button>
            )}
          </div>
        </div>
      </div>

      {/* One full-screen slide at a time */}
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={currentStepId}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-10 flex flex-col items-center justify-center px-4 overflow-y-auto"
          style={{ paddingTop: 120, paddingBottom: 64 }}
        >
          <div className="w-full flex flex-col items-center text-center gap-[18px]" style={{ maxWidth: 420 }}>

                {/* ── Country ── */}
                {currentStepId === 'country' && (
                  <>
                    <StepIconBadge icon={Globe} />
                    <StepHeading title="מאיזו מדינה אתה/את?" subtitle="כך נוכל להציע לך מוסדות לימוד ותכנים מתאימים" />
                    <div className="relative w-full" style={{ maxWidth: 320 }}>
                      <select
                        value={country}
                        onChange={e => {
                          setCountry(e.target.value);
                          setInstitution('');
                          setInstOptions([]);
                          setInstOpen(false);
                        }}
                        style={{
                          ...centeredInputStyle,
                          appearance: 'none',
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
                      <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 16 }}>
                        <Chevron />
                      </span>
                    </div>
                  </>
                )}

                {/* ── Institution ── */}
                {currentStepId === 'institution' && (
                  <>
                    <StepIconBadge icon={Building2} />
                    <StepHeading title="באיזה מוסד אתה/את לומד/ת?" subtitle="התחל/י להקליד וחפש/י מהרשימה" />
                    <div ref={instRef} className="relative w-full" style={{ maxWidth: 320 }}>
                      <input
                        type="text"
                        value={institution}
                        onChange={e => {
                          const val = e.target.value;
                          setInstitution(val);
                          setInstHighlight(-1);
                          if (val.length < 2) { setInstOptions([]); setInstOpen(false); setInstLoading(false); }
                          else setInstLoading(true);
                        }}
                        onFocus={e => {
                          applyFocusStyle(e.target);
                          if (instOptions.length > 0) setInstOpen(true);
                        }}
                        onBlur={e => applyBlurStyle(e.target)}
                        onKeyDown={handleInstKeyDown}
                        placeholder="הקלד לחיפוש מוסד לימודים..."
                        style={centeredInputStyle}
                      />
                      <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 16 }}>
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
                  </>
                )}

                {/* ── Degree type ── */}
                {currentStepId === 'degree' && (
                  <>
                    <StepIconBadge icon={GraduationCap} />
                    <StepHeading title="איזה סוג תואר אתה/את עושה?" subtitle="זה עוזר לנו להבין את מבנה הלימודים שלך" />
                    <div className="flex flex-col gap-3 w-full" style={{ maxWidth: 340 }}>
                      {DEGREE_TYPES.map(dt => {
                        const isSelected = degreeType === dt.value;
                        const Icon = DEGREE_ICONS[dt.value];
                        return (
                          <button
                            key={dt.value}
                            type="button"
                            onClick={() => selectDegree(dt.value)}
                            className="flex items-center gap-3.5"
                            style={{
                              padding: '16px 18px',
                              borderRadius: 16,
                              border: isSelected ? '2px solid #517B3E' : '1.5px solid rgba(200,190,170,0.6)',
                              background: isSelected ? 'rgba(81,123,62,0.10)' : 'rgba(255,255,255,0.65)',
                              boxShadow: isSelected ? '0 6px 20px rgba(81,123,62,0.18)' : '0 2px 8px rgba(30,42,69,0.04)',
                              cursor: 'pointer',
                              textAlign: 'start',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span
                              className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                              style={{ background: isSelected ? 'rgba(81,123,62,0.18)' : 'rgba(81,123,62,0.08)' }}
                            >
                              <Icon className="w-5 h-5" style={{ color: '#517B3E' }} strokeWidth={1.8} />
                            </span>
                            <span style={{ flex: 1 }}>
                              <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: isSelected ? '#517B3E' : '#1e2a45', lineHeight: 1.3 }}>
                                {dt.label}
                              </p>
                              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>
                                {dt.sub}
                              </p>
                            </span>
                            {isSelected && (
                              <span className="flex items-center justify-center w-6 h-6 rounded-full shrink-0" style={{ background: '#517B3E' }}>
                                <Check className="w-3.5 h-3.5" style={{ color: 'white' }} strokeWidth={2.5} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* ── Primary major ── */}
                {currentStepId === 'primaryMajor' && (
                  <>
                    <StepIconBadge icon={BookOpen} />
                    <StepHeading title="מה החוג הראשי שלך?" subtitle="לדוגמה: מדעי המחשב, הנדסה, כלכלה..." />
                    <div ref={primaryRef} className="relative w-full" style={{ maxWidth: 320 }}>
                      <input
                        type="text"
                        value={primaryMajor}
                        onChange={e => { setPrimaryMajor(e.target.value); setPrimaryHighlight(-1); }}
                        onFocus={e => { applyFocusStyle(e.target); setPrimaryOpen(true); }}
                        onBlur={e => applyBlurStyle(e.target)}
                        onKeyDown={handlePrimaryKeyDown}
                        placeholder="הקלד או בחר מהרשימה..."
                        style={centeredInputStyle}
                      />
                      <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 16 }}>
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
                  </>
                )}

                {/* ── Secondary major / specialization ── */}
                {currentStepId === 'secondaryMajor' && (
                  <>
                    <StepIconBadge icon={Layers} />
                    <StepHeading
                      title={secondaryLabel}
                      subtitle={degreeType === 'double' ? 'לדוגמה: פיזיקה, פילוסופיה...' : 'לדוגמה: בינה מלאכותית, ניהול...'}
                    />
                    <div ref={secondaryRef} className="relative w-full" style={{ maxWidth: 320 }}>
                      <input
                        type="text"
                        value={secondaryMajor}
                        onChange={e => { setSecondaryMajor(e.target.value); setSecondaryHighlight(-1); }}
                        onFocus={e => { applyFocusStyle(e.target); setSecondaryOpen(true); }}
                        onBlur={e => applyBlurStyle(e.target)}
                        onKeyDown={handleSecondaryKeyDown}
                        placeholder="הקלד או בחר מהרשימה..."
                        style={centeredInputStyle}
                      />
                      <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineEnd: 16 }}>
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
                  </>
                )}

                {/* ── Celebration / save ── */}
                {currentStepId === 'celebrate' && (
                  <>
                    {saveState === 'error' ? (
                      <>
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: 'rgba(220,38,38,0.10)', border: '1.5px solid rgba(220,38,38,0.25)' }}>
                          <AlertCircle className="w-7 h-7" style={{ color: '#dc2626' }} strokeWidth={1.8} />
                        </div>
                        <StepHeading title="אופס, הייתה תקלה" subtitle={error || 'שגיאה בשמירת הנתונים'} />
                        <button
                          type="button"
                          onClick={() => { setSaveState('idle'); setError(''); }}
                          style={{
                            padding: '13px 32px', borderRadius: 12, fontSize: '0.9375rem', fontWeight: 700,
                            color: 'white', backgroundColor: '#517B3E', border: 'none', cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(81,123,62,0.38)',
                          }}
                        >
                          ניסיון חוזר
                        </button>
                      </>
                    ) : saveState === 'success' ? (
                      <>
                        <motion.div
                          initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
                          animate={{ scale: 1, opacity: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
                          style={{ background: 'rgba(81,123,62,0.12)', border: '1.5px solid rgba(81,123,62,0.25)' }}
                        >
                          <PartyPopper className="w-8 h-8" style={{ color: '#517B3E' }} strokeWidth={1.8} />
                        </motion.div>
                        <StepHeading title="הכל מוכן! 🎉" subtitle="שמרנו את הפרטים שלך — אפשר להתחיל" />
                        <button
                          type="button"
                          onClick={() => router.push('/workspace')}
                          style={{
                            padding: '14px 36px', borderRadius: 12, fontSize: '1rem', fontWeight: 700,
                            color: 'white', backgroundColor: '#517B3E', border: 'none', cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(81,123,62,0.38)',
                          }}
                        >
                          קח אותי ללוח הבקרה
                        </button>
                      </>
                    ) : isLoading ? (
                      <>
                        <MiniSpinner size={28} />
                        <StepHeading title="רק רגע..." subtitle="שומרים את הפרטים שלך" />
                      </>
                    ) : (
                      <>
                        <StepIconBadge icon={PartyPopper} />
                        <StepHeading title="הכל מוכן — מתחילים?" subtitle="לחץ/י על סיים כדי לשמור את הפרטים שלך ולהתחיל" />
                        <div className="flex flex-col gap-3 w-full" style={{ maxWidth: 320 }}>
                          <button
                            type="button"
                            onClick={submitForm}
                            style={{
                              padding: '14px 36px', borderRadius: 12, fontSize: '1rem', fontWeight: 700,
                              color: 'white', backgroundColor: '#517B3E', border: 'none', cursor: 'pointer',
                              boxShadow: '0 4px 16px rgba(81,123,62,0.38)',
                            }}
                          >
                            סיים!
                          </button>
                          <button
                            type="button"
                            onClick={goBack}
                            className="flex items-center justify-center gap-1.5"
                            style={{
                              padding: '13px 0', borderRadius: 12,
                              border: '1.5px solid rgba(180,170,155,0.55)', background: 'transparent',
                              color: '#6b7280', fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            <ArrowRight className="w-4 h-4" />
                            חזור
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}

          </div>

          {/* Error (non-celebration steps) */}
          {error && currentStepId !== 'celebrate' && (
            <p style={{ fontSize: '0.875rem', color: '#dc2626', textAlign: 'center', marginTop: 8 }}>{error}</p>
          )}

          {/* Navigation */}
          {currentStepId !== 'celebrate' && (
            <div className="flex gap-3 mt-7 w-full" style={{ maxWidth: 420 }}>
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center justify-center gap-1.5"
                  style={{
                    flex: 1, padding: '13px 0', borderRadius: 12,
                    border: '1.5px solid rgba(180,170,155,0.55)', background: 'transparent',
                    color: '#6b7280', fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <ArrowRight className="w-4 h-4" />
                  חזור
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={nextDisabled}
                className="flex items-center justify-center gap-1.5"
                style={{
                  flex: 2, padding: '13px 0', borderRadius: 12, fontSize: '1rem', fontWeight: 700,
                  color: 'white', backgroundColor: nextDisabled ? '#9DC08B' : '#517B3E', border: 'none',
                  cursor: nextDisabled ? 'not-allowed' : 'pointer',
                  boxShadow: nextDisabled ? 'none' : '0 4px 16px rgba(81,123,62,0.38)',
                  transition: 'background-color 0.2s, box-shadow 0.2s',
                }}
              >
                הבא
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer note — persistent across every slide */}
      <p className="fixed bottom-4 inset-x-0 z-20 text-center text-xs px-4" style={{ color: 'rgba(30,42,69,0.45)' }}>
        ניתן לעדכן פרטים אלה בכל עת דרך הגדרות הפרופיל
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
