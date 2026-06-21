'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useLanguage } from '../../providers/language';
import { useCourse, type Course } from '../../providers/course';

const API = 'http://localhost:5003';

const COLOR_OPTIONS = [
  { id: 'green',  value: '#4A7C59', label: 'ירוק',  bg: '#D1E6D9' },
  { id: 'blue',   value: '#3A5E8B', label: 'כחול',  bg: '#D6E4F0' },
  { id: 'purple', value: '#6B4E9B', label: 'סגול',  bg: '#E8DEF8' },
  { id: 'orange', value: '#C07D3A', label: 'כתום',  bg: '#FDEBD0' },
  { id: 'rose',   value: '#9B3A4E', label: 'ורוד',  bg: '#FADBD8' },
];

const SEMESTER_OPTIONS = [
  { value: 'a',      label: "א'" },
  { value: 'b',      label: "ב'" },
  { value: 'summer', label: 'קיץ' },
];

const STEP_META = [
  { he: 'פרטים בסיסיים', en: 'Basic Details' },
  { he: 'תגבור',         en: 'Recitation'    },
  { he: 'הגדרות',        en: 'Settings'      },
] as const;

const inputBase: React.CSSProperties = {
  borderColor: '#D3E0D8',
  background:  '#F9FCFA',
  color:       '#1C3329',
};

