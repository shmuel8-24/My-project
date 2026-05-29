'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import { useCourse, COURSES, type Course } from '../providers/course';
import Skeleton        from '../../components/ui/Skeleton';
import { useHaptics }  from '../../hooks/useHaptics';
import { playSwitch }  from '../../utils/audio';

/* ── Time-based greeting ──────────────────────────────────────────────────── */
function getGreeting(he: boolean): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return he ? 'בוקר טוב, מוכנים ללמוד? ☕'              : 'Good morning, ready to learn? ☕';
  if (h >= 12 && h < 18) return he ? 'צהריים טובים, מה נלמד עכשיו? ☀️'        : 'Good afternoon, what shall we study? ☀️';
  if (h >= 18 && h < 23) return he ? 'ערב טוב, זמן להשלים פערים 🌙'            : 'Good evening, time to fill the gaps 🌙';
  return he ? 'לילה לבן של למידה? אנחנו איתך 🦉' : "Late-night study session? We're with you 🦉";
}

/* ── Constants ────────────────────────────────────────────────────────────── */
const EMOJI_OPTIONS = [
  '📖', '🔬', '📊', '🎯', '🏛️', '🔭',
  '🎨', '💡', '🧪', '🌍', '🎼', '🗺️',
];

const CUSTOM_COLORS = [
  '#6B4E9B', '#C07D3A', '#2E7D7A', '#8B5E3C',
  '#4A7C59', '#9B3A4E', '#3A5E8B', '#7B6F42',
];

const HEAT_COLORS = ['#E8F0EB', '#D1E6D9', '#86EFAC', '#4ADE80'] as const;

