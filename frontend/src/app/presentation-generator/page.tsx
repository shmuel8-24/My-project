'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import CoursePill      from '../../components/CoursePill';
import SlideViewer, { type DeckSlide } from '../../components/SlideViewer';

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
      `[presentation-generator] Expected JSON but got "${ct || 'unknown content-type'}" (HTTP ${res.status}). Raw response:`,
      text.slice(0, 1000),
    );
    throw new Error(`Unexpected ${res.status} response (not JSON) — see console for the raw body`);
  }
  return res.json();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'mpeg', 'webm'].includes(ext)) return <span className="text-lg leading-none">🎞️</span>;
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'mpga'].includes(ext)) return <span className="text-lg leading-none">🎙️</span>;
  if (['png', 'jpg', 'jpeg'].includes(ext)) return <span className="text-lg leading-none">🖼️</span>;
  if (ext === 'pptx') return <span className="text-lg leading-none">📊</span>;
  if (ext === 'docx') return <span className="text-lg leading-none">📃</span>;
  return <span className="text-lg leading-none">📄</span>;
}

interface PendingFile {
  id:   string;
  file: File;
}

interface SourceResult {
  filename: string;
  type:     'document' | 'image' | 'media' | 'unsupported';
  chars:    number;
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function PresentationGeneratorPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const he = lang === 'he';