function InputField({
  label, optional, he, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; optional?: boolean; he: boolean }) {
  return (
    <section className="mb-5">
      <label className="flex items-baseline gap-1.5 text-sm font-semibold mb-1.5" style={{ color: '#1C3329' }}>
        {label}
        {optional && (
          <span className="text-xs font-normal" style={{ color: '#527061' }}>
            ({he ? 'אופציונלי' : 'Optional'})
          </span>
        )}
      </label>
      <input
        dir="auto"
        className="w-full px-4 py-3 rounded-xl border outline-none transition-colors duration-150 text-base"
        style={inputBase}
        onFocus={e => {
          e.target.style.borderColor = '#517B3E';
          e.target.style.boxShadow   = '0 0 0 3px rgba(81,123,62,0.12)';
        }}
        onBlur={e => {
          e.target.style.borderColor = '#D3E0D8';
          e.target.style.boxShadow   = 'none';
        }}
        {...props}
      />
    </section>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      style={{ width: 28, height: 28, color: '#517B3E' }}
      fill="none" viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const slideVariants = {
  enter:  (dir: number) => ({ x: dir > 0 ? 36 : -36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir > 0 ? -36 : 36, opacity: 0 }),
};

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function AddCoursePage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { addCustomCourse } = useCourse();
  const he = lang === 'he';

  // Wizard navigation: 0 = upload zone, 1-3 = form steps
  const [step,      setStep]      = useState(0);
  const [direction, setDirection] = useState(1);

  // Form fields
  const [name,      setName]      = useState('');
  const [lecturer,  setLecturer]  = useState('');
  const [hasTirgul, setHasTirgul] = useState<boolean | null>(null);
  const [ta,        setTa]        = useState('');
  const [semester,  setSemester]  = useState('a');
  const [color,     setColor]     = useState(COLOR_OPTIONS[0].value);
  const [nameError, setNameError] = useState(false);

  // Syllabus state
  const [syllabusText, setSyllabusText] = useState('');
  const [isParsingPDF, setIsParsingPDF] = useState(false);
  const [parseError,   setParseError]   = useState('');

  // Exit protection
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [hasSaved,        setHasSaved]        = useState(false);
  const isDirty = step >= 1 && !hasSaved;

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    setIsParsingPDF(true);
    setParseError('');

    const formData = new FormData();
    // Append the File object directly — DO NOT set Content-Type manually;
    // the browser sets multipart/form-data with the correct boundary automatically.
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/api/courses/parse-syllabus`, {
        method:  'POST',
        credentials: 'include',
        body:    formData,
      });

      // Read body as text first — res.json() would throw on any non-JSON body
      // (Flask HTML 404, plain-text 500, etc.) and mask the real error.
      const raw = await res.text();

      // Try to parse as JSON; fall back to empty object so field access is safe.
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(raw); } catch { /* response wasn't JSON */ }

      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : he
              ? `שגיאה מהשרת (${res.status})`
              : `Server error (${res.status})`;
        setParseError(msg);
        return;
      }

      // Auto-fill all form fields from AI response
      setName((data.course_name     as string) || '');
      setLecturer((data.lecturer_name as string) || '');
      setHasTirgul((data.has_tirgul  as boolean) ?? null);
      setTa((data.ta_name           as string) || '');
      setSemester((data.semester     as string) || 'a');
      setSyllabusText((data.full_syllabus_text as string) || '');

      // Advance into the wizard
      setDirection(1);
      setStep(1);
    } catch (err) {
      // Only genuine network failures (backend unreachable, CORS block) reach here.
      const isNetworkErr = err instanceof TypeError;
      setParseError(
        isNetworkErr
          ? (he ? 'לא ניתן להגיע לשרת — ודא שה-Backend פועל' : 'Cannot reach server — make sure the backend is running')
          : (he ? 'שגיאה לא צפויה — נסה שנית' : 'Unexpected error — please try again'),
      );
    } finally {
      setIsParsingPDF(false);
    }
  }, [he]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept:   { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: isParsingPDF,
    onDrop:   (files) => { if (files[0]) handleFileUpload(files[0]); },
  });

  // Block native browser unload while unsaved data exists
  useEffect(() => {
    if (!isDirty) return;
    const handle = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handle);
    return () => window.removeEventListener('beforeunload', handle);
  }, [isDirty]);

  // Intercept the native browser Back button — push a phantom state on mount so
  // the first Back press fires popstate instead of leaving the page.
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      setShowExitWarning(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ── Wizard navigation ──────────────────────────────────────────────────────
  function goNext() {
    if (step === 1 && !name.trim()) { setNameError(true); return; }
    setDirection(1);
    setStep(s => s + 1);
  }

  function goBack() {
    setDirection(-1);
    setStep(s => s - 1);
  }

  function skipToManual() {
    setDirection(1);
    setStep(1);
  }

  function handleExitAttempt() {
    if (isDirty) setShowExitWarning(true);
    else router.push('/course-picker');
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    const localCourse: Course = {
      id:    `custom_${Date.now()}`,
      name:  name.trim(),
      icon:  '📖',
      color,
    };

    // Always persist to localStorage immediately
    addCustomCourse(localCourse);

    // Fire-and-forget backend save (indexes syllabus to ChromaDB for RAG)
    fetch(`${API}/api/courses`, {
      method:  'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_name:        name.trim(),
        lecturer_name:      lecturer.trim(),
        has_tirgul:         hasTirgul ?? false,
        ta_name:            hasTirgul ? ta.trim() : '',
        semester,
        color,
        full_syllabus_text: syllabusText,
      }),
    }).catch(() => { /* silently ignore network failures — localStorage save already succeeded */ });

    setHasSaved(true);
    router.push('/course-picker');
  }

  // ── Heading copy ───────────────────────────────────────────────────────────
  const heading  = step === 0
    ? (he ? 'חסוך זמן עם הסילבוס' : 'Save time with your syllabus')
    : (he ? 'הוספת קורס חדש'       : 'Add New Course');
  const subtitle = step === 0
    ? (he
        ? 'העלה את הסילבוס וה-AI ימלא את כל הפרטים לבד'
        : 'Upload the syllabus and AI will fill all the details')
    : (he
        ? 'מלא/י את הפרטים כדי להוסיף קורס לרשימה שלך'
        : 'Fill in the details to add a course to your list');

  return (
    <>
    <div
      dir={he ? 'rtl' : 'ltr'}
      className="!bg-[#97AB92] w-full min-h-screen p-6 md:p-12 flex flex-col items-center justify-start"
    >
      {/* Decorative leaf watermarks */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
        <svg style={{ position: 'absolute', top: '-70px', right: '-40px', width: '300px', opacity: 0.04, transform: 'rotate(22deg)' }}
          viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z" />
        </svg>
        <svg style={{ position: 'absolute', bottom: '-50px', left: '-25px', width: '220px', opacity: 0.032, transform: 'rotate(-18deg) scaleX(-1)' }}
          viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z" />
        </svg>
      </div>

      <motion.div
        className="relative z-10 w-full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.PNG" alt="U-Note" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Page heading — animates between step 0 and steps 1-3 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step === 0 ? 'h-upload' : 'h-form'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mb-7 text-center"
          >
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#1C3329' }}>
              {heading}
            </h1>
            <p className="mt-2 text-sm" style={{ color: '#527061' }}>
              {subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* ── Form card ── */}
        <motion.div
          layout
          transition={{ layout: { duration: 0.28, ease: 'easeInOut' } }}
          className="!bg-[#EAF4F8] rounded-3xl shadow-lg shadow-[#A8BCA0]/20 border border-[#C9E4EF] p-8 max-w-3xl mx-auto"
        >
          <AnimatePresence mode="wait" custom={direction}>

            {/* ──────────────── STEP 0: Smart Upload Zone ──────────────── */}
            {step === 0 && (
              <motion.div
                key="step-0"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeInOut' }}
              >
                {isParsingPDF ? (
                  /* Scanning state */
                  <div className="flex flex-col items-center gap-4 py-10">
                    <Spinner />
                    <p className="text-sm font-medium text-center" style={{ color: '#1C3329' }}>
                      {he
                        ? 'ה-AI סורק ומנתח את הסילבוס שלך...'
                        : 'AI is scanning and analyzing your syllabus...'}
                    </p>
                    <p className="text-xs text-center" style={{ color: '#527061' }}>
                      {he ? 'זה ייקח כמה שניות' : 'This will take a few seconds'}
                    </p>
                  </div>
                ) : (
                  /* Drop zone */
                  <div className="flex flex-col items-center gap-5">
                    <div
                      {...getRootProps()}
                      className="w-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center gap-3 p-8 select-none"
                      style={{
                        borderColor:  isDragActive ? '#517B3E' : '#C9E4EF',
                        background:   isDragActive ? 'rgba(81,123,62,0.06)' : 'rgba(255,255,255,0.55)',
                      }}
                    >
                      <input {...getInputProps()} />

                      {/* PDF icon */}
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: isDragActive ? '#D1E6D9' : '#EEF5F0' }}
                      >
                        <svg
                          className="w-7 h-7"
                          style={{ color: isDragActive ? '#517B3E' : '#7B9E8F' }}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                          />
                        </svg>
                      </div>

                      <div className="text-center">
                        <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>
                          {isDragActive
                            ? (he ? 'שחרר כאן!' : 'Release here!')
                            : (he ? 'גרור את הסילבוס לכאן' : 'Drag your syllabus here')}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#527061' }}>
                          {he ? 'או לחץ לבחירת קובץ PDF' : 'or click to select a PDF'}
                        </p>
                      </div>
                    </div>

                    {parseError && (
                      <p
                        className="text-xs text-center px-3 py-2 rounded-xl w-full"
                        style={{ background: '#FADBD8', color: '#9B3A4E' }}
                      >
                        {parseError}
                      </p>
                    )}

                    {/* Skip link */}
                    <button
                      type="button"
                      onClick={skipToManual}
                      className="text-sm transition-colors duration-150"
                      style={{ color: '#7B9E8F' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#1C3329'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#7B9E8F'; }}
                    >
                      {he ? 'דלג, אמלא ידנית ←' : '→ Skip, I\'ll fill it manually'}
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ──────────────── STEPS 1-3: Wizard ──────────────── */}
            {step >= 1 && (
              <motion.div
                key="wizard-shell"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {/* Step indicator */}
                <div className="flex flex-col items-center gap-2 mb-8">
                  <div className="flex items-center gap-2">
                    {[1, 2, 3].map(s => (
                      <motion.div
                        key={s}
                        layout
                        transition={{ duration: 0.3 }}
                        className="rounded-full"
                        style={{
                          height:     8,
                          width:      s === step ? 28 : 8,
                          background: s < step ? '#86EFAC' : s === step ? '#517B3E' : '#D3E0D8',
                        }}
                      />
                    ))}
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={step}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="text-xs font-medium"
                      style={{ color: '#527061' }}
                    >
                      {he
                        ? `שלב ${step} מתוך 3 — ${STEP_META[step - 1].he}`
                        : `Step ${step} of 3 — ${STEP_META[step - 1].en}`}
                    </motion.p>
                  </AnimatePresence>
                </div>

                {/* Animated step body */}
                <div style={{ overflow: 'hidden' }}>
                  <AnimatePresence mode="wait" custom={direction}>

                    {/* Step 1 — Basic Info */}
                    {step === 1 && (
                      <motion.div
                        key="step-1"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                      >
                        {/* AI-filled badge */}
                        {syllabusText && (
                          <div
                            className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl mb-5"
                            style={{ background: '#D1E6D9', color: '#183025' }}
                          >
                            <span>✨</span>
                            <span>
                              {he
                                ? 'הפרטים הבאים מולאו אוטומטית על-ידי ה-AI — ניתן לערוך'
                                : 'Fields pre-filled by AI — feel free to edit'}
                            </span>
                          </div>
                        )}

                        {/* Course Name */}
                        <section className="mb-5">
                          <label className="flex items-baseline gap-1.5 text-sm font-semibold mb-1.5" style={{ color: '#1C3329' }}>
                            {he ? 'שם הקורס' : 'Course Name'}
                            <span style={{ color: '#9B3A4E' }}>*</span>
                          </label>
                          <input
                            dir="auto"
                            type="text"
                            value={name}
                            onChange={e => { setName(e.target.value); if (nameError) setNameError(false); }}
                            onKeyDown={e => { if (e.key === 'Enter') goNext(); }}
                            placeholder={he ? 'לדוגמה: מבוא לכלכלה...' : 'e.g. Introduction to Economics...'}
                            className="w-full px-4 py-3 rounded-xl border outline-none transition-colors duration-150 text-base"
                            style={{
                              borderColor: nameError ? '#9B3A4E' : '#D3E0D8',
                              background:  '#F9FCFA',
                              color:       '#1C3329',
                              boxShadow:   nameError ? '0 0 0 3px rgba(155,58,78,0.10)' : 'none',
                            }}
                            onFocus={e => {
                              if (!nameError) e.target.style.borderColor = '#517B3E';
                              e.target.style.boxShadow = nameError
                                ? '0 0 0 3px rgba(155,58,78,0.14)'
                                : '0 0 0 3px rgba(81,123,62,0.12)';
                            }}
                            onBlur={e => {
                              if (!nameError) { e.target.style.borderColor = '#D3E0D8'; e.target.style.boxShadow = 'none'; }
                            }}
                            autoFocus
                          />
                          {nameError && (
                            <p className="text-xs mt-1.5" style={{ color: '#9B3A4E' }}>
                              {he ? 'יש להזין שם קורס' : 'Course name is required'}
                            </p>
                          )}
                        </section>

                        {/* Lecturer — free-text, always editable */}
                        <InputField
                          label={he ? 'שם המרצה' : 'Lecturer Name'}
                          he={he}
                          optional
                          type="text"
                          value={lecturer}
                          onChange={e => setLecturer(e.target.value)}
                          placeholder={he ? "לדוגמה: פרופ' כהן — ניתן לשנות בחופשיות" : "e.g. Prof. Cohen — edit freely"}
                        />
                      </motion.div>
                    )}

                    {/* Step 2 — Tirgul */}
                    {step === 2 && (
                      <motion.div
                        key="step-2"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                      >
                        <p className="text-sm font-semibold mb-4" style={{ color: '#1C3329' }}>
                          {he ? 'האם יש תגבור לקורס זה?' : 'Does this course have a recitation section?'}
                        </p>

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setHasTirgul(true)}
                            className="flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200"
                            style={{
                              background: hasTirgul === true  ? '#D1E6D9'                         : '#F4F9F6',
                              color:      hasTirgul === true  ? '#183025'                         : '#527061',
                              border:     hasTirgul === true  ? '1.5px solid #517B3E'             : '1.5px solid #D3E0D8',
                              boxShadow:  hasTirgul === true  ? '0 0 0 3px rgba(81,123,62,0.14)' : 'none',
                            }}
                          >
                            {he ? 'כן' : 'Yes'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setHasTirgul(false)}
                            className="flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200"
                            style={{
                              background: hasTirgul === false ? '#F4EEF0'                              : '#F4F9F6',
                              color:      hasTirgul === false ? '#6B2A3A'                              : '#527061',
                              border:     hasTirgul === false ? '1.5px solid #C06070'                 : '1.5px solid #D3E0D8',
                              boxShadow:  hasTirgul === false ? '0 0 0 3px rgba(155,58,78,0.10)'      : 'none',
                            }}
                          >
                            {he ? 'לא' : 'No'}
                          </button>
                        </div>

                        {/* Conditional TA input */}
                        <AnimatePresence>
                          {hasTirgul === true && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              className="mt-6"
                            >
                              <InputField
                                label={he ? 'מתרגל / שעות תגבור' : 'TA / Review Sessions'}
                                optional
                                he={he}
                                type="text"
                                value={ta}
                                onChange={e => setTa(e.target.value)}
                                placeholder={he ? 'לדוגמה: ימי שני, 10:00' : 'e.g. Mondays, 10:00'}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}

                    {/* Step 3 — Settings */}
                    {step === 3 && (
                      <motion.div
                        key="step-3"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                      >
                        <div className="grid grid-cols-2 gap-5 mb-2">

                          {/* Semester */}
                          <section>
                            <label className="block text-sm font-semibold mb-1.5" style={{ color: '#1C3329' }}>
                              {he ? 'סמסטר' : 'Semester'}
                            </label>
                            <div className="relative">
                              <select
                                value={semester}
                                onChange={e => setSemester(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border outline-none appearance-none cursor-pointer text-base transition-colors duration-150"
                                style={{ ...inputBase, direction: 'rtl', paddingInlineEnd: '2.5rem' }}
                                onFocus={e => {
                                  e.target.style.borderColor = '#517B3E';
                                  e.target.style.boxShadow   = '0 0 0 3px rgba(81,123,62,0.12)';
                                }}
                                onBlur={e => {
                                  e.target.style.borderColor = '#D3E0D8';
                                  e.target.style.boxShadow   = 'none';
                                }}
                              >
                                {SEMESTER_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              <div
                                className="pointer-events-none absolute inset-y-0 flex items-center"
                                style={{ [he ? 'left' : 'right']: '12px' }}
                              >
                                <svg className="w-4 h-4" style={{ color: '#527061' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>
                          </section>

                          {/* Color Theme */}
                          <section>
                            <label className="flex items-baseline gap-1.5 text-sm font-semibold mb-1.5" style={{ color: '#1C3329' }}>
                              {he ? 'צבע ייצוג' : 'Color Theme'}
                              <span className="text-xs font-normal" style={{ color: '#527061' }}>
                                ({he ? 'אופציונלי' : 'Optional'})
                              </span>
                            </label>
                            <div className="flex items-center gap-2.5 py-2">
                              {COLOR_OPTIONS.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setColor(c.value)}
                                  title={he ? c.label : c.id}
                                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 flex-shrink-0"
                                  style={{
                                    background: c.bg,
                                    border:     color === c.value ? `2.5px solid ${c.value}` : '2px solid transparent',
                                    transform:  color === c.value ? 'scale(1.20)' : 'scale(1)',
                                    boxShadow:  color === c.value ? `0 0 0 3px ${c.bg}` : 'none',
                                  }}
                                >
                                  {color === c.value && (
                                    <svg className="w-3.5 h-3.5" style={{ color: c.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </section>

                        </div>

                        {/* Syllabus indexed badge */}
                        {syllabusText && (
                          <div
                            className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl mt-4"
                            style={{ background: '#D1E6D9', color: '#183025' }}
                          >
                            <span>📄</span>
                            <span>
                              {he
                                ? 'הסילבוס יישמר ויהיה זמין לשאלות ה-AI לאחר השמירה'
                                : 'Syllabus will be saved and available for AI queries after saving'}
                            </span>
                          </div>
                        )}
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>

                {/* ── Navigation buttons ── */}
                <div className="flex gap-3 pt-5 mt-4 border-t border-[#E8F0EB]">

                  {step === 1 ? (
                    <button
                      type="button"
                      onClick={handleExitAttempt}
                      className="flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all duration-150"
                      style={{ background: '#F4F9F6', color: '#527061', border: '1.5px solid #D3E0D8' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#EEF5F0'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#F4F9F6'; }}
                    >
                      {he ? 'ביטול' : 'Cancel'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={goBack}
                      className="py-3.5 px-6 rounded-xl text-sm font-semibold transition-all duration-150"
                      style={{ background: '#F4F9F6', color: '#527061', border: '1.5px solid #D3E0D8' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#EEF5F0'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#F4F9F6'; }}
                    >
                      {he ? 'הקודם' : 'Back'}
                    </button>
                  )}

                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-150"
                      style={{
                        background: 'linear-gradient(135deg, #517B3E, #2A3B22)',
                        boxShadow:  '0 4px 14px rgba(81,123,62,0.30)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(81,123,62,0.48)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(81,123,62,0.30)'; }}
                    >
                      {he ? 'הבא' : 'Next'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSave}
                      className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-150"
                      style={{
                        background: 'linear-gradient(135deg, #517B3E, #2A3B22)',
                        boxShadow:  '0 4px 14px rgba(81,123,62,0.30)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(81,123,62,0.48)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(81,123,62,0.30)'; }}
                    >
                      {he ? 'שמור קורס' : 'Save Course'}
                    </button>
                  )}

                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleExitAttempt}
            className="text-sm transition-colors duration-150"
            style={{ color: '#7B9E8F' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#1C3329'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#7B9E8F'; }}
          >
            {he ? '→ חזור לבחירת קורס' : '← Back to Course Selection'}
          </button>
        </div>

      </motion.div>
    </div>

    {/* ── Exit without saving ── */}
    <AnimatePresence>
      {showExitWarning && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/30"
            style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={() => setShowExitWarning(false)}
          />
          <motion.div
            dir={he ? 'rtl' : 'ltr'}
            className="relative rounded-3xl p-8 w-full max-w-sm shadow-2xl"
            style={{ background: '#FFFFFF' }}
            initial={{ scale: 0.88, opacity: 0, y: 12 }}
            animate={{ scale: 1,    opacity: 1, y: 0  }}
            exit={{ scale: 0.88,    opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: '#FFF7ED' }}>
              <svg className="w-6 h-6" style={{ color: '#F97316' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: '#1C3329' }}>
              {he ? 'לצאת ללא שמירה?' : 'Exit without saving?'}
            </h2>
            <p className="text-sm mb-7 leading-relaxed" style={{ color: '#527061' }}>
              {he
                ? 'הנתונים שהזנת לא יישמרו. האם אתה בטוח שברצונך לצאת?'
                : 'The data you entered will not be saved. Are you sure you want to exit?'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push('/course-picker')}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-150"
                style={{ background: '#FEF2F2', color: '#EF4444', border: '1.5px solid #FECACA' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2'; }}
              >
                {he ? 'צא ללא שמירה' : 'Exit without saving'}
              </button>
              <button
                type="button"
                onClick={() => setShowExitWarning(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all duration-150"
                style={{ background: 'linear-gradient(135deg, #517B3E, #2A3B22)', boxShadow: '0 4px 14px rgba(81,123,62,0.30)' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(81,123,62,0.48)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(81,123,62,0.30)'; }}
              >
                {he ? 'הישאר' : 'Stay'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </>
  );
}