/* ── Course card (handles its own hover; accepts isRecommended for glow) ──── */
function CourseCard({
  course, isActive, isRecommended,
}: { course: Course; isActive: boolean; isRecommended: boolean }) {
  const baseShadow = isActive
    ? `0 8px 32px ${course.color}28, 0 4px 12px rgba(28,51,41,0.06)`
    : '0 4px 6px -1px rgba(28,51,41,0.04), 0 2px 4px -2px rgba(28,51,41,0.03)';

  function onEnter(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    el.style.borderColor = '#86EFAC';
    el.style.transform   = 'scale(1.05) translateY(-6px)';
    el.style.boxShadow   = '0 24px 60px rgba(28,51,41,0.13), 0 8px 20px rgba(74,222,128,0.10)';
  }
  function onLeave(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    el.style.borderColor = isActive ? course.color : '#E8F0EB';
    el.style.transform   = 'scale(1) translateY(0)';
    el.style.boxShadow   = baseShadow;
  }

  return (
    <div
      className="w-44 h-44 bg-white flex items-center justify-center"
      style={{
        borderRadius: '40px',
        border:       `2px solid ${isActive ? course.color : '#E8F0EB'}`,
        boxShadow:    baseShadow,
        transition:   'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.3s cubic-bezier(0.34,1.28,0.64,1)',
        animation:    isRecommended ? 'recommendedGlow 2.4s ease-in-out infinite' : undefined,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span style={{ fontSize: '3.5rem', lineHeight: 1, userSelect: 'none' }}>{course.icon}</span>
    </div>
  );
}

/* ── Add-course "+" card ─────────────────────────────────────────────────── */
function AddCard() {
  function onEnter(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    el.style.borderColor     = '#86EFAC';
    el.style.color           = '#517B3E';
    el.style.backgroundColor = '#ffffff';
    el.style.boxShadow       = '0 24px 60px rgba(81,123,62,0.10), 0 8px 20px rgba(74,222,128,0.08)';
    el.style.transform       = 'scale(1.05) translateY(-6px)';
  }
  function onLeave(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    el.style.borderColor     = '#E8F0EB';
    el.style.color           = '#C8DDD0';
    el.style.backgroundColor = 'rgba(255,255,255,0.60)';
    el.style.boxShadow       = 'none';
    el.style.transform       = 'scale(1) translateY(0)';
  }

  return (
    <div
      className="w-44 h-44 flex items-center justify-center"
      style={{
        borderRadius:    '40px',
        backgroundColor: 'rgba(255,255,255,0.60)',
        border:          '2px dashed #E8F0EB',
        color:           '#C8DDD0',
        transition:      'border-color 0.25s ease, color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease, transform 0.3s cubic-bezier(0.34,1.28,0.64,1)',
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span style={{ fontSize: '3rem', fontWeight: 200, lineHeight: 1, userSelect: 'none' }}>+</span>
    </div>
  );
}

/* ── Matcha Heatmap — 14-day consistency graph ────────────────────────────── */
function MatchaHeatmap({ he, animationDelay }: { he: boolean; animationDelay: number }) {
  const [data, setData] = useState<number[]>([]);

  useEffect(() => {
    const generated = Array.from({ length: 14 }, (_, i) => {
      const recency = i / 13;
      const r = Math.random();
      if (r < 0.38 - recency * 0.20) return 0;
      if (r < 0.62) return 1;
      if (r < 0.82) return 2;
      return 3;
    });
    Promise.resolve(generated).then(d => setData(d));
  }, []);

  const streak = useMemo(() => {
    let s = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i] > 0) s++;
      else break;
    }
    return s;
  }, [data]);

  const dayLabels = useMemo(() => {
    const abbr = he ? ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const now = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (13 - i));
      return abbr[d.getDay()];
    });
  }, [he]);

  const cells = data.length > 0
    ? data
    : Array.from({ length: 14 }, () => 0);

  return (
    <div
      className="mt-8 p-6 border border-[#E8F0EB] rounded-2xl flex flex-col items-center gap-3 w-full animate-course-card"
      style={{
        background:           'rgba(255,255,255,0.40)',
        backdropFilter:       'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animationDelay:       `${animationDelay}ms`,
      }}
    >
      {/* Title + streak badge */}
      <div className="flex items-center gap-2">
        <span style={{ fontSize: '1rem' }}>🔥</span>
        <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>
          {he ? 'רצף למידה' : 'Study Streak'}
        </p>
        {streak > 0 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: '#D1E6D9', color: '#517B3E' }}
          >
            {streak} {he ? 'ימים' : 'days'}
          </span>
        )}
      </div>

      {/* Day-of-week labels */}
      <div className="flex gap-1.5">
        {dayLabels.map((label, i) => (
          <div
            key={i}
            className="w-4 text-center"
            style={{ fontSize: '9px', color: '#A8C4B4', lineHeight: 1 }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Activity cells */}
      <div className="flex gap-1.5">
        {cells.map((level, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-sm transition-transform duration-150 hover:scale-125"
            style={{ backgroundColor: HEAT_COLORS[level as 0 | 1 | 2 | 3] }}
            title={i === 13 ? (he ? 'היום' : 'Today') : undefined}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 pt-1">
        <span style={{ fontSize: '10px', color: '#A8C4B4' }}>{he ? 'פחות' : 'Less'}</span>
        {HEAT_COLORS.map((color, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
        ))}
        <span style={{ fontSize: '10px', color: '#A8C4B4' }}>{he ? 'יותר' : 'More'}</span>
      </div>
    </div>
  );
}

/* ── Two-step Add Course Modal ────────────────────────────────────────────── */
function AddCourseModal({
  onCourseCreated,
  onNavigate,
  onClose,
  he,
  colorIndex,
}: {
  onCourseCreated: (course: Course) => void;
  onNavigate:      () => void;
  onClose:         () => void;
  he:              boolean;
  colorIndex:      number;
}) {
  const [step,           setStep]          = useState<1 | 2>(1);
  const [icon,           setIcon]          = useState(EMOJI_OPTIONS[0]);
  const [name,           setName]          = useState('');
  const [error,          setError]         = useState(false);
  const [contentVisible, setContentVisible] = useState(true);
  const [createdCourse,  setCreatedCourse] = useState<Course | null>(null);
  const [isDragOver,     setIsDragOver]    = useState(false);
  const [droppedFile,    setDroppedFile]   = useState<File | null>(null);

  const inputRef    = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    if (step === 1) Promise.resolve(null).then(() => inputRef.current?.focus());
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  function handleCreateCourse() {
    if (!name.trim()) { setError(true); return; }
    const course: Course = {
      id:    `custom_${Date.now()}`,
      name:  name.trim(),
      icon,
      color: CUSTOM_COLORS[colorIndex % CUSTOM_COLORS.length],
    };
    onCourseCreated(course);
    setCreatedCourse(course);
    // Fade content out → swap step → fade content in
    setContentVisible(false);
    setTimeout(() => { setStep(2); setContentVisible(true); }, 220);
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragOver(true); }
  function handleDragLeave() { setIsDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setDroppedFile(file);
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setDroppedFile(file);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(28,51,41,0.20)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        dir={he ? 'rtl' : 'ltr'}
        className="w-full max-w-md rounded-3xl shadow-2xl p-8 border border-[#E8F0EB] animate-slide-up-fade"
        style={{ background: '#ffffff' }}
        role="dialog"
        aria-modal="true"
        aria-label={he ? 'הוסף קורס חדש' : 'Add new course'}
      >
        {/* Animated content pane — cross-fades between steps */}
        <div
          style={{
            opacity:    contentVisible ? 1 : 0,
            transform:  contentVisible ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          {step === 1 ? (
            /* ────────── STEP 1 ────────── */
            <>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '1.25rem' }}>✨</span>
                  <h2 className="font-bold text-lg" style={{ color: '#1C3329' }}>
                    {he ? 'קורס חדש' : 'New Course'}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-[#EEF5F0]"
                  style={{ color: '#527061' }}
                  aria-label={he ? 'סגור' : 'Close'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Emoji picker */}
              <div className="mb-7">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#527061' }}>
                  {he ? 'בחר/י אייקון' : 'Choose an icon'}
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setIcon(e)}
                      className="aspect-square flex items-center justify-center rounded-xl text-xl transition-all duration-150"
                      style={{
                        background: icon === e ? '#D1E6D9' : '#F4F9F6',
                        border:     `1.5px solid ${icon === e ? '#517B3E' : 'transparent'}`,
                        transform:  icon === e ? 'scale(1.12)' : 'scale(1)',
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Large bottom-line input */}
              <div className="mb-8">
                <input
                  ref={inputRef}
                  dir="auto"
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); if (error) setError(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateCourse(); }}
                  placeholder={he ? 'איזה קורס הולכים לפצח הפעם?' : 'Which course are we tackling?'}
                  className="border-b-2 border-[#D1E6D9] focus:border-[#4ADE80] outline-none text-2xl text-center pb-2 bg-transparent w-full transition-colors duration-200"
                  style={{ color: error ? '#527061' : '#1C3329' }}
                />
                {error && (
                  <p className="text-xs mt-2 text-center" style={{ color: '#527061' }}>
                    {he ? 'הממ, שכחת לרשום שם? 😊' : 'Hmm, forgot a name?'}
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 hover:bg-[#EEF5F0]"
                  style={{ background: '#F4F9F6', color: '#527061', border: '1px solid #D3E0D8' }}
                >
                  {he ? 'ביטול' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleCreateCourse}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all duration-150"
                  style={{ background: 'linear-gradient(135deg, #517B3E, #2A3B22)', boxShadow: '0 4px 14px rgba(81,123,62,0.30)' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(81,123,62,0.48)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(81,123,62,0.30)'; }}
                >
                  {he ? '+ צור קורס' : '+ Create'}
                </button>
              </div>
            </>
          ) : (
            /* ────────── STEP 2: Upload dropzone ────────── */
            <>
              <div className="flex flex-col items-center text-center mb-6">
                <div className="animate-bounce mb-4" style={{ fontSize: '3rem', lineHeight: 1 }}>☁️</div>
                <h2 className="font-bold text-lg mb-2" style={{ color: '#1C3329' }}>
                  🎉 {he ? `"${createdCourse?.name}" מוכן!` : `"${createdCourse?.name}" is ready!`}
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: '#527061' }}>
                  {he
                    ? 'גרור לכאן סילבוס או סיכום כדי שהבינה המלאכותית תתחיל למפות את החומר'
                    : 'Drag a syllabus or summary here so the AI can start mapping the material'}
                </p>
              </div>

              {/* Dropzone */}
              <div
                className="mb-6 cursor-pointer transition-all duration-200"
                style={{
                  border:       `2px dashed ${isDragOver ? '#4ADE80' : droppedFile ? '#517B3E' : '#D1E6D9'}`,
                  background:   isDragOver ? 'rgba(74,222,128,0.05)' : droppedFile ? 'rgba(81,123,62,0.04)' : '#F9FCFA',
                  borderRadius: '0.75rem',
                  padding:      '2rem',
                  textAlign:    'center',
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.docx,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {droppedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <span style={{ fontSize: '2rem' }}>✅</span>
                    <p className="text-sm font-semibold" style={{ color: '#517B3E' }}>{droppedFile.name}</p>
                    <p className="text-xs" style={{ color: '#7B9E8F' }}>
                      {he ? 'הקובץ יועלה בכניסה לסביבת העבודה' : 'Will be uploaded when you enter the workspace'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <span style={{ fontSize: '2rem', opacity: 0.45 }}>📄</span>
                    <p className="text-sm" style={{ color: '#7B9E8F' }}>
                      {he ? 'גרור קובץ לכאן או לחץ לבחירה' : 'Drag a file here or click to select'}
                    </p>
                    <p className="text-xs" style={{ color: '#A8C4B4' }}>PDF · PPTX · DOCX</p>
                  </div>
                )}
              </div>

              {/* Skip / continue button */}
              <button
                type="button"
                onClick={onNavigate}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200"
                style={droppedFile
                  ? { background: 'linear-gradient(135deg, #517B3E, #2A3B22)', color: '#fff', boxShadow: '0 4px 14px rgba(81,123,62,0.30)' }
                  : { background: '#F4F9F6', color: '#527061', border: '1px solid #D3E0D8' }
                }
                onMouseEnter={droppedFile ? (e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(81,123,62,0.48)'; }) : undefined}
                onMouseLeave={droppedFile ? (e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(81,123,62,0.30)'; }) : undefined}
              >
                {droppedFile
                  ? (he ? '← המשך לדשבורד ✓' : '→ Continue to Dashboard ✓')
                  : (he ? 'אדלג בינתיים, ניכנס לדשבורד' : 'Skip for now, go to dashboard')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function CoursePickerPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang } = useLanguage();
  const { selectedCourse, setSelectedCourse, customCourses, addCustomCourse } = useCourse();
  const he = lang === 'he';

  const { triggerHaptic } = useHaptics();

  const [selecting,           setSelecting]           = useState<string | null>(null);
  const [showAddModal,        setShowAddModal]        = useState(false);
  const [recommendedCourseId, setRecommendedCourseId] = useState<string | null>(null);

  const allCourses = [...COURSES, ...customCourses];

  /* Auth guard */
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  /* Pick recommended course on mount — client-only to avoid hydration mismatch */
  useEffect(() => {
    Promise.resolve(null).then(() =>
      setRecommendedCourseId(COURSES[Math.floor(Math.random() * COURSES.length)].id)
    );
  }, []);

  function handleSelect(course: Course) {
    if (selecting) return;
    playSwitch();
    triggerHaptic('light');
    setSelecting(course.id);
    setSelectedCourse(course);
    setTimeout(() => router.push('/dashboard'), 260);
  }

  function handleCourseCreated(course: Course) {
    addCustomCourse(course);
    setSelectedCourse(course);
  }

  function handleNavigateToDashboard() {
    setShowAddModal(false);
    router.push('/dashboard');
  }

  if (authLoading || !authUser) {
    return (
      <div
        dir={he ? 'rtl' : 'ltr'}
        className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
        style={{ background: '#F9FCFA' }}
      >
        <div className="flex flex-col items-center w-full max-w-3xl gap-6">
          {/* Logo */}
          <Skeleton className="w-36 h-12 rounded-2xl" />
          {/* Title + subtitle */}
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="w-72 h-9 rounded-2xl" />
            <Skeleton className="w-48 h-5 rounded-xl" />
          </div>
          {/* Course card skeletons */}
          <div className="flex flex-wrap justify-center gap-8 mt-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex flex-col items-center gap-4">
                <Skeleton className="w-40 h-40 rounded-3xl" />
                <Skeleton className="w-20 h-4 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* Stagger delays */
  const heatmapDelay  = 200 + (allCourses.length + 1) * 100 + 80;
  const managePillDelay = heatmapDelay + 180;

  return (
    <>
      <div
        dir={he ? 'rtl' : 'ltr'}
        className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
        style={{ background: '#F9FCFA' }}
      >
        {/* Decorative leaf watermarks */}
        <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
          <svg style={{ position:'absolute', top:'-70px', right:'-40px', width:'340px', opacity:.04, transform:'rotate(22deg)' }}
            viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
            <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
          </svg>
          <svg style={{ position:'absolute', bottom:'-50px', left:'-25px', width:'260px', opacity:.035, transform:'rotate(-18deg) scaleX(-1)' }}
            viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
            <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
          </svg>
          <svg style={{ position:'absolute', top:'45%', right:'-12px', width:'170px', opacity:.028, transform:'rotate(48deg)' }}
            viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
            <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
          </svg>
        </div>

        <div className="relative z-10 flex flex-col items-center w-full max-w-3xl">

          {/* Logo */}
          <div className="mb-10 animate-course-card" style={{ animationDelay: '0ms' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.PNG" alt="U-Note" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
          </div>

          {/* Dynamic greeting */}
          <h1
            className="text-4xl font-medium mb-3 text-center animate-course-card"
            style={{ color: '#1C3329', animationDelay: '80ms' }}
            suppressHydrationWarning
          >
            {getGreeting(he)}
          </h1>

          {/* Subtitle */}
          <p
            className="text-base mb-12 text-center animate-course-card"
            style={{ color: '#527061', animationDelay: '140ms' }}
          >
            {he ? 'בחר/י קורס כדי להתחיל' : 'Select a course to begin'}
          </p>

          {/* Course grid — carousel on mobile, flex-wrap on desktop */}
          <div className="w-full flex gap-6 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-2 px-4 md:flex-wrap md:justify-center md:overflow-visible md:snap-none md:gap-8 md:pb-0 md:px-0">

            {allCourses.map((course, i) => {
              const isActive      = !selecting && selectedCourse?.id === course.id;
              const isSelecting   = selecting === course.id;
              const isRecommended = !selecting && course.id === recommendedCourseId;

              return (
                <div
                  key={course.id}
                  className="animate-course-card snap-center shrink-0"
                  style={{ animationDelay: `${200 + i * 100}ms` }}
                >
                  <button
                    onClick={() => handleSelect(course)}
                    disabled={!!selecting}
                    className="flex flex-col items-center gap-4 group outline-none"
                    style={{
                      transform:  isSelecting ? 'scale(0.91)' : 'scale(1)',
                      transition: 'transform 0.18s ease',
                    }}
                  >
                    {/* Recommended badge wrapper */}
                    <div className="relative">
                      <CourseCard course={course} isActive={isActive} isRecommended={isRecommended} />
                      {isRecommended && (
                        <div
                          className="absolute -top-3 bg-[#D1E6D9] text-[#1C3329] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm"
                          style={{ right: '-8px', whiteSpace: 'nowrap' }}
                        >
                          ✨ {he ? 'מומלץ היום' : "Today's pick"}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <p
                        className="text-base font-semibold text-center transition-colors duration-200 group-hover:text-[#3B6654]"
                        style={{ color: '#1C3329' }}
                      >
                        {course.name}
                      </p>
                      {isActive && (
                        <span
                          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                          style={{ background: `${course.color}18`, color: course.color }}
                        >
                          {he ? 'פעיל' : 'Active'}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}

            {/* Add new course card */}
            <div
              className="animate-course-card snap-center shrink-0"
              style={{ animationDelay: `${200 + allCourses.length * 100}ms` }}
            >
              <button
                onClick={() => setShowAddModal(true)}
                disabled={!!selecting}
                className="flex flex-col items-center gap-4 group outline-none"
              >
                <AddCard />
                <p
                  className="text-base font-medium text-center transition-colors duration-200 group-hover:text-[#517B3E]"
                  style={{ color: '#7B9E8F' }}
                >
                  {he ? 'הוסף קורס חדש' : 'Add New Course'}
                </p>
              </button>
            </div>

          </div>

          {/* Matcha heatmap */}
          <MatchaHeatmap he={he} animationDelay={heatmapDelay} />

          {/* Manage courses pill */}
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-8 px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:bg-white animate-course-card"
            style={{
              border:         '1px solid #D3E0D8',
              color:          '#527061',
              animationDelay: `${managePillDelay}ms`,
            }}
          >
            {he ? 'נהל קורסים' : 'Manage Courses'}
          </button>

        </div>
      </div>

      {showAddModal && (
        <AddCourseModal
          onCourseCreated={handleCourseCreated}
          onNavigate={handleNavigateToDashboard}
          onClose={() => setShowAddModal(false)}
          he={he}
          colorIndex={customCourses.length}
        />
      )}
    </>
  );
}