  const [topic,     setTopic]     = useState('');
  const [pending,   setPending]   = useState<PendingFile[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [slides,    setSlides]    = useState<DeckSlide[] | null>(null);
  const [sources,   setSources]   = useState<SourceResult[]>([]);

  const onDrop = useCallback((accepted: File[]) => {
    setError(null);
    setPending(prev => [
      ...prev,
      ...accepted.map(file => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`, file })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: loading,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/png':  ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'video/mp4':  ['.mp4'],
      'video/webm': ['.webm'],
      'video/mpeg': ['.mpeg'],
      'audio/mpeg': ['.mp3', '.mpga'],
      'audio/mp4':  ['.m4a'],
      'audio/wav':  ['.wav'],
      'audio/ogg':  ['.ogg'],
      'audio/flac': ['.flac'],
    },
  });

  const removeFile = useCallback((id: string) => {
    setPending(prev => prev.filter(p => p.id !== id));
  }, []);

  const totalSize = useMemo(() => pending.reduce((sum, p) => sum + p.file.size, 0), [pending]);

  const generate = useCallback(async () => {
    if (pending.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      if (topic.trim()) form.append('topic', topic.trim());
      pending.forEach(p => form.append('files', p.file));

      const res = await authFetch(`${API}/api/generate-presentation`, {
        method: 'POST',
        body:   form,
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError((data.error as string) ?? (he ? 'שגיאה ביצירת המצגת' : 'Failed to generate the presentation'));
        return;
      }
      setSlides(data.slides as DeckSlide[]);
      setSources((data.sources ?? []) as SourceResult[]);
    } catch (err) {
      console.error('[presentation-generator] generate-presentation failed:', err);
      setError(he ? 'לא ניתן להתחבר לשרת' : 'Could not connect to the server');
    } finally {
      setLoading(false);
    }
  }, [pending, topic, loading, he]);

  const reset = useCallback(() => {
    setSlides(null);
    setSources([]);
    setPending([]);
    setTopic('');
    setError(null);
  }, []);

  if (authLoading || !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#97AB92' }}>
        <Spinner large />
      </div>
    );
  }

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
            <span className="text-lg leading-none">🎬</span>
            <h1 className="text-[#1C3329] font-bold text-base tracking-wide truncate">
              {he ? 'יצירת מצגת מקבצים' : 'Presentation Generator'}
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

          {!slides && (
            <>
              {/* Intro */}
              <div className="flex flex-col items-center text-center gap-2 py-2">
                <span className="text-4xl">🤖</span>
                <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>
                  {he ? 'סוכן AI ליצירת מצגות' : 'AI Presentation Agent'}
                </h2>
                <p className="text-sm max-w-lg" style={{ color: '#527061' }}>
                  {he
                    ? 'העלה מסמכים, תמונות, הקלטות שמע או וידאו — והבינה המלאכותית תבנה עבורך מצגת מקצועית בת 10 שקופיות'
                    : 'Upload documents, images, audio or video — and the AI will build a professional 10-slide deck for you'}
                </p>
              </div>

              {/* Topic input */}
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'rgba(255,255,255,0.82)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(157,192,139,0.35)',
                  boxShadow: '0 4px 24px rgba(60,90,40,0.07)',
                  borderRadius: '1rem',
                }}
              >
                <label className="block text-xs font-bold mb-2" style={{ color: '#2A3B22' }}>
                  {he ? 'נושא המצגת (אופציונלי)' : 'Presentation topic (optional)'}
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  disabled={loading}
                  placeholder={he ? 'לדוגמה: סיכום הרצאה 4 — תרמודינמיקה' : 'e.g. Lecture 4 summary — Thermodynamics'}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all disabled:opacity-60"
                  style={{ border: '1px solid rgba(157,192,139,0.4)', background: 'rgba(255,255,255,0.80)', color: '#2A3B22' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#517B3E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(81,123,62,0.12)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(157,192,139,0.4)'; e.currentTarget.style.boxShadow = 'none'; }}
                />

                {/* Drop zone */}
                <div
                  {...getRootProps()}
                  className="mt-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-10 cursor-pointer transition-all text-center"
                  style={{
                    borderColor:     isDragActive ? '#517B3E' : 'rgba(157,192,139,0.5)',
                    backgroundColor: isDragActive ? 'rgba(81,123,62,0.07)' : 'rgba(255,255,255,0.4)',
                    opacity:         loading ? 0.6 : 1,
                  }}
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p className="text-sm font-bold" style={{ color: '#517B3E' }}>
                      {he ? 'שחרר כאן!' : 'Drop here!'}
                    </p>
                  ) : (
                    <>
                      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#9DC08B" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      <p className="text-sm font-medium" style={{ color: '#4a5e3a' }}>
                        {he ? 'גרור קבצים לכאן או לחץ לבחירה' : 'Drag files here or click to browse'}
                      </p>
                      <p className="text-xs" style={{ color: '#9aaf8a' }}>
                        {he ? 'PDF · PPTX · DOCX · תמונות · אודיו · וידאו' : 'PDF · PPTX · DOCX · Images · Audio · Video'}
                      </p>
                    </>
                  )}
                </div>

                {/* File list */}
                {pending.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    {pending.map(p => (
                      <div key={p.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.3)' }}>
                        <FileTypeIcon name={p.file.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: '#2A3B22' }}>{p.file.name}</p>
                          <p className="text-[10px]" style={{ color: '#7a9268' }}>{formatBytes(p.file.size)}</p>
                        </div>
                        <button
                          onClick={() => removeFile(p.id)}
                          disabled={loading}
                          aria-label={he ? 'הסר קובץ' : 'Remove file'}
                          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-100/60 transition-colors shrink-0 disabled:opacity-40"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#7a9268" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <p className="text-[11px] text-end" style={{ color: '#7a9268' }}>
                      {pending.length} {he ? 'קבצים' : 'files'} · {formatBytes(totalSize)}
                    </p>
                  </div>
                )}

                {/* Generate button */}
                <button
                  onClick={generate}
                  disabled={pending.length === 0 || loading}
                  className="mt-4 w-full px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: '#517B3E' }}
                >
                  {loading ? <Spinner /> : null}
                  {loading
                    ? (he ? 'הסוכן מעבד את החומרים...' : 'The agent is processing your materials...')
                    : (he ? 'צור מצגת' : 'Create Presentation')}
                </button>

                {loading && (
                  <p className="mt-2 text-xs text-center" style={{ color: '#7a9268' }}>
                    {he
                      ? 'מחלץ טקסט, מנתח תמונות, מתמלל מדיה ובונה מצגת — זה עשוי לקחת עד דקה'
                      : 'Extracting text, analyzing images, transcribing media and building your deck — this may take up to a minute'}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#b91c1c' }}>
                  {error}
                </div>
              )}
            </>
          )}

          {/* Slide viewer */}
          {slides && slides.length > 0 && (
            <div className="flex flex-col gap-4">
              <SlideViewer slides={slides} lang={lang} />

              {/* Sources summary */}
              {sources.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.3)' }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#7a9268' }}>
                    {he ? 'קבצים שעובדו' : 'Processed files'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((s, i) => (
                      <span key={i}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                        style={{
                          background: s.type === 'unsupported' ? 'rgba(220,38,38,0.08)' : 'rgba(81,123,62,0.08)',
                          color:      s.type === 'unsupported' ? '#b91c1c' : '#2A3B22',
                        }}>
                        <FileTypeIcon name={s.filename} />
                        {s.filename}
                        {s.type === 'unsupported' && (he ? ' (לא נתמך)' : ' (unsupported)')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={reset}
                className="self-center px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: '#EEF5F0', color: '#1C3329', border: '1px solid #D3E0D8' }}
              >
                {he ? 'מצגת חדשה' : 'New Presentation'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
