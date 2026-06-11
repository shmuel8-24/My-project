'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import { useCourse }   from '../providers/course';
import CoursePill      from '../../components/CoursePill';
import { type Slide, SlideRenderer } from '../../components/SlideLayouts';

const API = 'http://127.0.0.1:5003';

/* ── Auth / fetch helpers ─────────────────────────────────────────────────── */
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

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    console.error(
      `[presentation] Expected JSON but got "${ct || 'unknown content-type'}" (HTTP ${res.status}). Raw response:`,
      text.slice(0, 1000),
    );
    throw new Error(`Unexpected ${res.status} response (not JSON) — see console for the raw body`);
  }
  return res.json();
}

/* ── Shared micro-components ─────────────────────────────────────────────── */
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />
  );
}

function Spinner({ large = false }: { large?: boolean }) {
  const cls = large
    ? 'w-10 h-10 border-4 border-[#9DC08B]/30 border-t-[#517B3E]'
    : 'w-5 h-5 border-2 border-[#9DC08B]/30 border-t-[#517B3E]';
  return <span className={`inline-block rounded-full animate-spin ${cls}`} />;
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function PresentationPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const { selectedCourse } = useCourse();
  const he = lang === 'he';

  const [topic,   setTopic]   = useState('');
  const [slides,  setSlides]  = useState<Slide[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/api/generate-slides`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic:      topic.trim(),
          courseName: selectedCourse?.name ?? '',
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError((data.error as string) ?? (he ? 'שגיאה ביצירת המצגת' : 'Failed to generate the presentation'));
        return;
      }
      setSlides(data.slides as Slide[]);
      setCurrent(0);
    } catch (err) {
      console.error('[presentation] generate-slides failed:', err);
      setError(he ? 'לא ניתן להתחבר לשרת' : 'Could not connect to the server');
    } finally {
      setLoading(false);
    }
  }, [topic, loading, selectedCourse, he]);

  const goPrev = () => setCurrent(c => Math.max(0, c - 1));
  const goNext = () => setCurrent(c => (slides ? Math.min(slides.length - 1, c + 1) : c));

  if (authLoading || !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#97AB92' }}>
        <Spinner large />
      </div>
    );
  }

  const currentSlide = slides?.[current];

  return (
    <div dir={he ? 'rtl' : 'ltr'} className="h-screen flex flex-col overflow-hidden" style={{ background: '#97AB92' }}>

      {/* ── Header ── */}
      <header className="shrink-0 relative z-30" style={{
        background: '#8BAF84',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 1px 0 rgba(28,51,41,0.10)',
      }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">

          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push('/dashboard')}
              aria-label={he ? 'חזרה ללוח הבקרה' : 'Back to dashboard'}
              className="p-2 rounded-lg hover:bg-[#EEF5F0] transition-colors text-[#1C3329] shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 12 11.204 3.045a1.125 1.125 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </button>
            <LogoMark size={32} />
          </div>

          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <span className="text-lg leading-none">📊</span>
            <h1 className="text-[#1C3329] font-bold text-base tracking-wide truncate">
              {he ? 'יצירת מצגת' : 'Presentation Generator'}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <CoursePill />
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF5F0] hover:bg-[#E8F0EB] border border-[#D3E0D8] rounded-full text-sm text-[#1C3329] font-semibold transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              {he ? 'EN' : 'HE'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">

          {/* Topic input */}
          <div
            className="rounded-2xl p-5 flex flex-col sm:flex-row gap-3"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(157,192,139,0.35)',
              boxShadow: '0 4px 24px rgba(60,90,40,0.07)',
              borderRadius: '1rem',
            }}
          >
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') generate(); }}
              placeholder={he ? 'נושא המצגת (לדוגמה: מבוא לכלכלה התנהגותית)' : 'Presentation topic (e.g. Intro to Behavioral Economics)'}
              className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{ border: '1px solid rgba(157,192,139,0.4)', background: 'rgba(255,255,255,0.80)', color: '#2A3B22' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#517B3E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(81,123,62,0.12)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(157,192,139,0.4)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            <button
              onClick={generate}
              disabled={!topic.trim() || loading}
              className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
              style={{ background: '#517B3E' }}
            >
              {loading ? <Spinner /> : (he ? 'צור מצגת' : 'Generate')}
            </button>
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#b91c1c' }}>
              {error}
            </div>
          )}

          {/* Slide viewer */}
          {slides && currentSlide && (
            <div className="flex flex-col gap-4">
              <div className="w-full mx-auto" style={{ maxWidth: 1280 }}>
                <div
                  className="relative w-full rounded-2xl overflow-hidden"
                  style={{ aspectRatio: '1280 / 720', background: '#F9FCFA', border: '1px solid rgba(157,192,139,0.35)', boxShadow: '0 12px 40px rgba(60,90,40,0.12)' }}
                >
                  <SlideRenderer slide={currentSlide} />
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={goPrev}
                  disabled={current === 0}
                  aria-label={he ? 'שקופית קודמת' : 'Previous slide'}
                  className="p-2.5 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80"
                  style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.4)', color: '#1C3329' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={he ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
                  </svg>
                </button>

                <div className="flex items-center gap-1.5">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      aria-label={`${he ? 'שקופית' : 'Slide'} ${i + 1}`}
                      className="rounded-full transition-all"
                      style={{
                        width:  i === current ? 20 : 8,
                        height: 8,
                        background: i === current ? '#517B3E' : 'rgba(81,123,62,0.25)',
                      }}
                    />
                  ))}
                </div>

                <button
                  onClick={goNext}
                  disabled={current === slides.length - 1}
                  aria-label={he ? 'שקופית הבאה' : 'Next slide'}
                  className="p-2.5 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80"
                  style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.4)', color: '#1C3329' }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={he ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
                  </svg>
                </button>
              </div>

              <p className="text-center text-sm font-medium" style={{ color: '#2A3B22' }}>
                {current + 1} / {slides.length}
              </p>
            </div>
          )}

          {/* Empty state */}
          {!slides && !loading && (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-20" style={{ color: '#2A3B22' }}>
              <span className="text-5xl">📊</span>
              <p className="text-lg font-bold">
                {he ? 'הזן נושא וצור מצגת מקצועית מהחומר שלך' : 'Enter a topic to generate a professional deck from your materials'}
              </p>
              <p className="text-sm" style={{ color: '#527061' }}>
                {he ? '10 שקופיות בסגנון מצגות ייעוץ עסקי, מבוססות על המסמכים שהעלית' : '10 consulting-style slides, grounded in your uploaded documents'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
